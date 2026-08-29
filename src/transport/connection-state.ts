export enum ArgusConnectionState {
  IDLE = "IDLE",
  CONNECTING = "CONNECTING",
  READY = "READY",
  DRAINING = "DRAINING",
  TRANSIENT_FAILURE = "TRANSIENT_FAILURE",
  CLOSED = "CLOSED"
}

const ALLOWED_TRANSITIONS: Readonly<Record<ArgusConnectionState, ReadonlySet<ArgusConnectionState>>> = {
  [ArgusConnectionState.IDLE]: new Set([
    ArgusConnectionState.CONNECTING,
    ArgusConnectionState.CLOSED
  ]),
  [ArgusConnectionState.CONNECTING]: new Set([
    ArgusConnectionState.READY,
    ArgusConnectionState.TRANSIENT_FAILURE,
    ArgusConnectionState.CLOSED
  ]),
  [ArgusConnectionState.READY]: new Set([
    ArgusConnectionState.DRAINING,
    ArgusConnectionState.TRANSIENT_FAILURE,
    ArgusConnectionState.CLOSED
  ]),
  [ArgusConnectionState.DRAINING]: new Set([
    ArgusConnectionState.CLOSED,
    ArgusConnectionState.TRANSIENT_FAILURE
  ]),
  [ArgusConnectionState.TRANSIENT_FAILURE]: new Set([
    ArgusConnectionState.CONNECTING,
    ArgusConnectionState.CLOSED
  ]),
  [ArgusConnectionState.CLOSED]: new Set()
};

export class ConnectionStateMachine {
  private currentState = ArgusConnectionState.IDLE;

  get state(): ArgusConnectionState {
    return this.currentState;
  }

  canTransition(next: ArgusConnectionState): boolean {
    return ALLOWED_TRANSITIONS[this.currentState].has(next);
  }

  transition(next: ArgusConnectionState): void {
    if (next === this.currentState) return;
    if (!this.canTransition(next)) {
      throw new Error(`ARGUS_INVALID_CONNECTION_TRANSITION:${this.currentState}->${next}`);
    }
    this.currentState = next;
  }
}
