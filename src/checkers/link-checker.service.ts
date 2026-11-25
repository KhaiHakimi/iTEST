import type {Page} from 'playwright';
import type {FindingStoreService} from '../report/finding-store.service.js';
import type {UrlAllowlistService} from '../shared/url-allowlist.service.js';
import {
  DANGEROUS_LINK_PATTERN,
  LINK_CHECK_TIMEOUT_MS,
} from './checkers.constants.js';

interface PageLink {
  href: string;
  text: string;
}

/** Finds links on a page that lead to error pages. Each URL is checked once per run. */
export class LinkCheckerService {
  private readonly checked = new Set<string>();

  constructor(
    private readonly findings: FindingStoreService,
    private readonly allowlist: UrlAllowlistService,
    private readonly maxLinksPerPage: number,
  ) {}

  async check(page: Page, pageUrl: string): Promise<void> {
    const links = await page.locator('a[href]').evaluateAll(anchors =>
      anchors.map(anchor => ({
        href: (anchor as HTMLAnchorElement).href,
        text: (anchor.textContent ?? '').trim(),
      })),
    );
    // Sequential on purpose: gentle on small dev servers.
    for (const link of this.selectLinks(links)) {
      await this.checkLink(page, pageUrl, link);
    }
  }

  private selectLinks(links: PageLink[]): PageLink[] {
    const selected: PageLink[] = [];
    for (const link of links) {
      if (selected.length >= this.maxLinksPerPage) {
        break;
      }
      const url = new URL(link.href);
      url.hash = '';
      const href = url.toString();
      if (
        !url.protocol.startsWith('http') ||
        !this.allowlist.isAllowed(href) ||
        DANGEROUS_LINK_PATTERN.test(`${url.pathname} ${link.text}`) ||
        this.checked.has(href)
      ) {
        continue;
      }
      this.checked.add(href);
      selected.push({href, text: link.text});
    }
    return selected;
  }

  private async checkLink(
    page: Page,
    pageUrl: string,
    link: PageLink,
  ): Promise<void> {
    const path = new URL(link.href).pathname;
    try {
      // Redirects are not followed so the checker can never leave the allowlist.
      const response = await page.request.get(link.href, {
        maxRedirects: 0,
        failOnStatusCode: false,
        timeout: LINK_CHECK_TIMEOUT_MS,
      });
      const status = response.status();
      await response.dispose();
      if (status < 400) {
        return;
      }
      this.findings.add({
        source: 'broken-link',
        severity: status >= 500 ? 'high' : 'medium',
        title: `Broken link: ${path} (HTTP ${status})`,
        pageUrl,
        detail: `Link text: "${link.text || '(no text)'}"`,
        evidence: link.href,
      });
    } catch (error) {
      this.findings.add({
        source: 'broken-link',
        severity: 'medium',
        title: `Link could not be loaded: ${path}`,
        pageUrl,
        detail: error instanceof Error ? error.message : String(error),
        evidence: link.href,
      });
    }
  }
}
