"use client";

import { FormEvent, useEffect, useState } from "react";

type User = { id: string; name: string; email: string; role: string };
type Course = { id: string; title: string };
type Assignment = {
  id: string;
  user: { name: string; email: string };
  course: { title: string };
  assignedAt: string;
};

export default function AdminAssignmentsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [userId, setUserId] = useState("");
  const [courseId, setCourseId] = useState("");

  async function load() {
    const [u, c, a] = await Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/courses").then((r) => r.json()),
      fetch("/api/admin/assignments").then((r) => r.json()),
    ]);
    const captains = u.filter((x: User) => x.role === "CAPTAIN");
    setUsers(captains);
    setCourses(c);
    setAssignments(a);
    if (!userId && captains[0]) setUserId(captains[0].id);
    if (!courseId && c[0]) setCourseId(c[0].id);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, courseId }),
    });
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Eğitim ata</h2>
        <form onSubmit={onAssign} className="mt-4 space-y-3">
          <select
            className="w-full rounded-xl border border-sea-200 px-3 py-2"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          <select
            className="w-full rounded-xl border border-sea-200 px-3 py-2"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-xl bg-sea-700 px-4 py-2 text-white">
            Ata
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Atamalar</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {assignments.map((a) => (
            <li key={a.id} className="rounded-xl border border-sea-100 px-3 py-2">
              <span className="font-medium">{a.user.name}</span> → {a.course.title}
              <div className="text-xs text-sea-500">
                {new Date(a.assignedAt).toLocaleString("tr-TR")}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
