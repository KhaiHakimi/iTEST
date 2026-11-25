/**
 * Minimal console logger. Never pass secrets, passwords or extracted document
 * values to it: log lines can end up in terminals, CI output and screenshots.
 */
export class LoggerService {
  constructor(private readonly scope: string) {}

  info(message: string): void {
    console.log(this.format('INFO', message));
  }

  warn(message: string): void {
    console.warn(this.format('WARN', message));
  }

  error(message: string): void {
    console.error(this.format('ERROR', message));
  }

  private format(level: string, message: string): string {
    return `${new Date().toISOString()} ${level} [${this.scope}] ${message}`;
  }
}
