import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

export const PASSWORD_RESET_TTL_MINUTES = 30;
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetTokenUsable(input: {
  usedAt: Date | null;
  expiresAt: Date;
  now?: Date;
}) {
  return !input.usedAt && input.expiresAt.getTime() > (input.now || new Date()).getTime();
}

export async function issuePasswordResetToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000,
  );
  const reset = await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashPasswordResetToken(token),
      expiresAt,
    },
  });
  return { reset, token, expiresAt };
}

export async function discardPasswordResetToken(tokenId: string) {
  await prisma.passwordResetToken.delete({ where: { id: tokenId } });
}
