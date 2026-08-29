import { describe, expect, it } from "vitest";
import {
  ArgusCodecRegistry,
  jsonCodec,
  rawCodec,
  type ArgusCodec
} from "../../src";

describe("Argus codec primitives", () => {
  it("round-trips JSON values deterministically", () => {
    const encoded = jsonCodec.encode({ ok: true, count: 3 });
    expect(jsonCodec.decode(encoded)).toEqual({ ok: true, count: 3 });
  });

  it("copies raw buffers on encode and decode", () => {
    const input = Buffer.from([1, 2, 3]);
    const encoded = rawCodec.encode(input);
    const decoded = rawCodec.decode(encoded);

    expect(decoded).toEqual(input);
    expect(decoded).not.toBe(input);
  });

  it("normalizes codec names and rejects duplicates", () => {
    const custom: ArgusCodec = {
      name: " Custom.V1 ",
      encode: (value) => Buffer.from(String(value)),
      decode: (buffer) => buffer.toString("utf8")
    };

    const registry = new ArgusCodecRegistry([custom]);
    expect(registry.has("custom.v1")).toBe(true);
    expect(registry.get("CUSTOM.V1")).toBe(custom);
    expect(() => registry.register(custom)).toThrow("ARGUS_CODEC_ALREADY_REGISTERED");
  });

  it("ships json and raw codecs in the default registry", () => {
    expect(new ArgusCodecRegistry().list()).toEqual(["json", "raw"]);
  });
});
