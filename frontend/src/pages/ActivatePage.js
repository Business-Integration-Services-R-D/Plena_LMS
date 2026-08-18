import { useEffect, useId, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, GraduationCap, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const DotGrid = ({ className = "" }) => {
  const patternId = `plena-activate-grid-${useId()}`;
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id={patternId} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
};

const inputCls =
  "w-full rounded-xl border border-navy-900/10 bg-white/90 px-4 py-3 text-sm text-navy-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-500/50 transition";

export default function ActivatePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [status, setStatus] = useState("loading");
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setError("Aktivasyon bağlantısı eksik veya geçersiz.");
      setStatus("invalid");
      return () => {
        active = false;
      };
    }

    api
      .get(`/auth/activate?token=${encodeURIComponent(token)}`)
      .then((response) => {
        if (!active) return;
        setName(response.data.name || "");
        setExpiresAt(response.data.expiresAt);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError.response?.data?.detail ||
            "Aktivasyon bağlantısı geçersiz veya süresi dolmuş.",
        );
        setStatus("invalid");
      });

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const updateRemaining = () => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0) {
        setError("Aktivasyon bağlantısının süresi doldu. Yöneticinizden yeni bir mail isteyin.");
        setStatus("invalid");
      }
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const remainingLabel = useMemo(() => {
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }, [remaining]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(code)) {
      setError("6 haneli doğrulama kodunu girin.");
      return;
    }
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalıdır.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post("/auth/activate", {
        token,
        code,
        password,
        passwordConfirmation,
      });
      setUser(response.data);
      toast.success("Hesabınız aktive edildi");
      navigate(response.data.role === "admin" ? "/admin" : "/trainings", {
        replace: true,
      });
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "Hesap aktive edilemedi. Kodunuzu kontrol edin.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#f7f9fc] via-[#eaf4fd] to-[#f8fbff] flex items-center justify-center px-5 py-10">
      <DotGrid className="absolute inset-0 w-full h-full text-brand-500/[0.06] pointer-events-none" />
      <div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-cyan-300/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-36 right-0 w-[480px] h-[480px] rounded-full bg-brand-300/20 blur-3xl pointer-events-none" />

      <main className="relative z-10 w-full max-w-lg">
        <div className="rounded-[28px] border border-white/80 bg-white/85 backdrop-blur-xl shadow-[0_28px_80px_-28px_rgba(14,32,51,0.38)] px-6 py-9 sm:px-12 sm:py-11">
          <div className="flex justify-center mb-7">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-brand-700 flex items-center justify-center shadow-glow-cyan-sm">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-semibold tracking-tight text-navy-950">Plena LMS</span>
            </div>
          </div>

          {status === "loading" && (
            <div className="py-16 text-center" data-testid="activation-loading">
              <div className="w-8 h-8 mx-auto border-2 border-brand-100 border-t-brand-600 rounded-full animate-spin" />
              <p className="text-sm text-slate-500 mt-4">Aktivasyon bağlantısı kontrol ediliyor...</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="py-10 text-center" data-testid="activation-invalid">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-5">
                <KeyRound className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-semibold text-navy-950">Bağlantı kullanılamıyor</h1>
              <p className="text-sm text-slate-500 leading-relaxed mt-3">{error}</p>
              <button
                className="mt-7 px-6 py-3 rounded-full border border-navy-900/15 text-sm font-medium text-navy-900 hover:bg-slate-50 transition-colors"
                onClick={() => navigate("/login", { replace: true })}
              >
                Giriş ekranına dön
              </button>
            </div>
          )}

          {status === "ready" && (
            <>
              <div className="text-center mb-7">
                <h1 className="text-3xl font-medium tracking-tight text-navy-950">Hoş Geldiniz{name ? `, ${name}` : ""}!</h1>
                <p className="text-sm text-slate-500 leading-relaxed mt-2">
                  Hesabınızı aktive etmek için e-postadaki kodu girin ve şifrenizi oluşturun.
                </p>
                <p className="inline-flex mt-3 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
                  Kalan süre: {remainingLabel}
                </p>
              </div>

              <form onSubmit={submit} className="space-y-3">
                <input
                  data-testid="activation-code-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  aria-label="6 haneli doğrulama kodu"
                  placeholder="000000"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className={`${inputCls} text-center text-2xl font-semibold tracking-[0.42em] pl-[calc(1rem+0.42em)]`}
                />

                <div className="relative">
                  <input
                    data-testid="activation-password-input"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    placeholder="Yeni şifre (en az 6 karakter)"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={`${inputCls} pr-12`}
                  />
                  <button
                    type="button"
                    aria-label={showPasswords ? "Şifreleri gizle" : "Şifreleri göster"}
                    onClick={() => setShowPasswords((current) => !current)}
                    className="absolute inset-y-0 right-0 px-4 text-slate-400 hover:text-brand-600"
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <input
                  data-testid="activation-password-confirmation-input"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  placeholder="Yeni şifre tekrar"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  className={inputCls}
                />

                {error && (
                  <p data-testid="activation-error" className="text-xs text-red-500 text-center pt-1">
                    {error}
                  </p>
                )}

                <button
                  data-testid="activation-submit-btn"
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-cyan-500 to-brand-600 text-white rounded-full py-3.5 text-sm font-medium hover:shadow-[0_10px_30px_-6px_rgba(10,165,196,0.45)] active:scale-[0.98] transition-[box-shadow,transform] disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {submitting ? "Hesap aktive ediliyor..." : "Hesabı Aktive Et"}
                </button>
              </form>
            </>
          )}

          <div className="border-t border-navy-900/10 mt-8 pt-5 text-center">
            <p className="text-xs text-slate-500">© Martı Denizcilik — Powered by Plena LMS</p>
          </div>
        </div>
      </main>
    </div>
  );
}
