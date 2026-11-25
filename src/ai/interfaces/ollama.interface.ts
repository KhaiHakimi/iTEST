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
