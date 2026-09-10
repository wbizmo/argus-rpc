import type { ArgusProtocolLimits } from "./limits";
import {
  ARGUS_HEADER_LENGTH,
  ARGUS_MAX_MESSAGE_ID,
  isArgusMessageType,
  type ArgusFrame
} from "./types";

export function validateFrameShape(
  frame: ArgusFrame,
  methodLength: number,
  limits: ArgusProtocolLimits
): number {
  if (
    !Number.isInteger(frame.messageId) ||
    frame.messageId < 0 ||
    frame.messageId > ARGUS_MAX_MESSAGE_ID
  ) {
    throw new Error("ARGUS_INVALID_MESSAGE_ID");
  }

  if (!isArgusMessageType(frame.type)) {
    throw new Error("ARGUS_INVALID_MESSAGE_TYPE");
  }

  if (methodLength > limits.maxMethodBytes) {
    throw new Error("ARGUS_METHOD_TOO_LARGE");
  }

  if (frame.payload.length > limits.maxPayloadBytes) {
    throw new Error("ARGUS_PAYLOAD_TOO_LARGE");
  }

  const frameSize = ARGUS_HEADER_LENGTH + methodLength + frame.payload.length;
  if (frameSize > limits.maxFrameBytes) {
    throw new Error("ARGUS_FRAME_TOO_LARGE");
  }

  return frameSize;
}
