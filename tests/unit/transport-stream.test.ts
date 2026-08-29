import { describe, expect, it } from "vitest";
import {
  ArgusFrameStreamDecoder,
  ArgusMessageType,
  ChunkQueue,
  createFrame,
  encodeFrame
} from "../../src";

describe("transport buffering", () => {
  it("reads data spanning multiple chunks without losing boundaries", () => {
    const queue = new ChunkQueue();
    queue.append(Buffer.from("ab"));
    queue.append(Buffer.from("cdef"));

    expect(queue.peek(4).toString()).toBe("abcd");
    expect(queue.length).toBe(6);
    expect(queue.read(3).toString()).toBe("abc");
    expect(queue.read(3).toString()).toBe("def");
    expect(queue.length).toBe(0);
  });

  it("decodes a frame fragmented into single-byte chunks", () => {
    const encoded = encodeFrame(createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 77,
      method: "fragmented.echo",
      payload: { ok: true }
    }));
    const decoder = new ArgusFrameStreamDecoder();
    const decoded = [];

    for (const byte of encoded) {
      decoded.push(...decoder.push(Buffer.from([byte])));
    }

    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.messageId).toBe(77);
    expect(decoded[0]?.method).toBe("fragmented.echo");
    expect(decoder.pendingBytes).toBe(0);
  });

  it("decodes coalesced frames in arrival order", () => {
    const decoder = new ArgusFrameStreamDecoder();
    const first = encodeFrame(createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "one",
      payload: null
    }));
    const second = encodeFrame(createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 2,
      method: "two",
      payload: null
    }));

    const frames = decoder.push(Buffer.concat([first, second]));
    expect(frames.map((frame) => frame.messageId)).toEqual([1, 2]);
  });
});
