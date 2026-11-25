import {basename, dirname} from 'node:path';
import {ReportService} from '../report/report.service.js';
import type {ProjectRunOptions} from '../runner/interfaces/test-run.interface.js';
import type {LogEntry} from '../shared/interfaces/logger.interface.js';
import {LoggerService} from '../shared/logger.service.js';
import type {
  RunEvent,
  RunExecutor,
  RunListener,
  RunState,
} from './interfaces/ui.interface.js';
import {MAX_LOG_ENTRIES} from './ui.constants.js';

/**
 * Runs one project at a time for the web UI and broadcasts its progress.
 * One at a time because a run starts the app and a browser, and two runs
 * would fight over the same ports.
 */
export class RunManagerService {
  private state: RunState | undefined;
  private logs: LogEntry[] = [];
  private readonly listeners = new Set<RunListener>();

  constructor(private readonly executor: RunExecutor) {}

  snapshot(): {state: RunState | undefined; logs: LogEntry[]} {
    return {state: this.state, logs: [...this.logs]};
  }

  /** Returns started=false, with the current run, if one is already going. */
  start(
    project: string,
    options: ProjectRunOptions,
  ): {started: boolean; state: RunState} {
    if (this.state?.phase === 'running') {
      return {started: false, state: this.state};
    }
    const startedAt = new Date().toISOString();
    this.state = {id: startedAt, project, options, phase: 'running', startedAt};
    this.logs = [];
    this.emit({type: 'state', state: this.state});
    // Not awaited: the HTTP request returns at once and progress is streamed.
    // execute() handles its own errors, so nothing is left unhandled.
    void this.execute(this.state);
    return {started: true, state: this.state};
  }

  waitForIdle(): Promise<void> {
    if (this.state?.phase !== 'running') {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const unsubscribe = this.subscribe(event => {
        if (event.type === 'state' && event.state.phase !== 'running') {
          unsubscribe();
          resolve();
        }
      });
    });
  }

  subscribe(listener: RunListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async execute(state: RunState): Promise<void> {
    const logger = new LoggerService('agent', entry => this.onLog(entry));
    try {
      const result = await this.executor(state.project, state.options, logger);
      this.update({
        phase: 'finished',
        finishedAt: new Date().toISOString(),
        reportId: basename(dirname(result.reportFile)),
        summary: new ReportService().summarise(result.report),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Run failed: ${message}`);
      this.update({
        phase: 'error',
        finishedAt: new Date().toISOString(),
        error: message,
      });
    }
  }

  private onLog(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }
    this.emit({type: 'log', entry});
  }

  private update(patch: Partial<RunState>): void {
    if (!this.state) {
      return;
    }
    this.state = {...this.state, ...patch};
    this.emit({type: 'state', state: this.state});
  }

  private emit(event: RunEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        // A broken browser connection must not stop the run; drop that listener.
        this.listeners.delete(listener);
        console.warn(`Dropped a run listener: ${String(error)}`);
      }
    }
  }
}
