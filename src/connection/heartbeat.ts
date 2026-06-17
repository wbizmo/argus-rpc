import {
  ArgusMessageType,
  createFrame,
  decodeFrame,
  encodeFrame
} from "../protocol";

export function createPingFrame(messageId: number): Buffer {
  return encodeFrame(
    createFrame({
      type: ArgusMessageType.PING,
      messageId,
      method: "",
      payload: null
    })
  );
}

export function createPongFrame(messageId: number): Buffer {
  return encodeFrame(
    createFrame({
      type: ArgusMessageType.PONG,
      messageId,
      method: "",
      payload: null
    })
  );
}

export function isPingFrame(buffer: Buffer): boolean {
  const result = decodeFrame(buffer);
  return result.frame?.type === ArgusMessageType.PING;
}

export function isPongFrame(buffer: Buffer): boolean {
  const result = decodeFrame(buffer);
  return result.frame?.type === ArgusMessageType.PONG;
}
