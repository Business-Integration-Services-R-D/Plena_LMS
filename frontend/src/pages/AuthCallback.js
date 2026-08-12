import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const hasProcessed = useRef(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash;
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) {
      navigate("/login");
      return;
    }
    const process = async () => {
      try {
        const res = await api.post("/auth/session", { session_id: match[1] });
        window.history.replaceState(null, "", window.location.pathname);
        setUser(res.data);
        navigate(res.data.role === "admin" ? "/admin" : "/trainings", { state: { user: res.data } });
      } catch (e) {
        window.history.replaceState(null, "", window.location.pathname);
        setError(e.response?.data?.detail || "Giriş başarısız oldu");
      }
    };
    process();
  }, [navigate, setUser]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
        <div className="bg-white rounded-2xl p-10 max-w-md text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-black/5">
          <p className="text-lg font-medium text-gray-900 mb-2">Erişim Reddedildi</p>
          <p className="text-sm text-gray-500 mb-6" data-testid="auth-error-message">{error}</p>
          <button
            data-testid="back-to-login-btn"
            onClick={() => (window.location.href = "/login")}
            className="px-6 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Giriş sayfasına dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAF9]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Giriş yapılıyor...</p>
      </div>
    </div>
  );
}
