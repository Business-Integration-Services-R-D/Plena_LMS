import { useEffect, useState } from "react";
import { api, fmtDate, fmtTime, STATUS_TR, STATUS_COLOR } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Eye, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

const inputCls = "px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";

const EVENT_TR = {
  video_started: "Video başlatıldı", video_paused: "Video duraklatıldı", video_resumed: "Video devam ettirildi",
  video_closed: "Video kapatıldı", video_ended: "Video sonuna ulaşıldı", video_completed: "Video tamamlandı",
  checkpoint_passed: "Kontrol noktası geçildi", checkpoint_failed: "Kontrol noktası başarısız",
  quiz_submitted: "Sınav gönderildi",
};

export default function ReportsPage() {
  const [overview, setOverview] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [users, setUsers] = useState([]);
  const [reportMode, setReportMode] = useState("training");
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState(null);
  const [freeText, setFreeText] = useState([]);
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(null);

  const exportReport = async (fmt) => {
    setExporting(fmt);
    try {
      const scope = reportMode === "person" ? "users" : "trainings";
      const res = await api.get(`/reports/${scope}/${selected}/export`, { params: { fmt }, responseType: "blob" });
      const cd = res.headers["content-disposition"] || "";
      const fallbackName = reportMode === "person" ? "kisi-raporu" : "egitim-raporu";
      const filename = cd.match(/filename="?([^";]+)"?/)?.[1] || `${fallbackName}.${fmt === "excel" ? "xlsx" : "pdf"}`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(fmt === "excel" ? "Excel raporu indirildi" : "PDF raporu indirildi");
    } catch {
      toast.error("Rapor indirilemedi");
    } finally {
      setExporting(null);
    }
  };

  useEffect(() => {
    api.get("/reports/overview").then((r) => setOverview(r.data));
    // Rapor geçmişi eğitim pasife alındığında da korunur; filtrede aktif ve
    // pasif eğitimlerin tamamı seçilebilir olmalıdır.
    api.get("/trainings?status=all").then((r) => setTrainings(r.data));
    api.get("/users").then((r) => setUsers(r.data.filter((user) => user.role === "employee")));
  }, []);

  useEffect(() => {
    if (selected) {
      const scope = reportMode === "person" ? "users" : "trainings";
      api.get(`/reports/${scope}/${selected}`).then((r) => setReport(r.data));
    }
    else setReport(null);
  }, [reportMode, selected]);

  useEffect(() => {
    const params =
      reportMode === "person"
        ? selected
          ? { user_id: selected }
          : {}
        : selected
          ? { training_id: selected }
          : {};
    api
      .get("/reports/free-text", { params })
      .then((r) => setFreeText(r.data))
      .catch(() => setFreeText([]));
  }, [reportMode, selected]);

  const changeReportMode = (mode) => {
    setReportMode(mode);
    setSelected("");
    setReport(null);
    setFreeText([]);
  };

  const openDetail = async (row) => {
    const res = await api.get(`/reports/assignments/${row.assignment_id}/detail`);
    setDetail(res.data);
  };

  return (
    <div className="fade-up" data-testid="reports-page">
      <PageHeader overline="Denetim" title="Raporlar" subtitle="İzleme kanıtları, sınav sonuçları ve denetim logları." />

      {overview && overview.per_training.length > 0 && (
        <div className="n-card p-8 mb-8">
          <h2 className="text-lg font-medium tracking-tight text-navy-950 mb-6">Atama / Tamamlanma Dağılımı</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.per_training} barGap={4}>
                <XAxis dataKey="title" tick={{ fontSize: 12, fill: "#7A8B9A" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#7A8B9A" }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "rgba(14,32,51,0.03)" }} contentStyle={{ borderRadius: 12, border: "1px solid rgba(15,42,67,0.08)" }} />
                <Bar dataKey="assigned" name="Atanan" fill="#DCE4EC" radius={[6, 6, 0, 0]} />
                <Bar dataKey="completed" name="Tamamlanan" fill="#1F76A2" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="n-card p-8">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <h2 className="text-lg font-medium tracking-tight text-navy-950">
              {reportMode === "person" ? "Kişi Bazlı Rapor" : "Eğitim Detay Raporu"}
            </h2>
            <div className="flex gap-1 bg-slate-100 rounded-full p-1 w-fit mt-3">
              <button
                data-testid="report-mode-training"
                onClick={() => changeReportMode("training")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${reportMode === "training" ? "bg-white shadow-sm text-navy-950" : "text-slate-500"}`}
              >
                Eğitim Bazlı
              </button>
              <button
                data-testid="report-mode-person"
                onClick={() => changeReportMode("person")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${reportMode === "person" ? "bg-white shadow-sm text-navy-950" : "text-slate-500"}`}
              >
                Kişi Bazlı
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              data-testid={reportMode === "person" ? "report-person-select" : "report-training-select"}
              className={inputCls}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">{reportMode === "person" ? "Kişi seçin..." : "Eğitim seçin..."}</option>
              {reportMode === "person"
                ? users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.name} · {user.email}
                    </option>
                  ))
                : trainings.map((training) => (
                    <option key={training.training_id} value={training.training_id}>
                      {training.title}{training.active ? "" : " · Pasif"}
                    </option>
                  ))}
            </select>
            {selected && (
              <>
                <button
                  data-testid="export-pdf-btn"
                  disabled={!!exporting}
                  onClick={() => exportReport("pdf")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40"
                >
                  <FileDown className="w-4 h-4" /> {exporting === "pdf" ? "Hazırlanıyor..." : "PDF"}
                </button>
                <button
                  data-testid="export-excel-btn"
                  disabled={!!exporting}
                  onClick={() => exportReport("excel")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-navy-900/10 text-navy-950 text-sm font-medium hover:bg-slate-50 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40"
                >
                  <FileSpreadsheet className="w-4 h-4" /> {exporting === "excel" ? "Hazırlanıyor..." : "Excel"}
                </button>
              </>
            )}
          </div>
        </div>
        {!report && (
          <p className="text-sm text-slate-400">
            Rapor görüntülemek için {reportMode === "person" ? "bir kişi" : "bir eğitim"} seçin.
          </p>
        )}
        {report && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b n-hairline bg-[#F5F8FA]">
                  <th className="px-4 py-3 font-medium">
                    {reportMode === "person" ? "Eğitim" : "Kullanıcı"}
                  </th>
                  <th className="px-4 py-3 font-medium">Durum</th>
                  <th className="px-4 py-3 font-medium">İzleme</th>
                  <th className="px-4 py-3 font-medium">İzleme Süresi</th>
                  <th className="px-4 py-3 font-medium">Kontrol N.</th>
                  <th className="px-4 py-3 font-medium">Kontrol Noktası Hatası</th>
                  <th className="px-4 py-3 font-medium">Sınav</th>
                  <th className="px-4 py-3 font-medium">Tamamlanma</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.assignment_id} className="border-b border-navy-900/5 last:border-0 hover:bg-slate-50/60" data-testid={`report-row-${reportMode === "person" ? r.training_id : r.user_email}`}>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-navy-950">
                        {reportMode === "person" ? r.training_title : r.user_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {reportMode === "person"
                          ? r.training_category || "Kategorisiz"
                          : r.user_email}
                      </p>
                    </td>
                    <td className="px-4 py-3.5"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]}`}>{STATUS_TR[r.status]}</span></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${r.watch_pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums">%{r.watch_pct}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 tabular-nums">{fmtTime(r.watched_seconds)}</td>
                    <td className="px-4 py-3.5 text-slate-500">{r.checkpoints_passed}/{r.checkpoints_total}</td>
                    <td className="px-4 py-3.5">{r.checkpoint_fails > 0 ? <span className="text-red-500 font-medium">{r.checkpoint_fails}</span> : <span className="text-slate-300">0</span>}</td>
                    <td className="px-4 py-3.5">{r.quiz_score != null ? <span className="font-medium text-navy-950">%{r.quiz_score}</span> : <span className="text-slate-300">-</span>}</td>
                    <td className="px-4 py-3.5 text-slate-400">{fmtDate(r.completed_at)}</td>
                    <td className="px-4 py-3.5">
                      <button data-testid={`report-detail-${r.user_email}`} onClick={() => openDetail(r)} className="p-2 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
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

      <div className="n-card p-8 mt-8" data-testid="free-text-answers-card">
        <div className="mb-6">
          <h2 className="text-lg font-medium tracking-tight text-navy-950 mb-1">Serbest Metin Cevapları</h2>
          <p className="text-sm text-slate-400">
            Doğru cevabı olmayan sorular; puanlamaya girmez, değerlendirmek için okunur.
            {selected
              ? reportMode === "person"
                ? " Seçili kişinin tüm eğitimleri için listelenir."
                : " Seçili eğitim için listelenir."
              : " Tüm eğitimler listelenir."}
          </p>
        </div>
        {freeText.length === 0 ? (
          <p className="text-sm text-slate-400">Serbest metin cevabı yok.</p>
        ) : (
          <div className="space-y-3 max-h-[28rem] overflow-y-auto">
            {freeText.map((a) => (
              <div key={`${a.source}-${a.id}`} className="px-4 py-3.5 rounded-xl bg-[#F5F8FA] border n-hairline" data-testid={`free-text-answer-${a.id}`}>
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <span className="text-sm font-medium text-navy-950">{a.user_name}</span>
                  <span className="text-xs text-slate-400">{a.user_email}</span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-navy-900/10 text-slate-600">
                    {a.source === "checkpoint" ? `Kontrol noktası · ${fmtTime(a.position || 0)}` : `Sınav · ${a.attempt_no}. deneme`}
                  </span>
                  {(reportMode === "person" || !selected) && a.training_title && (
                    <span className="text-xs text-slate-400">{a.training_title}</span>
                  )}
                  <span className="text-xs text-slate-400 ml-auto">{fmtDate(a.answered_at)}</span>
                </div>
                <p className="text-sm text-slate-700 mb-1">{a.question_text}</p>
                <p className="text-sm text-slate-500 italic">"{a.answer_text}"</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Denetim Kaydı — {detail?.user?.name}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-6 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="bg-[#F5F8FA] border n-hairline rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">İzleme Süresi</p>
                  <p className="font-medium text-navy-950">{fmtTime(detail.progress?.watched_seconds || 0)}</p>
                </div>
                <div className="bg-[#F5F8FA] border n-hairline rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Video Tamam</p>
                  <p className="font-medium text-navy-950">{detail.progress?.video_completed ? "Evet" : "Hayır"}</p>
                </div>
                <div className="bg-[#F5F8FA] border n-hairline rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1">Sınav Denemesi</p>
                  <p className="font-medium text-navy-950">{(detail.progress?.quiz_attempts || []).length}</p>
                </div>
              </div>
              {(detail.progress?.quiz_attempts || []).length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-400 mb-3">Son Sınav Cevapları</p>
                  <div className="space-y-2">
                    {detail.progress.quiz_attempts[detail.progress.quiz_attempts.length - 1].answers.map((a, i) => (
                      <div key={i} className="px-4 py-3 rounded-xl bg-[#F5F8FA] text-sm">
                        <p className="text-slate-800 mb-1">{a.text}</p>
                        {a.qtype === "multiple_choice" ? (
                          <p className={a.correct ? "text-emerald-600" : "text-red-500"}>
                            Cevap: {a.options?.[a.answer_index] ?? "-"} {a.correct ? "✓" : `✗ (Doğru: ${a.options?.[a.correct_index]})`}
                          </p>
                        ) : (
                          <p className="text-slate-500 italic">"{a.answer_text || "-"}" <span className="text-amber-500 not-italic">(manuel değerlendirme)</span></p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 mb-3">Olay Günlüğü ({detail.events.length})</p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {detail.events.map((e) => (
                    <div key={e.event_id} className="px-3 py-2 text-xs border-b border-navy-900/5 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 tabular-nums whitespace-nowrap">{new Date(e.created_at).toLocaleString("tr-TR")}</span>
                        <span className="font-medium text-slate-700">{EVENT_TR[e.type] || e.type}</span>
                        {e.position != null && <span className="text-slate-400 ml-auto tabular-nums">{fmtTime(e.position)}</span>}
                      </div>
                      {e.answer_text && <p className="text-slate-500 italic mt-1">"{e.answer_text}"</p>}
                    </div>
                  ))}
                  {detail.events.length === 0 && <p className="text-xs text-slate-400">Olay kaydı yok.</p>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
