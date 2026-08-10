"use client";

import { useEffect, useState } from "react";

type AuditPayload = {
  watchEvents: Array<{
    id: string;
    eventType: string;
    positionSec: number;
    createdAt: string;
    user: { name: string; email: string };
    video: { course: { title: string } };
  }>;
  quizAttempts: Array<{
    id: string;
    attemptNo: number;
    scorePercent: number;
    passed: boolean;
    completedAt: string;
    user: { name: string; email: string };
    course: { title: string };
  }>;
  progress: Array<{
    id: string;
    watchedPercent: number;
    status: string;
    maxReachedSec: number;
    user: { name: string };
    course: { title: string };
  }>;
};

export default function AdminAuditPage() {
  const [data, setData] = useState<AuditPayload | null>(null);

  useEffect(() => {
    void fetch("/api/admin/audit")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return <p className="text-sm text-sea-600">Denetim verileri yükleniyor...</p>;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-sea-200 bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold">Denetim ve raporlar</h2>
          <p className="text-sm text-sea-600">Zaman damgalı izleme ve sınav logları</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/admin/audit/export?format=xlsx"
            className="rounded-xl bg-sea-700 px-4 py-2 text-sm text-white"
          >
            Excel indir
          </a>
          <a
            href="/api/admin/audit/export?format=csv"
            className="rounded-xl border border-sea-200 px-4 py-2 text-sm"
          >
            CSV indir
          </a>
        </div>
      </section>

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h3 className="font-semibold">İlerleme özeti</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-sea-500">
              <tr>
                <th className="py-2">Kaptan</th>
                <th>Eğitim</th>
                <th>İzleme %</th>
                <th>Max sn</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {data.progress.map((p) => (
                <tr key={p.id} className="border-t border-sea-100">
                  <td className="py-2">{p.user.name}</td>
                  <td>{p.course.title}</td>
                  <td>{p.watchedPercent.toFixed(0)}%</td>
                  <td>{p.maxReachedSec.toFixed(1)}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-sea-200 bg-white p-5">
          <h3 className="font-semibold">İzleme olayları</h3>
          <ul className="mt-3 max-h-96 space-y-2 overflow-auto text-sm">
            {data.watchEvents.map((e) => (
              <li key={e.id} className="rounded-xl border border-sea-100 px-3 py-2">
                <div className="font-medium">
                  {e.user.name} · {e.eventType} · {e.positionSec.toFixed(1)}s
                </div>
                <div className="text-xs text-sea-500">
                  {e.video.course.title} · {new Date(e.createdAt).toLocaleString("tr-TR")}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-sea-200 bg-white p-5">
          <h3 className="font-semibold">Sınav denemeleri</h3>
          <ul className="mt-3 max-h-96 space-y-2 overflow-auto text-sm">
            {data.quizAttempts.map((a) => (
              <li key={a.id} className="rounded-xl border border-sea-100 px-3 py-2">
                <div className="font-medium">
                  {a.user.name} · %{a.scorePercent.toFixed(0)} ·{" "}
                  {a.passed ? "GEÇTİ" : "KALDI"}
                </div>
                <div className="text-xs text-sea-500">
                  {a.course.title} · deneme #{a.attemptNo} ·{" "}
                  {new Date(a.completedAt).toLocaleString("tr-TR")}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
