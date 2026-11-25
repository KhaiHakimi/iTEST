export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type FindingSource =
  | 'navigation'
  | 'page-error'
  | 'console'
  | 'network'
  | 'broken-link'
  | 'accessibility'
  | 'blocked-request'
  | 'agent';

export interface NewFinding {
  source: FindingSource;
  severity: Severity;
  title: string;
  /** The page under test when the problem was seen. */
  pageUrl: string;
  detail: string;
  /** Raw proof: stack trace, element selector, request URL. */
  evidence?: string;
}

export interface Finding extends NewFinding {
  /** How many times the same problem was seen on the same page. */
  occurrences: number;
}
