import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {ProjectConfigService} from '../src/config/project-config.service.js';
import type {RunResult} from '../src/runner/interfaces/test-run.interface.js';
import {TestRunService} from '../src/runner/test-run.service.js';
import {LoggerService} from '../src/shared/logger.service.js';

/** End-to-end: runs Phase 1 against the bundled demo app and its known bugs. */
describe('Phase 1 run against the demo app', () => {
  let reportsDir: string;
  let result: RunResult;

  beforeAll(async () => {
    reportsDir = await mkdtemp(join(tmpdir(), 'agent-reports-'));
    const project = await new ProjectConfigService(
      resolve(import.meta.dirname, '..', 'projects'),
    ).load('demo');
    result = await new TestRunService(
      new LoggerService('e2e'),
      reportsDir,
      true,
    ).run(project);
  }, 120_000);

  afterAll(async () => {
    await rm(reportsDir, {recursive: true, force: true});
  });

  const titles = () =>
    result.report.findings.map(f => `${f.source}: ${f.title}`);

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
