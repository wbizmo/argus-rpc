import { describe, expect, it } from "vitest";
import { ArgusError } from "../../src";

describe("ArgusError", () => {
  it("stores code, message, and details", () => {
    const error = new ArgusError({
      code: "ARGUS_TEST_ERROR",
      message: "Test error",
      details: {
        field: "value"
      }
    });

    expect(error.name).toBe("ArgusError");
    expect(error.code).toBe("ARGUS_TEST_ERROR");
    expect(error.message).toBe("Test error");
    expect(error.details).toEqual({
      field: "value"
    });
  });

  it("serializes to JSON", () => {
    const error = new ArgusError({
      code: "ARGUS_TEST_ERROR",
      message: "Test error"
    });

    expect(error.toJSON()).toEqual({
      code: "ARGUS_TEST_ERROR",
      message: "Test error",
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

  it("wraps normal Error instances", () => {
    const wrapped = ArgusError.fromUnknown(new Error("ARGUS_NORMAL_ERROR"));

    expect(wrapped).toBeInstanceOf(ArgusError);
    expect(wrapped.code).toBe("ARGUS_NORMAL_ERROR");
  });

  it("wraps unknown values", () => {
    const wrapped = ArgusError.fromUnknown({ bad: true }, "ARGUS_UNKNOWN_VALUE");

    expect(wrapped.code).toBe("ARGUS_UNKNOWN_VALUE");
    expect(wrapped.details).toEqual({
      bad: true
    });
  });
});
