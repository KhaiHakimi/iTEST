/**
 * Clicks on elements whose name contains one of these words are refused unless
 * the test goal lists the word in allowActions (proposal: dangerous actions).
 */
export const DANGEROUS_ACTION_WORDS: readonly string[] = [
  'delete',
  'remove',
  'destroy',
  'deactivate',
  'pay',
  'payment',
  'purchase',
  'buy',
  'transfer',
  'send',
  'log out',
  'logout',
  'sign out',
  'signout',
  'unsubscribe',
];

/** Phrases that suggest a page is trying to steer the AI. */
export const SUSPICIOUS_TEXT_PATTERNS: readonly RegExp[] = [
  /ignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions|prompts?|rules)/i,
  /disregard\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier)/i,
  /\byou\s+are\s+now\s+(?:a|an|the)\b/i,
  /\bsystem\s+prompt\b/i,
  /\bnew\s+instructions?\s*:/i,
];

/** Attribute the observer stamps on elements so actions can find them again. */
export const REF_ATTRIBUTE = 'data-agent-ref';

/** Untrusted page content is wrapped in this tag inside prompts. */
export const UNTRUSTED_TAG = 'untrusted_page_content';

export const MAX_OBSERVED_ELEMENTS = 80;
export const MAX_PAGE_TEXT_CHARS = 4_000;
export const MAX_RAW_TEXT_CHARS = 20_000;
/** Steps shown to the AI; older ones are summarised by count only. */
export const MAX_HISTORY_STEPS = 10;
/** Attempts at getting a valid JSON decision before giving up. */
export const MAX_DECISION_ATTEMPTS = 2;
export const ACTION_TIMEOUT_MS = 10_000;
export const AFTER_ACTION_IDLE_MS = 3_000;
export const LOGIN_TIMEOUT_MS = 15_000;
