import { describe, expect, it } from "vitest";
import {
  hashPasswordResetToken,
  passwordResetTokenUsable,
} from "./password-reset";

describe("password reset security helpers", () => {
  it("hashes reset tokens deterministically without storing the raw token", () => {
    const token = "reset-token-example";
    expect(hashPasswordResetToken(token)).toBe(hashPasswordResetToken(token));
    expect(hashPasswordResetToken(token)).not.toContain(token);
  });

  it("accepts only unused, unexpired reset tokens", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    expect(
      passwordResetTokenUsable({
        usedAt: null,
        expiresAt: new Date("2026-09-01T12:01:00.000Z"),
        now,
      }),
    ).toBe(true);
    expect(
      passwordResetTokenUsable({
        usedAt: now,
        expiresAt: new Date("2026-09-01T12:01:00.000Z"),
        now,
      }),
    ).toBe(false);
    expect(
      passwordResetTokenUsable({
        usedAt: null,
        expiresAt: now,
        now,
      }),
    ).toBe(false);
  });
});
