import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession(["USER", "ADMIN"]);
  if (!session) redirect("/login");

  return (
    <AppShell
      user={session}
      nav={[
        { href: "/user", label: "Eğitimlerim" },
      ]}
    >
      {children}
    </AppShell>
  );
}
