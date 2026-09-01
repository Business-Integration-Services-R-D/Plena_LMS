import { useState } from "react";
import { ArrowLeft, CheckCircle2, Mail, Send } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#04101B] via-navy-950 to-[#071826] px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <Link to="/login" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Giriş ekranına dön
        </Link>

        {sent ? (
          <div className="py-4 text-center" data-testid="forgot-password-success">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-semibold text-white">E-postanızı kontrol edin</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Bu adresle eşleşen aktif bir hesap varsa şifre yenileme bağlantısı gönderildi. Bağlantı 30 dakika boyunca geçerlidir.
            </p>
            <Link to="/login" className="mt-7 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-navy-950 hover:bg-slate-100">
              Giriş ekranına dön
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold text-white">Şifrenizi mi unuttunuz?</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Hesabınıza bağlı e-posta adresini yazın. Size güvenli bir şifre yenileme bağlantısı gönderelim.
            </p>
            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-300">E-posta adresi</span>
                <input
                  data-testid="forgot-password-email-input"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="ornek@sirket.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                />
              </label>
              <button data-testid="forgot-password-submit" disabled={submitting || !email.trim()} className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-brand-600 py-3 text-sm font-medium text-white disabled:opacity-50">
                <Send className="h-4 w-4" /> {submitting ? "Gönderiliyor..." : "Yenileme Bağlantısı Gönder"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
