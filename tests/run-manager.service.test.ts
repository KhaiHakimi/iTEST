import {describe, expect, it} from 'vitest';
import type {RunResult} from '../src/runner/interfaces/test-run.interface.js';
import type {RunEvent} from '../src/ui/interfaces/ui.interface.js';
import {RunManagerService} from '../src/ui/run-manager.service.js';
import {FAKE_REPORT_ID, fakeRunResult} from './helpers/fake-run.js';

const OPTIONS = {headed: false, skipAi: true};

/** An executor whose run finishes only when the test says so. */
function controllableExecutor() {
  let finish: (result: RunResult) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const executor = async (
    _project: string,
    _options: unknown,
    logger: {info(message: string): void},
  ) => {
    logger.info('Testing http://127.0.0.1:4173/');
    return new Promise<RunResult>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
  };
  return {
    executor,
    finish: (result: RunResult) => finish(result),
    fail: (error: Error) => fail(error),
  };
}

describe('RunManagerService', () => {
  it('runs one project at a time', () => {
    const {executor} = controllableExecutor();
    const runs = new RunManagerService(executor);

    expect(runs.start('demo', OPTIONS).started).toBe(true);
    const second = runs.start('other', OPTIONS);

    expect(second.started).toBe(false);
    expect(second.state.project).toBe('demo');
  });

  it('streams log lines and the final summary', async () => {
    const control = controllableExecutor();
    const runs = new RunManagerService(control.executor);
    const events: RunEvent[] = [];
    runs.subscribe(event => events.push(event));

    runs.start('demo', OPTIONS);
    control.finish(fakeRunResult());
    await runs.waitForIdle();

    const {state, logs} = runs.snapshot();
    expect(state).toMatchObject({
      phase: 'finished',
      reportId: FAKE_REPORT_ID,
      summary: {findings: 1, serious: 1},
    });
    expect(logs.map(l => l.message)).toContain(
      'Testing http://127.0.0.1:4173/',
    );
    expect(events.map(e => e.type)).toEqual(['state', 'log', 'state']);
  });

  it('records an agent crash as an error and allows a new run', async () => {
    const control = controllableExecutor();
    const runs = new RunManagerService(control.executor);

    runs.start('demo', OPTIONS);
    control.fail(new Error('Browser could not start'));
    await runs.waitForIdle();

    expect(runs.snapshot().state).toMatchObject({
      phase: 'error',
      error: 'Browser could not start',
    });
    expect(runs.start('demo', OPTIONS).started).toBe(true);
  });

  it('keeps running when a listener throws', async () => {
    const control = controllableExecutor();
    const runs = new RunManagerService(control.executor);
    runs.subscribe(() => {
      throw new Error('connection gone');
    });

    runs.start('demo', OPTIONS);
    control.finish(fakeRunResult());
    await runs.waitForIdle();

    expect(runs.snapshot().state?.phase).toBe('finished');
  });
});
