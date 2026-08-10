import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const [users, courses, events, attempts] = await Promise.all([
    prisma.user.count({ where: { role: "CAPTAIN" } }),
    prisma.course.count(),
    prisma.watchEvent.count(),
    prisma.quizAttempt.count(),
  ]);

  const cards = [
    { label: "Kaptan", value: users, href: "/admin/users" },
    { label: "Eğitim", value: courses, href: "/admin/courses" },
    { label: "İzleme olayı", value: events, href: "/admin/audit" },
    { label: "Sınav denemesi", value: attempts, href: "/admin/audit" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sea-200 bg-white/90 p-6">
        <h2 className="text-xl font-semibold text-sea-950">Yönetici paneli</h2>
        <p className="mt-2 max-w-2xl text-sm text-sea-600">
          PoC kapsamında kullanıcı, eğitim, atama ve denetim raporlarını yönetin. Kaptan tarafında
          ileri sarma engelli oynatıcıyı doğrulayabilirsiniz.
        </p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-2xl border border-sea-200 bg-white p-5 hover:border-sea-400"
          >
            <div className="text-3xl font-semibold text-sea-900">{c.value}</div>
            <div className="mt-1 text-sm text-sea-600">{c.label}</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
