/**
 * Request failures that are not bugs in the app:
 * - ERR_BLOCKED_BY_CLIENT is our own allowlist (reported as blocked-request).
 * - ERR_ABORTED happens when a newer navigation cancels an older request.
 */
export const IGNORED_REQUEST_FAILURES: readonly string[] = [
  'net::ERR_BLOCKED_BY_CLIENT',
  'net::ERR_ABORTED',
];

/** Chrome logs these for every failed request; the network checker already reports them. */
export const DUPLICATE_CONSOLE_PREFIX = 'Failed to load resource';

/**
 * Links whose URL or text matches are never followed by the link checker,
 * because a GET on a badly built app could log out or delete data.
 */
export const DANGEROUS_LINK_PATTERN =
  /log-?out|sign-?out|delete|remove|destroy|unsubscribe|cancel|reset/i;

export const LINK_CHECK_TIMEOUT_MS = 10_000;

/** WCAG 2.1 A and AA, the usual baseline for public-facing web apps. */
export const AXE_TAGS: readonly string[] = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
];
