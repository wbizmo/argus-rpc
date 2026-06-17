import { describe, expect, it } from "vitest";
import { ARGUS_VERSION } from "../src";

describe("Argus", () => {
  it("exports a version", () => {
    expect(ARGUS_VERSION).toBeDefined();
  });
});
