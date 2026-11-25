export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen3:8b';
export const DEFAULT_WARN_SECONDS = 10;

/** Only these hosts are accepted, so no prompt or page content leaves the machine. */
export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

export const MAX_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 1_000;
export const METADATA_TIMEOUT_MS = 5_000;
/** The first prompt also loads the model into memory, which is slow on CPU. */
export const GENERATE_TIMEOUT_MS = 180_000;
/** Keeps the model loaded between calls during a run. */
export const KEEP_ALIVE = '15m';
