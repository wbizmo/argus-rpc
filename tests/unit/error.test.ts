import { describe, expect, it } from "vitest";
import { ArgusError, ArgusStatus } from "../../src";

describe("ArgusError", () => {
  it("stores code, message, status, retryability, and details", () => {
    const error = new ArgusError({
      code: "ARGUS_TEST_ERROR",
      message: "Test error",
      status: ArgusStatus.UNAVAILABLE,
      details: { field: "value" }
    });

    expect(error.name).toBe("ArgusError");
    expect(error.code).toBe("ARGUS_TEST_ERROR");
    expect(error.message).toBe("Test error");
    expect(error.status).toBe(ArgusStatus.UNAVAILABLE);
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ field: "value" });
  });

  it("serializes the stable remote error contract", () => {
    const error = new ArgusError({
      code: "ARGUS_TEST_ERROR",
      message: "Test error",
      status: ArgusStatus.INVALID_ARGUMENT
    });

    expect(error.toJSON()).toEqual({
      code: "ARGUS_TEST_ERROR",
      message: "Test error",
      status: ArgusStatus.INVALID_ARGUMENT,
      retryable: false,
      details: undefined
    });
  });

  it("returns ArgusError instances unchanged", () => {
    const original = new ArgusError({
      code: "ARGUS_ORIGINAL",
      message: "Original"
    });

    expect(ArgusError.fromUnknown(original)).toBe(original);
  });

  it("preserves explicit legacy ARGUS error codes", () => {
    const wrapped = ArgusError.fromUnknown(new Error("ARGUS_NORMAL_ERROR"));

    expect(wrapped).toBeInstanceOf(ArgusError);
    expect(wrapped.code).toBe("ARGUS_NORMAL_ERROR");
  });

  it("uses a stable fallback code for arbitrary Error messages", () => {
    const wrapped = ArgusError.fromUnknown(new Error("database password leaked"), "ARGUS_HANDLER_ERROR");

    expect(wrapped.code).toBe("ARGUS_HANDLER_ERROR");
    expect(wrapped.message).toBe("database password leaked");
  });

  it("wraps unknown values", () => {
    const wrapped = ArgusError.fromUnknown({ bad: true }, "ARGUS_UNKNOWN_VALUE");

    expect(wrapped.code).toBe("ARGUS_UNKNOWN_VALUE");
    expect(wrapped.details).toEqual({ bad: true });
  });
});
