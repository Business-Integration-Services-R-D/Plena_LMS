import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getQuotaUsage } from "@/lib/quota";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession([Role.ADMIN]);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getQuotaUsage());
}
