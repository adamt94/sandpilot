import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type ProviderModelConfig = {
  defaultModel: string;
  models: string[];
};

export type ModelRegistry = {
  defaultProvider: string;
  providers: Record<string, ProviderModelConfig>;
};

const registryPath = join(dirname(fileURLToPath(import.meta.url)), "models.json");

export const MODEL_REGISTRY = JSON.parse(readFileSync(registryPath, "utf8")) as ModelRegistry;
export const DEFAULT_MODEL_PROVIDER = MODEL_REGISTRY.defaultProvider;

function getProviderConfig(provider: string): ProviderModelConfig {
  const config = MODEL_REGISTRY.providers[provider];
  if (!config) throw new Error(`Unknown model provider: ${provider}`);
  return config;
}

export function getProviderModels(provider: string): readonly string[] {
  return getProviderConfig(provider).models;
}

export function getDefaultModel(provider: string = DEFAULT_MODEL_PROVIDER): string {
  return getProviderConfig(provider).defaultModel;
}

export function getAllModels(): string[] {
  return Object.values(MODEL_REGISTRY.providers).flatMap((entry) => entry.models);
}

export function getModelProvider(model: string): string | null {
  for (const [provider, config] of Object.entries(MODEL_REGISTRY.providers)) {
    if (config.models.includes(model)) return provider;
  }
  return null;
}
