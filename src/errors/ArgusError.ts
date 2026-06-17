export interface ArgusErrorOptions {
  code: string;
  message: string;
  details?: unknown;
}

export class ArgusError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(options: ArgusErrorOptions) {
    super(options.message);
    this.name = "ArgusError";
    this.code = options.code;
    this.details = options.details;
  }

  toJSON(): {
    code: string;
    message: string;
    details?: unknown;
  } {
    return {
      code: this.code,
      message: this.message,
      details: this.details
    };
  }

  static fromUnknown(error: unknown, fallbackCode = "ARGUS_UNKNOWN_ERROR"): ArgusError {
    if (error instanceof ArgusError) {
      return error;
    }

    if (error instanceof Error) {
      return new ArgusError({
        code: error.message || fallbackCode,
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
