export interface ArgusPeerInfo {
  address?: string;
  port?: number;
}

export interface ArgusCallContext {
  messageId: number;
  method: string;
  peer: ArgusPeerInfo;
  startedAt: number;
  signal: AbortSignal;
}
