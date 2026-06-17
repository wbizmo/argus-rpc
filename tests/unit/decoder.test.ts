import { describe, expect, it } from "vitest";
import {
  ARGUS_HEADER_LENGTH,
  ARGUS_VERSION,
  ArgusMessageType,
  createFrame,
  decodeFrame,
  decodeFrames,
  encodeFrame
} from "../../src";

describe("Argus frame decoder", () => {
  it("decodes an encoded request frame", () => {
    const original = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 7,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(original);
    const result = decodeFrame(encoded);

    expect(result.frame).not.toBeNull();
    expect(result.frame?.type).toBe(ArgusMessageType.REQUEST);
    expect(result.frame?.messageId).toBe(7);
    expect(result.frame?.method).toBe("user.get");
    expect(result.frame?.payload.toString("utf8")).toBe(JSON.stringify({ id: 1 }));
    expect(result.remaining.length).toBe(0);
  });

  it("returns null frame when buffer is smaller than header", () => {
    const result = decodeFrame(Buffer.alloc(ARGUS_HEADER_LENGTH - 1));

    expect(result.frame).toBeNull();
    expect(result.remaining.length).toBe(ARGUS_HEADER_LENGTH - 1);
  });

  it("returns null frame when full payload has not arrived yet", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 10,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);
    const partial = encoded.subarray(0, encoded.length - 2);
    const result = decodeFrame(partial);

    expect(result.frame).toBeNull();
    expect(result.remaining.length).toBe(partial.length);
  });

  it("rejects invalid magic bytes", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);
    encoded.write("ZZ", 0, 2, "ascii");

    expect(() => decodeFrame(encoded)).toThrow("ARGUS_INVALID_MAGIC");
  });

  it("rejects unsupported protocol versions", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);
    encoded.writeUInt8(ARGUS_VERSION + 1, 2);

    expect(() => decodeFrame(encoded)).toThrow("ARGUS_UNSUPPORTED_VERSION");
  });

  it("rejects invalid message types", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);
    encoded.writeUInt8(255, 3);

    expect(() => decodeFrame(encoded)).toThrow("ARGUS_INVALID_MESSAGE_TYPE");
  });

  it("decodes multiple frames from one buffer", () => {
    const first = encodeFrame(
      createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: 1,
        method: "user.get",
        payload: { id: 1 }
      })
    );

    const second = encodeFrame(
      createFrame({
        type: ArgusMessageType.RESPONSE,
        messageId: 1,
        method: "user.get",
        payload: { id: 1, name: "Williams" }
      })
    );

    const result = decodeFrames(Buffer.concat([first, second]));

    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]?.type).toBe(ArgusMessageType.REQUEST);
    expect(result.frames[1]?.type).toBe(ArgusMessageType.RESPONSE);
    expect(result.remaining.length).toBe(0);
  });

  it("preserves remaining partial data after complete frames", () => {
    const first = encodeFrame(
      createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: 1,
        method: "user.get",
        payload: { id: 1 }
      })
    );

    const second = encodeFrame(
      createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: 2,
        method: "user.list",
        payload: {}
      })
    );

    const partialSecond = second.subarray(0, second.length - 3);
    const result = decodeFrames(Buffer.concat([first, partialSecond]));

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.messageId).toBe(1);
    expect(result.remaining.length).toBe(partialSecond.length);
  });
});
