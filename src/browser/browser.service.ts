import {chromium, type Browser, type BrowserContext} from 'playwright';
import type {UrlAllowlistService} from '../shared/url-allowlist.service.js';

/** Owns the Playwright browser and enforces the URL allowlist on every request. */
export class BrowserService {
  private browser: Browser | undefined;

  constructor(private readonly headless: boolean) {}

  async openContext(
    allowlist: UrlAllowlistService,
    onBlocked: (url: string) => void,
  ): Promise<BrowserContext> {
    this.browser ??= await chromium.launch({headless: this.headless});
    // Service workers can fetch without passing through routes, so block them.
    const context = await this.browser.newContext({serviceWorkers: 'block'});
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (allowlist.isAllowed(url)) {
        await route.continue();
        return;
      }
      onBlocked(url);
      await route.abort('blockedbyclient');
    });
    return context;
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }
}
