import { describe, expect, it } from "vitest";
import { MethodRegistry } from "../../src";

describe("MethodRegistry", () => {
  it("registers and executes a method", async () => {
    const registry = new MethodRegistry();

    registry.register("system.echo", async (payload) => payload);

    await expect(registry.execute("system.echo", { ok: true })).resolves.toEqual({
      ok: true
    });
  });

  it("rejects empty method names", () => {
    const registry = new MethodRegistry();

    expect(() => registry.register("", async () => null)).toThrow("ARGUS_INVALID_METHOD_NAME");
  });

  it("rejects duplicate method names", () => {
    const registry = new MethodRegistry();

    registry.register("system.ping", async () => ({ ok: true }));

    expect(() => registry.register("system.ping", async () => ({ ok: true }))).toThrow(
      "ARGUS_METHOD_ALREADY_REGISTERED"
    );
  });

  it("throws when executing an unknown method", async () => {
    const registry = new MethodRegistry();

    await expect(registry.execute("missing.method", {})).rejects.toThrow(
      "ARGUS_METHOD_NOT_FOUND"
    );
  });

  it("lists methods alphabetically", () => {
    const registry = new MethodRegistry();

    registry.register("z.method", async () => null);
    registry.register("a.method", async () => null);

    expect(registry.list()).toEqual(["a.method", "z.method"]);
  });

  it("clears registered methods", () => {
    const registry = new MethodRegistry();

    registry.register("system.ping", async () => null);
    registry.clear();

    expect(registry.has("system.ping")).toBe(false);
  });
});
