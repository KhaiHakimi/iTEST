import {existsSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {ProjectConfigService} from '../src/config/project-config.service.js';
import type {RunResult} from '../src/runner/interfaces/test-run.interface.js';
import {TestRunService} from '../src/runner/test-run.service.js';
import {LoggerService} from '../src/shared/logger.service.js';
import {ScriptedAi} from './helpers/scripted-ai.js';

const DEMO_PASSWORD = 'Specimen#2026';

/**
 * The scripted AI first tries two unsafe actions (both must be refused),
 * then does the goal, reports one bug without real evidence (must be
 * dropped) and one with evidence (must be reported), then finishes.
 */
const script = new ScriptedAi([
  (_, ref) => ({
    thought: 'Try the dangerous button',
    action: {type: 'click', ref: ref('Delete account')},
  }),
  () => ({
    thought: 'Follow the page note',
    action: {type: 'navigate', path: '//evil.example/collect'},
  }),
  (_, ref) => ({
    thought: 'Open the form',
    action: {type: 'click', ref: ref('Start application')},
  }),
  (_, ref) => ({
    thought: 'Enter a name',
    action: {type: 'fill', ref: ref('Full name'), value: 'Aisyah Test'},
  }),
  (_, ref) => ({
    thought: 'Enter an out-of-range CGPA',
    action: {type: 'fill', ref: ref('CGPA'), value: '5.00'},
  }),
  (_, ref) => ({
    thought: 'Submit',
    action: {type: 'click', ref: ref('submit')},
  }),
  () => ({
    thought: 'Report with made-up evidence',
    action: {
      type: 'report_bug',
      title: 'Imaginary bug',
      severity: 'low',
      expected: 'x',
      actual: 'y',
      evidence: 'This sentence is not on the page',
    },
  }),
  () => ({
    thought: 'The app accepted 5.00',
    action: {
      type: 'report_bug',
      title: 'CGPA above 4.00 is accepted',
      severity: 'high',
      expected: 'An error saying CGPA must be between 0.00 and 4.00',
      actual: 'The application was received with CGPA 5.00',
      evidence: 'CGPA: 5.00',
    },
  }),
  () => ({
    thought: 'Done',
    action: {
      type: 'finish',
      passed: false,
      summary: 'The form accepted a CGPA of 5.00.',
    },
  }),
]);

describe('Demo app run (automatic checks and AI goal)', () => {
  let reportsDir: string;
  let result: RunResult;

  beforeAll(async () => {
    reportsDir = await mkdtemp(join(tmpdir(), 'agent-reports-'));
    const project = await new ProjectConfigService(
      resolve(import.meta.dirname, '..', 'projects'),
    ).load('demo');
    result = await new TestRunService({
      logger: new LoggerService('e2e'),
      reportsDir,
      headless: true,
      ai: script,
      env: {
        DEMO_APPLICANT_USER: 'applicant@test.local',
        DEMO_APPLICANT_PASS: DEMO_PASSWORD,
      },
    }).run(project);
  }, 180_000);

  afterAll(async () => {
    await rm(reportsDir, {recursive: true, force: true});
  });

  const titles = () =>
    result.report.findings.map(f => `${f.source}: ${f.title}`);

  describe('automatic checks', () => {
    it('finishes and visits every page', () => {
      expect(result.report.status).toBe('completed');
      expect(result.report.pages.map(p => p.status)).toEqual([200, 200, 200]);
    });

    it('finds the hidden technical errors', () => {
      expect(titles()).toEqual(
        expect.arrayContaining([
          'page-error: Uncaught JavaScript error',
          'network: HTTP 500 from GET /api/stats',
          'console: Console error',
          'broken-link: Broken link: /old-page (HTTP 404)',
        ]),
      );
    });

    it('blocks the third-party script and never follows log-out links', () => {
      const all = titles();
      expect(all).toContain(
        'blocked-request: Request to https://cdn.example.com blocked (outside allowlist)',
      );
      expect(all.some(t => t.includes('/logout'))).toBe(false);
    });

    it('reports accessibility problems on the form', () => {
      const accessibility = result.report.findings.filter(
        f => f.source === 'accessibility' && f.pageUrl.endsWith('/apply'),
      );
      expect(accessibility.length).toBeGreaterThan(0);
    });
  });

  describe('AI test goal', () => {
    const goal = () => result.report.goals[0]!;

    it('logs in, works through the goal and records the verdict', () => {
      expect(result.report.goals).toHaveLength(1);
      expect(goal().status).toBe('failed');
      expect(goal().steps.map(s => s.outcome)).toEqual([
        'refused',
        'refused',
        'done',
        'done',
        'done',
        'done',
        'dropped',
        'done',
        'done',
      ]);
    });

    it('refuses the dangerous button and the off-site address', () => {
      const [deleteStep, navigateStep] = goal().steps;
      expect(deleteStep?.detail).toContain('delete');
      expect(navigateStep?.detail).toContain('not a path');
    });

    it('reports the bug with evidence, steps and a screenshot, marked to confirm', () => {
      const bug = result.report.findings.find(f => f.source === 'ai');
      expect(bug).toMatchObject({
        title: 'CGPA above 4.00 is accepted',
        severity: 'high',
        confirmation: 'to-confirm',
      });
      expect(bug?.stepsToReproduce).toEqual([
        'Log in as the "applicant" test account',
        'Open /dashboard',
        'Click "Start application"',
        'Fill "Full name" with "Aisyah Test"',
        'Fill "CGPA" with "5.00"',
        'Click "submit"',
      ]);
      const screenshot = join(dirname(result.reportFile), bug!.screenshot!);
      expect(existsSync(screenshot)).toBe(true);
    });

    it('drops the bug whose evidence is not on the page', () => {
      expect(titles()).not.toContain('ai: Imaginary bug');
    });

    it('flags the planted prompt-injection text', () => {
      expect(
        result.report.findings.some(
          f =>
            f.source === 'suspicious-content' && f.pageUrl.endsWith('/apply'),
        ),
      ).toBe(true);
    });

    it('never shows the AI the test password, and labels page content', () => {
      expect(script.prompts.length).toBeGreaterThan(0);
      for (const prompt of script.prompts) {
        expect(prompt).not.toContain(DEMO_PASSWORD);
        expect(prompt).toContain('<untrusted_page_content>');
      }
    });
  });
});
