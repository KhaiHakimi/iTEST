import type {AccessibilityCheckerService} from '../../checkers/accessibility-checker.service.js';
import type {ErrorCheckerService} from '../../checkers/error-checker.service.js';
import type {LinkCheckerService} from '../../checkers/link-checker.service.js';
import type {FindingStoreService} from '../../report/finding-store.service.js';
import type {RunReport} from '../../report/interfaces/run-report.interface.js';

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
