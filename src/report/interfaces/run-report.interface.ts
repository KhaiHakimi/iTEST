import type {GoalResult} from '../../agent/interfaces/agent.interface.js';
import type {Finding} from './finding.interface.js';

/** "could-not-finish" means the agent failed, not the app; see the proposal. */
export type RunStatus = 'completed' | 'could-not-finish';

export interface PageVisit {
  url: string;
  /** HTTP status of the page itself, or null if it could not be opened. */
  status: number | null;
  durationMs: number;
}

export interface RunReport {
  project: string;
  environment: string;
  baseUrl: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  /** Why the run could not finish, when status is "could-not-finish". */
  failure?: string;
  /** Model used and start-up check result, or why AI testing was skipped. */
  ai: string;
  pages: PageVisit[];
  goals: GoalResult[];
  findings: Finding[];
}
