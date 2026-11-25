import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {Page} from 'playwright';
import type {TestGoal} from '../config/interfaces/project-config.interface.js';
import {NAVIGATION_TIMEOUT_MS} from '../runner/runner.constants.js';
import type {
  BrowserAction,
  GoalResult,
  GoalStatus,
  PageObservation,
  ReportBugAction,
  StepRecord,
} from './interfaces/agent.interface.js';
import type {GoalRunnerDeps} from './interfaces/goal-runner.interface.js';

type StepResult = Pick<StepRecord, 'outcome' | 'detail'>;

const SCREENSHOT_FOLDER = 'screenshots';

/**
 * The AI testing loop for one written test goal: observe the page, ask the AI
 * for one action, check it with the guard, carry it out, repeat. Each goal
 * gets a fresh browser context so goals cannot affect each other.
 */
export class GoalRunnerService {
  constructor(private readonly deps: GoalRunnerDeps) {}

  async run(goal: TestGoal): Promise<GoalResult> {
    const {browser, allowlist, errors, logger} = this.deps;
    const steps: StepRecord[] = [];
    const finish = (status: GoalStatus, summary: string): GoalResult => ({
      id: goal.id,
      goal: goal.goal,
      status,
      summary,
      steps,
    });

    logger.info(`Goal "${goal.id}": ${goal.goal}`);
    const context = await browser.openContext(allowlist, url =>
      errors.recordBlockedRequest(url),
    );
    try {
      const page = await context.newPage();
      errors.watch(page);
      if (goal.account) {
        await this.logIn(page, goal.account);
      }
      await page.goto(this.deps.guard.resolvePath(goal.startPath), {
        timeout: NAVIGATION_TIMEOUT_MS,
      });

      for (let number = 1; number <= goal.maxSteps; number++) {
        const done = await this.takeStep(page, goal, steps, number);
        if (done) {
          return finish(done.passed ? 'passed' : 'failed', done.summary);
        }
      }
      return finish(
        'could-not-finish',
        `Ran out of steps (${goal.maxSteps}) before the AI finished the goal.`,
      );
    } catch (error) {
      const message = this.firstLine(error);
      logger.warn(`Goal "${goal.id}" could not finish: ${message}`);
      return finish('could-not-finish', message);
    } finally {
      await context.close();
    }
  }

  /** Returns the AI's verdict when it finishes the goal, otherwise undefined. */
  private async takeStep(
    page: Page,
    goal: TestGoal,
    steps: StepRecord[],
    number: number,
  ): Promise<{passed: boolean; summary: string} | undefined> {
    const {errors, observer, brain, guard, executor, logger} = this.deps;
    errors.setCurrentPage(page.url());
    const observation = await observer.observe(page);
    this.flagSuspiciousText(observation);

    const {action} = await brain.decide({
      goal: goal.goal,
      history: steps,
      observation,
    });
    const step = {
      number,
      description: executor.describe(action, observation),
      url: observation.url,
    };

    const verdict = guard.check(action, observation, goal.allowActions);
    if (!verdict.allowed) {
      logger.warn(`Refused: ${step.description} (${verdict.reason})`);
      steps.push({...step, outcome: 'refused', detail: verdict.reason});
      return undefined;
    }

    logger.info(`Step ${number}: ${step.description}`);
    if (action.type === 'finish') {
      steps.push({...step, outcome: 'done', detail: action.summary});
      return {passed: action.passed, summary: action.summary};
    }
    const result =
      action.type === 'report_bug'
        ? await this.reportBug(page, goal, action, observation, steps, number)
        : await this.act(page, action);
    steps.push({...step, ...result});
    return undefined;
  }

  private async act(page: Page, action: BrowserAction): Promise<StepResult> {
    try {
      const detail = await this.deps.executor.execute(page, action, path =>
        this.deps.guard.resolvePath(path),
      );
      return {outcome: 'done', detail};
    } catch (error) {
      return {outcome: 'failed', detail: this.firstLine(error)};
    }
  }

  /**
   * Evidence check from the proposal: the quoted text must really be on the
   * page, or the bug is dropped. Kept bugs get a screenshot and are marked
   * "to confirm" for a person to review.
   */
  private async reportBug(
    page: Page,
    goal: TestGoal,
    action: ReportBugAction,
    observation: PageObservation,
    steps: StepRecord[],
    number: number,
  ): Promise<StepResult> {
    if (!this.hasEvidence(action.evidence, observation)) {
      return {
        outcome: 'dropped',
        detail: `Evidence "${action.evidence}" is not on the page, so the bug was not reported.`,
      };
    }
    const screenshot = `${SCREENSHOT_FOLDER}/${goal.id}-step-${number}.png`;
    await mkdir(join(this.deps.reportDir, SCREENSHOT_FOLDER), {
      recursive: true,
    });
    await page.screenshot({
      path: join(this.deps.reportDir, screenshot),
      fullPage: true,
    });
    this.deps.findings.add({
      source: 'ai',
      severity: action.severity,
      title: action.title,
      pageUrl: observation.url,
      detail: `Expected: ${action.expected}\nActual: ${action.actual}`,
      evidence: action.evidence,
      confirmation: 'to-confirm',
      stepsToReproduce: this.stepsToReproduce(goal, steps),
      screenshot,
    });
    return {outcome: 'done', detail: 'Reported for a person to confirm.'};
  }

  private hasEvidence(evidence: string, observation: PageObservation): boolean {
    const normalise = (text: string) =>
      text.replace(/\s+/g, ' ').trim().toLowerCase();
    const wanted = normalise(evidence);
    const pageText = normalise(
      [
        observation.rawText,
        observation.text,
        ...observation.elements.map(e => `${e.name} ${e.value ?? ''}`),
      ].join(' '),
    );
    return wanted.length > 0 && pageText.includes(wanted);
  }

  private stepsToReproduce(goal: TestGoal, steps: StepRecord[]): string[] {
    const setup = [
      ...(goal.account ? [`Log in as the "${goal.account}" test account`] : []),
      `Open ${goal.startPath}`,
    ];
    const actions = steps
      .filter(
        step =>
          step.outcome === 'done' && !step.description.startsWith('Report bug'),
      )
      .map(step => step.description);
    return [...setup, ...actions];
  }

  private flagSuspiciousText(observation: PageObservation): void {
    for (const snippet of this.deps.detector.findSuspiciousText(
      observation.rawText,
    )) {
      this.deps.findings.add({
        source: 'suspicious-content',
        severity: 'medium',
        title: 'Page text tries to give the AI instructions',
        pageUrl: observation.url,
        detail:
          'This text was passed to the AI only as untrusted data, and the action ' +
          'guard refuses anything outside the test goal. Check whether it should be on the page.',
        evidence: snippet,
      });
    }
  }

  private async logIn(page: Page, accountName: string): Promise<void> {
    const account = this.deps.accounts[accountName];
    if (!this.deps.login || !account) {
      throw new Error(`No log-in settings for account "${accountName}".`);
    }
    await this.deps.login.logIn(page, account, path =>
      this.deps.guard.resolvePath(path),
    );
  }

  /** Playwright errors run to many lines; the first says what went wrong. */
  private firstLine(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.split('\n')[0] ?? message;
  }
}
