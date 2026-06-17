import { describe, expect, it } from "vitest";
import { ARGUS_PACKAGE_VERSION } from "../src";

describe("Argus", () => {
  it("exports a package version", () => {
    expect(ARGUS_PACKAGE_VERSION).toBeDefined();
  });
});
