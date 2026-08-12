import { useEffect, useState } from "react";
import { api, fmtDate, fmtTime, STATUS_TR, STATUS_COLOR } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Eye, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

const inputCls = "px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent";

const EVENT_TR = {
  video_started: "Video başlatıldı", video_paused: "Video duraklatıldı", video_resumed: "Video devam ettirildi",
  video_closed: "Video kapatıldı", video_ended: "Video sonuna ulaşıldı", video_completed: "Video tamamlandı",
  checkpoint_passed: "Kontrol noktası geçildi", checkpoint_failed: "Kontrol noktası başarısız",
  quiz_submitted: "Sınav gönderildi",
};

export default function ReportsPage() {
  const [overview, setOverview] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState(null);
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(null);

  const exportReport = async (fmt) => {
    setExporting(fmt);
    try {
      const res = await api.get(`/reports/trainings/${selected}/export`, { params: { fmt }, responseType: "blob" });
      const cd = res.headers["content-disposition"] || "";
      const filename = cd.match(/filename="?([^";]+)"?/)?.[1] || `rapor.${fmt === "excel" ? "xlsx" : "pdf"}`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(fmt === "excel" ? "Excel raporu indirildi" : "PDF raporu indirildi");
    } catch {
      toast.error("Rapor indirilemedi");
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    api.get("/reports/overview").then((r) => setOverview(r.data));
    api.get("/trainings").then((r) => setTrainings(r.data));
  }, []);

  useEffect(() => {
    if (selected) api.get(`/reports/trainings/${selected}`).then((r) => setReport(r.data));
    else setReport(null);
  }, [selected]);

  const openDetail = async (row) => {
    const res = await api.get(`/reports/assignments/${row.assignment_id}/detail`);
    setDetail(res.data);
  };

  return (
    <div className="fade-up" data-testid="reports-page">
      <PageHeader overline="Denetim" title="Raporlar" subtitle="İzleme kanıtları, sınav sonuçları ve denetim logları." />

      {overview && overview.per_training.length > 0 && (
        <div className="n-card p-8 mb-8">
          <h2 className="text-lg font-medium tracking-tight text-gray-900 mb-6">Atama / Tamamlanma Dağılımı</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.per_training} barGap={4}>
                <XAxis dataKey="title" tick={{ fontSize: 12, fill: "#86868B" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#86868B" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} contentStyle={{ borderRadius: 12, border: "1px solid rgba(0,0,0,0.06)" }} />
                <Bar dataKey="assigned" name="Atanan" fill="#E5E5EA" radius={[6, 6, 0, 0]} />
                <Bar dataKey="completed" name="Tamamlanan" fill="#007AFF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="n-card p-8">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <h2 className="text-lg font-medium tracking-tight text-gray-900">Eğitim Detay Raporu</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select data-testid="report-training-select" className={inputCls} value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Eğitim seçin...</option>
              {trainings.map((t) => <option key={t.training_id} value={t.training_id}>{t.title}</option>)}
            </select>
            {selected && (
              <>
                <button
                  data-testid="export-pdf-btn"
                  disabled={!!exporting}
                  onClick={() => exportReport("pdf")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40"
                >
                  <FileDown className="w-4 h-4" /> {exporting === "pdf" ? "Hazırlanıyor..." : "PDF"}
                </button>
                <button
                  data-testid="export-excel-btn"
                  disabled={!!exporting}
                  onClick={() => exportReport("excel")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-black/10 text-gray-900 text-sm font-medium hover:bg-gray-50 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40"
                >
                  <FileSpreadsheet className="w-4 h-4" /> {exporting === "excel" ? "Hazırlanıyor..." : "Excel"}
                </button>
              </>
            )}
          </div>
        </div>
        {!report && <p className="text-sm text-gray-400">Rapor görüntülemek için bir eğitim seçin.</p>}
        {report && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b n-hairline bg-[#FAFAF9]">
                  <th className="px-4 py-3 font-medium">Kullanıcı</th>
                  <th className="px-4 py-3 font-medium">Durum</th>
                  <th className="px-4 py-3 font-medium">İzleme</th>
                  <th className="px-4 py-3 font-medium">İzleme Süresi</th>
                  <th className="px-4 py-3 font-medium">Kontrol N.</th>
                  <th className="px-4 py-3 font-medium">Hata</th>
                  <th className="px-4 py-3 font-medium">Sınav</th>
                  <th className="px-4 py-3 font-medium">Tamamlanma</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.assignment_id} className="border-b border-black/5 last:border-0 hover:bg-gray-50/50" data-testid={`report-row-${r.user_email}`}>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-gray-900">{r.user_name}</p>
                      <p className="text-xs text-gray-400">{r.user_email}</p>
                    </td>
                    <td className="px-4 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]}`}>{STATUS_TR[r.status]}</span></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#007AFF] rounded-full" style={{ width: `${r.watch_pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 tabular-nums">%{r.watch_pct}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 tabular-nums">{fmtTime(r.watched_seconds)}</td>
                    <td className="px-4 py-3.5 text-gray-500">{r.checkpoints_passed}/{r.checkpoints_total}</td>
                    <td className="px-4 py-3.5">{r.checkpoint_fails > 0 ? <span className="text-red-500 font-medium">{r.checkpoint_fails}</span> : <span className="text-gray-300">0</span>}</td>
                    <td className="px-4 py-3.5">{r.quiz_score != null ? <span className="font-medium text-gray-900">%{r.quiz_score}</span> : <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-3.5 text-gray-400">{fmtDate(r.completed_at)}</td>
                    <td className="px-4 py-3.5">
                      <button data-testid={`report-detail-${r.user_email}`} onClick={() => openDetail(r)} className="p-2 rounded-lg text-gray-400 hover:text-[#007AFF] hover:bg-blue-50 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Denetim Kaydı — {detail?.user?.name}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-6 mt-2">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-[#F7F7F5] border n-hairline rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">İzleme Süresi</p>
                  <p className="font-medium text-gray-900">{fmtTime(detail.progress?.watched_seconds || 0)}</p>
                </div>
                <div className="bg-[#F7F7F5] border n-hairline rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Video Tamam</p>
                  <p className="font-medium text-gray-900">{detail.progress?.video_completed ? "Evet" : "Hayır"}</p>
                </div>
                <div className="bg-[#F7F7F5] border n-hairline rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Sınav Denemesi</p>
                  <p className="font-medium text-gray-900">{(detail.progress?.quiz_attempts || []).length}</p>
                </div>
              </div>
              {(detail.progress?.quiz_attempts || []).length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">Son Sınav Cevapları</p>
                  <div className="space-y-2">
                    {detail.progress.quiz_attempts[detail.progress.quiz_attempts.length - 1].answers.map((a, i) => (
                      <div key={i} className="px-4 py-3 rounded-xl bg-[#F5F5F7] text-sm">
                        <p className="text-gray-800 mb-1">{a.text}</p>
                        {a.qtype === "multiple_choice" ? (
                          <p className={a.correct ? "text-emerald-600" : "text-red-500"}>
                            Cevap: {a.options?.[a.answer_index] ?? "-"} {a.correct ? "✓" : `✗ (Doğru: ${a.options?.[a.correct_index]})`}
                          </p>
                        ) : (
                          <p className="text-gray-500 italic">"{a.answer_text || "-"}" <span className="text-amber-500 not-italic">(manuel değerlendirme)</span></p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">Olay Günlüğü ({detail.events.length})</p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {detail.events.map((e) => (
                    <div key={e.event_id} className="flex items-center gap-3 px-3 py-2 text-xs border-b border-black/5 last:border-0">
                      <span className="text-gray-400 tabular-nums whitespace-nowrap">{new Date(e.created_at).toLocaleString("tr-TR")}</span>
                      <span className="font-medium text-gray-700">{EVENT_TR[e.type] || e.type}</span>
                      {e.position != null && <span className="text-gray-400 ml-auto tabular-nums">{fmtTime(e.position)}</span>}
                    </div>
                  ))}
                  {detail.events.length === 0 && <p className="text-xs text-gray-400">Olay kaydı yok.</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
