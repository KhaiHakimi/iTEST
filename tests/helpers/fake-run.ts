import type {RunReport} from '../../src/report/interfaces/run-report.interface.js';
import type {RunResult} from '../../src/runner/interfaces/test-run.interface.js';

export const FAKE_REPORT_ID = '2026-11-25T08-00-00-000Z';

/** A small finished run, as TestRunService would return it. */
export function fakeRunResult(project = 'demo'): RunResult {
  const report: RunReport = {
    project,
    environment: 'local',
    baseUrl: 'http://127.0.0.1:4173',
    startedAt: '2026-11-25T08:00:00.000Z',
    finishedAt: '2026-11-25T08:00:05.000Z',
    status: 'completed',
    ai: 'scripted',
    pages: [],
    goals: [],
    findings: [
      {
        source: 'network',
        severity: 'high',
        title: 'HTTP 500 from GET /api/stats',
        pageUrl: 'http://127.0.0.1:4173/',
        detail: 'The server answered 500.',
        occurrences: 1,
      },
    ],
  };
  return {
    report,
    reportFile: `/reports/${project}/${FAKE_REPORT_ID}/report.md`,
  };
}
