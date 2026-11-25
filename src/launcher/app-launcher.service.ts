import {spawn, spawnSync, type ChildProcess} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import type {LoggerService} from '../shared/logger.service.js';
import type {AppStartOptions} from './interfaces/app-start-options.interface.js';
import {
  MAX_OUTPUT_TAIL_CHARS,
  READY_POLL_INTERVAL_MS,
  READY_REQUEST_TIMEOUT_MS,
} from './launcher.constants.js';

const IS_WINDOWS = process.platform === 'win32';

/** Starts the web app under test, waits until it answers, and stops it. */
export class AppLauncherService {
  private child: ChildProcess | undefined;
  private spawnError: Error | undefined;
  private outputTail = '';

  constructor(private readonly logger: LoggerService) {}

  async start(options: AppStartOptions): Promise<void> {
    if (await this.isReady(options.readyUrl)) {
      this.logger.info(
        `App already answering at ${options.readyUrl}; not starting another copy.`,
      );
      return;
    }

    this.logger.info(`Starting app: ${options.command}`);
    // The command comes from the project's settings file, which developers
    // own and review in git. It never comes from page content or the AI.
    const child = spawn(options.command, {
      cwd: options.cwd,
      shell: true,
      detached: !IS_WINDOWS,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    child.on('error', error => {
      this.spawnError = error;
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.outputTail = (this.outputTail + chunk.toString()).slice(
        -MAX_OUTPUT_TAIL_CHARS,
      );
    });

    await this.waitUntilReady(options.readyUrl, options.timeoutMs);
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child?.pid || child.exitCode !== null) {
      return;
    }
    this.logger.info('Stopping app');
    if (IS_WINDOWS) {
      // The shell wraps the real server process, so the whole tree must go.
      const result = spawnSync(
        'taskkill',
        ['/pid', String(child.pid), '/T', '/F'],
        {windowsHide: true},
      );
      if (result.status !== 0) {
        this.logger.warn(
          `Could not stop app process ${child.pid}; stop it manually.`,
        );
      }
      return;
    }
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      this.logger.warn(
        `Could not stop app process group ${child.pid}: ${String(error)}`,
      );
    }
  }

  private async waitUntilReady(url: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      this.throwIfExited();
      if (await this.isReady(url)) {
        this.logger.info(`App is ready at ${url}`);
        return;
      }
      await delay(READY_POLL_INTERVAL_MS);
    }
    throw new Error(
      `App did not answer at ${url} within ${timeoutMs / 1000}s.${this.tailForMessage()}`,
    );
  }

  private throwIfExited(): void {
    if (this.spawnError) {
      throw new Error(`App could not be started: ${this.spawnError.message}`);
    }
    const code = this.child?.exitCode;
    if (code !== null && code !== undefined) {
      throw new Error(
        `App exited early with code ${code}.${this.tailForMessage()}`,
      );
    }
  }

  private async isReady(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(READY_REQUEST_TIMEOUT_MS),
      });
      return response.status < 500;
    } catch {
      // Connection refused is the expected answer while the app starts up.
      return false;
    }
  }

  private tailForMessage(): string {
    const tail = this.outputTail.trim();
    return tail ? `\nLast error output:\n${tail}` : '';
  }
}
