import { describe, expect, it } from "vitest";
import {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAGIC,
  ARGUS_MAGIC_LENGTH,
  ARGUS_VERSION,
  ArgusMessageType,
  createFrame,
  getFrameSize,
  normalizePayload
} from "../../src";

describe("Argus protocol primitives", () => {
  it("uses AR as protocol magic", () => {
    expect(ARGUS_MAGIC).toBe("AR");
    expect(ARGUS_MAGIC_LENGTH).toBe(2);
  });

  it("uses protocol version 1", () => {
    expect(ARGUS_VERSION).toBe(1);
  });

  it("uses a 14 byte fixed header", () => {
    expect(ARGUS_HEADER_LENGTH).toBe(14);
  });

  it("defines the v1 message types", () => {
    expect(ArgusMessageType.REQUEST).toBe(1);
    expect(ArgusMessageType.RESPONSE).toBe(2);
    expect(ArgusMessageType.ERROR).toBe(3);
    expect(ArgusMessageType.PING).toBe(4);
    expect(ArgusMessageType.PONG).toBe(5);
  });

  it("normalizes object payloads to JSON buffers", () => {
    const payload = normalizePayload({ ok: true });

    expect(Buffer.isBuffer(payload)).toBe(true);
    expect(payload.toString("utf8")).toBe(JSON.stringify({ ok: true }));
  });

  it("normalizes empty payloads to empty buffers", () => {
    expect(normalizePayload(null).length).toBe(0);
    expect(normalizePayload(undefined).length).toBe(0);
  });

  it("creates frames with default empty method and payload", () => {
    const frame = createFrame({
      type: ArgusMessageType.PING,
      messageId: 99
    });

    expect(frame.method).toBe("");
    expect(frame.payload.length).toBe(0);
  });

  it("calculates frame size", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "system.echo",
      payload: { value: "hello" }
    });

    const expected =
      ARGUS_HEADER_LENGTH +
      Buffer.byteLength("system.echo", "utf8") +
      Buffer.byteLength(JSON.stringify({ value: "hello" }), "utf8");

    expect(getFrameSize(frame)).toBe(expected);
  });
});
