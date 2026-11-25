#!/usr/bin/env node
import {existsSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {OllamaService} from './ai/ollama.service.js';
import {ProjectConfigService} from './config/project-config.service.js';
import {DoctorService} from './doctor/doctor.service.js';
import {TestRunService} from './runner/test-run.service.js';
import {LoggerService} from './shared/logger.service.js';

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

Options:
  --headed    Show the browser window
  --skip-ai   Run the automatic checks only, without the AI test goals

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
    default:
      console.error(`Unknown command "${command}".\n\n${USAGE}`);
      return EXIT_AGENT_FAILED;
  }
}

async function runProject(
  projectName: string | undefined,
  {headed, skipAi}: {headed: boolean; skipAi: boolean},
  logger: LoggerService,
): Promise<number> {
  if (!projectName) {
    console.error('Name the project to run, e.g. npm run agent -- run demo');
    return EXIT_AGENT_FAILED;
  }
  const project = await new ProjectConfigService(PROJECTS_DIR).load(
    projectName,
  );
  const ai = skipAi
    ? undefined
    : new OllamaService(OllamaService.settingsFromEnv(process.env), logger);
  const {report, reportFile} = await new TestRunService({
    logger,
    reportsDir: REPORTS_DIR,
    headless: !headed,
    ai,
    env: process.env,
  }).run(project);

  const serious = report.findings.filter(
    f => f.severity === 'critical' || f.severity === 'high',
  ).length;
  const failedGoals = report.goals.filter(g => g.status === 'failed').length;
  logger.info(
    `Run ${report.status}: ${report.findings.length} finding(s), ${serious} high or critical, ` +
      `${failedGoals} of ${report.goals.length} goal(s) failed.`,
  );
  logger.info(`Report: ${relative(process.cwd(), reportFile)}`);

  if (report.status === 'could-not-finish') {
    return EXIT_AGENT_FAILED;
  }
  return serious > 0 || failedGoals > 0 ? EXIT_SERIOUS_FINDINGS : EXIT_OK;
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
