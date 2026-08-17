import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Users, Clapperboard, Send, CheckCircle2, HelpCircle, TrendingUp, ArrowRight } from "lucide-react";
import { HeroBanner } from "@/components/brand/HeroBanner";

const StatCard = ({ icon: Icon, label, value, tint, hero, testId }) => (
  <div data-testid={testId} className={`n-card n-card-hover p-6 h-full ${hero ? "n-card-brand" : ""}`}>
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${
        hero ? "bg-gradient-to-br from-cyan-500 to-navy-800 text-white shadow-glow-cyan-sm" : tint
      }`}
    >
      <Icon className="w-5 h-5" />
    </div>
    <p className="text-3xl font-semibold tracking-tight text-navy-950">{value}</p>
    <p className="text-sm text-slate-500 mt-1">{label}</p>
  </div>
);

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/reports/overview").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data) {
    return <div className="w-6 h-6 border-2 border-slate-200 border-t-navy-900 rounded-full animate-spin" />;
  }

  return (
    <div className="fade-up" data-testid="admin-dashboard">
      <HeroBanner
        testId="admin-welcome-banner"
        overline="GENEL BAKIŞ"
        title={`Hoş geldiniz, ${user?.name || "Sistem Yöneticisi"}`}
        subtitle="Martı Denizcilik LMS platformuna hoş geldiniz."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-10">
        <StatCard testId="stat-users" icon={Users} label="Çalışan" value={data.total_users} hero />
        <StatCard testId="stat-trainings" icon={Clapperboard} label="Eğitim" value={data.total_trainings} tint="bg-indigo-50 text-indigo-600" />
        <StatCard testId="stat-questions" icon={HelpCircle} label="Soru" value={data.total_questions} tint="bg-amber-50 text-amber-600" />
        <StatCard testId="stat-assignments" icon={Send} label="Atama" value={data.total_assignments} tint="bg-brand-50 text-brand-700" />
        <StatCard testId="stat-completed" icon={CheckCircle2} label="Tamamlanan" value={data.completed} tint="bg-emerald-50 text-emerald-600" />
        <StatCard testId="stat-completion-rate" icon={TrendingUp} label="Tamamlanma" value={`%${data.completion_rate}`} tint="bg-cyan-50 text-cyan-700" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="n-card p-8">
          <h2 className="text-lg font-medium tracking-tight text-navy-950 mb-6">Eğitim Bazında Tamamlanma</h2>
          {data.per_training.length === 0 ? (
            <p className="text-sm text-slate-400">Henüz atama yapılmış eğitim yok.</p>
          ) : (
            <div className="space-y-5">
              {data.per_training.map((t) => (
                <div key={t.training_id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-slate-700">{t.title}</span>
                    <span className="text-slate-400">{t.completed}/{t.assigned}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-brand-700"
                      style={{ width: `${t.assigned ? (t.completed / t.assigned) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="n-card p-8">
          <h2 className="text-lg font-medium tracking-tight text-navy-950 mb-6">Hızlı İşlemler</h2>
          <div className="relative space-y-1">
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-cyan-500/30 via-navy-900/10 to-transparent" aria-hidden="true" />
            {[
              { to: "/admin/users", label: "Yeni kullanıcı tanımla", testId: "quick-users" },
              { to: "/admin/questions", label: "Soru havuzuna soru ekle", testId: "quick-questions" },
              { to: "/admin/trainings", label: "Yeni eğitim oluştur", testId: "quick-trainings" },
              { to: "/admin/assignments", label: "Eğitim ataması yap", testId: "quick-assignments" },
              { to: "/admin/reports", label: "Raporları görüntüle", testId: "quick-reports" },
            ].map((x) => (
              <Link
                key={x.to}
                to={x.to}
                data-testid={x.testId}
                className="relative flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-brand-50/60 transition-colors group"
              >
                <span className="relative z-10 w-2.5 h-2.5 rounded-full bg-white border-2 border-navy-300 group-hover:border-cyan-500 group-hover:bg-cyan-500 transition-colors shrink-0 ml-[2px]" />
                <span className="flex-1 text-sm font-medium text-slate-700">{x.label}</span>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-brand-600 transition-all" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
