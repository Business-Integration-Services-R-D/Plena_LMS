import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtTime, fmtDate } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { PlayCircle, CheckCircle2, Clock, FileQuestion } from "lucide-react";

export default function MyTrainingsPage() {
  const [assignments, setAssignments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/my/assignments").then((r) => { setAssignments(r.data); setLoaded(true); });
  }, []);

  return (
    <div className="fade-up" data-testid="my-trainings-page">
      <PageHeader overline="Çalışan Paneli" title="Eğitimlerim" subtitle="Size atanan eğitimleri buradan tamamlayabilirsiniz." />
      {loaded && assignments.length === 0 && (
        <div className="n-card p-16 text-center max-w-lg">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <PlayCircle className="w-6 h-6 text-gray-400" />
          </div>
          <p className="font-medium text-gray-900 mb-1">Henüz atanmış eğitiminiz yok</p>
          <p className="text-sm text-gray-400">Yöneticiniz size eğitim atadığında burada görünecek.</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assignments.map((a, i) => {
          const done = a.status === "completed";
          return (
            <div
              key={a.assignment_id}
              data-testid={`my-training-card-${a.assignment_id}`}
              onClick={() => navigate(`/trainings/${a.assignment_id}/watch`)}
              className="n-card n-card-hover p-6 cursor-pointer fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${done ? "bg-emerald-50 text-emerald-600" : "bg-black text-white"}`}>
                  {done ? <CheckCircle2 className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${done ? "bg-emerald-50 text-emerald-600" : a.status === "assigned" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-600"}`}>
                  {done ? "Tamamlandı" : a.status === "assigned" ? "Başlamadı" : a.status === "video_completed" ? "Sınav Bekliyor" : "Devam Ediyor"}
                </span>
              </div>
              <p className="font-medium text-gray-900 mb-1">{a.training_title}</p>
              <p className="text-sm text-gray-400 line-clamp-2 mb-5 min-h-[20px]">{a.training_description || ""}</p>
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>İzleme ilerlemesi</span>
                  <span className="tabular-nums">%{a.watch_pct}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-[#007AFF]"}`} style={{ width: `${done ? 100 : a.watch_pct}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{fmtTime(a.duration)}</span>
                {a.has_quiz && <span className="flex items-center gap-1.5"><FileQuestion className="w-3.5 h-3.5" />Sınav var</span>}
                {a.due_at && <span className="ml-auto">Son: {fmtDate(a.due_at)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
