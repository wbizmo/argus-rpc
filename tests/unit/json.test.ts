import { describe, expect, it } from "vitest";
import { parsePayload, serializePayload } from "../../src";

describe("JSON payload helpers", () => {
  it("serializes undefined as an empty buffer", () => {
    expect(serializePayload(undefined).length).toBe(0);
  });

  it("serializes null as an empty buffer", () => {
    expect(serializePayload(null).length).toBe(0);
  });

  it("serializes objects as JSON buffers", () => {
    const payload = serializePayload({ ok: true });

    expect(payload.toString("utf8")).toBe(JSON.stringify({ ok: true }));
  });

  it("parses empty buffers as undefined", () => {
    expect(parsePayload(Buffer.alloc(0))).toBeUndefined();
  });

  it("parses JSON buffers", () => {
    const payload = Buffer.from(JSON.stringify({ ok: true }), "utf8");

    expect(parsePayload(payload)).toEqual({ ok: true });
  });
});
