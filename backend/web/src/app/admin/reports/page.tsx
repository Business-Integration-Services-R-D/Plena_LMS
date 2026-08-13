"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusPill } from "@/components/StatusPill";

type Row = {
  enrollmentId: string;
  user: { id: string; name: string; email: string };
  course: { id: string; title: string };
  group: { name: string } | null;
  status: string;
  assignedAt: string;
  startsAt: string;
  dueAt: string | null;
  completedAt: string | null;
  totalWatchedSec: number;
  watchedPercent: number;
  attemptCount: number;
  correctCount: number | null;
  wrongCount: number | null;
  bestScorePercent: number | null;
  passed: boolean;
};

type Summary = {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  failed: number;
  overdue: number;
};

function formatDuration(totalSec: number) {
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min} dk ${String(sec).padStart(2, "0")} sn`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("tr-TR") : "-";
}

export default function AdminReportsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [userId, setUserId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (courseId) params.set("courseId", courseId);
    if (status) params.set("status", status);

    const data = await fetch(`/api/admin/reports?${params}`).then((r) => r.json());
    setRows(data.rows ?? []);
    setSummary(data.summary ?? null);
  }, [userId, courseId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/courses").then((r) => r.json()),
    ]).then(([u, c]) => {
      setUsers(u);
      setCourses(c);
    });
  }, []);

  const exportUrl = () => {
    const params = new URLSearchParams({ format: "xlsx" });
    if (userId) params.set("userId", userId);
    if (courseId) params.set("courseId", courseId);
    return `/api/admin/audit/export?${params}`;
  };

  const cards = summary
    ? [
        { label: "Toplam", value: summary.total },
        { label: "Başlamadı", value: summary.notStarted },
        { label: "Devam ediyor", value: summary.inProgress },
        { label: "Tamamlandı", value: summary.completed },
        { label: "Kaldı", value: summary.failed },
        { label: "Süresi geçti", value: summary.overdue },
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-sea-200 bg-white p-4"
          >
            <div className="text-2xl font-semibold text-sea-900">{c.value}</div>
            <div className="text-xs text-sea-600">{c.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="text-sea-700">Kullanıcı</span>
            <select
              className="mt-1 block rounded-xl border border-sea-200 px-3 py-2"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Tümü</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-sea-700">Eğitim</span>
            <select
              className="mt-1 block rounded-xl border border-sea-200 px-3 py-2"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">Tümü</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-sea-700">Durum</span>
            <select
              className="mt-1 block rounded-xl border border-sea-200 px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tümü</option>
              <option value="NOT_STARTED">Başlamadı</option>
              <option value="IN_PROGRESS">Devam ediyor</option>
              <option value="COMPLETED">Tamamlandı</option>
              <option value="FAILED">Kaldı</option>
              <option value="OVERDUE">Süresi geçti</option>
            </select>
          </label>
          <a
            href={exportUrl()}
            className="rounded-xl bg-sea-700 px-4 py-2 text-sm text-white"
          >
            Excel indir
          </a>
        </div>
      </section>

      <section className="overflow-x-auto rounded-3xl border border-sea-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-sea-50 text-xs uppercase text-sea-700">
            <tr>
              <th className="px-4 py-3">Kullanıcı</th>
              <th className="px-4 py-3">Eğitim</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3">İzleme</th>
              <th className="px-4 py-3">D / Y</th>
              <th className="px-4 py-3">Deneme</th>
              <th className="px-4 py-3">Atama</th>
              <th className="px-4 py-3">Son tarih</th>
              <th className="px-4 py-3">Bitirme</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollmentId} className="border-t border-sea-100">
                <td className="px-4 py-3">
                  <div>{r.user.name}</div>
                  <div className="text-xs text-sea-500">{r.user.email}</div>
                  {r.group ? (
                    <div className="text-xs text-sea-500">Ekip: {r.group.name}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{r.course.title}</td>
                <td className="px-4 py-3">
                  <StatusPill status={r.status} />
                </td>
                <td className="px-4 py-3">
                  <div>{formatDuration(r.totalWatchedSec)}</div>
                  <div className="text-xs text-sea-500">%{r.watchedPercent}</div>
                </td>
                <td className="px-4 py-3">
                  {r.correctCount ?? "-"} / {r.wrongCount ?? "-"}
                  {r.bestScorePercent != null ? (
                    <div className="text-xs text-sea-500">
                      en iyi %{r.bestScorePercent.toFixed(0)}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">{r.attemptCount}</td>
                <td className="px-4 py-3 text-xs">{formatDate(r.assignedAt)}</td>
                <td className="px-4 py-3 text-xs">{formatDate(r.dueAt)}</td>
                <td className="px-4 py-3 text-xs">{formatDate(r.completedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-sea-500">Kayıt bulunamadı.</p>
        ) : null}
      </section>
    </div>
  );
}
