import {AxeBuilder} from '@axe-core/playwright';
import type {Page} from 'playwright';
import type {FindingStoreService} from '../report/finding-store.service.js';
import type {Severity} from '../report/interfaces/finding.interface.js';
import {AXE_TAGS} from './checkers.constants.js';

/** Maximum element selectors quoted per accessibility finding. */
const MAX_EXAMPLE_ELEMENTS = 3;

/** Runs axe-core's standard accessibility rules on the current page. */
export class AccessibilityCheckerService {
  constructor(private readonly findings: FindingStoreService) {}

  async check(page: Page, pageUrl: string): Promise<void> {
    const results = await new AxeBuilder({page})
      .withTags([...AXE_TAGS])
      .analyze();
    for (const violation of results.violations) {
      const examples = violation.nodes
        .slice(0, MAX_EXAMPLE_ELEMENTS)
        .map(node => node.target.join(' '));
      this.findings.add({
        source: 'accessibility',
        severity: this.severityFor(violation.impact),
        title: `Accessibility: ${violation.help}`,
        pageUrl,
        detail:
          `${violation.description} Affects ${violation.nodes.length} ` +
          `element(s). Rule: ${violation.id} (${violation.helpUrl}).`,
        evidence: examples.join('\n'),
      });
    }
  }

  /** Accessibility issues rarely break a journey, so they cap at medium. */
  private severityFor(impact: string | null | undefined): Severity {
    return impact === 'critical' || impact === 'serious' ? 'medium' : 'low';
  }
}
