import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession(["ADMIN"]);
  if (!session) redirect("/login");

  return (
    <AppShell
      user={session}
      nav={[
        { href: "/admin", label: "Özet" },
        { href: "/admin/users", label: "Kullanıcılar" },
        { href: "/admin/groups", label: "Ekipler" },
        { href: "/admin/courses", label: "Eğitimler" },
        { href: "/admin/assignments", label: "Atamalar" },
        { href: "/admin/reports", label: "Raporlar" },
        { href: "/admin/audit", label: "Denetim" },
      ]}
    >
      {children}
    </AppShell>
  );
}
