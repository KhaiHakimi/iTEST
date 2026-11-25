import type {GoalResult} from '../../agent/interfaces/agent.interface.js';
import type {LocalAiClient} from '../../ai/interfaces/ollama.interface.js';
import type {AccessibilityCheckerService} from '../../checkers/accessibility-checker.service.js';
import type {ErrorCheckerService} from '../../checkers/error-checker.service.js';
import type {LinkCheckerService} from '../../checkers/link-checker.service.js';
import type {FindingStoreService} from '../../report/finding-store.service.js';
import type {RunReport} from '../../report/interfaces/run-report.interface.js';
import type {LoggerService} from '../../shared/logger.service.js';

export interface TestRunOptions {
  logger: LoggerService;
  reportsDir: string;
  headless: boolean;
  /** Undefined skips the AI test goals (e.g. --skip-ai). */
  ai: LocalAiClient | undefined;
  /** Source of test-account credentials. */
  env: NodeJS.ProcessEnv;
}

export interface ProjectRunOptions {
  /** Show the browser window. */
  headed: boolean;
  /** Run the automatic checks only, without the AI test goals. */
  skipAi: boolean;
}

export interface GoalsOutcome {
  goals: GoalResult[];
  /** Summary for the report's AI line. */
  ai: string;
}

export interface RunResult {
  report: RunReport;
  /** Path of the Markdown report written for this run. */
  reportFile: string;
}

/** The per-run services a page visit needs. */
export interface RunCheckers {
  findings: FindingStoreService;
  errors: ErrorCheckerService;
  links: LinkCheckerService | undefined;
  accessibility: AccessibilityCheckerService | undefined;
}
