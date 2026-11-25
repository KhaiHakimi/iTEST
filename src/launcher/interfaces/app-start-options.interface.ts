export interface AppStartOptions {
  /** Shell command from the project's settings file, e.g. `npm run dev`. */
  command: string;
  /** Absolute working directory for the command. */
  cwd: string;
  /** URL polled until it answers with a status below 500. */
  readyUrl: string;
  timeoutMs: number;
}
