import type {BrowserService} from '../../browser/browser.service.js';
import type {ErrorCheckerService} from '../../checkers/error-checker.service.js';
import type {ProjectConfig} from '../../config/interfaces/project-config.interface.js';
import type {FindingStoreService} from '../../report/finding-store.service.js';
import type {LoggerService} from '../../shared/logger.service.js';
import type {UrlAllowlistService} from '../../shared/url-allowlist.service.js';
import type {ActionExecutorService} from '../action-executor.service.js';
import type {ActionGuardService} from '../action-guard.service.js';
import type {AgentBrainService} from '../agent-brain.service.js';
import type {InjectionDetectorService} from '../injection-detector.service.js';
import type {LoginService} from '../login.service.js';
import type {PageObserverService} from '../page-observer.service.js';

export interface GoalRunnerDeps {
  browser: BrowserService;
  allowlist: UrlAllowlistService;
  errors: ErrorCheckerService;
  findings: FindingStoreService;
  brain: AgentBrainService;
  guard: ActionGuardService;
  observer: PageObserverService;
  executor: ActionExecutorService;
  detector: InjectionDetectorService;
  /** Undefined when the project has no scripted log-in. */
  login: LoginService | undefined;
  accounts: ProjectConfig['accounts'];
  /** Folder of this run's report; screenshots go in a subfolder. */
  reportDir: string;
  logger: LoggerService;
}
