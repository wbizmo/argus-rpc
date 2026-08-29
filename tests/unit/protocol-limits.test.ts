import { describe, expect, it } from "vitest";
import {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAX_MESSAGE_ID,
  ARGUS_VERSION,
  ArgusMessageType,
  createFrame,
  decodeFrame,
  encodeFrame,
  validateFrame
} from "../../src";

describe("Argus protocol limits", () => {
  it("rejects a declared payload that exceeds the configured limit before its body arrives", () => {
    const header = Buffer.alloc(ARGUS_HEADER_LENGTH);
    header.write("AR", 0, 2, "ascii");
    header.writeUInt8(ARGUS_VERSION, 2);
    header.writeUInt8(ArgusMessageType.REQUEST, 3);
    header.writeUInt32BE(1, 4);
    header.writeUInt16BE(0, 8);
    header.writeUInt32BE(4096, 10);

    expect(() =>
      decodeFrame(header, {
        maxPayloadBytes: 1024,
        maxFrameBytes: 2048
      })
    ).toThrow("ARGUS_PAYLOAD_TOO_LARGE");
  });

  it("rejects method names over the configured byte limit", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "abcd",
      payload: null
    });

    expect(() => encodeFrame(frame, { maxMethodBytes: 3 })).toThrow(
      "ARGUS_METHOD_TOO_LARGE"
    );
  });

  it("accepts the largest valid uint32 message id", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: ARGUS_MAX_MESSAGE_ID,
      method: "echo",
      payload: null
    });

    expect(() => validateFrame(frame)).not.toThrow();
  });

  it("rejects message ids outside the uint32 wire range", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: ARGUS_MAX_MESSAGE_ID + 1,
      method: "echo",
      payload: null
    });

    expect(() => validateFrame(frame)).toThrow("ARGUS_INVALID_MESSAGE_ID");
  });
});
