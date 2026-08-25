import { describe, expect, it } from "vitest";
import { pingDatabase } from "./keepAlive.js";

describe("pingDatabase", () => {
  it("resolves without throwing against a live connection", async () => {
    await expect(pingDatabase()).resolves.toBeUndefined();
  });
});
