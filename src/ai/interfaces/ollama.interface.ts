export interface OllamaSettings {
  /** Must be a loopback address; see OllamaService. */
  url: string;
  model: string;
  /** A test prompt slower than this suggests a smaller model. */
  warnAfterMs: number;
}

export interface OllamaHealth {
  ok: boolean;
  message: string;
  version?: string;
  installedModels: string[];
  latencyMs?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * What the testing loop needs from a local AI. OllamaService implements it;
 * tests use a scripted fake so they run without a model.
 */
export interface LocalAiClient {
  readonly model: string;
  healthCheck(): Promise<OllamaHealth>;
  /** Returns the raw reply, constrained to the given JSON schema. */
  chat(messages: ChatMessage[], format: object): Promise<string>;
}
