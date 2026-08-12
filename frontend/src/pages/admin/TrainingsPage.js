import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, fmtDate, fmtTime } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Video, Film, HelpCircle, Send } from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-black/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#007AFF] focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-[background-color,transform] disabled:opacity-40";

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
        {trainings.length === 0 && <p className="text-sm text-gray-400 col-span-full">Henüz eğitim yok.</p>}
        {trainings.map((t) => (
          <div
            key={t.training_id}
            data-testid={`training-card-${t.training_id}`}
            onClick={() => navigate(`/admin/trainings/${t.training_id}`)}
            className="n-card n-card-hover p-6 cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${t.video_filename ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
                <Film className="w-5 h-5" />
              </div>
              <button data-testid={`delete-training-${t.training_id}`} onClick={(e) => remove(t, e)}
                className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <p className="font-medium text-gray-900 mb-1">{t.title}</p>
            <p className="text-sm text-gray-400 line-clamp-2 mb-5 min-h-[20px]">{t.description || "Açıklama yok"}</p>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><Video className="w-3.5 h-3.5" />{t.video_filename ? fmtTime(t.duration) : "Video yok"}</span>
              <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" />{(t.checkpoints || []).length} kontrol</span>
              <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" />{t.assignment_count} atama</span>
            </div>
            <p className="text-xs text-gray-300 mt-3">{fmtDate(t.created_at)}</p>
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
