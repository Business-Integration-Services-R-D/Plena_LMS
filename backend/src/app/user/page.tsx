import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshOverdue, visibleEnrollmentWhere } from "@/lib/enrollment";
import { StatusPill } from "@/components/StatusPill";

export const dynamic = "force-dynamic";

function formatDuration(totalSec: number) {
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min} dk ${String(sec).padStart(2, "0")} sn`;
}

export default async function UserHomePage() {
  const session = await requireSession(["USER", "ADMIN"]);
  if (!session) redirect("/login");

  await refreshOverdue({ userId: session.id });

  const enrollments = await prisma.enrollment.findMany({
    where: visibleEnrollmentWhere(session.id),
    include: {
      course: {
        include: {
          video: true,
          questionPool: { select: { _count: { select: { questions: true } } } },
        },
      },
      quizAttempts: { orderBy: { completedAt: "desc" }, take: 1 },
    },
    orderBy: [{ dueAt: "asc" }, { assignedAt: "desc" }],
  });

  const upcoming = await prisma.enrollment.count({
    where: { userId: session.id, startsAt: { gt: new Date() } },
  });

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sea-200 bg-white/90 p-6">
        <h2 className="text-xl font-semibold">Eğitimlerim</h2>
        <p className="mt-2 text-sm text-sea-600">
          Videoları ileri sarmadan izleyin. %100 tamamlanınca test açılır.
        </p>
        {upcoming > 0 ? (
          <p className="mt-2 text-sm text-sea-500">
            {upcoming} eğitim henüz başlangıç tarihine gelmedi, tarihi geldiğinde
            listede görünecek.
          </p>
        ) : null}
      </section>

      {enrollments.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-sea-200 bg-white p-8 text-center text-sm text-sea-500">
          Şu anda açık bir eğitiminiz yok.
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        {enrollments.map((e) => {
          const latest = e.quizAttempts[0];
          const questionCount =
            e.course.questionCount || e.course.questionPool?._count.questions || 0;
          return (
            <article
              key={e.id}
              className="rounded-3xl border border-sea-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-sea-950">
                  {e.course.title}
                </h3>
                <StatusPill status={e.status} />
              </div>
              <p className="mt-2 text-sm text-sea-600">{e.course.description}</p>
              <div className="mt-3 text-xs text-sea-500">
                {formatDuration(e.course.video?.durationSec ?? 0)} · {questionCount}{" "}
                soru · izleme {e.watchedPercent.toFixed(0)}%
                {latest
                  ? ` · son test %${latest.scorePercent.toFixed(0)} (${latest.passed ? "geçti" : "kaldı"})`
                  : ""}
              </div>
              {e.dueAt ? (
                <div className="mt-1 text-xs text-sea-500">
                  Son tarih: {e.dueAt.toLocaleString("tr-TR")}
                </div>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/user/courses/${e.courseId}`}
                  className="rounded-xl bg-sea-700 px-4 py-2 text-sm text-white"
                >
                  {e.positionSec > 0 && !e.videoCompleted
                    ? "Kaldığın yerden devam et"
                    : "Eğitime git"}
                </Link>
                {e.videoCompleted && !e.passed ? (
                  <Link
                    href={`/user/courses/${e.courseId}/quiz`}
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
