#!/usr/bin/env node
import {existsSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {ProjectConfigService} from './config/project-config.service.js';
import {DoctorService} from './doctor/doctor.service.js';
import {ReportService} from './report/report.service.js';
import type {ProjectRunOptions} from './runner/interfaces/test-run.interface.js';
import {ProjectRunService} from './runner/project-run.service.js';
import {LoggerService} from './shared/logger.service.js';
import {ReportStoreService} from './ui/report-store.service.js';
import {RunManagerService} from './ui/run-manager.service.js';
import {DEFAULT_UI_PORT} from './ui/ui.constants.js';
import {UiServerService} from './ui/ui-server.service.js';

/** Works from both src/ (tsx) and dist/ (compiled). */
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECTS_DIR = join(ROOT_DIR, 'projects');
const REPORTS_DIR = join(ROOT_DIR, 'reports');

const EXIT_OK = 0;
const EXIT_SERIOUS_FINDINGS = 1;
const EXIT_AGENT_FAILED = 2;

const USAGE = `AI testing agent

Usage:
  npm run agent -- run <project> [--headed] [--skip-ai]
                                   Test a project and write a report
  npm run agent -- list            List projects in projects/
  npm run agent -- doctor          Check Node, browser and local Ollama
  npm run agent -- ui [--port N]   Start the local web UI (default port ${DEFAULT_UI_PORT})

Options:
  --headed    Show the browser window
  --skip-ai   Run the automatic checks only, without the AI test goals
  --port      Port for the web UI, on 127.0.0.1 only

Exit codes: 0 ok, 1 high or critical findings or a failed goal,
2 the agent could not finish.`;

async function main(): Promise<number> {
  const envFile = join(ROOT_DIR, '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  const {positionals, values} = parseArgs({
    allowPositionals: true,
    options: {
      headed: {type: 'boolean', default: false},
      'skip-ai': {type: 'boolean', default: false},
      port: {type: 'string', default: String(DEFAULT_UI_PORT)},
      help: {type: 'boolean', short: 'h', default: false},
    },
  });
  const [command, projectName] = positionals;
  const logger = new LoggerService('agent');

  if (values.help || !command) {
    console.log(USAGE);
    return EXIT_OK;
  }
  switch (command) {
    case 'run':
      return runProject(
        projectName,
        {headed: values.headed, skipAi: values['skip-ai']},
        logger,
      );
    case 'list':
      return listProjects();
    case 'doctor':
      return runDoctor(logger);
    case 'ui':
      return startUi(values.port, logger);
    default:
      console.error(`Unknown command "${command}".\n\n${USAGE}`);
      return EXIT_AGENT_FAILED;
  }
}

async function runProject(
  projectName: string | undefined,
  options: ProjectRunOptions,
  logger: LoggerService,
): Promise<number> {
  if (!projectName) {
    console.error('Name the project to run, e.g. npm run agent -- run demo');
    return EXIT_AGENT_FAILED;
  }
  const {report, reportFile} = await new ProjectRunService(
    PROJECTS_DIR,
    REPORTS_DIR,
    process.env,
  ).run(projectName, options, logger);

  const summary = new ReportService().summarise(report);
  logger.info(
    `Run ${summary.status}: ${summary.findings} finding(s), ${summary.serious} high or critical, ` +
      `${summary.goals.failed} of ${summary.goals.total} goal(s) failed.`,
  );
  logger.info(`Report: ${relative(process.cwd(), reportFile)}`);

  if (summary.status === 'could-not-finish') {
    return EXIT_AGENT_FAILED;
  }
  return summary.serious > 0 || summary.goals.failed > 0
    ? EXIT_SERIOUS_FINDINGS
    : EXIT_OK;
}

async function startUi(
  portOption: string,
  logger: LoggerService,
): Promise<number> {
  const port = Number(portOption);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error(`Invalid port "${portOption}".`);
    return EXIT_AGENT_FAILED;
  }
  const projectRuns = new ProjectRunService(
    PROJECTS_DIR,
    REPORTS_DIR,
    process.env,
  );
  const server = new UiServerService({
    rootDir: ROOT_DIR,
    projects: new ProjectConfigService(PROJECTS_DIR),
    reports: new ReportStoreService(REPORTS_DIR, logger),
    runs: new RunManagerService((name, options, runLogger) =>
      projectRuns.run(name, options, runLogger),
    ),
    doctor: () => new DoctorService(logger, process.env).runAll(),
    logger,
  });
  const actualPort = await server.listen(port);
  logger.info(`Web UI ready: http://127.0.0.1:${actualPort} (Ctrl+C to stop)`);

  await new Promise<void>(resolve => process.once('SIGINT', () => resolve()));
  logger.info('Stopping web UI');
  await server.close();
  return EXIT_OK;
}

async function listProjects(): Promise<number> {
  const projects = await new ProjectConfigService(PROJECTS_DIR).list();
  console.log(projects.length ? projects.join('\n') : 'No projects yet.');
  return EXIT_OK;
}

async function runDoctor(logger: LoggerService): Promise<number> {
  const checks = await new DoctorService(logger, process.env).runAll();
  for (const check of checks) {
    console.log(
      `${check.ok ? 'OK  ' : 'FAIL'} ${check.name}: ${check.message}`,
    );
  }
  return checks.every(check => check.ok) ? EXIT_OK : EXIT_AGENT_FAILED;
}

main().then(
  code => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = EXIT_AGENT_FAILED;
  },
);
