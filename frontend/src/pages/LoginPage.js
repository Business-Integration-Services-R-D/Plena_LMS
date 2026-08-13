import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { GraduationCap, PlayCircle, ShieldCheck, BarChart3, LogIn } from "lucide-react";

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
    <div className="min-h-screen bg-[#FAFAF9] flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-14">
            <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900">Plena LMS</span>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] font-medium text-gray-400 mb-3">Kurumsal Eğitim Platformu</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900 leading-[1.1] mb-4">
            Eğitim, kanıtlanabilir olmalı.
          </h1>
          <p className="text-base text-gray-500 leading-relaxed mb-10">
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
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 transition"
            />
            <input
              data-testid="login-password-input"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 transition"
            />
            {error && (
              <p data-testid="login-error" className="text-xs text-red-500">{error}</p>
            )}
            <button
              data-testid="login-submit-btn"
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-3 bg-black text-white rounded-full py-3.5 text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              {submitting ? "Giriş yapılıyor..." : "Giriş Yap"}
            </button>
          </form>
          <p className="text-xs text-gray-400 mt-6 text-center">
            Hesabınız yöneticiniz tarafından tanımlanmış olmalıdır.
          </p>
        </div>
      </div>
      <div className="hidden lg:flex flex-1 items-center justify-center p-8">
        <div className="relative w-full max-w-lg">
          <div
            className="rounded-3xl overflow-hidden shadow-[0_20px_60px_rgb(0,0,0,0.08)]"
            style={{ aspectRatio: "4/5" }}
          >
            <img
              src="https://images.unsplash.com/photo-1587522384446-64daf3e2689a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwxfHxtaW5pbWFsJTIwZGVzayUyMHdvcmtzcGFjZSUyMHdoaXRlfGVufDB8fHx8MTc4NjQ0NjE2M3ww&ixlib=rb-4.1.0&q=85"
              alt="Minimal çalışma alanı"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -left-10 top-12 bg-white/70 backdrop-blur-2xl rounded-2xl px-5 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/40 flex items-center gap-3">
            <PlayCircle className="w-5 h-5 text-[#007AFF]" />
            <div>
              <p className="text-sm font-medium text-gray-900">İleri sarma yok</p>
              <p className="text-xs text-gray-500">Segment bazlı izleme kanıtı</p>
            </div>
          </div>
          <div className="absolute -left-6 bottom-24 bg-white/70 backdrop-blur-2xl rounded-2xl px-5 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/40 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Kontrol noktaları</p>
              <p className="text-xs text-gray-500">Video içi anlık sorular</p>
            </div>
          </div>
          <div className="absolute -right-6 bottom-8 bg-white/70 backdrop-blur-2xl rounded-2xl px-5 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/40 flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Denetime hazır</p>
              <p className="text-xs text-gray-500">Detaylı izleme raporları</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
