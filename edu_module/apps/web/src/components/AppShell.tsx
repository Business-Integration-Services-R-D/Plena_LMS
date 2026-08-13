import Link from "next/link";
import { SessionUser } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";

export function AppShell({
  user,
  nav,
  children,
}: {
  user: SessionUser;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sea-200 bg-white/90 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-sea-500">Martı Denizcilik</p>
          <h1 className="text-xl font-semibold text-sea-900">Cloud LMS PoC</h1>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-sm text-sea-800 hover:bg-sea-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="font-medium">{user.name}</div>
            <div className="text-sea-500">{user.role === "ADMIN" ? "Yönetici" : "Kullanıcı"}</div>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
