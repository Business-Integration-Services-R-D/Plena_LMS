import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, ShieldX } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    api.get(`/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((response) => {
        setEmail(response.data.email);
        setStatus("ready");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const issue =
    password && password.length < 8
      ? "Şifre en az 8 karakter olmalı."
      : confirmation && password !== confirmation
        ? "Şifreler birbiriyle eşleşmiyor."
        : "";

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8 || password !== confirmation) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/reset-password", {
        token,
        password,
        passwordConfirmation: confirmation,
      });
      setStatus("success");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Şifre yenilenemedi. Bağlantı süresi dolmuş olabilir.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#04101B] via-navy-950 to-[#071826] px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        {status === "loading" && (
          <div className="flex flex-col items-center py-14 text-slate-300">
            <LoaderCircle className="mb-4 h-8 w-8 animate-spin text-cyan-300" />
            Şifre yenileme bağlantısı kontrol ediliyor...
          </div>
        )}
        {status === "invalid" && (
          <div className="py-6 text-center" data-testid="reset-password-invalid">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300"><ShieldX className="h-7 w-7" /></div>
            <h1 className="text-2xl font-semibold text-white">Bağlantı kullanılamıyor</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">Bu şifre yenileme bağlantısı geçersiz, kullanılmış veya süresi dolmuş olabilir.</p>
            <Link to="/forgot-password" className="mt-7 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-navy-950">Yeni bağlantı iste</Link>
          </div>
        )}
        {status === "success" && (
          <div className="py-6 text-center" data-testid="reset-password-success">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300"><CheckCircle2 className="h-7 w-7" /></div>
            <h1 className="text-2xl font-semibold text-white">Şifreniz yenilendi</h1>
            <p className="mt-3 text-sm text-slate-400">Yeni şifrenizle hesabınıza giriş yapabilirsiniz.</p>
            <Link to="/login" className="mt-7 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-navy-950">Giriş Yap</Link>
          </div>
        )}
        {status === "ready" && (
          <>
            <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300"><KeyRound className="h-6 w-6" /></div>
            <h1 className="text-2xl font-semibold text-white">Yeni şifrenizi belirleyin</h1>
            <p className="mt-2 text-sm text-slate-400">{email} hesabı için en az 8 karakterli yeni bir şifre oluşturun.</p>
            <form onSubmit={submit} className="mt-7 space-y-4">
              {[
                ["Yeni şifre", password, setPassword, "reset-password-input"],
                ["Yeni şifre tekrar", confirmation, setConfirmation, "reset-password-confirmation-input"],
              ].map(([label, value, setter, testId]) => (
                <label key={testId} className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">{label}</span>
                  <div className="relative">
                    <input data-testid={testId} type={showPasswords ? "text" : "password"} required autoComplete="new-password" value={value} onChange={(event) => setter(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 pr-11 text-sm text-white focus:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20" />
                    <button type="button" aria-label={showPasswords ? "Şifreleri gizle" : "Şifreleri göster"} onClick={() => setShowPasswords((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white">
                      {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
              ))}
              {issue && <p className="text-xs text-amber-300">{issue}</p>}
              {error && <p data-testid="reset-password-error" className="text-xs text-red-300">{error}</p>}
              <button data-testid="reset-password-submit" disabled={submitting || password.length < 8 || password !== confirmation} className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-brand-600 py-3 text-sm font-medium text-white disabled:opacity-50">
                {submitting ? "Şifre yenileniyor..." : "Şifremi Yenile"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
