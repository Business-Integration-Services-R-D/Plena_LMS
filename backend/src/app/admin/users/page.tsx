"use client";

import { FormEvent, useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Kaptan123!");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin/users");
    setUsers(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role: "USER" }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Kayıt başarısız");
      return;
    }
    setName("");
    setEmail("");
    await load();
  }

  async function toggleActive(user: User) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Kullanıcılar</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-sea-500">
              <tr>
                <th className="py-2">Ad</th>
                <th>E-posta</th>
                <th>Rol</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-sea-100">
                  <td className="py-2 font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.active ? "Aktif" : "Pasif"}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleActive(u)}
                      className="text-sea-700 underline"
                    >
                      {u.active ? "Pasifleştir" : "Aktifleştir"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Yeni kullanıcı</h2>
        <form onSubmit={onCreate} className="mt-4 space-y-3">
          <input
            className="w-full rounded-xl border border-sea-200 px-3 py-2"
            placeholder="Ad soyad"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full rounded-xl border border-sea-200 px-3 py-2"
            placeholder="E-posta"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded-xl border border-sea-200 px-3 py-2"
            placeholder="Şifre"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            className="rounded-xl bg-sea-700 px-4 py-2 text-white hover:bg-sea-800"
          >
            Oluştur
          </button>
        </form>
      </section>
    </div>
  );
}
