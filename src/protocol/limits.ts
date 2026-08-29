import { ARGUS_HEADER_LENGTH } from "./types";

export interface ArgusProtocolLimits {
  /** Maximum UTF-8 byte length of a method name. */
  maxMethodBytes: number;
  /** Maximum payload bytes accepted in a single frame. */
  maxPayloadBytes: number;
  /** Maximum total encoded frame bytes. */
  maxFrameBytes: number;
}

export const DEFAULT_MAX_METHOD_BYTES = 1024;
export const DEFAULT_MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const DEFAULT_MAX_FRAME_BYTES =
  ARGUS_HEADER_LENGTH + DEFAULT_MAX_METHOD_BYTES + DEFAULT_MAX_PAYLOAD_BYTES;

export const DEFAULT_PROTOCOL_LIMITS: Readonly<ArgusProtocolLimits> = Object.freeze({
  maxMethodBytes: DEFAULT_MAX_METHOD_BYTES,
  maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
  maxFrameBytes: DEFAULT_MAX_FRAME_BYTES
});

export function normalizeProtocolLimits(
  limits: Partial<ArgusProtocolLimits> = {}
): ArgusProtocolLimits {
  const normalized: ArgusProtocolLimits = {
    maxMethodBytes: limits.maxMethodBytes ?? DEFAULT_PROTOCOL_LIMITS.maxMethodBytes,
    maxPayloadBytes: limits.maxPayloadBytes ?? DEFAULT_PROTOCOL_LIMITS.maxPayloadBytes,
    maxFrameBytes: limits.maxFrameBytes ?? DEFAULT_PROTOCOL_LIMITS.maxFrameBytes
  };

  for (const [name, value] of Object.entries(normalized)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`ARGUS_INVALID_PROTOCOL_LIMIT:${name}`);
    }
  }

  if (normalized.maxMethodBytes > 0xffff) {
    throw new Error("ARGUS_METHOD_LIMIT_EXCEEDS_WIRE_FORMAT");
  }

  if (normalized.maxPayloadBytes > 0xffffffff) {
    throw new Error("ARGUS_PAYLOAD_LIMIT_EXCEEDS_WIRE_FORMAT");
  }

  const minimumFrameLimit = ARGUS_HEADER_LENGTH;
  if (normalized.maxFrameBytes < minimumFrameLimit) {
    throw new Error("ARGUS_FRAME_LIMIT_TOO_SMALL");
  }

  return normalized;
}
