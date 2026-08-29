import type { ArgusMetadata } from "./envelope";

export interface ArgusPeerInfo {
  address?: string;
  port?: number;
}

export interface ArgusCallContext {
  messageId: number;
  method: string;
  peer: ArgusPeerInfo;
  startedAt: number;
  deadlineUnixMs?: number;
  metadata: ArgusMetadata;
  signal: AbortSignal;
}

export function remainingDeadlineMs(context: Pick<ArgusCallContext, "deadlineUnixMs">): number | undefined {
  if (context.deadlineUnixMs === undefined) return undefined;
  return Math.max(0, context.deadlineUnixMs - Date.now());
}
