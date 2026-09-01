import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { GraduationCap, LogIn } from "lucide-react";
import loginHero from "@/assets/brand/login-hero.jpg";

// Faint dot grid — restrained "connected systems" texture, not a map.
const DotGrid = ({ className = "" }) => {
  const patternId = `plena-dot-grid-${useId()}`;
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id={patternId} width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
};

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate(user.role === "admin" ? "/admin" : "/trainings");
    }
  }, [user, loading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err?.response?.data?.error || "Giriş yapılamadı. Bilgilerinizi kontrol edin.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#04101B] via-navy-950 to-[#071826] flex relative overflow-hidden">
      <DotGrid className="absolute inset-0 w-full h-full text-white/[0.03] pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-[460px] h-[460px] rounded-full bg-cyan-500/[0.10] blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 w-[420px] h-[420px] rounded-full bg-brand-500/[0.08] blur-3xl pointer-events-none" />

      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-14">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-brand-700 flex items-center justify-center shadow-[0_4px_18px_rgba(10,165,196,0.4)]">
              <GraduationCap className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">Plena LMS</span>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] font-medium text-cyan-300/80 mb-3">Kurumsal Eğitim Platformu</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white leading-[1.1] mb-4">
            Eğitim, kanıtlanabilir olmalı.
          </h1>
          <p className="text-base text-slate-400 leading-relaxed mb-10">
            Video eğitimleri, kontrol noktası soruları ve denetime hazır raporlarla ekibinizin gerçekten öğrendiğinden emin olun.
          </p>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              data-testid="login-email-input"
              type="email"
              required
              autoComplete="email"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400/40 transition"
            />
            <input
              data-testid="login-password-input"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400/40 transition"
            />
            <div className="flex justify-end px-1">
              <Link data-testid="login-forgot-password-link" to="/forgot-password" className="text-xs font-medium text-cyan-300/80 transition-colors hover:text-cyan-200">
                Şifremi unuttum
              </Link>
            </div>
            {error && (
              <p data-testid="login-error" className="text-xs text-red-400">{error}</p>
            )}
            <button
              data-testid="login-submit-btn"
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-500 to-brand-600 text-white rounded-full py-3.5 text-sm font-medium hover:shadow-[0_10px_30px_-6px_rgba(10,165,196,0.55)] active:scale-[0.98] transition-[box-shadow,transform] disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              {submitting ? "Giriş yapılıyor..." : "Giriş Yap"}
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-6 text-center">
            Hesabınız yöneticiniz tarafından tanımlanmış olmalıdır.
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 items-center justify-center p-8 relative z-10">
        <div className="relative w-full max-w-lg" style={{ aspectRatio: "4/5" }}>
          <div className="absolute -inset-6 rounded-[40px] bg-cyan-500/[0.10] blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-10 -left-10 w-56 h-56 rounded-full bg-brand-500/[0.14] blur-3xl" aria-hidden="true" />
          <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-[0_40px_90px_-30px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.08]">
            <img
              src={loginHero}
              alt="Plena LMS — video izleme kanıtı, kontrol noktaları ve denetim raporları"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
