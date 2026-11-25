import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Finding} from './interfaces/finding.interface.js';
import type {RunReport} from './interfaces/run-report.interface.js';
import {SEVERITIES} from './report.constants.js';

/** Writes a run's results as `report.json` (for tools) and `report.md` (for people). */
export class ReportService {
  /** Returns the path of the Markdown report. */
  async write(report: RunReport, outDir: string): Promise<string> {
    await mkdir(outDir, {recursive: true});
    const markdownFile = join(outDir, 'report.md');
    await writeFile(
      join(outDir, 'report.json'),
      JSON.stringify(report, null, 2),
      'utf8',
    );
    await writeFile(markdownFile, this.toMarkdown(report), 'utf8');
    return markdownFile;
  }

  private toMarkdown(report: RunReport): string {
    const lines = [
      `# Test report: ${report.project}`,
      '',
      `- Environment: ${report.environment} (${report.baseUrl})`,
      `- Started: ${report.startedAt}`,
      `- Finished: ${report.finishedAt}`,
      `- Status: **${report.status}**`,
    ];
    if (report.failure) {
      lines.push(
        '',
        '## Why the run could not finish',
        '',
        this.fence(report.failure),
      );
    }

    lines.push(
      '',
      '## Summary',
      '',
      '| Severity | Findings |',
      '| --- | --- |',
    );
    for (const severity of SEVERITIES) {
      const count = report.findings.filter(f => f.severity === severity).length;
      lines.push(`| ${severity} | ${count} |`);
    }

    lines.push('', '## Pages visited', '');
    for (const page of report.pages) {
      lines.push(
        `- ${page.url}: HTTP ${page.status ?? 'none'} in ${page.durationMs} ms`,
      );
    }

    lines.push('', '## Findings', '');
    if (report.findings.length === 0) {
      lines.push('No problems found by the automatic checks.');
    }
    report.findings.forEach((finding, index) => {
      lines.push(...this.formatFinding(finding, index + 1));
    });
    return `${lines.join('\n')}\n`;
  }

  private formatFinding(finding: Finding, number: number): string[] {
    const seen =
      finding.occurrences > 1 ? ` (seen ${finding.occurrences} times)` : '';
    const lines = [
      `### ${number}. [${finding.severity}] ${finding.title}${seen}`,
      '',
      `- Source: ${finding.source}`,
      `- Page: ${finding.pageUrl}`,
      '',
      this.fence(finding.detail),
    ];
    if (finding.evidence) {
      lines.push('', 'Evidence:', '', this.fence(finding.evidence));
    }
    lines.push('');
    return lines;
  }

  /**
   * Wraps untrusted page text in a code fence longer than any backtick run
   * inside it, so page content cannot break out and reformat the report.
   */
  private fence(text: string): string {
    const longestRun = Math.max(
      0,
      ...[...text.matchAll(/`+/g)].map(match => match[0].length),
    );
    const marker = '`'.repeat(Math.max(3, longestRun + 1));
    return `${marker}text\n${text}\n${marker}`;
  }
}
