import { describe, expect, test } from "bun:test";
import { createDefaultClientConfig } from "../src/shared/config";
import {
  DEFAULT_MODEL_PROVIDER,
  getAllModels,
  getDefaultModel,
  getModelProvider,
  getProviderModels,
  MODEL_REGISTRY,
} from "../src/shared/models";

describe("model registry", () => {
  test("uses the shared default model for new client configs", () => {
    expect(createDefaultClientConfig().defaultModel).toBe(getDefaultModel());
  });

  test("exposes provider lists through the central registry", () => {
    expect(getProviderModels(DEFAULT_MODEL_PROVIDER)).toEqual(MODEL_REGISTRY.providers[DEFAULT_MODEL_PROVIDER]?.models);
    expect(getAllModels()).toContain(getDefaultModel());
    expect(getAllModels()).toContain(MODEL_REGISTRY.providers.anthropic?.defaultModel);
  });

  test("maps registered models back to their provider", () => {
    expect(getModelProvider("claude-sonnet-4-5")).toBe("anthropic");
    expect(getModelProvider("gpt-4o")).toBe("openai");
  });
});
