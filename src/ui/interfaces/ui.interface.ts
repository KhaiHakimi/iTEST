import type {ProjectConfigService} from '../../config/project-config.service.js';
import type {DoctorCheck} from '../../doctor/interfaces/doctor.interface.js';
import type {
  RunStatus,
  RunSummary,
} from '../../report/interfaces/run-report.interface.js';
import type {
  ProjectRunOptions,
  RunResult,
} from '../../runner/interfaces/test-run.interface.js';
import type {LogEntry} from '../../shared/interfaces/logger.interface.js';
import type {LoggerService} from '../../shared/logger.service.js';
import type {ReportStoreService} from '../report-store.service.js';
import type {RunManagerService} from '../run-manager.service.js';

/** "error" means the agent itself crashed before writing a report. */
export type RunPhase = 'running' | 'finished' | 'error';

export interface RunState {
  id: string;
  project: string;
  options: ProjectRunOptions;
  phase: RunPhase;
  startedAt: string;
  finishedAt?: string;
  /** Report folder name, once the run has written its report. */
  reportId?: string;
  summary?: RunSummary;
  error?: string;
}

export type RunEvent =
  {type: 'state'; state: RunState} | {type: 'log'; entry: LogEntry};

export type RunListener = (event: RunEvent) => void;

export type RunExecutor = (
  projectName: string,
  options: ProjectRunOptions,
  logger: LoggerService,
) => Promise<RunResult>;

export interface ReportListItem {
  project: string;
  id: string;
  startedAt: string;
  finishedAt: string;
  status: RunStatus;
  summary: RunSummary;
}

export interface ProjectListItem {
  name: string;
  baseUrl?: string;
  environment?: string;
  pages?: number;
  goals?: number;
  /** Set when project.json is invalid; the project cannot be run. */
  error?: string;
}

export interface UiServerDeps {
  /** Repository root: web/ and node_modules/ are found from here. */
  rootDir: string;
  projects: ProjectConfigService;
  reports: ReportStoreService;
  runs: RunManagerService;
  doctor: () => Promise<DoctorCheck[]>;
  logger: LoggerService;
}
