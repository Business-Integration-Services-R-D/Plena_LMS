import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const tx = {
    user: { update: vi.fn() },
    userActivationToken: { updateMany: vi.fn() },
  };
  return {
    tx,
    requireSession: vi.fn(),
    hashPassword: vi.fn(),
    recordAudit: vi.fn(),
    sendActivationEmail: vi.fn(),
    issueActivationToken: vi.fn(),
    keepOnlyActivationToken: vi.fn(),
    discardActivationToken: vi.fn(),
    prisma: {
      user: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(async (operation: (client: typeof tx) => unknown) =>
        operation(tx),
      ),
    },
  };
});

vi.mock("@/lib/auth", () => ({
  requireSession: mocks.requireSession,
  hashPassword: mocks.hashPassword,
}));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/email", () => ({
  sendActivationEmail: mocks.sendActivationEmail,
}));
vi.mock("@/lib/activation", () => ({
  issueActivationToken: mocks.issueActivationToken,
  keepOnlyActivationToken: mocks.keepOnlyActivationToken,
  discardActivationToken: mocks.discardActivationToken,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { GET as listUsers, POST as createUser } from "./route";
import { POST as restoreUser } from "./[id]/restore/route";

const admin = { id: "admin-1", email: "admin@example.com" };
const archivedAt = new Date("2026-10-01T08:00:00.000Z");
const restored = {
  id: "user-1",
  email: "user@example.com",
  name: "Example User",
  role: "USER",
  active: false,
  deactivatedAt: null,
  deletedAt: null,
  createdAt: new Date("2026-01-01T08:00:00.000Z"),
};

function request(path: string, body?: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
        }),
  });
}

describe("archived user lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue(admin);
    mocks.hashPassword.mockResolvedValue("new-password-hash");
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.keepOnlyActivationToken.mockResolvedValue(undefined);
    mocks.discardActivationToken.mockResolvedValue(undefined);
    mocks.tx.userActivationToken.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.user.update.mockResolvedValue(restored);
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (client: typeof mocks.tx) => unknown) =>
        operation(mocks.tx),
    );
    mocks.issueActivationToken.mockResolvedValue({
      activation: { id: "activation-1" },
      token: "token",
      code: "123456",
      expiresAt: new Date("2026-10-07T09:10:00.000Z"),
    });
    mocks.sendActivationEmail.mockResolvedValue({ id: "mail-1" });
  });

  it("lists only archived users when archived=true", async () => {
    mocks.prisma.user.findMany.mockResolvedValue([]);

    const response = await listUsers(
      request("/api/admin/users?archived=true"),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        select: expect.objectContaining({
          activationTokens: expect.objectContaining({
            where: { usedAt: null },
          }),
        }),
      }),
    );
  });

  it("returns a distinct conflict for an archived email", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      deletedAt: archivedAt,
    });

    const response = await createUser(
      request("/api/admin/users", {
        email: "user@example.com",
        name: "Example User",
        role: "USER",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "USER_ARCHIVED",
      userId: "user-1",
    });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });

  it("restores the existing identity and sends a new activation", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Example User",
      role: "USER",
      deletedAt: archivedAt,
    });

    const response = await restoreUser(
      request("/api/admin/users/user-1/restore", { sendActivation: true }),
      { params: Promise.resolve({ id: "user-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "user-1",
      activationEmailSent: true,
    });
    expect(mocks.tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1", deletedAt: { not: null } },
        data: expect.objectContaining({
          active: false,
          deletedAt: null,
          deactivatedAt: null,
          passwordHash: "new-password-hash",
          sessionVersion: { increment: 1 },
        }),
      }),
    );
    expect(mocks.sendActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com", code: "123456" }),
    );
  });

  it("keeps the user restored when activation delivery fails", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Example User",
      role: "USER",
      deletedAt: archivedAt,
    });
    mocks.sendActivationEmail.mockRejectedValue(new Error("mail unavailable"));

    const response = await restoreUser(
      request("/api/admin/users/user-1/restore", { sendActivation: true }),
      { params: Promise.resolve({ id: "user-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "user-1",
      activationEmailSent: false,
      activationEmailError:
        "Kullanıcı geri yüklendi ancak aktivasyon maili gönderilemedi",
    });
    expect(mocks.discardActivationToken).toHaveBeenCalledWith("activation-1");
  });

  it("does not restore an active or pending user", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "Example User",
      role: "USER",
      deletedAt: null,
    });

    const response = await restoreUser(
      request("/api/admin/users/user-1/restore", { sendActivation: true }),
      { params: Promise.resolve({ id: "user-1" }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
