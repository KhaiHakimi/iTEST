import type {Page} from 'playwright';
import type {
  AccountConfig,
  LoginConfig,
} from '../config/interfaces/project-config.interface.js';
import {LOGIN_TIMEOUT_MS} from './agent.constants.js';

/**
 * Logs in with plain browser steps, no AI (proposal: routine steps are
 * scripted). Credentials come from environment variables and are never put
 * in prompts, logs or reports.
 */
export class LoginService {
  constructor(
    private readonly login: LoginConfig,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  async logIn(
    page: Page,
    account: AccountConfig,
    resolvePath: (path: string) => string,
  ): Promise<void> {
    const {username, password} = this.credentialsFor(account);
    const options = {timeout: LOGIN_TIMEOUT_MS};
    await page.goto(resolvePath(this.login.path), options);
    await page.locator(this.login.usernameSelector).fill(username, options);
    await page.locator(this.login.passwordSelector).fill(password, options);
    await page.locator(this.login.submitSelector).click(options);
    try {
      await page
        .locator(this.login.successSelector)
        .first()
        .waitFor({state: 'visible', ...options});
    } catch {
      throw new Error(
        `Log-in did not succeed: "${this.login.successSelector}" never appeared. ` +
          `Check the test account in ${account.usernameEnv} / ${account.passwordEnv}.`,
      );
    }
  }

  private credentialsFor(account: AccountConfig): {
    username: string;
    password: string;
  } {
    const username = this.env[account.usernameEnv];
    const password = this.env[account.passwordEnv];
    if (!username || !password) {
      throw new Error(
        `Set ${account.usernameEnv} and ${account.passwordEnv} in .env for this test account.`,
      );
    }
    return {username, password};
  }
}
