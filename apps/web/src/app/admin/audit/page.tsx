"use client";

import { useEffect, useState } from "react";

type AuditPayload = {
  watchEvents: Array<{
    id: string;
    eventType: string;
    positionSec: number;
    createdAt: string;
    user: { name: string; email: string };
    course: { title: string };
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
  systemLogs: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    entityType: string | null;
    entityId: string | null;
    createdAt: string;
    actor: { name: string; email: string } | null;
  }>;
};

/** Denetim eylemlerinin okunabilir Türkçe karşılıkları. */
const ACTION_TR: Record<string, string> = {
  ADMIN_CREATED_USER: "Kullanıcı oluşturuldu",
  ADMIN_UPDATED_USER: "Kullanıcı güncellendi",
  ADMIN_CHANGED_USER_STATUS: "Kullanıcı durumu değişti",
  ADMIN_CREATED_COURSE: "Eğitim oluşturuldu",
  ADMIN_CREATED_GROUP: "Ekip oluşturuldu",
  ADMIN_ADDED_GROUP_MEMBER: "Ekibe üye eklendi",
  ADMIN_REMOVED_GROUP_MEMBER: "Ekipten üye çıkarıldı",
  ADMIN_ASSIGNED_COURSE: "Eğitim atandı",
  ADMIN_CREATED_QUESTION_POOL: "Soru havuzu oluşturuldu",
  ADMIN_EXPORTED_REPORT: "Rapor dışa aktarıldı",
  USER_LOGGED_IN: "Giriş yapıldı",
  USER_LOGGED_OUT: "Çıkış yapıldı",
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
                  {e.course.title} · {new Date(e.createdAt).toLocaleString("tr-TR")}
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

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h3 className="font-semibold">Sistem denetim kayıtları</h3>
        <p className="text-xs text-sea-500">
          Kullanıcı, ekip, eğitim ve atama yönetimi gibi video dışı işlemler
        </p>
        <ul className="mt-3 max-h-96 space-y-2 overflow-auto text-sm">
          {(data.systemLogs ?? []).map((log) => (
            <li key={log.id} className="rounded-xl border border-sea-100 px-3 py-2">
              <div className="font-medium">
                {ACTION_TR[log.action] ?? log.action}
              </div>
              <div className="text-xs text-sea-500">
                {log.actor?.name ?? log.actorEmail ?? "Sistem"}
                {log.entityType ? ` · ${log.entityType}` : ""} ·{" "}
                {new Date(log.createdAt).toLocaleString("tr-TR")}
              </div>
            </li>
          ))}
          {(data.systemLogs ?? []).length === 0 && (
            <li className="text-sm text-sea-500">Henüz denetim kaydı yok.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
