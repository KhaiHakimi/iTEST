import {OllamaService} from '../ai/ollama.service.js';
import {ProjectConfigService} from '../config/project-config.service.js';
import type {LoggerService} from '../shared/logger.service.js';
import type {
  ProjectRunOptions,
  RunResult,
} from './interfaces/test-run.interface.js';
import {TestRunService} from './test-run.service.js';

/** Loads a project by name and runs it. Shared by the CLI and the web UI. */
export class ProjectRunService {
  constructor(
    private readonly projectsDir: string,
    private readonly reportsDir: string,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  async run(
    projectName: string,
    options: ProjectRunOptions,
    logger: LoggerService,
  ): Promise<RunResult> {
    const project = await new ProjectConfigService(this.projectsDir).load(
      projectName,
    );
    const ai = options.skipAi
      ? undefined
      : new OllamaService(OllamaService.settingsFromEnv(this.env), logger);
    return new TestRunService({
      logger,
      reportsDir: this.reportsDir,
      headless: !options.headed,
      ai,
      env: this.env,
    }).run(project);
  }
}
