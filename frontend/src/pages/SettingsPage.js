import { useEffect, useState } from "react";
import { Eye, EyeOff, Info, LockKeyhole, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";

export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name || "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [password, setPassword] = useState({ current: "", next: "", confirmation: "" });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    api.get("/profile")
      .then((response) => {
        setProfile({ name: response.data.name });
        setUser(response.data);
      })
      .catch(() => toast.error("Profil bilgileri yüklenemedi"));
  }, [setUser]);

  const saveProfile = async () => {
    if (profile.name.trim().length < 2) {
      toast.error("Ad soyad en az 2 karakter olmalı");
      return;
    }
    setProfileSaving(true);
    try {
      const response = await api.patch("/profile", {
        name: profile.name.trim(),
      });
      setUser(response.data);
      setProfile({ name: response.data.name });
      toast.success("Profil bilgileriniz güncellendi");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Profil güncellenemedi");
    } finally {
      setProfileSaving(false);
    }
  };

  const passwordIssue =
    password.next && password.next.length < 8
      ? "Yeni şifre en az 8 karakter olmalı."
      : password.confirmation && password.next !== password.confirmation
        ? "Yeni şifreler birbiriyle eşleşmiyor."
        : "";
  const passwordReady = Boolean(
    password.current &&
      password.next.length >= 8 &&
      password.next === password.confirmation,
  );

  const changePassword = async () => {
    if (!passwordReady) return;
    setPasswordSaving(true);
    try {
      await api.post("/profile/change-password", {
        current_password: password.current,
        new_password: password.next,
        new_password_confirmation: password.confirmation,
      });
      setPassword({ current: "", next: "", confirmation: "" });
      toast.success("Şifreniz değiştirildi. Diğer açık oturumlar kapatıldı");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Şifre değiştirilemedi");
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="fade-up" data-testid="settings-page">
      <PageHeader
        overline="Hesabım"
        title="Profil Ayarları"
        subtitle="Profil görünümünüzü ve hesap güvenliğinizi buradan yönetebilirsiniz."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="n-card n-card-brand p-5 sm:p-7">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700"><UserRound className="h-5 w-5" /></div>
            <div>
              <h2 className="font-semibold text-navy-950">Profil Bilgileri</h2>
              <p className="mt-1 text-sm text-slate-500">Diğer ekranlarda görünen adınızı düzenleyin.</p>
            </div>
          </div>

          <div className="mb-7 rounded-2xl border border-navy-900/[0.06] bg-slate-50/70 p-4">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-navy-950">{profile.name || "Ad Soyad"}</p>
              <p className="truncate text-sm text-slate-500">{user?.email}</p>
              <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm">
                {user?.role === "admin" ? "Yönetici" : "Kullanıcı"}
              </span>
            </div>
          </div>

          <div className="space-y-5">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">Ad Soyad</span>
              <input data-testid="settings-name-input" className={inputCls} maxLength="80" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">E-posta</span>
              <input className={`${inputCls} cursor-not-allowed bg-slate-50 text-slate-400`} value={user?.email || ""} readOnly />
              <span className="block text-xs text-slate-400">E-posta değişikliği hesap güvenliği nedeniyle yönetici tarafından yapılır.</span>
            </label>

            <button data-testid="settings-profile-save" className={`${btnPrimary} w-full sm:w-auto`} disabled={profileSaving || profile.name.trim().length < 2} onClick={saveProfile}>
              <span className="flex items-center justify-center gap-2"><Save className="h-4 w-4" /> {profileSaving ? "Kaydediliyor..." : "Profili Kaydet"}</span>
            </button>
          </div>
        </section>

        <section className="n-card p-5 sm:p-7">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <h2 className="font-semibold text-navy-950">Şifre ve Güvenlik</h2>
              <p className="mt-1 text-sm text-slate-500">Şifrenizi düzenli olarak yenileyerek hesabınızı koruyun.</p>
            </div>
          </div>

          <div className="mb-5 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
            Şifre değiştirildiğinde bu cihazdaki oturumunuz açık kalır, diğer cihazlardaki oturumlar güvenlik amacıyla kapatılır.
          </div>

          <div className="space-y-4">
            {[
              ["current", "Mevcut şifre", "current-password"],
              ["next", "Yeni şifre", "new-password"],
              ["confirmation", "Yeni şifre tekrar", "new-password"],
            ].map(([key, label, autoComplete]) => (
              <label key={key} className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{label}</span>
                <div className="relative">
                  <input
                    data-testid={`settings-password-${key}`}
                    type={showPasswords ? "text" : "password"}
                    autoComplete={autoComplete}
                    className={`${inputCls} pr-11`}
                    value={password[key]}
                    onChange={(event) => setPassword({ ...password, [key]: event.target.value })}
                  />
                  <button type="button" aria-label={showPasswords ? "Şifreleri gizle" : "Şifreleri göster"} onClick={() => setShowPasswords((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-navy-900">
                    {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            ))}
            <p className="text-xs text-slate-400">Yeni şifreniz en az 8 karakter olmalı ve mevcut şifrenizden farklı olmalıdır.</p>
            {passwordIssue && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 animate-in fade-in slide-in-from-top-1 duration-300">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" /> {passwordIssue}
              </p>
            )}
            <button data-testid="settings-password-save" className={`${btnPrimary} w-full`} disabled={passwordSaving || !passwordReady} onClick={changePassword}>
              <span className="flex items-center justify-center gap-2"><LockKeyhole className="h-4 w-4" /> {passwordSaving ? "Şifre değiştiriliyor..." : "Şifreyi Değiştir"}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
