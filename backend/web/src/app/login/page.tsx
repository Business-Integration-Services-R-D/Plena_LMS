"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("kaptan1@marti.demo");
  const [password, setPassword] = useState("Kaptan123!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Giriş başarısız");
      return;
    }
    const data = await res.json();
    router.push(data.role === "ADMIN" ? "/admin" : "/user");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-3xl border border-sea-200 bg-white/95 p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-sea-500">Martı Denizcilik</p>
        <h1 className="mt-2 text-2xl font-semibold text-sea-950">Cloud LMS PoC</h1>
        <p className="mt-2 text-sm text-sea-600">
          Demo hesaplarla giriş yapın. Kullanıcı: zorunlu izleme + test. Admin: rapor ve içerik.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-sea-700">E-posta</span>
            <input
              className="w-full rounded-xl border border-sea-200 px-3 py-2 outline-none ring-sea-400 focus:ring"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-sea-700">Şifre</span>
            <input
              className="w-full rounded-xl border border-sea-200 px-3 py-2 outline-none ring-sea-400 focus:ring"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-sea-700 px-4 py-2.5 font-medium text-white hover:bg-sea-800 disabled:opacity-60"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş yap"}
          </button>
        </form>
        <div className="mt-6 rounded-2xl bg-sea-50 p-4 text-xs text-sea-700">
          <p className="font-medium">Demo hesaplar</p>
          <p className="mt-1">admin@marti.demo / Admin123!</p>
          <p>kaptan1@marti.demo / Kaptan123!</p>
        </div>
      </div>
    </div>
  );
}
