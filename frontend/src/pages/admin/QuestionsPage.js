import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, ListChecks, TextCursorInput, CheckCircle2 } from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";

const emptyForm = { text: "", qtype: "multiple_choice", options: ["", ""], correct_index: 0, category: "" };

export default function QuestionsPage() {
  const [questions, setQuestions] = useState([]);
  const [modal, setModal] = useState(null); // null | {editing question or {}}
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => api.get("/questions").then((r) => setQuestions(r.data)), []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(emptyForm); setModal({}); };
  const openEdit = (q) => {
    setForm({ text: q.text, qtype: q.qtype, options: q.options?.length ? q.options : ["", ""], correct_index: q.correct_index ?? 0, category: q.category || "" });
    setModal(q);
  };

  const save = async () => {
    const payload = { ...form, options: form.qtype === "multiple_choice" ? form.options.filter((o) => o.trim()) : [], correct_index: form.qtype === "multiple_choice" ? form.correct_index : null };
    try {
      if (modal?.question_id) {
        await api.put(`/questions/${modal.question_id}`, payload);
        toast.success("Soru güncellendi");
      } else {
        await api.post("/questions", payload);
        toast.success("Soru havuza eklendi");
      }
      setModal(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Soru kaydedilemedi");
    }
  };

  const remove = async (q) => {
    if (!window.confirm("Bu soru silinsin mi?")) return;
    await api.delete(`/questions/${q.question_id}`);
    toast.success("Soru silindi");
    load();
  };

  const setOption = (i, v) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));
  const filtered = questions.filter((q) => filter === "all" || q.qtype === filter);

  return (
    <div className="fade-up" data-testid="questions-page">
      <PageHeader
        overline="İçerik"
        title="Soru Havuzu"
        subtitle="Kontrol noktalarında ve sınavlarda kullanılacak soruları yönetin."
        action={
          <button data-testid="add-question-btn" className={btnPrimary} onClick={openNew}>
            <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Soru Ekle</span>
          </button>
        }
      />
      <div className="flex gap-1 bg-slate-100 rounded-full p-1 w-fit mb-8">
        {[["all", "Tümü"], ["multiple_choice", "Çoktan Seçmeli"], ["free_text", "Serbest Metin"]].map(([k, l]) => (
          <button key={k} data-testid={`filter-${k}`} onClick={() => setFilter(k)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${filter === k ? "bg-white shadow-sm text-navy-950" : "text-slate-500"}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {filtered.length === 0 && <p className="text-sm text-slate-400 col-span-full">Henüz soru yok. "Soru Ekle" ile başlayın.</p>}
        {filtered.map((q) => (
          <div key={q.question_id} className="n-card p-6" data-testid={`question-card-${q.question_id}`}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${q.qtype === "multiple_choice" ? "bg-brand-50 text-brand-700" : "bg-navy-50 text-navy-700"}`}>
                {q.qtype === "multiple_choice" ? <ListChecks className="w-3 h-3" /> : <TextCursorInput className="w-3 h-3" />}
                {q.qtype === "multiple_choice" ? "Çoktan Seçmeli" : "Serbest Metin"}
              </span>
              <div className="flex gap-1">
                <button data-testid={`edit-question-${q.question_id}`} onClick={() => openEdit(q)} className="p-2 rounded-lg text-slate-400 hover:text-navy-950 hover:bg-slate-100 transition-colors"><Pencil className="w-4 h-4" /></button>
                <button data-testid={`delete-question-${q.question_id}`} onClick={() => remove(q)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <p className="text-sm font-medium text-navy-950 leading-relaxed">{q.text}</p>
            {q.qtype === "multiple_choice" && (
              <div className="mt-4 space-y-1.5">
                {q.options.map((o, i) => (
                  <div key={i} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${i === q.correct_index ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
                    {i === q.correct_index && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {o}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>{modal?.question_id ? "Soruyu Düzenle" : "Yeni Soru"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <textarea data-testid="question-text-input" className={inputCls + " min-h-[80px]"} placeholder="Soru metni" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            <select data-testid="question-type-select" className={inputCls} value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}>
              <option value="multiple_choice">Çoktan Seçmeli</option>
              <option value="free_text">Serbest Metin</option>
            </select>
            {form.qtype === "multiple_choice" && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Seçenekler — doğru cevabı işaretleyin</p>
                {form.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" data-testid={`correct-option-${i}`} name="correct" checked={form.correct_index === i} onChange={() => setForm({ ...form, correct_index: i })} className="accent-emerald-600" />
                    <input data-testid={`option-input-${i}`} className={inputCls} placeholder={`Seçenek ${i + 1}`} value={o} onChange={(e) => setOption(i, e.target.value)} />
                    {form.options.length > 2 && (
                      <button onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i), correct_index: 0 })} className="p-2 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                <button data-testid="add-option-btn" onClick={() => setForm({ ...form, options: [...form.options, ""] })} className="text-sm text-brand-600 font-medium hover:underline">+ Seçenek ekle</button>
              </div>
            )}
            <button data-testid="question-save-btn" className={btnPrimary + " w-full"} disabled={!form.text.trim() || (form.qtype === "multiple_choice" && form.options.filter((o) => o.trim()).length < 2)} onClick={save}>
              Kaydet
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
