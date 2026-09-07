import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtTime, fmtDate } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayCircle, CheckCircle2, Clock, FileQuestion, FileText, CircleAlert } from "lucide-react";
import { MartiBadge } from "@/components/brand/MartiMark";
import { WaveLine, OceanBanner } from "@/components/brand/Decoration";
import { HeroBanner } from "@/components/brand/HeroBanner";

const isExpiredTraining = (assignment) => {
  if (!assignment || assignment.status === "completed") return false;
  if (assignment.status === "overdue") return true;
  return Boolean(
    assignment.due_at && new Date(assignment.due_at).getTime() < Date.now(),
  );
};

export default function MyTrainingsPage() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [infoModal, setInfoModal] = useState(null); // tıklanan tamamlanmamış eğitim
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/my/assignments").then((r) => { setAssignments(r.data); setLoaded(true); });
  }, []);

  const openTraining = (a) => {
    if (a.status === "completed") {
      navigate(`/trainings/${a.assignment_id}/watch`);
      return;
    }
    setInfoModal(a);
  };

  // Kontrol noktası / sınav durumuna göre bilgilendirme cümlesi
  const infoText = (a) => {
    if (!a) return "";
    const cp = a.checkpoint_count || 0;
    const q = a.quiz_question_count || 0;
    const content = a.content_type === "pdf" ? "PDF'nin tüm sayfalarını" : "videoyu";
    if (cp > 0 && q > 0)
      return `Bu eğitimde ${cp} kontrol noktası sorusu bulunmaktadır ve ${content} tamamladığınızda ${q} soruluk bir sınavı tamamlamanız gerekmektedir.`;
    if (cp > 0)
      return `Bu eğitimde ${cp} kontrol noktası sorusu bulunmaktadır.`;
    if (q > 0)
      return `${content[0].toLocaleUpperCase("tr-TR") + content.slice(1)} tamamladığınızda ${q} soruluk bir sınavı tamamlamanız gerekmektedir.`;
    return a.content_type === "pdf"
      ? "Bu eğitimi tamamlamak için PDF'nin tüm sayfalarını sırayla görüntülemeniz gerekmektedir."
      : "Bu eğitimi tamamlamak için videoyu sonuna kadar izlemeniz gerekmektedir.";
  };

  return (
    <div className="fade-up" data-testid="my-trainings-page">
      <HeroBanner
        testId="trainings-welcome-banner"
        overline="ÇALIŞAN PANELİ"
        title={`Hoş geldiniz, ${user?.name || ""}`}
        subtitle="Size atanan eğitimleri buradan tamamlayabilirsiniz."
      />
      {loaded && assignments.length === 0 && (
        <div className="n-card p-16 text-center max-w-lg relative overflow-hidden">
          <WaveLine className="absolute bottom-4 inset-x-0 w-full h-8 text-cyan-500/10" />
          <div className="relative flex justify-center mb-4">
            <MartiBadge size="w-14 h-14" />
          </div>
          <p className="relative font-medium text-navy-950 mb-1">Henüz atanmış eğitiminiz yok</p>
          <p className="relative text-sm text-slate-400">Yöneticiniz size eğitim atadığında burada görünecek.</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {assignments.map((a, i) => {
          const done = a.status === "completed";
          const expired = isExpiredTraining(a);
          return (
            <div
              key={a.assignment_id}
              data-testid={`my-training-card-${a.assignment_id}`}
              onClick={() => openTraining(a)}
              className="n-card n-card-glow-hover p-0 cursor-pointer fade-up overflow-hidden flex flex-col"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <OceanBanner className="h-20 rounded-none shrink-0">
                <div className="relative z-10 h-full flex items-center justify-between px-5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ring-1 ${done ? "bg-emerald-400/90 text-white ring-emerald-300/40" : expired ? "bg-red-500/90 text-white ring-red-300/40" : "bg-white/[0.14] text-cyan-200 ring-white/20"}`}>
                    {done ? <CheckCircle2 className="w-5 h-5" /> : expired ? <CircleAlert className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium backdrop-blur-sm ${done ? "bg-emerald-400/90 text-white" : expired ? "bg-red-500/95 text-white ring-1 ring-red-300/40" : a.status === "assigned" ? "bg-white/[0.14] text-white ring-1 ring-white/20" : "bg-cyan-400/90 text-navy-950"}`}>
                    {done ? "Eğitim Tamamlandı" : expired ? "Süresi Doldu" : a.status === "assigned" ? "Başlamadı" : a.status === "video_completed" ? "Sınav Bekliyor" : "Devam Ediyor"}
                  </span>
                </div>
              </OceanBanner>
              <div className="p-6 flex flex-col flex-1">
                <p className="font-semibold text-navy-950 mb-1.5 leading-snug">{a.training_title}</p>
                <p className="text-sm text-slate-400 line-clamp-2 mb-5 min-h-[40px]">{a.training_description || "Bu eğitim için açıklama eklenmemiş."}</p>
                <div className="mb-4">
                  <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${done ? "bg-emerald-500" : "bg-cyan-500"}`} />
                      Eğitim ilerlemesi
                    </span>
                    <span className="tabular-nums font-medium text-slate-600">%{done ? 100 : a.watch_pct}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-gradient-to-r from-cyan-500 to-brand-700"}`}
                      style={{ width: `${done ? 100 : a.watch_pct}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-auto pt-4 border-t border-navy-900/[0.06]">
                  {a.content_type === "pdf" ? (
                    <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-300" />{a.pdf_page_count} sayfa</span>
                  ) : (
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-300" />{fmtTime(a.duration)}</span>
                  )}
                  {a.has_quiz && <span className="flex items-center gap-1.5"><FileQuestion className="w-3.5 h-3.5 text-slate-300" />Sınav var</span>}
                  {a.due_at && <span className="ml-auto text-slate-400">Son: {fmtDate(a.due_at)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tamamlanmamış eğitime tıklanınca bilgilendirme popup'ı */}
      <Dialog open={!!infoModal} onOpenChange={(o) => !o && setInfoModal(null)}>
        <DialogContent className="rounded-2xl max-w-md border-navy-900/10 bg-white shadow-[0_28px_80px_-24px_rgba(14,32,51,0.38)]" data-testid="training-info-modal">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${isExpiredTraining(infoModal) ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-700"}`}>
            {isExpiredTraining(infoModal) ? <CircleAlert className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
          </div>
          <DialogHeader className="text-left">
            <DialogTitle className="text-xl tracking-tight text-navy-950">
              {isExpiredTraining(infoModal) ? "Eğitimin süresi doldu" : infoModal?.training_title}
            </DialogTitle>
          </DialogHeader>
          {isExpiredTraining(infoModal) ? (
            <>
              <p className="text-sm text-slate-600 leading-relaxed">
                <span className="font-medium text-navy-950">{infoModal?.training_title}</span> eğitimini tamamlamak için tanımlanan süre sona erdi. Eğitime devam edebilmek için yöneticinizden son tarihi güncellemesini veya eğitimi yeniden atamasını isteyin.
              </p>
              <p className="rounded-xl border border-navy-900/5 bg-[#F5F8FA] px-4 py-3 text-sm leading-relaxed text-slate-500">
                Bu eğitimdeki mevcut ilerlemeniz ve sınav kayıtlarınız korunmaktadır.
              </p>
              <button
                type="button"
                data-testid="expired-training-close-btn"
                className="w-full mt-2 py-3 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow]"
                onClick={() => setInfoModal(null)}
              >
                Anladım
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600 leading-relaxed mt-2">{infoText(infoModal)}</p>
              <button
                data-testid="continue-training-btn"
                className="w-full mt-4 py-3 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow]"
                onClick={() => {
                  const id = infoModal.assignment_id;
                  setInfoModal(null);
                  navigate(`/trainings/${id}/watch`);
                }}
              >
                Eğitime devam et
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
