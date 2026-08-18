import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { syncUserNotifications } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession([Role.USER, Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await syncUserNotifications(session.id);

  const [items, unreadCount] = await Promise.all([
    prisma.userNotification.findMany({
      where: { userId: session.id },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        link: true,
        metadata: true,
        readAt: true,
        occurredAt: true,
        createdAt: true,
      },
    }),
    prisma.userNotification.count({
      where: { userId: session.id, readAt: null },
    }),
  ]);

  return NextResponse.json({ items, unreadCount });
}
