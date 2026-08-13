"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type User = { id: string; name: string; email: string; role: string };
type Course = { id: string; title: string };
type Group = { id: string; name: string; members: { id: string }[] };
type Assignment = {
  id: string;
  target: "USER" | "GROUP";
  user: { name: string; email: string } | null;
  group: { name: string } | null;
  course: { title: string };
  startsAt: string;
  dueAt: string | null;
  assignedAt: string;
  enrollmentCount: number;
};

/** datetime-local input'u için yerel saat dilimine göre ISO benzeri değer. */
function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function AdminAssignmentsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [target, setTarget] = useState<"USER" | "GROUP">("USER");
  const [userId, setUserId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return toLocalInput(d);
  });

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, c, g, a] = await Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/courses").then((r) => r.json()),
      fetch("/api/admin/groups").then((r) => r.json()),
      fetch("/api/admin/assignments").then((r) => r.json()),
    ]);
    const members = (u as User[]).filter((x) => x.role === "USER");
    setUsers(members);
    setCourses(c);
    setGroups(g);
    setAssignments(a);
    setUserId((prev) => prev || members[0]?.id || "");
    setGroupId((prev) => prev || (g as Group[])[0]?.id || "");
    setCourseId((prev) => prev || (c as Course[])[0]?.id || "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          target,
          userId: target === "USER" ? userId : undefined,
          groupId: target === "GROUP" ? groupId : undefined,
          startsAt: new Date(startsAt).toISOString(),
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Atama yapılamadı");
        return;
      }
      setMessage(`Atama kaydedildi. ${data.enrolled} kullanıcıya tanımlandı.`);
      await load();
    } catch {
      setError("Sunucuya ulaşılamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Eğitim ata</h2>
        <p className="mt-1 text-sm text-sea-600">
          Kullanıcı başlangıç tarihi gelmeden eğitimi göremez.
        </p>

        <form onSubmit={onAssign} className="mt-4 space-y-3">
          <div className="flex gap-2">
            {(["USER", "GROUP"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                  target === t
                    ? "border-sea-700 bg-sea-700 text-white"
                    : "border-sea-200 text-sea-700"
                }`}
              >
                {t === "USER" ? "Kişiye" : "Ekibe"}
              </button>
            ))}
          </div>

          {target === "USER" ? (
            <label className="block text-sm">
              <span className="text-sea-700">Kullanıcı</span>
              <select
                className="mt-1 w-full rounded-xl border border-sea-200 px-3 py-2"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-sea-700">Ekip</span>
              <select
                className="mt-1 w-full rounded-xl border border-sea-200 px-3 py-2"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.members.length} kişi)
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm">
            <span className="text-sea-700">Eğitim</span>
            <select
              className="mt-1 w-full rounded-xl border border-sea-200 px-3 py-2"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-sea-700">Başlangıç (tarih/saat)</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl border border-sea-200 px-3 py-2"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-sea-700">Son tarih (opsiyonel)</span>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl border border-sea-200 px-3 py-2"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-sea-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Kaydediliyor..." : "Ata"}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Atamalar</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {assignments.map((a) => (
            <li key={a.id} className="rounded-xl border border-sea-100 px-3 py-2">
              <div>
                <span className="font-medium">
                  {a.target === "USER" ? a.user?.name : `${a.group?.name} (ekip)`}
                </span>{" "}
                → {a.course.title}
              </div>
              <div className="mt-1 text-xs text-sea-500">
                Başlangıç: {new Date(a.startsAt).toLocaleString("tr-TR")}
                {a.dueAt
                  ? ` · Son tarih: ${new Date(a.dueAt).toLocaleString("tr-TR")}`
                  : " · Son tarih yok"}
              </div>
              <div className="text-xs text-sea-500">
                {a.enrollmentCount} kullanıcı kaydı · atandı{" "}
                {new Date(a.assignedAt).toLocaleString("tr-TR")}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
