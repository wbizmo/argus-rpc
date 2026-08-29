import {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAGIC,
  ARGUS_VERSION,
  ArgusFrame,
  ArgusMessageType
} from "./types";
import {
  DEFAULT_PROTOCOL_LIMITS,
  normalizeProtocolLimits,
  type ArgusProtocolLimits
} from "./limits";

export interface DecodeResult {
  frame: ArgusFrame | null;
  remaining: Buffer;
}

export function decodeFrame(
  buffer: Buffer,
  limits: Partial<ArgusProtocolLimits> = DEFAULT_PROTOCOL_LIMITS
): DecodeResult {
  if (buffer.length < ARGUS_HEADER_LENGTH) {
    return {
      frame: null,
      remaining: buffer
    };
  }

  const normalizedLimits = normalizeProtocolLimits(limits);
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

  if (methodLength > normalizedLimits.maxMethodBytes) {
    throw new Error("ARGUS_METHOD_TOO_LARGE");
  }

  if (payloadLength > normalizedLimits.maxPayloadBytes) {
    throw new Error("ARGUS_PAYLOAD_TOO_LARGE");
  }

  const totalLength = ARGUS_HEADER_LENGTH + methodLength + payloadLength;

  if (totalLength > normalizedLimits.maxFrameBytes) {
    throw new Error("ARGUS_FRAME_TOO_LARGE");
  }

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

export function decodeFrames(
  buffer: Buffer,
  limits: Partial<ArgusProtocolLimits> = DEFAULT_PROTOCOL_LIMITS
): {
  frames: ArgusFrame[];
  remaining: Buffer;
} {
  const frames: ArgusFrame[] = [];
  let remaining = buffer;

  while (remaining.length >= ARGUS_HEADER_LENGTH) {
    const result = decodeFrame(remaining, limits);

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
