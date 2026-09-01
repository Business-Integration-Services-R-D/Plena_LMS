import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
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
import {
  CheckCircle2,
  ChevronRight,
  FolderPlus,
  LayoutGrid,
  ListChecks,
  Pencil,
  Plus,
  Tags,
  TextCursorInput,
  Trash2,
} from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";
const btnSecondary = "px-5 py-2.5 rounded-full border border-navy-900/10 bg-white text-navy-950 text-sm font-medium hover:bg-slate-50 active:scale-[0.98] transition-colors disabled:opacity-40";

const newQuestionForm = (categoryId = "") => ({
  text: "",
  qtype: "multiple_choice",
  options: ["", ""],
  correct_index: 0,
  category_id: categoryId,
});

export default function QuestionsPage() {
  const [questions, setQuestions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modal, setModal] = useState(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "" });
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [deleteMode, setDeleteMode] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [form, setForm] = useState(newQuestionForm());
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [viewMode, setViewMode] = useState("cards");

  const load = useCallback(async () => {
    const [questionRes, categoryRes] = await Promise.all([
      api.get("/questions"),
      api.get("/question-categories"),
    ]);
    setQuestions(questionRes.data);
    setCategories(categoryRes.data);
  }, []);

  useEffect(() => {
    load().catch(() => toast.error("Soru havuzu yüklenemedi"));
  }, [load]);

  const openNew = (categoryId = "") => {
    setForm(newQuestionForm(categoryId));
    setModal({});
  };

  const openEdit = (q) => {
    setForm({
      text: q.text,
      qtype: q.qtype,
      options: q.options?.length ? q.options : ["", ""],
      correct_index: q.correct_index ?? 0,
      category_id: q.category_id || "",
    });
    setModal(q);
  };

  const openNewCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: "", description: "" });
    setCategoryModal(true);
  };

  const openEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryForm({ name: category.name, description: category.description || "" });
    setCategoryModal(true);
  };

  const save = async () => {
    const filledOptions = form.options
      .map((option, originalIndex) => ({ option, originalIndex }))
      .filter(({ option }) => option.trim());
    const payload = {
      ...form,
      options: form.qtype === "multiple_choice" ? filledOptions.map(({ option }) => option) : [],
      correct_index:
        form.qtype === "multiple_choice"
          ? filledOptions.findIndex(({ originalIndex }) => originalIndex === form.correct_index)
          : null,
    };
    try {
      if (modal?.question_id) {
        await api.put(`/questions/${modal.question_id}`, payload);
        toast.success("Soru güncellendi");
      } else {
        await api.post("/questions", payload);
        toast.success("Soru havuza eklendi");
      }
      setModal(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.error || "Soru kaydedilemedi");
    }
  };

  const saveCategory = async () => {
    setCategorySaving(true);
    try {
      const res = editingCategory
        ? await api.patch(`/question-categories/${editingCategory.id}`, categoryForm)
        : await api.post("/question-categories", categoryForm);
      setCategoryForm({ name: "", description: "" });
      setCategoryModal(false);
      setEditingCategory(null);
      if (!editingCategory) {
        setForm((current) => ({ ...current, category_id: res.data.id }));
      }
      toast.success(editingCategory ? "Soru kategorisi güncellendi" : "Soru kategorisi oluşturuldu");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.error || "Kategori kaydedilemedi");
    } finally {
      setCategorySaving(false);
    }
  };

  const openDeleteCategory = (category) => {
    setCategoryToDelete(category);
    setDeleteMode("");
  };

  const proceedToDeleteConfirmation = () => {
    if (!categoryToDelete || !deleteMode) return;
    setDeleteConfirmation({ category: categoryToDelete, mode: deleteMode });
    setCategoryToDelete(null);
  };

  const deleteSelectedCategory = async () => {
    if (!deleteConfirmation) return;
    try {
      await api.delete(
        `/question-categories/${deleteConfirmation.category.id}?mode=${deleteConfirmation.mode}`,
      );
      if (categoryFilter === deleteConfirmation.category.id) setCategoryFilter("all");
      setViewMode("categories");
      toast.success(
        deleteConfirmation.mode === "move_to_general"
          ? "Kategori silindi, sorular Genel kategorisine taşındı"
          : "Kategori ve içindeki sorular silindi",
      );
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.error || "Kategori silinemedi");
    } finally {
      setDeleteConfirmation(null);
      setDeleteMode("");
    }
  };

  const openCategoryQuestions = (category) => {
    setCategoryFilter(category.id);
    setViewMode("cards");
  };

  const remove = async (q) => {
    if (!window.confirm("Bu soru silinsin mi?")) return;
    try {
      await api.delete(`/questions/${q.question_id}`);
      toast.success("Soru silindi");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Soru silinemedi");
    }
  };

  const setOption = (index, value) =>
    setForm((current) => ({
      ...current,
      options: current.options.map((option, itemIndex) => (itemIndex === index ? value : option)),
    }));

  const filtered = questions.filter(
    (question) =>
      (typeFilter === "all" || question.qtype === typeFilter) &&
      (categoryFilter === "all" || question.category_id === categoryFilter),
  );
  const selectedCategory = categories.find((category) => category.id === categoryFilter);

  const renderQuestion = (q) => (
    <div key={q.question_id} className="n-card p-6" data-testid={`question-card-${q.question_id}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${q.qtype === "multiple_choice" ? "bg-brand-50 text-brand-700" : "bg-navy-50 text-navy-700"}`}>
            {q.qtype === "multiple_choice" ? <ListChecks className="w-3 h-3" /> : <TextCursorInput className="w-3 h-3" />}
            {q.qtype === "multiple_choice" ? "Çoktan Seçmeli" : "Serbest Metin"}
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
            <Tags className="w-3 h-3" /> {q.category || "Kategorisiz"}
          </span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button aria-label="Soruyu düzenle" data-testid={`edit-question-${q.question_id}`} onClick={() => openEdit(q)} className="p-2 rounded-lg text-slate-400 hover:text-navy-950 hover:bg-slate-100 transition-colors"><Pencil className="w-4 h-4" /></button>
          <button aria-label="Soruyu sil" data-testid={`delete-question-${q.question_id}`} onClick={() => remove(q)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      <p className="text-sm font-medium text-navy-950 leading-relaxed">{q.text}</p>
      {q.qtype === "multiple_choice" && (
        <div className="mt-4 space-y-1.5">
          {q.options.map((option, index) => (
            <div key={index} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${index === q.correct_index ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
              {index === q.correct_index && <CheckCircle2 className="w-3.5 h-3.5" />}
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fade-up" data-testid="questions-page">
      <PageHeader
        overline="İçerik"
        title="Soru Havuzu"
        subtitle="Soruları kategorilere ayırın; kontrol noktalarında ve sınavlarda kullanın."
        action={
          <div className="flex flex-wrap gap-2">
            <button data-testid="add-category-btn" className={btnSecondary} onClick={openNewCategory}>
              <span className="flex items-center gap-2"><FolderPlus className="w-4 h-4" /> Kategori Ekle</span>
            </button>
            <button
              data-testid="add-question-btn"
              className={btnPrimary}
              onClick={() => openNew(categoryFilter === "all" ? "" : categoryFilter)}
            >
              <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Soru Ekle</span>
            </button>
          </div>
        }
      />

      <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {viewMode === "cards" ? (
          <div className="flex flex-wrap gap-1 bg-slate-100 rounded-2xl sm:rounded-full p-1 w-fit">
            {[["all", "Tümü"], ["multiple_choice", "Çoktan Seçmeli"], ["free_text", "Serbest Metin"]].map(([key, label]) => (
              <button key={key} data-testid={`filter-${key}`} onClick={() => setTypeFilter(key)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors ${typeFilter === key ? "bg-white shadow-sm text-navy-950" : "text-slate-500"}`}>
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-semibold text-navy-950">Soru Kategorileri</h2>
            <p className="mt-1 text-sm text-slate-500">Kategorileri görüntüleyin, düzenleyin veya silin.</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "cards" && (
            <select data-testid="category-filter" className={inputCls + " sm:w-56"} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">Tüm kategoriler</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.questionCount})</option>)}
            </select>
          )}
          <div className="flex gap-1 rounded-full bg-slate-100 p-1">
            <button aria-label="Kart görünümü" data-testid="view-cards" onClick={() => setViewMode("cards")} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${viewMode === "cards" ? "bg-white text-navy-950 shadow-sm" : "text-slate-500"}`}><LayoutGrid className="w-3.5 h-3.5" /> Kartlar</button>
            <button aria-label="Kategori görünümü" data-testid="view-categories" onClick={() => { setCategoryFilter("all"); setViewMode("categories"); }} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${viewMode === "categories" ? "bg-white text-navy-950 shadow-sm" : "text-slate-500"}`}><Tags className="w-3.5 h-3.5" /> Kategoriler</button>
          </div>
        </div>
      </div>

      {viewMode === "cards" && selectedCategory?.description && (
        <div
          data-testid="selected-category-description"
          className="mb-6 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-800"
        >
          <Tags className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-medium">{selectedCategory.name}:</span> {selectedCategory.description}</span>
        </div>
      )}

      {viewMode === "cards" && filtered.length === 0 && <p className="text-sm text-slate-400">Seçili filtrelerle eşleşen soru yok.</p>}

      {viewMode === "cards" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">{filtered.map(renderQuestion)}</div>
      ) : (
        <div className="space-y-3" data-testid="category-list">
          {categories.length === 0 && <p className="text-sm text-slate-400">Henüz kategori yok.</p>}
          {categories.map((category) => (
            <div key={category.id} className="n-card flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center" data-testid={`category-row-${category.id}`}>
              <button className="flex min-w-0 flex-1 items-center gap-4 text-left" onClick={() => openCategoryQuestions(category)}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Tags className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium text-navy-950">
                    {category.name}
                    {category.isDefault && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">Varsayılan</span>}
                  </span>
                  <span className="mt-1 block truncate text-sm text-slate-500">{category.description || "Açıklama eklenmemiş"}</span>
                </span>
                <span className="whitespace-nowrap text-xs font-medium text-slate-400">{category.questionCount} soru</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
              <div className="flex items-center gap-1 sm:border-l sm:border-navy-900/10 sm:pl-4">
                <button data-testid={`edit-category-${category.id}`} aria-label="Kategoriyi düzenle" onClick={() => openEditCategory(category)} className="p-2 rounded-lg text-slate-400 hover:text-navy-950 hover:bg-slate-100 transition-colors"><Pencil className="w-4 h-4" /></button>
                {!category.isDefault && (
                  <button data-testid={`delete-category-${category.id}`} aria-label="Kategoriyi sil" onClick={() => openDeleteCategory(category)} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!modal} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>{modal?.question_id ? "Soruyu Düzenle" : "Yeni Soru"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">Kategori</span>
              <select data-testid="question-category-select" className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Genel (varsayılan)</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <textarea data-testid="question-text-input" className={inputCls + " min-h-[80px]"} placeholder="Soru metni" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            <select data-testid="question-type-select" className={inputCls} value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}>
              <option value="multiple_choice">Çoktan Seçmeli</option>
              <option value="free_text">Serbest Metin</option>
            </select>
            {form.qtype === "multiple_choice" && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Seçenekler — doğru cevabı işaretleyin</p>
                {form.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input type="radio" data-testid={`correct-option-${index}`} name="correct" checked={form.correct_index === index} onChange={() => setForm({ ...form, correct_index: index })} className="accent-emerald-600" />
                    <input data-testid={`option-input-${index}`} className={inputCls} placeholder={`Seçenek ${index + 1}`} value={option} onChange={(e) => setOption(index, e.target.value)} />
                    {form.options.length > 2 && (
                      <button aria-label="Seçeneği sil" onClick={() => setForm({ ...form, options: form.options.filter((_, itemIndex) => itemIndex !== index), correct_index: 0 })} className="p-2 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                <button data-testid="add-option-btn" onClick={() => setForm({ ...form, options: [...form.options, ""] })} className="text-sm text-brand-600 font-medium hover:underline">+ Seçenek ekle</button>
              </div>
            )}
            <button data-testid="question-save-btn" className={btnPrimary + " w-full"} disabled={!form.text.trim() || (form.qtype === "multiple_choice" && (form.options.filter((option) => option.trim()).length < 2 || !form.options[form.correct_index]?.trim()))} onClick={save}>
              Kaydet
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryModal} onOpenChange={(open) => { setCategoryModal(open); if (!open) setEditingCategory(null); }}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle>{editingCategory ? "Soru Kategorisini Düzenle" : "Yeni Soru Kategorisi"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">Kategori adı</span>
              <input autoFocus data-testid="category-name-input" className={inputCls} maxLength={80} placeholder="Kategori adı" value={categoryForm.name} disabled={editingCategory?.isDefault} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} />
              {editingCategory?.isDefault && <span className="block text-xs text-slate-400">Varsayılan kategorinin adı değiştirilemez.</span>}
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">Açıklama</span>
            <textarea data-testid="category-description-input" className={inputCls + " min-h-[72px]"} maxLength={300} placeholder="Açıklama (isteğe bağlı)" value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} />
            </label>
            <button data-testid="category-save-btn" className={btnPrimary + " w-full"} disabled={categorySaving || categoryForm.name.trim().length < 2} onClick={saveCategory}>{categorySaving ? "Kaydediliyor..." : "Kategoriyi Kaydet"}</button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!categoryToDelete} onOpenChange={(open) => { if (!open) { setCategoryToDelete(null); setDeleteMode(""); } }}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>“{categoryToDelete?.name}” Kategorisini Sil</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-slate-500">Kategori içindeki sorulara ne yapılacağını seçin.</p>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${deleteMode === "move_to_general" ? "border-brand-500 bg-brand-50/50" : "border-navy-900/10 hover:bg-slate-50"}`}>
              <input type="radio" name="category-delete-mode" value="move_to_general" checked={deleteMode === "move_to_general"} onChange={(e) => setDeleteMode(e.target.value)} className="mt-1 accent-navy-900" />
              <span>
                <span className="block text-sm font-medium text-navy-950">Yalnızca kategoriyi sil</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">Kategori kaldırılır, içindeki sorular Genel kategorisine taşınır.</span>
              </span>
            </label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${deleteMode === "delete_questions" ? "border-red-400 bg-red-50/60" : "border-navy-900/10 hover:bg-slate-50"}`}>
              <input type="radio" name="category-delete-mode" value="delete_questions" checked={deleteMode === "delete_questions"} onChange={(e) => setDeleteMode(e.target.value)} className="mt-1 accent-red-600" />
              <span>
                <span className="block text-sm font-medium text-red-700">Kategoriyi ve soruları sil</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">Kategori ve ona bağlı tüm sorular kalıcı olarak silinir.</span>
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className={btnSecondary} onClick={() => { setCategoryToDelete(null); setDeleteMode(""); }}>Vazgeç</button>
              <button data-testid="category-delete-continue" className={deleteMode === "delete_questions" ? "px-5 py-2.5 rounded-full bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40" : btnPrimary} disabled={!deleteMode} onClick={proceedToDeleteConfirmation}>Devam Et</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmation} onOpenChange={(open) => !open && setDeleteConfirmation(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>İşlemi onaylıyor musunuz?</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {deleteConfirmation?.mode === "move_to_general"
                ? "Bu kategori kaldırma işlemine devam ettiğinizde içinde bulunan soruların hepsi Genel kategorisine taşınacaktır. Kabul ediyor musunuz?"
                : "Bu kategori kaldırma işlemine devam ettiğinizde hem kategori hem de içindeki sorular kalıcı olarak silinecektir. Kabul ediyor musunuz?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              data-testid="category-delete-confirm"
              onClick={deleteSelectedCategory}
              className={deleteConfirmation?.mode === "delete_questions" ? "bg-red-600 text-white hover:bg-red-700" : "bg-navy-900 text-white hover:bg-navy-800"}
            >
              Evet, Devam Et
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
