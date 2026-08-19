import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { prisma } from "./prisma";

export const ACTIVATION_TTL_MINUTES = 10;
export const ACTIVATION_MAX_ATTEMPTS = 5;

function activationSecret() {
  return process.env.AUTH_SECRET || "poc-demo-secret-change-me";
}

export function hashActivationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashActivationCode(token: string, code: string) {
  return createHmac("sha256", activationSecret())
    .update(`${token}:${code}`)
    .digest("hex");
}

export function isActivationCodeValid(
  token: string,
  code: string,
  codeHash: string,
) {
  const expected = Buffer.from(hashActivationCode(token, code), "hex");
  const actual = Buffer.from(codeHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function issueActivationToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(
    Date.now() + ACTIVATION_TTL_MINUTES * 60 * 1000,
  );

  const activation = await prisma.userActivationToken.create({
    data: {
      userId,
      tokenHash: hashActivationToken(token),
      codeHash: hashActivationCode(token, code),
      expiresAt,
    },
  });

  return { activation, token, code, expiresAt };
}

export async function keepOnlyActivationToken(userId: string, tokenId: string) {
  await prisma.userActivationToken.updateMany({
    where: {
      userId,
      id: { not: tokenId },
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });
}

export async function discardActivationToken(tokenId: string) {
  await prisma.userActivationToken.delete({ where: { id: tokenId } });
}
