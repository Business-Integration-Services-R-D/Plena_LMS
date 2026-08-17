import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtDate, fmtTime } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Video, Film, HelpCircle, Send } from "lucide-react";
import { OceanBanner } from "@/components/brand/Decoration";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const navigate = useNavigate();

  const load = useCallback(() => api.get("/trainings").then((r) => setTrainings(r.data)), []);
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

  const remove = async (t, e) => {
    e.stopPropagation();
    if (!window.confirm(`"${t.title}" eğitimi ve tüm atamaları silinsin mi?`)) return;
    await api.delete(`/trainings/${t.training_id}`);
    toast.success("Eğitim silindi");
    load();
  };

  return (
    <div className="fade-up" data-testid="trainings-page">
      <PageHeader
        overline="İçerik"
        title="Eğitimler"
        subtitle="Video yükleyin, kontrol noktaları yerleştirin ve sınav oluşturun."
        action={
          <button data-testid="add-training-btn" className={btnPrimary} onClick={() => { setForm({ title: "", description: "" }); setModal(true); }}>
            <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Eğitim Oluştur</span>
          </button>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {trainings.length === 0 && <p className="text-sm text-slate-400 col-span-full">Henüz eğitim yok.</p>}
        {trainings.map((t) => (
          <div
            key={t.training_id}
            data-testid={`training-card-${t.training_id}`}
            onClick={() => navigate(`/admin/trainings/${t.training_id}`)}
            className="n-card n-card-glow-hover p-0 cursor-pointer group overflow-hidden"
          >
            <OceanBanner className="h-16 rounded-none">
              <div className="relative z-10 h-full flex items-center justify-between px-5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.video_filename ? "bg-white/[0.14] text-cyan-200 ring-1 ring-white/20" : "bg-white/10 text-white/50"}`}>
                  <Film className="w-4 h-4" />
                </div>
                <button data-testid={`delete-training-${t.training_id}`} onClick={(e) => remove(t, e)}
                  className="p-1.5 rounded-lg text-white/60 hover:text-red-300 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </OceanBanner>
            <div className="p-6">
              <p className="font-medium text-navy-950 mb-1">{t.title}</p>
              <p className="text-sm text-slate-400 line-clamp-2 mb-5 min-h-[20px]">{t.description || "Açıklama yok"}</p>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><Video className="w-3.5 h-3.5" />{t.video_filename ? fmtTime(t.duration) : "Video yok"}</span>
                <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" />{(t.checkpoints || []).length} kontrol</span>
                <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" />{t.assignment_count} atama</span>
              </div>
              <p className="text-xs text-slate-300 mt-3">{fmtDate(t.created_at)}</p>
            </div>
          </div>
        ))}
      </div>

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
