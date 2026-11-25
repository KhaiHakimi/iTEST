import type {
  ChatMessage,
  LocalAiClient,
  OllamaHealth,
} from '../../src/ai/interfaces/ollama.interface.js';

/** Finds an element's ref in a prompt by its visible name. */
export type RefLookup = (name: string) => string;

/** One scripted AI turn: given the prompt, return the decision (or raw text). */
export type ScriptedTurn = (prompt: string, ref: RefLookup) => unknown;

/**
 * Stands in for Ollama in tests. Replies follow a fixed script, so the whole
 * testing loop can be exercised without a model. Prompts are recorded.
 */
export class ScriptedAi implements LocalAiClient {
  readonly model = 'scripted-test-ai';
  readonly prompts: string[] = [];
  private turn = 0;

  constructor(
    private readonly script: ScriptedTurn[],
    private readonly health: OllamaHealth = {
      ok: true,
      message: 'scripted',
      installedModels: [],
    },
  ) {}

  async healthCheck(): Promise<OllamaHealth> {
    return this.health;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const prompt = messages.at(-1)?.content ?? '';
    this.prompts.push(prompt);
    const next = this.script[this.turn++];
    if (!next) {
      throw new Error('Scripted AI ran out of turns');
    }
    const reply = next(prompt, name => this.refFor(prompt, name));
    return typeof reply === 'string' ? reply : JSON.stringify(reply);
  }

  private refFor(prompt: string, name: string): string {
    for (const match of prompt.matchAll(/\[(e\d+)\] \S+ "([^"]*)"/g)) {
      if (match[2] === name && match[1]) {
        return match[1];
      }
    }
    throw new Error(`No element named "${name}" in the prompt`);
  }
}
