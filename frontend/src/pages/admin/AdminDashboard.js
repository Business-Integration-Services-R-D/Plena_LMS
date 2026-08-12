import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { Users, Clapperboard, Send, CheckCircle2, HelpCircle, TrendingUp, ArrowRight } from "lucide-react";

const StatCard = ({ icon: Icon, label, value, tint, testId }) => (
  <div data-testid={testId} className="n-card n-card-hover p-6 h-full">
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${tint}`}>
      <Icon className="w-5 h-5" />
    </div>
    <p className="text-3xl font-semibold tracking-tight text-gray-900">{value}</p>
    <p className="text-sm text-gray-500 mt-1">{label}</p>
  </div>
);

export default function AdminDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/reports/overview").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data) {
    return <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />;
  }

  return (
    <div className="fade-up" data-testid="admin-dashboard">
      <PageHeader overline="Genel Bakış" title="Hoş geldiniz" subtitle="Platformun genel durumu ve eğitim ilerlemeleri." />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-10">
        <StatCard testId="stat-users" icon={Users} label="Çalışan" value={data.total_users} tint="bg-blue-50 text-blue-600" />
        <StatCard testId="stat-trainings" icon={Clapperboard} label="Eğitim" value={data.total_trainings} tint="bg-purple-50 text-purple-600" />
        <StatCard testId="stat-questions" icon={HelpCircle} label="Soru" value={data.total_questions} tint="bg-amber-50 text-amber-600" />
        <StatCard testId="stat-assignments" icon={Send} label="Atama" value={data.total_assignments} tint="bg-gray-100 text-gray-700" />
        <StatCard testId="stat-completed" icon={CheckCircle2} label="Tamamlanan" value={data.completed} tint="bg-emerald-50 text-emerald-600" />
        <StatCard testId="stat-completion-rate" icon={TrendingUp} label="Tamamlanma" value={`%${data.completion_rate}`} tint="bg-rose-50 text-rose-600" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="n-card p-8">
          <h2 className="text-lg font-medium tracking-tight text-gray-900 mb-6">Eğitim Bazında Tamamlanma</h2>
          {data.per_training.length === 0 ? (
            <p className="text-sm text-gray-400">Henüz atama yapılmış eğitim yok.</p>
          ) : (
            <div className="space-y-5">
              {data.per_training.map((t) => (
                <div key={t.training_id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-800">{t.title}</span>
                    <span className="text-gray-400">{t.completed}/{t.assigned}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#007AFF] rounded-full" style={{ width: `${t.assigned ? (t.completed / t.assigned) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="n-card p-8">
          <h2 className="text-lg font-medium tracking-tight text-gray-900 mb-6">Hızlı İşlemler</h2>
          <div className="space-y-3">
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
                className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-[#F7F7F5] border n-hairline hover:bg-[#F1F1EF] transition-colors group"
              >
                <span className="text-sm font-medium text-gray-800">{x.label}</span>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
