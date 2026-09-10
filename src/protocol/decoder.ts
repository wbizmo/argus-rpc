import {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAGIC,
  ARGUS_VERSION,
  type ArgusFrame,
  type ArgusMessageType,
  isArgusMessageType
} from "./types";
import {
  DEFAULT_PROTOCOL_LIMITS,
  normalizeProtocolLimits,
  type ArgusProtocolLimits
} from "./limits";

const ARGUS_MAGIC_FIRST = ARGUS_MAGIC.charCodeAt(0);
const ARGUS_MAGIC_SECOND = ARGUS_MAGIC.charCodeAt(1);

export interface DecodeResult {
  frame: ArgusFrame | null;
  remaining: Buffer;
}

export interface DecodedFrameHeader {
  type: ArgusMessageType;
  messageId: number;
  methodLength: number;
  payloadLength: number;
  totalLength: number;
}

export function decodeFrame(
  buffer: Buffer,
  limits: Partial<ArgusProtocolLimits> = DEFAULT_PROTOCOL_LIMITS
): DecodeResult {
  if (buffer.length < ARGUS_HEADER_LENGTH) {
    return { frame: null, remaining: buffer };
  }

  return decodeFrameWithNormalizedLimits(buffer, normalizeProtocolLimits(limits));
}

export function decodeFrames(
  buffer: Buffer,
  limits: Partial<ArgusProtocolLimits> = DEFAULT_PROTOCOL_LIMITS
): {
  frames: ArgusFrame[];
  remaining: Buffer;
} {
  if (buffer.length < ARGUS_HEADER_LENGTH) {
    return { frames: [], remaining: buffer };
  }

  const normalizedLimits = normalizeProtocolLimits(limits);
  const frames: ArgusFrame[] = [];
  let remaining = buffer;

  while (remaining.length >= ARGUS_HEADER_LENGTH) {
    const result = decodeFrameWithNormalizedLimits(remaining, normalizedLimits);

    if (!result.frame) {
      return {
        frames,
        remaining: result.remaining
      };
    }

    frames.push(result.frame);
    remaining = result.remaining;
  }

  return { frames, remaining };
}

export function decodeFrameWithNormalizedLimits(
  buffer: Buffer,
  limits: ArgusProtocolLimits
): DecodeResult {
  const header = decodeFrameHeaderWithNormalizedLimits(buffer, limits);
  if (!header) return { frame: null, remaining: buffer };
  return decodeFrameFromValidatedHeader(buffer, header);
}

export function decodeFrameHeaderWithNormalizedLimits(
  buffer: Buffer,
  limits: ArgusProtocolLimits
): DecodedFrameHeader | null {
  if (buffer.length < ARGUS_HEADER_LENGTH) return null;

  if (buffer[0] !== ARGUS_MAGIC_FIRST || buffer[1] !== ARGUS_MAGIC_SECOND) {
    throw new Error("ARGUS_INVALID_MAGIC");
  }

  const version = buffer.readUInt8(2);
  if (version !== ARGUS_VERSION) {
    throw new Error("ARGUS_UNSUPPORTED_VERSION");
  }

  const type = buffer.readUInt8(3);
  if (!isArgusMessageType(type)) {
    throw new Error("ARGUS_INVALID_MESSAGE_TYPE");
  }

  const messageId = buffer.readUInt32BE(4);
  const methodLength = buffer.readUInt16BE(8);
  const payloadLength = buffer.readUInt32BE(10);

  if (methodLength > limits.maxMethodBytes) {
    throw new Error("ARGUS_METHOD_TOO_LARGE");
  }
  if (payloadLength > limits.maxPayloadBytes) {
    throw new Error("ARGUS_PAYLOAD_TOO_LARGE");
  }

  const totalLength = ARGUS_HEADER_LENGTH + methodLength + payloadLength;
  if (totalLength > limits.maxFrameBytes) {
    throw new Error("ARGUS_FRAME_TOO_LARGE");
  }

  return {
    type,
    messageId,
    methodLength,
    payloadLength,
    totalLength
  };
}

export function decodeFrameFromValidatedHeader(
  buffer: Buffer,
  header: DecodedFrameHeader
): DecodeResult {
  if (buffer.length < header.totalLength) {
    return { frame: null, remaining: buffer };
  }

  const methodStart = ARGUS_HEADER_LENGTH;
  const methodEnd = methodStart + header.methodLength;
  const payloadStart = methodEnd;
  const payloadEnd = payloadStart + header.payloadLength;

  return {
    frame: {
      type: header.type,
      messageId: header.messageId,
      method: buffer.toString("utf8", methodStart, methodEnd),
      payload: buffer.subarray(payloadStart, payloadEnd)
    },
    remaining: buffer.subarray(header.totalLength)
  };
}
