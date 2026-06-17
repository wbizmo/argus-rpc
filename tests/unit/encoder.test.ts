import { describe, expect, it } from "vitest";
import {
  ARGUS_MAGIC,
  ARGUS_VERSION,
  ARGUS_HEADER_LENGTH,
  ArgusMessageType,
  createFrame,
  encodeFrame
} from "../../src";

describe("Argus frame encoder", () => {
  it("encodes the protocol magic bytes", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);

    expect(encoded.toString("ascii", 0, 2)).toBe(ARGUS_MAGIC);
  });

  it("encodes the protocol version", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);

    expect(encoded.readUInt8(2)).toBe(ARGUS_VERSION);
  });

  it("encodes message type and message id", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 42,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);

    expect(encoded.readUInt8(3)).toBe(ArgusMessageType.REQUEST);
    expect(encoded.readUInt32BE(4)).toBe(42);
  });

  it("encodes method length and payload length", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);
    const expectedPayload = Buffer.from(JSON.stringify({ id: 1 }), "utf8");

    expect(encoded.readUInt16BE(8)).toBe(Buffer.byteLength("user.get", "utf8"));
    expect(encoded.readUInt32BE(10)).toBe(expectedPayload.length);
  });

  it("places method and payload after the header", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: 1,
      method: "user.get",
      payload: { id: 1 }
    });

    const encoded = encodeFrame(frame);
    const methodLength = encoded.readUInt16BE(8);
    const payloadLength = encoded.readUInt32BE(10);
    const methodStart = ARGUS_HEADER_LENGTH;
    const payloadStart = methodStart + methodLength;

    expect(encoded.toString("utf8", methodStart, payloadStart)).toBe("user.get");
    expect(encoded.subarray(payloadStart, payloadStart + payloadLength).toString("utf8")).toBe(
      JSON.stringify({ id: 1 })
    );
  });

  it("rejects negative message IDs", () => {
    const frame = createFrame({
      type: ArgusMessageType.REQUEST,
      messageId: -1,
      method: "user.get",
      payload: { id: 1 }
    });

    expect(() => encodeFrame(frame)).toThrow("ARGUS_INVALID_MESSAGE_ID");
  });
});
