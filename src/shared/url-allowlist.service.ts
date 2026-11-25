/** Schemes that stay inside the browser and never reach the network. */
const IN_BROWSER_PROTOCOLS = new Set(['data:', 'blob:', 'about:']);

/**
 * Decides which URLs the agent may contact. This is the code-enforced guard
 * against prompt injection described in the proposal: whatever a page or the
 * AI says, requests outside the application under test are refused.
 */
export class UrlAllowlistService {
  private readonly origins: ReadonlySet<string>;

  constructor(baseUrl: string, extraOrigins: readonly string[] = []) {
    this.origins = new Set(
      [baseUrl, ...extraOrigins].map(url => new URL(url).origin),
    );
  }

  isAllowed(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      // An unparseable URL cannot be proven safe, so it is refused.
      return false;
    }
    if (IN_BROWSER_PROTOCOLS.has(parsed.protocol)) {
      return true;
    }
    return this.origins.has(parsed.origin);
  }
}
