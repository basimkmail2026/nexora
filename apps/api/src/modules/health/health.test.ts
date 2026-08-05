import { describe, expect, it } from "vitest";

describe("health contract", () => {
  it("uses a stable response shape", () => {
    const response = { ok: true, service: "nexora-api", time: new Date().toISOString() };
    expect(response.ok).toBe(true);
    expect(response.service).toBe("nexora-api");
  });
});
