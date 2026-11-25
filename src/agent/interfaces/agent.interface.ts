import type {z} from 'zod';
import type {
  agentActionSchema,
  agentDecisionSchema,
} from '../agent-decision.schema.js';

export type AgentAction = z.infer<typeof agentActionSchema>;
export type AgentDecision = z.infer<typeof agentDecisionSchema>;
/** Actions that change the browser, as opposed to reporting or finishing. */
export type BrowserAction = Extract<
  AgentAction,
  {type: 'click' | 'fill' | 'select' | 'navigate'}
>;
export type ReportBugAction = Extract<AgentAction, {type: 'report_bug'}>;

/** One interactive element on the page, addressed by a short ref like "e3". */
export interface ObservedElement {
  ref: string;
  role: string;
  name: string;
  /** Current value; always hidden for password fields. */
  value?: string;
  options?: string[];
  disabled: boolean;
}

export interface PageObservation {
  url: string;
  title: string;
  elements: ObservedElement[];
  /** Visible text, trimmed to a size the local model can handle. */
  text: string;
  /** All text including hidden parts; scanned for injection, never sent to the AI. */
  rawText: string;
}

export type StepOutcome = 'done' | 'refused' | 'failed' | 'dropped';

export interface StepRecord {
  number: number;
  /** Plain description, e.g. 'Fill "CGPA" with "5.00"'. */
  description: string;
  outcome: StepOutcome;
  /** Result or reason, e.g. why an action was refused. */
  detail: string;
  url: string;
}

export type GoalStatus = 'passed' | 'failed' | 'could-not-finish';

export interface GoalResult {
  id: string;
  goal: string;
  status: GoalStatus;
  summary: string;
  steps: StepRecord[];
}

export type GuardVerdict = {allowed: true} | {allowed: false; reason: string};

export interface DecisionContext {
  goal: string;
  history: StepRecord[];
  observation: PageObservation;
}
