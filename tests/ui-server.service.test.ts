import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {request} from 'node:http';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {ProjectConfigService} from '../src/config/project-config.service.js';
import type {RunResult} from '../src/runner/interfaces/test-run.interface.js';
import {LoggerService} from '../src/shared/logger.service.js';
import {ReportStoreService} from '../src/ui/report-store.service.js';
import {RunManagerService} from '../src/ui/run-manager.service.js';
import {UiServerService} from '../src/ui/ui-server.service.js';
import {fakeRunResult} from './helpers/fake-run.js';

const ROOT = resolve(import.meta.dirname, '..');
const OLD_REPORT_ID = '2026-11-25T03-32-55-399Z';

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

describe('UiServerService', () => {
  let tempDir: string;
  let server: UiServerService;
  let port: number;
  let finishRun: (result: RunResult) => void = () => {};

  /** Raw HTTP so tests can send any Host or Origin header. */
  const send = (
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<Reply> =>
    new Promise((resolvePromise, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: options.method ?? 'GET',
          headers: {Host: `127.0.0.1:${port}`, ...options.headers},
        },
        res => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            body += chunk;
            // Event streams never end; the first event is enough.
            if (res.headers['content-type']?.startsWith('text/event-stream')) {
              res.destroy();
              resolvePromise({
                status: res.statusCode ?? 0,
                headers: res.headers,
                body,
              });
            }
          });
          res.on('end', () =>
            resolvePromise({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body,
            }),
          );
        },
      );
      req.on('error', reject);
      req.end(options.body);
    });

  const postRun = (body: unknown, headers: Record<string, string> = {}) =>
    send('/api/runs', {
      method: 'POST',
      headers: {
        Origin: `http://127.0.0.1:${port}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ui-'));
    const projectsDir = join(tempDir, 'projects');
    const reportsDir = join(tempDir, 'reports');
    await mkdir(join(projectsDir, 'demo'), {recursive: true});
    await writeFile(
      join(projectsDir, 'demo', 'project.json'),
      JSON.stringify({
        name: 'demo',
        environment: 'local',
        baseUrl: 'http://127.0.0.1:4173',
        pages: ['/'],
      }),
    );
    // A report saved before Phase 2: no goals or AI line.
    const oldReport = join(reportsDir, 'demo', OLD_REPORT_ID);
    await mkdir(join(oldReport, 'screenshots'), {recursive: true});
    await writeFile(
      join(oldReport, 'report.json'),
      JSON.stringify({
        project: 'demo',
        environment: 'local',
        baseUrl: 'http://127.0.0.1:4173',
        startedAt: '2026-11-25T03:32:55.399Z',
        finishedAt: '2026-11-25T03:33:01.951Z',
        status: 'completed',
        pages: [],
        findings: [],
      }),
    );
    await writeFile(join(oldReport, 'screenshots', 'goal-step-1.png'), 'png');

    const logger = new LoggerService('ui-test');
    server = new UiServerService({
      rootDir: ROOT,
      projects: new ProjectConfigService(projectsDir),
      reports: new ReportStoreService(reportsDir, logger),
      runs: new RunManagerService(
        () => new Promise<RunResult>(done => (finishRun = done)),
      ),
      doctor: async () => [{name: 'Node.js', ok: true, message: 'v26'}],
      logger,
    });
    port = await server.listen(0);
  });

  afterAll(async () => {
    finishRun(fakeRunResult());
    await server.close();
    await rm(tempDir, {recursive: true, force: true});
  });

  describe('pages and fonts', () => {
    it('serves the UI with a strict content security policy', async () => {
      const reply = await send('/');
      expect(reply.status).toBe(200);
      expect(reply.body).toContain('<title>iTEST</title>');
      expect(reply.headers['content-security-policy']).toContain(
        "script-src 'self'",
      );
      expect(reply.headers['x-content-type-options']).toBe('nosniff');
    });

    it('serves the self-hosted pixel fonts and nothing else', async () => {
      expect((await send('/fonts/vt323.woff2')).status).toBe(200);
      expect((await send('/fonts/other.woff2')).status).toBe(404);
      expect((await send('/package.json')).status).toBe(404);
      expect((await send('/web/../package.json')).status).toBe(404);
    });
  });

  describe('protection against other websites', () => {
    it('refuses requests addressed to another host name (DNS rebinding)', async () => {
      const reply = await send('/api/projects', {
        headers: {Host: `evil.example:${port}`},
      });
      expect(reply.status).toBe(403);
    });

    it('refuses POSTs from another origin or without an origin', async () => {
      expect(
        (await postRun({project: 'demo'}, {Origin: 'https://evil.example'}))
          .status,
      ).toBe(403);
      const noOrigin = await send('/api/runs', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: '{"project":"demo"}',
      });
      expect(noOrigin.status).toBe(403);
    });

    it('refuses form-style POSTs that skip the browser preflight', async () => {
      const reply = await postRun(
        {project: 'demo'},
        {'Content-Type': 'text/plain'},
      );
      expect(reply.status).toBe(415);
    });
  });

  describe('runs', () => {
    it('validates the request and the project name', async () => {
      expect((await postRun({project: '../etc'})).status).toBe(400);
      expect((await postRun({project: 'demo', extra: 1})).status).toBe(400);
      expect((await postRun({project: 'missing'})).status).toBe(404);
    });

    it('starts a run, refuses a second one, and streams progress', async () => {
      const first = await postRun({project: 'demo', skipAi: true});
      expect(first.status).toBe(202);
      expect(JSON.parse(first.body)).toMatchObject({
        project: 'demo',
        phase: 'running',
        options: {headed: false, skipAi: true},
      });

      expect((await postRun({project: 'demo'})).status).toBe(409);

      const events = await send('/api/runs/events');
      expect(events.body).toContain('event: snapshot');
      expect(events.body).toContain('"phase":"running"');
    });
  });

  describe('reports', () => {
    it('lists reports, including ones saved before AI testing', async () => {
      const reports = JSON.parse((await send('/api/reports')).body);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({
        project: 'demo',
        id: OLD_REPORT_ID,
        summary: {findings: 0, goals: {total: 0}},
      });
      const report = JSON.parse(
        (await send(`/api/reports/demo/${OLD_REPORT_ID}`)).body,
      );
      expect(report.goals).toEqual([]);
      expect(report.ai).toContain('Not recorded');
    });

    it('serves screenshots by strict name only', async () => {
      const base = `/api/reports/demo/${OLD_REPORT_ID}/screenshots`;
      expect((await send(`${base}/goal-step-1.png`)).status).toBe(200);
      expect((await send(`${base}/..%2Freport.json`)).status).toBe(404);
      expect((await send(`${base}/other.png`)).status).toBe(404);
    });

    it('returns 404 for unknown or malformed report names', async () => {
      expect((await send('/api/reports/demo/not-a-report')).status).toBe(404);
      expect(
        (await send(`/api/reports/..%2F..%2Fprojects/${OLD_REPORT_ID}`)).status,
      ).toBe(404);
    });
  });
});
