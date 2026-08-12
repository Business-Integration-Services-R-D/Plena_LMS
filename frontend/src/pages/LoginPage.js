import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { GraduationCap, PlayCircle, ShieldCheck, BarChart3 } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate(user.role === "admin" ? "/admin" : "/trainings");
    }
  }, [user, loading, navigate]);

  const handleLogin = () => {
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
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
          <button
            data-testid="google-login-btn"
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-black text-white rounded-full py-3.5 text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-[background-color,transform]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" opacity=".9"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity=".7"/>
              <path fill="#fff" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" opacity=".5"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" opacity=".8"/>
            </svg>
            Google ile Giriş Yap
          </button>
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
