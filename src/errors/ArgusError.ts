import { ArgusStatus, isRetryableStatus } from "../rpc/status";

export interface ArgusErrorOptions {
  code: string;
  message: string;
  details?: unknown;
  status?: ArgusStatus;
  retryable?: boolean;
}

export class ArgusError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: ArgusStatus;
  readonly retryable: boolean;

  constructor(options: ArgusErrorOptions) {
    super(options.message);
    this.name = "ArgusError";
    this.code = options.code;
    this.details = options.details;
    this.status = options.status ?? inferStatusFromCode(options.code);
    this.retryable = options.retryable ?? isRetryableStatus(this.status);
  }

  toJSON(): {
    code: string;
    message: string;
    status: ArgusStatus;
    retryable: boolean;
    details?: unknown;
  } {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
      details: this.details
    };
  }

  static fromUnknown(error: unknown, fallbackCode = "ARGUS_UNKNOWN_ERROR"): ArgusError {
    if (error instanceof ArgusError) {
      return error;
    }

    if (error instanceof Error) {
      const code = error.message.startsWith("ARGUS_")
        ? error.message
        : fallbackCode;
      return new ArgusError({
        code,
        message: error.message || "Unknown Argus error"
      });
    }

    return new ArgusError({
      code: fallbackCode,
      message: "Unknown Argus error",
      details: error
    });
  }
}

function inferStatusFromCode(code: string): ArgusStatus {
  if (code.includes("TIMEOUT") || code.includes("DEADLINE")) {
    return ArgusStatus.DEADLINE_EXCEEDED;
  }
  if (code.includes("CANCEL")) {
    return ArgusStatus.CANCELLED;
  }
  if (
    code.includes("CONNECTION") ||
    code.includes("SOCKET_CLOSED") ||
    code.includes("NOT_CONNECTED")
  ) {
    return ArgusStatus.UNAVAILABLE;
  }
  if (
    code.includes("OVERLOADED") ||
    code.includes("QUEUE_FULL") ||
    code.includes("POOL_EXHAUSTED")
  ) {
    return ArgusStatus.RESOURCE_EXHAUSTED;
  }
  if (code.includes("METHOD_NOT_FOUND")) {
    return ArgusStatus.UNIMPLEMENTED;
  }
  if (
    code.includes("INVALID") ||
    code.includes("TOO_LARGE") ||
    code.includes("UNSUPPORTED_VERSION")
  ) {
    return ArgusStatus.INVALID_ARGUMENT;
  }
  return ArgusStatus.UNKNOWN;
}
