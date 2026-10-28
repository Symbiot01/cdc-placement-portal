import { describe, expect, it } from "vitest";
import { classifyBridgePing, isVersionAtLeast } from "../lib/erpBridge";

describe("extension bridge version gate", () => {
  it("accepts the current bridge and rejects older builds", () => {
    expect(isVersionAtLeast("1.0.4", "1.0.4")).toBe(true);
    expect(isVersionAtLeast("1.0.10", "1.0.4")).toBe(true);
    expect(isVersionAtLeast("1.0.3", "1.0.4")).toBe(false);
    expect(isVersionAtLeast("1.0.2", "1.0.4")).toBe(false);
    expect(isVersionAtLeast("not-a-version", "1.0.4")).toBe(false);
  });

  it("treats a current ping as connected and an older ping as outdated", () => {
    expect(classifyBridgePing(true, "1.0.4")).toEqual({
      status: "connected",
      version: "1.0.4",
    });
    expect(classifyBridgePing(true, "1.0.2")).toEqual({
      status: "outdated",
      version: "1.0.2",
    });
    expect(classifyBridgePing(true, null)).toEqual({
      status: "outdated",
      version: null,
    });
    expect(classifyBridgePing(false, "1.0.4")).toEqual({
      status: "missing",
      version: null,
    });
  });
});
