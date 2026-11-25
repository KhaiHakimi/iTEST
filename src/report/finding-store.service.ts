import type {Finding, NewFinding} from './interfaces/finding.interface.js';
import {MAX_FINDING_TEXT_CHARS, SEVERITY_RANK} from './report.constants.js';

/**
 * Collects findings from every checker during a run. Repeats of the same
 * problem on the same page are merged into one finding with a count.
 */
export class FindingStoreService {
  private readonly findings = new Map<string, Finding>();

  add(finding: NewFinding): void {
    const clean: NewFinding = {
      ...finding,
      detail: this.truncate(finding.detail),
      evidence:
        finding.evidence === undefined
          ? undefined
          : this.truncate(finding.evidence),
    };
    const key = [clean.source, clean.pageUrl, clean.title, clean.detail].join(
      '\u0000',
    );
    const existing = this.findings.get(key);
    if (existing) {
      existing.occurrences += 1;
      return;
    }
    this.findings.set(key, {...clean, occurrences: 1});
  }

  /** Most severe first, then grouped by source and page. */
  all(): Finding[] {
    return [...this.findings.values()].sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.source.localeCompare(b.source) ||
        a.pageUrl.localeCompare(b.pageUrl),
    );
  }

  private truncate(text: string): string {
    return text.length <= MAX_FINDING_TEXT_CHARS
      ? text
      : `${text.slice(0, MAX_FINDING_TEXT_CHARS)}… (truncated)`;
  }
}
