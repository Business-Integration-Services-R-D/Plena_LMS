import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    id: session.id,
    email: session.email,
    name: session.name,
    role: session.role,
  });
}
