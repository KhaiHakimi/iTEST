import type {Severity} from './interfaces/finding.interface.js';

export const SEVERITIES: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
];

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Keeps one noisy page from producing a multi-megabyte report. */
export const MAX_FINDING_TEXT_CHARS = 2_000;
