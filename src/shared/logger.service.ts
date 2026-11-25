import type {
  LogEntry,
  LogLevel,
  LogSink,
} from './interfaces/logger.interface.js';

/**
 * Minimal console logger with an optional extra sink. Never pass secrets,
 * passwords or extracted document values to it: log lines can end up in
 * terminals, CI output, the web UI and screenshots.
 */
export class LoggerService {
  constructor(
    private readonly scope: string,
    private readonly sink?: LogSink,
  ) {}

  info(message: string): void {
    this.write('INFO', message);
  }

  warn(message: string): void {
    this.write('WARN', message);
  }

  error(message: string): void {
    this.write('ERROR', message);
  }

  private write(level: LogLevel, message: string): void {
    const entry: LogEntry = {
      time: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
    };
    const line = `${entry.time} ${level} [${this.scope}] ${message}`;
    if (level === 'ERROR') {
      console.error(line);
    } else if (level === 'WARN') {
      console.warn(line);
    } else {
      console.log(line);
    }
    this.sink?.(entry);
  }
}
