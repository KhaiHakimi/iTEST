import type {UrlAllowlistService} from '../shared/url-allowlist.service.js';
import {DANGEROUS_ACTION_WORDS} from './agent.constants.js';
import type {
  AgentAction,
  GuardVerdict,
  ObservedElement,
  PageObservation,
} from './interfaces/agent.interface.js';

const FILLABLE_ROLES = new Set(['textbox', 'searchbox', 'spinbutton']);

/**
 * Checks every AI action in code before it runs. Whatever the AI was told by
 * a page, it can only touch listed elements, stay on the app under test, and
 * never press dangerous buttons the goal did not allow.
 */
export class ActionGuardService {
  constructor(
    private readonly allowlist: UrlAllowlistService,
    private readonly baseUrl: string,
  ) {}

  check(
    action: AgentAction,
    observation: PageObservation,
    allowedWords: readonly string[],
  ): GuardVerdict {
    switch (action.type) {
      case 'click':
        return this.checkClick(action.ref, observation, allowedWords);
      case 'fill':
        return this.checkElement(action.ref, observation, element =>
          FILLABLE_ROLES.has(element.role)
            ? undefined
            : `"${element.name}" is a ${element.role}, not a text field`,
        );
      case 'select':
        return this.checkElement(action.ref, observation, element => {
          if (element.role !== 'combobox') {
            return `"${element.name}" is not a dropdown`;
          }
          return element.options?.includes(action.value)
            ? undefined
            : `"${action.value}" is not one of its options`;
        });
      case 'navigate':
        return this.checkNavigate(action.path);
      case 'report_bug':
      case 'finish':
        return {allowed: true};
    }
  }

  /** Resolves an allowed navigation path to a full URL on the app. */
  resolvePath(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  private checkClick(
    ref: string,
    observation: PageObservation,
    allowedWords: readonly string[],
  ): GuardVerdict {
    return this.checkElement(ref, observation, element => {
      const word = this.dangerousWordIn(element.name, allowedWords);
      return word
        ? `"${element.name}" looks dangerous ("${word}") and this goal does not allow it`
        : undefined;
    });
  }

  private checkElement(
    ref: string,
    observation: PageObservation,
    rule: (element: ObservedElement) => string | undefined,
  ): GuardVerdict {
    const element = observation.elements.find(e => e.ref === ref);
    if (!element) {
      return {allowed: false, reason: `No element ${ref} on the current page`};
    }
    if (element.disabled) {
      return {allowed: false, reason: `"${element.name}" is disabled`};
    }
    const problem = rule(element);
    return problem ? {allowed: false, reason: problem} : {allowed: true};
  }

  private checkNavigate(path: string): GuardVerdict {
    // Paths only: "//host" would be read as another site, so it is refused too.
    if (!path.startsWith('/') || path.startsWith('//')) {
      return {
        allowed: false,
        reason: `"${path}" is not a path on the application under test`,
      };
    }
    const url = this.resolvePath(path);
    return this.allowlist.isAllowed(url)
      ? {allowed: true}
      : {allowed: false, reason: `${url} is outside the allowlist`};
  }

  private dangerousWordIn(
    name: string,
    allowedWords: readonly string[],
  ): string | undefined {
    const allowed = new Set(allowedWords.map(w => w.toLowerCase()));
    return DANGEROUS_ACTION_WORDS.find(
      word =>
        !allowed.has(word) &&
        new RegExp(`\\b${word.replace(/ /g, '\\s+')}\\b`, 'i').test(name),
    );
  }
}
