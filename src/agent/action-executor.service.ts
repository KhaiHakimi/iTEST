import type {Page} from 'playwright';
import {
  ACTION_TIMEOUT_MS,
  AFTER_ACTION_IDLE_MS,
  REF_ATTRIBUTE,
} from './agent.constants.js';
import type {
  AgentAction,
  BrowserAction,
  PageObservation,
} from './interfaces/agent.interface.js';

/**
 * Carries out a guard-approved action in the browser. Refs were validated
 * against the observation (format e<number>), so they are safe in a selector.
 */
export class ActionExecutorService {
  /** Plain description used in step lists and steps to reproduce. */
  describe(action: AgentAction, observation: PageObservation): string {
    const name = (ref: string) =>
      `"${observation.elements.find(e => e.ref === ref)?.name ?? ref}"`;
    switch (action.type) {
      case 'click':
        return `Click ${name(action.ref)}`;
      case 'fill':
        return `Fill ${name(action.ref)} with "${action.value}"`;
      case 'select':
        return `Select "${action.value}" in ${name(action.ref)}`;
      case 'navigate':
        return `Open ${action.path}`;
      case 'report_bug':
        return `Report bug: ${action.title}`;
      case 'finish':
        return `Finish (${action.passed ? 'passed' : 'failed'})`;
    }
  }

  /** Returns where the browser ended up. */
  async execute(
    page: Page,
    action: BrowserAction,
    resolvePath: (path: string) => string,
  ): Promise<string> {
    if (action.type === 'navigate') {
      await page.goto(resolvePath(action.path), {timeout: ACTION_TIMEOUT_MS});
    } else {
      const target = page.locator(`[${REF_ATTRIBUTE}="${action.ref}"]`);
      const options = {timeout: ACTION_TIMEOUT_MS};
      if (action.type === 'click') {
        await target.click(options);
      } else if (action.type === 'fill') {
        await target.fill(action.value, options);
      } else {
        await target.selectOption({label: action.value}, options);
      }
    }
    await this.settle(page);
    return `Now at ${page.url()}`;
  }

  private async settle(page: Page): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', {
        timeout: AFTER_ACTION_IDLE_MS,
      });
    } catch {
      // Pages that poll never go idle; the next observation shows the state.
    }
  }
}
