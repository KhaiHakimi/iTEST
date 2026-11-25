export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  time: string;
  level: LogLevel;
  scope: string;
  message: string;
}

/** Extra destination for log lines, e.g. the web UI's live run view. */
export type LogSink = (entry: LogEntry) => void;
