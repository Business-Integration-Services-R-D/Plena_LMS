import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtDate, fmtTime } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Archive, RotateCcw, Video, Film, HelpCircle, Send, FileText } from "lucide-react";
import { OceanBanner } from "@/components/brand/Decoration";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState([]);
  const [statusFilter, setStatusFilter] = useState("active");
  const [modal, setModal] = useState(false);
  const [deactivationTarget, setDeactivationTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const navigate = useNavigate();

  const load = useCallback(() => api.get("/trainings?status=all").then((r) => setTrainings(r.data)), []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      const res = await api.post("/trainings", form);
      toast.success("Eğitim oluşturuldu");
      navigate(`/admin/trainings/${res.data.training_id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Oluşturulamadı");
    }
  };

  const requestDeactivation = (t, e) => {
    e.stopPropagation();
    setDeactivationTarget(t);
  };

  const deactivate = async () => {
    if (!deactivationTarget) return;
    setDeactivating(true);
    try {
      await api.delete(`/trainings/${deactivationTarget.training_id}`);
      toast.success("Eğitim pasife alındı");
      setDeactivationTarget(null);
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Eğitim pasife alınamadı");
    } finally {
      setDeactivating(false);
    }
  };

  const reactivate = async (t, e) => {
    e.stopPropagation();
    try {
      await api.patch(`/trainings/${t.training_id}/status`, { active: true });
      toast.success("Eğitim yeniden aktifleştirildi");
      load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Eğitim aktifleştirilemedi");
    }
  };

  const visibleTrainings = trainings.filter((training) =>
    statusFilter === "active" ? training.active : !training.active,
  );
  const activeCount = trainings.filter((training) => training.active).length;
  const inactiveCount = trainings.length - activeCount;

  return (
    <div className="fade-up" data-testid="trainings-page">
      <PageHeader
        overline="İçerik"
        title="Eğitimler"
        subtitle="Video veya PDF yükleyin, kontrol noktaları yerleştirin ve sınav oluşturun."
        action={
          <button data-testid="add-training-btn" className={btnPrimary} onClick={() => { setForm({ title: "", description: "" }); setModal(true); }}>
            <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Eğitim Oluştur</span>
          </button>
        }
      />
      <div className="mb-6 inline-flex rounded-xl border border-navy-900/10 bg-white p-1 shadow-sm" aria-label="Eğitim durumu filtresi">
        <button
          type="button"
          data-testid="active-trainings-tab"
          onClick={() => setStatusFilter("active")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${statusFilter === "active" ? "bg-navy-900 text-white shadow-sm" : "text-slate-500 hover:text-navy-950"}`}
        >
          Aktif Eğitimler <span className={statusFilter === "active" ? "text-white/65" : "text-slate-400"}>{activeCount}</span>
        </button>
        <button
          type="button"
          data-testid="inactive-trainings-tab"
          onClick={() => setStatusFilter("inactive")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${statusFilter === "inactive" ? "bg-navy-900 text-white shadow-sm" : "text-slate-500 hover:text-navy-950"}`}
        >
          Pasif Eğitimler <span className={statusFilter === "inactive" ? "text-white/65" : "text-slate-400"}>{inactiveCount}</span>
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleTrainings.length === 0 && (
          <p className="text-sm text-slate-400 col-span-full">
            {statusFilter === "active" ? "Henüz aktif eğitim yok." : "Pasif eğitim bulunmuyor."}
          </p>
        )}
        {visibleTrainings.map((t) => (
          <div
            key={t.training_id}
            data-testid={`training-card-${t.training_id}`}
            onClick={() => t.active && navigate(`/admin/trainings/${t.training_id}`)}
            className={`n-card p-0 group overflow-hidden ${t.active ? "n-card-glow-hover cursor-pointer" : "opacity-80"}`}
          >
            <OceanBanner className="h-16 rounded-none">
              <div className="relative z-10 h-full flex items-center justify-between px-5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.video_filename ? "bg-white/[0.14] text-cyan-200 ring-1 ring-white/20" : "bg-white/10 text-white/50"}`}>
                  {t.content_type === "pdf" ? <FileText className="w-4 h-4" /> : <Film className="w-4 h-4" />}
                </div>
                {t.active ? (
                  <button
                    type="button"
                    title="Eğitimi pasife al"
                    aria-label="Eğitimi pasife al"
                    data-testid={`deactivate-training-${t.training_id}`}
                    onClick={(e) => requestDeactivation(t, e)}
                    className="p-1.5 rounded-lg text-white/60 hover:text-amber-200 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    title="Eğitimi yeniden aktifleştir"
                    aria-label="Eğitimi yeniden aktifleştir"
                    data-testid={`reactivate-training-${t.training_id}`}
                    onClick={(e) => reactivate(t, e)}
                    className="p-1.5 rounded-lg text-cyan-100 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </OceanBanner>
            <div className="p-6">
              <p className="font-medium text-navy-950 mb-1">{t.title}</p>
              {!t.active && (
                <span className="mb-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">Pasif</span>
              )}
              <p className="text-sm text-slate-400 line-clamp-2 mb-5 min-h-[20px]">{t.description || "Açıklama yok"}</p>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  {t.content_type === "pdf" ? <FileText className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                  {t.video_filename ? (t.content_type === "pdf" ? `${t.pdf_page_count} sayfa` : fmtTime(t.duration)) : "İçerik yok"}
                </span>
                <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" />{(t.checkpoints || []).length} kontrol</span>
                <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" />{t.assignment_count} atama</span>
              </div>
              <p className="text-xs text-slate-300 mt-3">{fmtDate(t.created_at)}</p>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!deactivationTarget}
        onOpenChange={(open) => !open && !deactivating && setDeactivationTarget(null)}
      >
        <AlertDialogContent
          overlayClassName="bg-navy-950/35 backdrop-blur-[2px]"
          className="w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border-navy-900/10 bg-white p-0 shadow-[0_28px_80px_-24px_rgba(14,32,51,0.38)]"
        >
          <div className="p-7">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Archive className="h-5 w-5" />
            </div>
            <AlertDialogHeader className="space-y-2 text-left">
              <AlertDialogTitle className="text-xl font-semibold tracking-tight text-navy-950">
                Eğitim pasife alınsın mı?
              </AlertDialogTitle>
              <AlertDialogDescription className="leading-6 text-slate-500">
                <span className="font-medium text-navy-950">{deactivationTarget?.title}</span> çalışanların eğitim listesinden kaldırılacak ve yeni atamalara kapatılacak.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-5 rounded-xl border border-navy-900/5 bg-[#F5F8FA] px-4 py-3 text-sm leading-6 text-slate-500">
              Mevcut atamalar, ilerlemeler, sınav sonuçları ve rapor geçmişi korunur. Eğitimi daha sonra yeniden aktifleştirebilirsiniz.
            </div>
            <AlertDialogFooter className="mt-7 gap-2 sm:space-x-0">
              <AlertDialogCancel disabled={deactivating} className="h-10 rounded-full border-navy-900/10 bg-white px-5 text-navy-950 shadow-none hover:bg-slate-50 disabled:opacity-40">
                Vazgeç
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="confirm-deactivate-training"
                disabled={deactivating}
                onClick={(event) => {
                  event.preventDefault();
                  deactivate();
                }}
                className="h-10 rounded-full bg-navy-900 px-5 text-white shadow-none hover:bg-navy-800 disabled:opacity-40"
              >
                {deactivating ? "Pasife alınıyor..." : "Pasife Al"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle>Yeni Eğitim</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <input data-testid="training-title-input" className={inputCls} placeholder="Eğitim başlığı" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea data-testid="training-desc-input" className={inputCls + " min-h-[80px]"} placeholder="Açıklama (opsiyonel)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button data-testid="training-create-btn" className={btnPrimary + " w-full"} disabled={!form.title.trim()} onClick={create}>Oluştur ve Düzenle</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
