import {describe, expect, it} from 'vitest';
import {OllamaService} from '../src/ai/ollama.service.js';
import {LoggerService} from '../src/shared/logger.service.js';

const logger = new LoggerService('test');

describe('OllamaService', () => {
  it('accepts localhost addresses', () => {
    for (const url of [
      'http://127.0.0.1:11434',
      'http://localhost:11434',
      'http://[::1]:11434',
    ]) {
      expect(
        () =>
          new OllamaService({url, model: 'qwen3:8b', warnAfterMs: 1}, logger),
      ).not.toThrow();
    }
  });

  it('refuses remote or cloud addresses so no data leaves the computer', () => {
    for (const url of ['http://10.0.0.5:11434', 'https://ollama.com']) {
      expect(
        () =>
          new OllamaService({url, model: 'qwen3:8b', warnAfterMs: 1}, logger),
      ).toThrow(/must point at this computer/);
    }
  });

  it('reads settings from the environment with safe defaults', () => {
    expect(OllamaService.settingsFromEnv({})).toEqual({
      url: 'http://127.0.0.1:11434',
      model: 'qwen3:8b',
      warnAfterMs: 10_000,
    });
    expect(() =>
      OllamaService.settingsFromEnv({AGENT_OLLAMA_WARN_SECONDS: 'abc'}),
    ).toThrow(/positive number/);
  });
});
