import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

export default async function CaptainHomePage() {
  const session = await requireSession(["CAPTAIN", "ADMIN"]);
  if (!session) redirect("/login");

  const assignments = await prisma.assignment.findMany({
    where: { userId: session.id },
    include: {
      course: {
        include: {
          video: true,
          _count: { select: { questions: true } },
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  const progress = await prisma.watchProgress.findMany({
    where: { userId: session.id },
  });
  const progressMap = new Map(progress.map((p) => [p.courseId, p]));

  const attempts = await prisma.quizAttempt.findMany({
    where: { userId: session.id },
    orderBy: { completedAt: "desc" },
  });
  const attemptMap = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    if (!attemptMap.has(a.courseId)) attemptMap.set(a.courseId, a);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sea-200 bg-white/90 p-6">
        <h2 className="text-xl font-semibold">Eğitimlerim</h2>
        <p className="mt-2 text-sm text-sea-600">
          Videoları ileri sarmadan izleyin. %100 tamamlanınca test açılır.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {assignments.map((a) => {
          const p = progressMap.get(a.courseId);
          const latest = attemptMap.get(a.courseId);
          return (
            <article
              key={a.id}
              className="rounded-3xl border border-sea-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-sea-950">{a.course.title}</h3>
                <StatusPill status={p?.status || "NOT_STARTED"} />
              </div>
              <p className="mt-2 text-sm text-sea-600">{a.course.description}</p>
              <div className="mt-3 text-xs text-sea-500">
                {a.course.video?.durationSec || 0} sn · {a.course._count.questions} soru · izleme{" "}
                {(p?.watchedPercent || 0).toFixed(0)}%
                {latest
                  ? ` · son test %${latest.scorePercent.toFixed(0)} (${latest.passed ? "geçti" : "kaldı"})`
                  : ""}
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/captain/courses/${a.courseId}`}
                  className="rounded-xl bg-sea-700 px-4 py-2 text-sm text-white"
                >
                  Eğitime git
                </Link>
                {p?.completed ? (
                  <Link
                    href={`/captain/courses/${a.courseId}/quiz`}
                    className="rounded-xl border border-sea-200 px-4 py-2 text-sm"
                  >
                    Teste git
                  </Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
