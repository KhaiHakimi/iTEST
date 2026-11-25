import {resolve, join} from 'node:path';
import type {Page} from 'playwright';
import {BrowserService} from '../browser/browser.service.js';
import {AccessibilityCheckerService} from '../checkers/accessibility-checker.service.js';
import {ErrorCheckerService} from '../checkers/error-checker.service.js';
import {LinkCheckerService} from '../checkers/link-checker.service.js';
import type {LoadedProject} from '../config/interfaces/project-config.interface.js';
import {AppLauncherService} from '../launcher/app-launcher.service.js';
import {FindingStoreService} from '../report/finding-store.service.js';
import type {
  PageVisit,
  RunReport,
  RunStatus,
} from '../report/interfaces/run-report.interface.js';
import {ReportService} from '../report/report.service.js';
import type {LoggerService} from '../shared/logger.service.js';
import {UrlAllowlistService} from '../shared/url-allowlist.service.js';
import type {RunCheckers, RunResult} from './interfaces/test-run.interface.js';
import {
  NAVIGATION_TIMEOUT_MS,
  NETWORK_IDLE_TIMEOUT_MS,
} from './runner.constants.js';

/**
 * Phase 1 test run: start the app, open each configured page, let the
 * automatic checkers watch, then write the report and stop the app.
 */
export class TestRunService {
  constructor(
    private readonly logger: LoggerService,
    private readonly reportsDir: string,
    private readonly headless: boolean,
  ) {}

  async run({config, projectDir}: LoadedProject): Promise<RunResult> {
    const startedAt = new Date();
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
    const launcher = new AppLauncherService(this.logger);
    const browser = new BrowserService(this.headless);
    const pages: PageVisit[] = [];
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
        this.logger.info(`Testing ${url}`);
        pages.push(await this.visitPage(page, url, checkers));
      }
    } catch (error) {
      status = 'could-not-finish';
      failure = this.messageOf(error);
      this.logger.error(`Run could not finish: ${failure}`);
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
      pages,
      findings: findings.all(),
    };
    const outDir = join(
      this.reportsDir,
      config.name,
      this.folderNameFor(startedAt),
    );
    const reportFile = await new ReportService().write(report, outDir);
    return {report, reportFile};
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
      this.logger.warn(`${name} failed on ${url}: ${message}`);
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
