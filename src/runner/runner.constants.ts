export const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * Extra wait after "load" so late API calls (and their errors) are seen.
 * Pages that poll never go idle, so this is a cap, not a requirement.
 */
export const NETWORK_IDLE_TIMEOUT_MS = 5_000;
