import {join, resolve} from 'node:path';
import type {Page} from 'playwright';
import {ActionExecutorService} from '../agent/action-executor.service.js';
import {ActionGuardService} from '../agent/action-guard.service.js';
import {AgentBrainService} from '../agent/agent-brain.service.js';
import {GoalRunnerService} from '../agent/goal-runner.service.js';
import {InjectionDetectorService} from '../agent/injection-detector.service.js';
import type {GoalResult} from '../agent/interfaces/agent.interface.js';
import {LoginService} from '../agent/login.service.js';
import {PageObserverService} from '../agent/page-observer.service.js';
import {BrowserService} from '../browser/browser.service.js';
import {AccessibilityCheckerService} from '../checkers/accessibility-checker.service.js';
import {ErrorCheckerService} from '../checkers/error-checker.service.js';
import {LinkCheckerService} from '../checkers/link-checker.service.js';
import type {
  LoadedProject,
  ProjectConfig,
  TestGoal,
} from '../config/interfaces/project-config.interface.js';
import {AppLauncherService} from '../launcher/app-launcher.service.js';
import {FindingStoreService} from '../report/finding-store.service.js';
import type {
  PageVisit,
  RunReport,
  RunStatus,
} from '../report/interfaces/run-report.interface.js';
import {ReportService} from '../report/report.service.js';
import {UrlAllowlistService} from '../shared/url-allowlist.service.js';
import type {
  GoalsOutcome,
  RunCheckers,
  RunResult,
  TestRunOptions,
} from './interfaces/test-run.interface.js';
import {
  NAVIGATION_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from './runner.constants.js';

/**
 * One test run: start the app, check each configured page with the
 * automatic checkers (Phase 1), work through the AI test goals (Phase 2),
 * then write the report and stop the app.
 */
export class TestRunService {
  constructor(private readonly options: TestRunOptions) {}

  async run({config, projectDir}: LoadedProject): Promise<RunResult> {
    const {logger} = this.options;
    const startedAt = new Date();
    const reportDir = join(
      this.options.reportsDir,
      config.name,
      this.folderNameFor(startedAt),
    );
    const allowlist = new UrlAllowlistService(
      config.baseUrl,
      config.allowedOrigins,
    );
    const findings = new FindingStoreService();
    const checkers: RunCheckers = {
      findings,
      errors: new ErrorCheckerService(findings),
      links: config.checks.brokenLinks
        ? new LinkCheckerService(
            findings,
            allowlist,
            config.checks.maxLinksPerPage,
          )
        : undefined,
      accessibility: config.checks.accessibility
        ? new AccessibilityCheckerService(findings)
        : undefined,
    };
    const launcher = new AppLauncherService(logger);
    const browser = new BrowserService(this.options.headless);
    const pages: PageVisit[] = [];
    let goalsOutcome: GoalsOutcome = {
      goals: [],
      ai: config.testGoals.length
        ? 'Not reached: the run stopped early.'
        : 'No test goals in project.json.',
    };
    let status: RunStatus = 'completed';
    let failure: string | undefined;

    try {
      if (config.app) {
        await launcher.start({
          command: config.app.startCommand,
          cwd: resolve(projectDir, config.app.cwd),
          readyUrl: config.app.readyUrl ?? config.baseUrl,
          timeoutMs: config.app.readyTimeoutSeconds * 1000,
        });
      }
      const context = await browser.openContext(allowlist, url =>
        checkers.errors.recordBlockedRequest(url),
      );
      const page = await context.newPage();
      checkers.errors.watch(page);
      for (const path of config.pages) {
        const url = new URL(path, config.baseUrl).toString();
        logger.info(`Testing ${url}`);
        pages.push(await this.visitPage(page, url, checkers));
      }
      await context.close();

      if (config.testGoals.length) {
        goalsOutcome = await this.runGoals(
          config,
          browser,
          allowlist,
          checkers,
          reportDir,
        );
      }
    } catch (error) {
      status = 'could-not-finish';
      failure = this.messageOf(error);
      logger.error(`Run could not finish: ${failure}`);
    } finally {
      await browser.close();
      await launcher.stop();
    }

    const report: RunReport = {
      project: config.name,
      environment: config.environment,
      baseUrl: config.baseUrl,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      status,
      failure,
      ai: goalsOutcome.ai,
      pages,
      goals: goalsOutcome.goals,
      findings: findings.all(),
    };
    const reportFile = await new ReportService().write(report, reportDir);
    return {report, reportFile};
  }

  /** Start-up check first; if the AI is not ready, goals are marked "could not finish". */
  private async runGoals(
    config: ProjectConfig,
    browser: BrowserService,
    allowlist: UrlAllowlistService,
    checkers: RunCheckers,
    reportDir: string,
  ): Promise<GoalsOutcome> {
    const {ai, logger, env} = this.options;
    if (!ai) {
      return this.skipGoals(
        config.testGoals,
        'AI testing skipped (--skip-ai).',
      );
    }
    let healthMessage: string;
    try {
      const health = await ai.healthCheck();
      if (!health.ok) {
        return this.skipGoals(
          config.testGoals,
          `Local AI not ready: ${health.message}`,
        );
      }
      healthMessage = health.message;
    } catch (error) {
      return this.skipGoals(
        config.testGoals,
        `Local AI not ready: ${this.messageOf(error)}`,
      );
    }
    logger.info(`Local AI ready. ${healthMessage}`);

    const runner = new GoalRunnerService({
      browser,
      allowlist,
      errors: checkers.errors,
      findings: checkers.findings,
      brain: new AgentBrainService(ai),
      guard: new ActionGuardService(allowlist, config.baseUrl),
      observer: new PageObserverService(),
      executor: new ActionExecutorService(),
      detector: new InjectionDetectorService(),
      login: config.login ? new LoginService(config.login, env) : undefined,
      accounts: config.accounts,
      reportDir,
      logger,
    });
    const goals: GoalResult[] = [];
    for (const goal of config.testGoals) {
      const result = await runner.run(goal);
      logger.info(`Goal "${goal.id}" ${result.status}: ${result.summary}`);
      goals.push(result);
    }
    return {goals, ai: `${ai.model}. Start-up check: ${healthMessage}`};
  }

  private skipGoals(goals: TestGoal[], reason: string): GoalsOutcome {
    this.options.logger.warn(reason);
    return {
      goals: goals.map(goal => ({
        id: goal.id,
        goal: goal.goal,
        status: 'could-not-finish',
        summary: reason,
        steps: [],
      })),
      ai: reason,
    };
  }

  private async visitPage(
    page: Page,
    url: string,
    checkers: RunCheckers,
  ): Promise<PageVisit> {
    checkers.errors.setCurrentPage(url);
    const started = Date.now();
    let status: number | null;
    try {
      const response = await page.goto(url, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      status = response?.status() ?? null;
      await this.waitForNetworkIdle(page);
    } catch (error) {
      checkers.findings.add({
        source: 'navigation',
        severity: 'high',
        title: 'Page could not be opened',
        pageUrl: url,
        detail: this.messageOf(error),
      });
      return {url, status: null, durationMs: Date.now() - started};
    }
    const durationMs = Date.now() - started;

    if (checkers.links) {
      const links = checkers.links;
      await this.runCheck('Link check', url, checkers, () =>
        links.check(page, url),
      );
    }
    if (checkers.accessibility) {
      const accessibility = checkers.accessibility;
      await this.runCheck('Accessibility check', url, checkers, () =>
        accessibility.check(page, url),
      );
    }
    return {url, status, durationMs};
  }

  private async waitForNetworkIdle(page: Page): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', {
        timeout: NETWORK_IDLE_TIMEOUT_MS,
      });
    } catch {
      // Expected for pages that poll; carry on with what has loaded.
    }
  }

  /** A failing checker is reported, but does not stop the rest of the run. */
  private async runCheck(
    name: string,
    url: string,
    checkers: RunCheckers,
    check: () => Promise<void>,
  ): Promise<void> {
    try {
      await check();
    } catch (error) {
      const message = this.messageOf(error);
      this.options.logger.warn(`${name} failed on ${url}: ${message}`);
      checkers.findings.add({
        source: 'agent',
        severity: 'low',
        title: `${name} could not run`,
        pageUrl: url,
        detail: message,
      });
    }
  }

  private folderNameFor(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '-');
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
