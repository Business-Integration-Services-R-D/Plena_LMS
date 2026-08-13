"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type User = { id: string; name: string; email: string; role: string };
type Group = {
  id: string;
  name: string;
  description: string;
  assignmentCount: number;
  members: { id: string; name: string; email: string; active: boolean }[];
};

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [g, u] = await Promise.all([
      fetch("/api/admin/groups").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
    ]);
    setGroups(g);
    setUsers((u as User[]).filter((x) => x.role === "USER"));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Ekip oluşturulamadı");
      return;
    }
    setName("");
    setDescription("");
    await load();
  }

  async function addMember(groupId: string, userId: string) {
    if (!userId) return;
    await fetch(`/api/admin/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    await load();
  }

  async function removeMember(groupId: string, userId: string) {
    await fetch(`/api/admin/groups/${groupId}/members?userId=${userId}`, {
      method: "DELETE",
    });
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Yeni ekip</h2>
        <form onSubmit={onCreate} className="mt-4 space-y-3">
          <input
            className="w-full rounded-xl border border-sea-200 px-3 py-2"
            placeholder="Ekip adı (ör. Kuru Yük Kaptanları)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <textarea
            className="w-full rounded-xl border border-sea-200 px-3 py-2"
            placeholder="Açıklama"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-sea-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Kaydediliyor..." : "Ekip oluştur"}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        {groups.map((g) => {
          const memberIds = new Set(g.members.map((m) => m.id));
          const candidates = users.filter((u) => !memberIds.has(u.id));
          return (
            <article
              key={g.id}
              className="rounded-3xl border border-sea-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{g.name}</h3>
                  <p className="text-sm text-sea-600">{g.description}</p>
                </div>
                <span className="rounded-full bg-sea-100 px-2.5 py-1 text-xs text-sea-800">
                  {g.members.length} kişi · {g.assignmentCount} atama
                </span>
              </div>

              <ul className="mt-3 space-y-1 text-sm">
                {g.members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-xl border border-sea-100 px-3 py-2"
                  >
                    <span>
                      {m.name}{" "}
                      <span className="text-xs text-sea-500">{m.email}</span>
                      {!m.active ? (
                        <span className="ml-2 text-xs text-amber-700">pasif</span>
                      ) : null}
                    </span>
                    <button
                      onClick={() => removeMember(g.id, m.id)}
                      className="text-xs text-rose-700 hover:underline"
                    >
                      Çıkar
                    </button>
                  </li>
                ))}
              </ul>

              {candidates.length > 0 ? (
                <select
                  className="mt-3 w-full rounded-xl border border-sea-200 px-3 py-2 text-sm"
                  value=""
                  onChange={(e) => addMember(g.id, e.target.value)}
                >
                  <option value="">Üye ekle...</option>
                  {candidates.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
