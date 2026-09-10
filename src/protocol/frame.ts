import {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAGIC,
  ARGUS_MAGIC_LENGTH,
  ARGUS_MAX_MESSAGE_ID,
  ARGUS_VERSION,
  ArgusFrame,
  ArgusMessageType
} from "./types";
import {
  DEFAULT_PROTOCOL_LIMITS,
  normalizeProtocolLimits,
  type ArgusProtocolLimits
} from "./limits";
import { validateFrameShape } from "./validation";

export function createFrame(input: {
  type: ArgusMessageType;
  messageId: number;
  method?: string;
  payload?: Buffer | string | object | null;
}): ArgusFrame {
  return {
    type: input.type,
    messageId: input.messageId,
    method: input.method ?? "",
    payload: normalizePayload(input.payload)
  };
}

export function normalizePayload(payload?: Buffer | string | object | null): Buffer {
  if (payload === undefined || payload === null) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(payload)) {
    return payload;
  }

  if (typeof payload === "string") {
    return Buffer.from(payload, "utf8");
  }

  return Buffer.from(JSON.stringify(payload), "utf8");
}

export function validateFrame(
  frame: ArgusFrame,
  limits: Partial<ArgusProtocolLimits> = DEFAULT_PROTOCOL_LIMITS
): void {
  const normalizedLimits = normalizeProtocolLimits(limits);
  const methodLength = Buffer.byteLength(frame.method, "utf8");
  validateFrameShape(frame, methodLength, normalizedLimits);
}

export function getFrameSize(frame: ArgusFrame): number {
  const methodLength = Buffer.byteLength(frame.method, "utf8");
  return ARGUS_HEADER_LENGTH + methodLength + frame.payload.length;
}

export {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAGIC,
  ARGUS_MAGIC_LENGTH,
  ARGUS_MAX_MESSAGE_ID,
  ARGUS_VERSION,
  ArgusMessageType
};
