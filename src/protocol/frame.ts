import {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAGIC,
  ARGUS_MAGIC_LENGTH,
  ARGUS_VERSION,
  ArgusFrame,
  ArgusMessageType
} from "./types";

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

export function validateFrame(frame: ArgusFrame): void {
  if (!Number.isInteger(frame.messageId) || frame.messageId < 0) {
    throw new Error("ARGUS_INVALID_MESSAGE_ID");
  }

  if (!Object.values(ArgusMessageType).includes(frame.type)) {
    throw new Error("ARGUS_INVALID_MESSAGE_TYPE");
  }

  const methodLength = Buffer.byteLength(frame.method, "utf8");

  if (methodLength > 65535) {
    throw new Error("ARGUS_METHOD_TOO_LARGE");
  }

  if (frame.payload.length > 4294967295) {
    throw new Error("ARGUS_PAYLOAD_TOO_LARGE");
  }
}

export function getFrameSize(frame: ArgusFrame): number {
  const methodLength = Buffer.byteLength(frame.method, "utf8");

  return ARGUS_HEADER_LENGTH + methodLength + frame.payload.length;
}

export {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAGIC,
  ARGUS_MAGIC_LENGTH,
  ARGUS_VERSION,
  ArgusMessageType
};
