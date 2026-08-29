import { ArgusMessageType, type ArgusFrame } from "./types";

export type ArgusPeerRole = "client" | "server";

const CLIENT_TO_SERVER = new Set<ArgusMessageType>([
  ArgusMessageType.REQUEST,
  ArgusMessageType.PING,
  ArgusMessageType.CANCEL
]);

const SERVER_TO_CLIENT = new Set<ArgusMessageType>([
  ArgusMessageType.RESPONSE,
  ArgusMessageType.ERROR,
  ArgusMessageType.PONG
]);

export function isFrameAllowedFromPeer(
  localRole: ArgusPeerRole,
  frame: Pick<ArgusFrame, "type">
): boolean {
  return localRole === "server"
    ? CLIENT_TO_SERVER.has(frame.type)
    : SERVER_TO_CLIENT.has(frame.type);
}

export function assertFrameAllowedFromPeer(
  localRole: ArgusPeerRole,
  frame: Pick<ArgusFrame, "type">
): void {
  if (!isFrameAllowedFromPeer(localRole, frame)) {
    throw new Error("ARGUS_INVALID_FRAME_DIRECTION");
  }
}
