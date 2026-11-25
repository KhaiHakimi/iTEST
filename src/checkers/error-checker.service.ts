import type {ConsoleMessage, Page, Request, Response} from 'playwright';
import type {FindingStoreService} from '../report/finding-store.service.js';
import {
  DUPLICATE_CONSOLE_PREFIX,
  IGNORED_REQUEST_FAILURES,
} from './checkers.constants.js';

/**
 * Listens to the browser while pages are tested and records hidden technical
 * errors: uncaught exceptions, console errors, failed or erroring requests,
 * and requests blocked by the allowlist. No AI is involved.
 */
export class ErrorCheckerService {
  /** Findings are attributed to the page under test, not the request's frame. */
  private currentPageUrl = 'about:blank';

  constructor(private readonly findings: FindingStoreService) {}

  setCurrentPage(url: string): void {
    this.currentPageUrl = url;
  }

  watch(page: Page): void {
    page.on('pageerror', error => this.onPageError(error));
    page.on('console', message => this.onConsole(message));
    page.on('response', response => this.onResponse(response));
    page.on('requestfailed', request => this.onRequestFailed(request));
  }

  recordBlockedRequest(url: string): void {
    this.findings.add({
      source: 'blocked-request',
      severity: 'low',
      title: `Request to ${new URL(url).origin} blocked (outside allowlist)`,
      pageUrl: this.currentPageUrl,
      detail:
        'The agent only contacts the application under test. If the app ' +
        'genuinely needs this origin, add it to allowedOrigins in project.json.',
      evidence: url,
    });
  }

  private onPageError(error: Error): void {
    this.findings.add({
      source: 'page-error',
      severity: 'high',
      title: 'Uncaught JavaScript error',
      pageUrl: this.currentPageUrl,
      detail: error.message,
      evidence: error.stack,
    });
  }

  private onConsole(message: ConsoleMessage): void {
    const text = message.text();
    if (
      message.type() !== 'error' ||
      text.startsWith(DUPLICATE_CONSOLE_PREFIX)
    ) {
      return;
    }
    const {url, lineNumber} = message.location();
    this.findings.add({
      source: 'console',
      severity: 'medium',
      title: 'Console error',
      pageUrl: this.currentPageUrl,
      detail: text,
      evidence: url ? `${url}:${lineNumber}` : undefined,
    });
  }

  private onResponse(response: Response): void {
    const status = response.status();
    if (status < 400) {
      return;
    }
    const request = response.request();
    this.findings.add({
      source: 'network',
      severity: status >= 500 ? 'high' : 'medium',
      title: `HTTP ${status} from ${request.method()} ${this.pathOf(response.url())}`,
      pageUrl: this.currentPageUrl,
      detail: `The server answered ${status} ${response.statusText()}.`,
      evidence: response.url(),
    });
  }

  private onRequestFailed(request: Request): void {
    const errorText = request.failure()?.errorText ?? 'unknown error';
    if (IGNORED_REQUEST_FAILURES.some(ignored => errorText.includes(ignored))) {
      return;
    }
    this.findings.add({
      source: 'network',
      severity: 'medium',
      title: `Request failed: ${request.method()} ${this.pathOf(request.url())}`,
      pageUrl: this.currentPageUrl,
      detail: errorText,
      evidence: request.url(),
    });
  }

  private pathOf(url: string): string {
    return new URL(url).pathname;
  }
}
