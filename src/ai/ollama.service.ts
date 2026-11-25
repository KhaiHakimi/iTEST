import {setTimeout as delay} from 'node:timers/promises';
import type {LoggerService} from '../shared/logger.service.js';
import {
  CHAT_TIMEOUT_MS,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_URL,
  DEFAULT_WARN_SECONDS,
  GENERATE_TIMEOUT_MS,
  KEEP_ALIVE,
  LOOPBACK_HOSTS,
  MAX_ATTEMPTS,
  METADATA_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
} from './ai.constants.js';
import type {
  ChatMessage,
  LocalAiClient,
  OllamaHealth,
  OllamaSettings,
} from './interfaces/ollama.interface.js';

interface TagsResponse {
  models: Array<{name: string}>;
}

interface ChatResponse {
  message: {content: string};
}

/** Talks to the local Ollama server: start-up check and chat calls. */
export class OllamaService implements LocalAiClient {
  constructor(
    private readonly settings: OllamaSettings,
    private readonly logger: LoggerService,
  ) {
    const host = new URL(settings.url).hostname;
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new Error(
        `AGENT_OLLAMA_URL must point at this computer (localhost), not "${host}". ` +
          'Remote or cloud AI is out of scope so that no data leaves the company.',
      );
    }
  }

  static settingsFromEnv(env: NodeJS.ProcessEnv): OllamaSettings {
    const warnSeconds = Number(
      env.AGENT_OLLAMA_WARN_SECONDS ?? DEFAULT_WARN_SECONDS,
    );
    if (!Number.isFinite(warnSeconds) || warnSeconds <= 0) {
      throw new Error('AGENT_OLLAMA_WARN_SECONDS must be a positive number.');
    }
    return {
      url: env.AGENT_OLLAMA_URL || DEFAULT_OLLAMA_URL,
      model: env.AGENT_OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
      warnAfterMs: warnSeconds * 1000,
    };
  }

  get model(): string {
    return this.settings.model;
  }

  async chat(messages: ChatMessage[], format: object): Promise<string> {
    const response = await this.requestJson<ChatResponse>(
      '/api/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          model: this.settings.model,
          messages,
          format,
          stream: false,
          think: false,
          keep_alive: KEEP_ALIVE,
          // Deterministic answers make runs repeatable and bugs replayable.
          options: {temperature: 0},
        }),
      },
      CHAT_TIMEOUT_MS,
    );
    return response.message.content;
  }

  /** Start-up check from the proposal: service running, model present, answers quickly. */
  async healthCheck(): Promise<OllamaHealth> {
    const {model, warnAfterMs} = this.settings;
    const {version} = await this.requestJson<{version: string}>(
      '/api/version',
      {method: 'GET'},
      METADATA_TIMEOUT_MS,
    );
    const tags = await this.requestJson<TagsResponse>(
      '/api/tags',
      {method: 'GET'},
      METADATA_TIMEOUT_MS,
    );
    const installedModels = tags.models.map(m => m.name);
    if (!this.isInstalled(installedModels)) {
      return {
        ok: false,
        version,
        installedModels,
        message: `Model "${model}" is not downloaded. Run: ollama pull ${model}`,
      };
    }

    const started = Date.now();
    await this.requestJson(
      '/api/generate',
      {
        method: 'POST',
        body: JSON.stringify({
          model,
          prompt: 'Reply with the single word OK.',
          stream: false,
          think: false,
          keep_alive: KEEP_ALIVE,
        }),
      },
      GENERATE_TIMEOUT_MS,
    );
    const latencyMs = Date.now() - started;
    const slow = latencyMs > warnAfterMs;
    return {
      ok: true,
      version,
      installedModels,
      latencyMs,
      message: slow
        ? `"${model}" answered in ${latencyMs} ms, over the ${warnAfterMs} ms target. ` +
          'Run doctor again (the first call loads the model), or try a smaller model.'
        : `"${model}" answered in ${latencyMs} ms.`,
    };
  }

  /** "qwen3" in settings matches the "qwen3:latest" tag Ollama reports. */
  private isInstalled(installedModels: string[]): boolean {
    const wanted = this.settings.model.includes(':')
      ? this.settings.model
      : `${this.settings.model}:latest`;
    return installedModels.includes(wanted);
  }

  /** Time limit on every call and up to three attempts with growing waits. */
  private async requestJson<T>(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<T> {
    const url = new URL(path, this.settings.url);
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, {
          ...init,
          headers: {'Content-Type': 'application/json'},
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from ${path}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS) {
          const waitMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
          this.logger.warn(
            `Ollama ${path} attempt ${attempt} failed; retrying in ${waitMs} ms.`,
          );
          await delay(waitMs);
        }
      }
    }
    const reason =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Ollama did not answer at ${this.settings.url} after ${MAX_ATTEMPTS} attempts (${reason}). ` +
        'Is Ollama installed and running?',
      {cause: lastError},
    );
  }
}
