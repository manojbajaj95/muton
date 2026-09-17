import { afterEach, describe, expect, test } from "bun:test";
import { parseBackendSpec, selectBackend } from "../../src/reflection/complete/index.ts";

describe("reflection backend selection", () => {
  const previousBackend = process.env.MUTON_REFLECTION_BACKEND;
  const previousModel = process.env.MUTON_REFLECTION_MODEL;
  const previousLegacyModel = process.env.MUTON_MODEL;
  const previousApiKey = process.env.MUTON_API_KEY;

  afterEach(() => {
    restore("MUTON_REFLECTION_BACKEND", previousBackend);
    restore("MUTON_REFLECTION_MODEL", previousModel);
    restore("MUTON_MODEL", previousLegacyModel);
    restore("MUTON_API_KEY", previousApiKey);
  });

  test("uses the source host by default and keeps model selection explicit", () => {
    delete process.env.MUTON_REFLECTION_BACKEND;
    delete process.env.MUTON_MODEL;
    delete process.env.MUTON_API_KEY;
    process.env.MUTON_REFLECTION_MODEL = "extractor-1";
    expect(selectBackend("claude")).toEqual({
      kind: "host",
      host: "claude",
      model: "extractor-1",
    });
  });

  test("lets a requested model refine the default backend", () => {
    delete process.env.MUTON_REFLECTION_BACKEND;
    delete process.env.MUTON_REFLECTION_MODEL;
    delete process.env.MUTON_MODEL;
    expect(selectBackend(undefined, "extractor-1")).toEqual({
      kind: "host",
      host: "codex",
      model: "extractor-1",
    });
  });

  test("selects a direct provider independently of the source host", () => {
    process.env.MUTON_REFLECTION_BACKEND = "direct:anthropic";
    process.env.MUTON_REFLECTION_MODEL = "claude-extractor";
    expect(selectBackend("pi")).toEqual({
      kind: "direct",
      provider: "anthropic",
      model: "claude-extractor",
      baseUrl: process.env.MUTON_API_BASE,
    });
    expect(parseBackendSpec("anthropic", "claude-extractor")).toEqual({
      kind: "direct",
      provider: "anthropic",
      model: "claude-extractor",
      baseUrl: process.env.MUTON_API_BASE,
    });
    expect(() => parseBackendSpec("openai")).toThrow(/model/);
  });

  test("accepts simple host backend names", () => {
    expect(parseBackendSpec("codex", "extractor-1")).toEqual({
      kind: "host",
      host: "codex",
      model: "extractor-1",
    });
  });
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
