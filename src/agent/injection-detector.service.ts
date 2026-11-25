import {SUSPICIOUS_TEXT_PATTERNS} from './agent.constants.js';

/** Characters of context kept either side of a suspicious match. */
const SNIPPET_PADDING = 60;

/**
 * Spots page text that tries to give the AI instructions (prompt injection),
 * so it can be flagged in the report. Detection does not make the agent safe
 * on its own; the allowlist and action guard do that.
 */
export class InjectionDetectorService {
  /** Returns a short snippet around each suspicious phrase. */
  findSuspiciousText(text: string): string[] {
    const snippets: string[] = [];
    for (const pattern of SUSPICIOUS_TEXT_PATTERNS) {
      const match = pattern.exec(text);
      if (!match) {
        continue;
      }
      const start = Math.max(0, match.index - SNIPPET_PADDING);
      const end = Math.min(
        text.length,
        match.index + match[0].length + SNIPPET_PADDING,
      );
      snippets.push(text.slice(start, end).replace(/\s+/g, ' ').trim());
    }
    return snippets;
  }
}
