import {existsSync} from 'node:fs';
import {readFile, readdir} from 'node:fs/promises';
import {join, resolve, sep} from 'node:path';
import type {RunReport} from '../report/interfaces/run-report.interface.js';
import {ReportService} from '../report/report.service.js';
import type {LoggerService} from '../shared/logger.service.js';
import type {ReportListItem} from './interfaces/ui.interface.js';
import {ReportNotFoundError} from './report-not-found.error.js';
import {
  PROJECT_NAME_PATTERN,
  REPORT_ID_PATTERN,
  SCREENSHOT_PATTERN,
} from './ui.constants.js';

const REPORT_FILE = 'report.json';
const SCREENSHOT_FOLDER = 'screenshots';

/**
 * Read-only access to saved reports for the web UI. Every name from a
 * request is checked against a strict pattern and the final path must stay
 * inside the reports folder.
 */
export class ReportStoreService {
  private readonly reportsDir: string;

  constructor(
    reportsDir: string,
    private readonly logger: LoggerService,
  ) {
    this.reportsDir = resolve(reportsDir);
  }

  /** Newest first. Only the newest `limit` report files are read. */
  async list(limit: number): Promise<ReportListItem[]> {
    if (!existsSync(this.reportsDir)) {
      return [];
    }
    const runs: Array<{project: string; id: string}> = [];
    for (const project of await this.subfolders(this.reportsDir)) {
      if (!PROJECT_NAME_PATTERN.test(project)) {
        continue;
      }
      for (const id of await this.subfolders(join(this.reportsDir, project))) {
        if (
          REPORT_ID_PATTERN.test(id) &&
          existsSync(join(this.reportsDir, project, id, REPORT_FILE))
        ) {
          runs.push({project, id});
        }
      }
    }
    runs.sort((a, b) => b.id.localeCompare(a.id));

    const summariser = new ReportService();
    const items: ReportListItem[] = [];
    for (const run of runs.slice(0, limit)) {
      try {
        const report = await this.read(run.project, run.id);
        items.push({
          ...run,
          startedAt: report.startedAt,
          finishedAt: report.finishedAt,
          status: report.status,
          summary: summariser.summarise(report),
        });
      } catch (error) {
        // One damaged report file should not hide all the others.
        this.logger.warn(
          `Skipping unreadable report ${run.project}/${run.id}: ${String(error)}`,
        );
      }
    }
    return items;
  }

  async read(project: string, id: string): Promise<RunReport> {
    const file = join(this.runDir(project, id), REPORT_FILE);
    const saved = JSON.parse(
      await readFile(file, 'utf8'),
    ) as Partial<RunReport>;
    return this.withDefaults(saved);
  }

  /** Returns the screenshot's path, or undefined if the name or file is not valid. */
  screenshotPath(
    project: string,
    id: string,
    file: string,
  ): string | undefined {
    if (!SCREENSHOT_PATTERN.test(file)) {
      return undefined;
    }
    const path = join(this.runDir(project, id), SCREENSHOT_FOLDER, file);
    return existsSync(path) ? path : undefined;
  }

  private runDir(project: string, id: string): string {
    if (!PROJECT_NAME_PATTERN.test(project) || !REPORT_ID_PATTERN.test(id)) {
      throw new ReportNotFoundError();
    }
    const dir = resolve(this.reportsDir, project, id);
    // Belt and braces: the patterns already rule out "..", but check anyway.
    if (!dir.startsWith(this.reportsDir + sep)) {
      throw new ReportNotFoundError();
    }
    if (!existsSync(join(dir, REPORT_FILE))) {
      throw new ReportNotFoundError();
    }
    return dir;
  }

  /** Reports saved before Phase 2 have no goals or AI line. */
  private withDefaults(saved: Partial<RunReport>): RunReport {
    if (
      typeof saved.project !== 'string' ||
      typeof saved.startedAt !== 'string' ||
      !Array.isArray(saved.findings)
    ) {
      throw new Error('report.json is missing required fields');
    }
    return {
      environment: '',
      baseUrl: '',
      finishedAt: saved.startedAt,
      status: 'completed',
      pages: [],
      ...saved,
      ai: saved.ai ?? 'Not recorded (report from before AI testing).',
      goals: saved.goals ?? [],
    } as RunReport;
  }

  private async subfolders(dir: string): Promise<string[]> {
    const entries = await readdir(dir, {withFileTypes: true});
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  }
}
