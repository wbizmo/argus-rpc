import {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAGIC,
  ARGUS_VERSION,
  ArgusFrame,
  ArgusMessageType
} from "./types";

export interface DecodeResult {
  frame: ArgusFrame | null;
  remaining: Buffer;
}

export function decodeFrame(buffer: Buffer): DecodeResult {
  if (buffer.length < ARGUS_HEADER_LENGTH) {
    return {
      frame: null,
      remaining: buffer
    };
  }

  const magic = buffer.toString("ascii", 0, 2);

  if (magic !== ARGUS_MAGIC) {
    throw new Error("ARGUS_INVALID_MAGIC");
  }

  const version = buffer.readUInt8(2);

  if (version !== ARGUS_VERSION) {
    throw new Error("ARGUS_UNSUPPORTED_VERSION");
  }

  const type = buffer.readUInt8(3);

  if (!isValidMessageType(type)) {
    throw new Error("ARGUS_INVALID_MESSAGE_TYPE");
  }

  const messageId = buffer.readUInt32BE(4);
  const methodLength = buffer.readUInt16BE(8);
  const payloadLength = buffer.readUInt32BE(10);
  const totalLength = ARGUS_HEADER_LENGTH + methodLength + payloadLength;

  if (buffer.length < totalLength) {
    return {
      frame: null,
      remaining: buffer
    };
  }

  const methodStart = ARGUS_HEADER_LENGTH;
  const methodEnd = methodStart + methodLength;
  const payloadStart = methodEnd;
  const payloadEnd = payloadStart + payloadLength;

  const method = buffer.toString("utf8", methodStart, methodEnd);
  const payload = buffer.subarray(payloadStart, payloadEnd);
  const remaining = buffer.subarray(totalLength);

  return {
    frame: {
      type,
      messageId,
      method,
      payload
    },
    remaining
  };
}

export function decodeFrames(buffer: Buffer): {
  frames: ArgusFrame[];
  remaining: Buffer;
} {
  const frames: ArgusFrame[] = [];
  let remaining = buffer;

  while (remaining.length >= ARGUS_HEADER_LENGTH) {
    const result = decodeFrame(remaining);

    if (!result.frame) {
      return {
        frames,
        remaining: result.remaining
      };
    }

    frames.push(result.frame);
    remaining = result.remaining;
  }

  return {
    frames,
    remaining
  };
}

function isValidMessageType(type: number): type is ArgusMessageType {
  return Object.values(ArgusMessageType).includes(type);
}
