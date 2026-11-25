import type {Page} from 'playwright';
import {
  MAX_OBSERVED_ELEMENTS,
  MAX_PAGE_TEXT_CHARS,
  MAX_RAW_TEXT_CHARS,
  REF_ATTRIBUTE,
} from './agent.constants.js';
import type {PageObservation} from './interfaces/agent.interface.js';

/**
 * Turns the current page into a compact description for the AI: a numbered
 * list of visible interactive elements plus trimmed visible text. Only the
 * parts relevant to choosing an action are sent, to keep prompts small.
 */
export class PageObserverService {
  async observe(page: Page): Promise<PageObservation> {
    const snapshot = await page.evaluate(
      ({refAttribute, maxElements, maxText, maxRawText}) => {
        const selector = [
          'a[href]',
          'button',
          'input:not([type=hidden])',
          'select',
          'textarea',
          '[role=button]',
          '[role=link]',
          '[role=checkbox]',
          '[role=tab]',
        ].join(',');

        const isVisible = (el: Element): boolean => {
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return (
            box.width > 0 &&
            box.height > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none'
          );
        };

        const roleOf = (el: Element): string => {
          const explicit = el.getAttribute('role');
          if (explicit) return explicit;
          const tag = el.tagName.toLowerCase();
          if (tag === 'a') return 'link';
          if (tag === 'button') return 'button';
          if (tag === 'select') return 'combobox';
          if (tag === 'textarea') return 'textbox';
          const type = (el as HTMLInputElement).type;
          if (['submit', 'button', 'reset', 'image'].includes(type)) {
            return 'button';
          }
          if (type === 'checkbox' || type === 'radio') return type;
          if (type === 'number') return 'spinbutton';
          if (type === 'search') return 'searchbox';
          if (type === 'file') return 'file';
          return 'textbox';
        };

        const nameOf = (el: Element): string => {
          const clean = (s: string | null | undefined) =>
            (s ?? '').replace(/\s+/g, ' ').trim();
          const labelledBy = el.getAttribute('aria-labelledby');
          const labelText = labelledBy
            ? clean(document.getElementById(labelledBy)?.textContent)
            : '';
          const input = el as HTMLInputElement;
          const firstLabel = input.labels?.[0];
          const candidates = [
            el.getAttribute('aria-label'),
            labelText,
            firstLabel ? firstLabel.textContent : '',
            input.placeholder,
            el.tagName === 'INPUT' ? '' : el.textContent,
            el.getAttribute('title'),
            input.type === 'submit' ? input.value : '',
            el.getAttribute('name'),
          ];
          return clean(candidates.find(c => clean(c))).slice(0, 100);
        };

        document
          .querySelectorAll(`[${refAttribute}]`)
          .forEach(el => el.removeAttribute(refAttribute));

        const elements = [...document.querySelectorAll(selector)]
          .filter(isVisible)
          .slice(0, maxElements)
          .map((el, index) => {
            const ref = `e${index + 1}`;
            el.setAttribute(refAttribute, ref);
            const input = el as HTMLInputElement;
            const role = roleOf(el);
            const isField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(
              el.tagName,
            );
            return {
              ref,
              role,
              name: nameOf(el),
              value:
                input.type === 'password'
                  ? input.value
                    ? '(hidden)'
                    : ''
                  : isField && role !== 'button'
                    ? input.value
                    : undefined,
              options:
                el.tagName === 'SELECT'
                  ? [...(el as HTMLSelectElement).options].map(o =>
                      o.text.trim(),
                    )
                  : undefined,
              disabled: (el as HTMLButtonElement).disabled === true,
            };
          });

        return {
          title: document.title,
          elements,
          text: (document.body?.innerText ?? '').slice(0, maxText),
          rawText: (document.body?.textContent ?? '').slice(0, maxRawText),
        };
      },
      {
        refAttribute: REF_ATTRIBUTE,
        maxElements: MAX_OBSERVED_ELEMENTS,
        maxText: MAX_PAGE_TEXT_CHARS,
        maxRawText: MAX_RAW_TEXT_CHARS,
      },
    );
    return {url: page.url(), ...snapshot};
  }
}
