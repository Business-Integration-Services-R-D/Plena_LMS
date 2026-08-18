import { describe, expect, it } from "vitest";
import {
  ACTIVATION_MAX_ATTEMPTS,
  ACTIVATION_TTL_MINUTES,
  hashActivationCode,
  hashActivationToken,
  isActivationCodeValid,
} from "./activation";

describe("activation security helpers", () => {
  it("hashes link tokens deterministically without storing the raw token", () => {
    const token = "a".repeat(43);
    const hash = hashActivationToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).toBe(hashActivationToken(token));
    expect(hash).not.toContain(token);
  });

  it("binds a verification code to its link token", () => {
    const token = "token-for-first-invitation";
    const codeHash = hashActivationCode(token, "123456");

    expect(isActivationCodeValid(token, "123456", codeHash)).toBe(true);
    expect(isActivationCodeValid(token, "654321", codeHash)).toBe(false);
    expect(
      isActivationCodeValid("token-for-another-invitation", "123456", codeHash),
    ).toBe(false);
  });

  it("keeps the agreed expiry and attempt limits", () => {
    expect(ACTIVATION_TTL_MINUTES).toBe(10);
    expect(ACTIVATION_MAX_ATTEMPTS).toBe(5);
  });
});
