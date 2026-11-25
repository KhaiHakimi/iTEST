import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {GoalResult} from '../agent/interfaces/agent.interface.js';
import type {Finding} from './interfaces/finding.interface.js';
import type {RunReport, RunSummary} from './interfaces/run-report.interface.js';
import {SEVERITIES} from './report.constants.js';

/** Writes a run's results as `report.json` (for tools) and `report.md` (for people). */
export class ReportService {
  summarise(report: RunReport): RunSummary {
    const bySeverity = {critical: 0, high: 0, medium: 0, low: 0};
    for (const finding of report.findings) {
      bySeverity[finding.severity] += 1;
    }
    const countGoals = (status: GoalResult['status']) =>
      report.goals.filter(goal => goal.status === status).length;
    return {
      status: report.status,
      findings: report.findings.length,
      bySeverity,
      serious: bySeverity.critical + bySeverity.high,
      goals: {
        total: report.goals.length,
        passed: countGoals('passed'),
        failed: countGoals('failed'),
        couldNotFinish: countGoals('could-not-finish'),
      },
    };
  }

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
      `- AI: ${this.inline(report.ai)}`,
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

    if (report.goals.length) {
      lines.push('', '## Test goals', '');
      report.goals.forEach(goal => lines.push(...this.formatGoal(goal)));
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
    const toConfirm =
      finding.confirmation === 'to-confirm' ? ' (AI-found: to confirm)' : '';
    const lines = [
      `### ${number}. [${finding.severity}] ${this.inline(finding.title)}${toConfirm}${seen}`,
      '',
      `- Source: ${finding.source}`,
      `- Page: ${finding.pageUrl}`,
    ];
    if (finding.screenshot) {
      lines.push(
        `- Screenshot: [${finding.screenshot}](${finding.screenshot})`,
      );
    }
    lines.push('', this.fence(finding.detail));
    if (finding.stepsToReproduce?.length) {
      lines.push(
        '',
        'Steps to reproduce:',
        '',
        ...finding.stepsToReproduce.map(
          (step, index) => `${index + 1}. ${this.inline(step)}`,
        ),
      );
    }
    if (finding.evidence) {
      lines.push('', 'Evidence:', '', this.fence(finding.evidence));
    }
    lines.push('');
    return lines;
  }

  private formatGoal(goal: GoalResult): string[] {
    const lines = [
      `### ${goal.id}: ${goal.status}`,
      '',
      `Goal: ${this.inline(goal.goal)}`,
      '',
      `Result: ${this.inline(goal.summary)}`,
    ];
    if (goal.steps.length) {
      lines.push(
        '',
        ...goal.steps.map(
          step =>
            `${step.number}. ${this.inline(step.description)} (${step.outcome}: ${this.inline(step.detail)})`,
        ),
      );
    }
    lines.push('');
    return lines;
  }

  /**
   * Text from pages or the AI shown outside a fence: kept on one line, with
   * angle brackets escaped so it cannot inject HTML into rendered Markdown.
   */
  private inline(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
