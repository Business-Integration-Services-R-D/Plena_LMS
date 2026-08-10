import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function CaptainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession(["CAPTAIN", "ADMIN"]);
  if (!session) redirect("/login");

  return (
    <AppShell
      user={session}
      nav={[
        { href: "/captain", label: "Eğitimlerim" },
      ]}
    >
      {children}
    </AppShell>
  );
}
