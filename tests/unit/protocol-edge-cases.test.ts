import { describe, expect, it } from "vitest";
import {
  ARGUS_HEADER_LENGTH,
  ArgusMessageType,
  createFrame,
  decodeFrames,
  encodeFrame,
  getFrameSize
} from "../../src";

describe("protocol edge cases", () => {
  it("supports empty method and empty payload frames", () => {
    const encoded = encodeFrame(
      createFrame({
        type: ArgusMessageType.PING,
        messageId: 1
      })
    );

    const result = decodeFrames(encoded);

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]?.method).toBe("");
    expect(result.frames[0]?.payload.length).toBe(0);
    expect(result.remaining.length).toBe(0);
  });

  it("supports unicode method names", () => {
    const method = "service.δοκιμή";

    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 2,
      method,
      payload: { ok: true }
    });

    const encoded = encodeFrame(frame);
    const result = decodeFrames(encoded);

    expect(result.frames[0]?.method).toBe(method);
  });

  it("supports unicode payload content", () => {
    const payload = {
      message: "hello Williams 👁️"
    };

    const encoded = encodeFrame(
      createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: 3,
        method: "unicode.echo",
        payload
      })
    );

    const result = decodeFrames(encoded);

    expect(result.frames[0]?.payload.toString("utf8")).toBe(JSON.stringify(payload));
  });

  it("calculates size for frames with no body beyond header", () => {
    const frame = createFrame({
      type: ArgusMessageType.PONG,
      messageId: 4
    });

    expect(getFrameSize(frame)).toBe(ARGUS_HEADER_LENGTH);
  });

  it("preserves partial frame data across decode attempts", () => {
    const encoded = encodeFrame(
      createFrame({
        type: ArgusMessageType.REQUEST,
        messageId: 5,
        method: "partial.test",
        payload: { ok: true }
      })
    );

    const firstHalf = encoded.subarray(0, Math.floor(encoded.length / 2));
    const secondHalf = encoded.subarray(Math.floor(encoded.length / 2));

    const firstDecode = decodeFrames(firstHalf);

    expect(firstDecode.frames).toHaveLength(0);
    expect(firstDecode.remaining.length).toBe(firstHalf.length);

    const secondDecode = decodeFrames(Buffer.concat([firstDecode.remaining, secondHalf]));

    expect(secondDecode.frames).toHaveLength(1);
    expect(secondDecode.frames[0]?.messageId).toBe(5);
    expect(secondDecode.remaining.length).toBe(0);
  });
});
