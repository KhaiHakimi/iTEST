import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {OllamaService} from '../ai/ollama.service.js';
import type {LoggerService} from '../shared/logger.service.js';
import type {DoctorCheck} from './interfaces/doctor.interface.js';

const MIN_NODE_MAJOR = 20;
const MIN_NODE_MINOR = 12;

/** Checks this computer is ready to run the agent. */
export class DoctorService {
  constructor(
    private readonly logger: LoggerService,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  async runAll(): Promise<DoctorCheck[]> {
    return [this.checkNode(), this.checkBrowser(), await this.checkOllama()];
  }

  private checkNode(): DoctorCheck {
    const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
    const ok =
      major > MIN_NODE_MAJOR ||
      (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
    return {
      name: 'Node.js',
      ok,
      message: ok
        ? `v${process.versions.node}`
        : `v${process.versions.node} is too old; install ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR} or newer.`,
    };
  }

  private checkBrowser(): DoctorCheck {
    const path = chromium.executablePath();
    const ok = existsSync(path);
    return {
      name: 'Playwright Chromium',
      ok,
      message: ok ? path : 'Not installed. Run: npm run browsers',
    };
  }

  private async checkOllama(): Promise<DoctorCheck> {
    try {
      const service = new OllamaService(
        OllamaService.settingsFromEnv(this.env),
        this.logger,
      );
      const health = await service.healthCheck();
      return {
        name: 'Ollama (needed from Phase 2)',
        ok: health.ok,
        message: `${health.version ? `v${health.version}. ` : ''}${health.message}`,
      };
    } catch (error) {
      return {
        name: 'Ollama (needed from Phase 2)',
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
