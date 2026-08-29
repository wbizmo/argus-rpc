import { describe, expect, it } from "vitest";
import {
  ArgusFrameStreamDecoder,
  ArgusMessageType,
  createFrame,
  encodeFrame
} from "../../src";

describe("Argus deterministic protocol fuzzing", () => {
  it("round-trips randomized frames across arbitrary TCP fragmentation", () => {
    const random = lcg(0x41524755);

    for (let iteration = 0; iteration < 256; iteration += 1) {
      const messageId = 1 + Math.floor(random() * 0xfffffffe);
      const method = `fuzz.${iteration}.${Math.floor(random() * 10_000)}`;
      const payload = Buffer.alloc(Math.floor(random() * 2048));
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] = Math.floor(random() * 256);
      }

      const encoded = encodeFrame(createFrame({
        type: ArgusMessageType.REQUEST,
        messageId,
        method,
        payload
      }));
      const decoder = new ArgusFrameStreamDecoder();
      const decoded = [];

      for (let offset = 0; offset < encoded.length;) {
        const remaining = encoded.length - offset;
        const chunkSize = Math.max(1, Math.min(remaining, 1 + Math.floor(random() * 97)));
        decoded.push(...decoder.push(encoded.subarray(offset, offset + chunkSize)));
        offset += chunkSize;
      }

      expect(decoded).toHaveLength(1);
      expect(decoded[0]?.messageId).toBe(messageId);
      expect(decoded[0]?.method).toBe(method);
      expect(decoded[0]?.payload).toEqual(payload);
      expect(decoder.pendingBytes).toBe(0);
    }
  });
});

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
