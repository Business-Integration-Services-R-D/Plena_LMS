import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/Layout";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  ChevronsUpDown,
  ChevronRight,
  FolderPlus,
  Info,
  LayoutGrid,
  ListChecks,
  ListPlus,
  Pencil,
  Plus,
  Tags,
  TextCursorInput,
  Trash2,
} from "lucide-react";

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-navy-900/10 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent";
const btnPrimary = "px-5 py-2.5 rounded-full bg-navy-900 text-white text-sm font-medium hover:bg-navy-800 hover:shadow-glow-cyan-sm active:scale-[0.98] transition-[background-color,transform,box-shadow] disabled:opacity-40";
const btnSecondary = "px-5 py-2.5 rounded-full border border-navy-900/10 bg-white text-navy-950 text-sm font-medium hover:bg-slate-50 active:scale-[0.98] transition-colors disabled:opacity-40";

const newQuestionForm = (categoryId = "", qtype = "multiple_choice") => ({
  text: "",
  qtype,
  options: ["", ""],
  correct_index: 0,
  category_id: categoryId,
});

let bulkDraftSequence = 0;
const newBulkDraft = (categoryId = "", qtype = "multiple_choice") => ({
  ...newQuestionForm(categoryId, qtype),
  draft_id: `bulk-question-${Date.now()}-${++bulkDraftSequence}`,
});

const BULK_DRAFT_STORAGE_KEY = "plena:question-bank:bulk-draft";

const readBulkDraft = () => {
  if (typeof window === "undefined") return null;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(BULK_DRAFT_STORAGE_KEY));
    if (stored?.version !== 1 || !Array.isArray(stored.questions)) return null;
    const questions = stored.questions.map((question) => ({
      ...newBulkDraft(),
      ...question,
      options: Array.isArray(question.options) ? question.options : ["", ""],
    }));
    return questions.length ? { open: stored.open === true, questions } : null;
  } catch {
    return null;
  }
};

export default function QuestionsPage() {
  const [initialBulkDraft] = useState(readBulkDraft);
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
  const [bulkModal, setBulkModal] = useState(Boolean(initialBulkDraft?.open));
  const [bulkQuestions, setBulkQuestions] = useState(initialBulkDraft?.questions || []);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [form, setForm] = useState(newQuestionForm());
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (bulkModal && bulkQuestions.length) {
      window.sessionStorage.setItem(
        BULK_DRAFT_STORAGE_KEY,
        JSON.stringify({ version: 1, open: true, questions: bulkQuestions }),
      );
    } else {
      window.sessionStorage.removeItem(BULK_DRAFT_STORAGE_KEY);
    }
  }, [bulkModal, bulkQuestions]);

  const openNew = (categoryId = "") => {
    const initialType =
      viewMode === "cards" && typeFilter === "free_text"
        ? "free_text"
        : "multiple_choice";
    setForm(newQuestionForm(categoryId, initialType));
    setModal({});
  };

  const openBulkQuestions = () => {
    const activeCategory = categories.find((category) => category.id === categoryFilter);
    const initialCategory =
      categoryFilter === "all" || activeCategory?.isDefault ? "" : categoryFilter;
    const initialType =
      viewMode === "cards" && typeFilter === "free_text"
        ? "free_text"
        : "multiple_choice";
    setBulkQuestions([
      newBulkDraft(initialCategory, initialType),
      newBulkDraft(initialCategory, initialType),
    ]);
    setBulkModal(true);
  };

  const updateBulkQuestion = (draftId, changes) =>
    setBulkQuestions((current) =>
      current.map((question) =>
        question.draft_id === draftId ? { ...question, ...changes } : question,
      ),
    );

  const updateBulkOption = (draftId, optionIndex, value) =>
    setBulkQuestions((current) =>
      current.map((question) =>
        question.draft_id === draftId
          ? {
              ...question,
              options: question.options.map((option, index) =>
                index === optionIndex ? value : option,
              ),
            }
          : question,
      ),
    );

  const bulkQuestionStarted = (question) =>
    Boolean(question.text.trim() || question.options.some((option) => option.trim()));

  const bulkQuestionValidationMessages = (question) => {
    if (!bulkQuestionStarted(question)) return [];
    const messages = [];
    if (question.text.trim().length < 3) {
      messages.push("Lütfen soru metnini tamamlayın.");
    }
    if (question.qtype === "multiple_choice") {
      if (question.options.filter((option) => option.trim()).length < 2) {
        messages.push("En az 2 seçenek doldurulmalı.");
      }
      if (!question.options[question.correct_index]?.trim()) {
        messages.push("Doğru cevap olarak işaretlenen seçenek doldurulmalı.");
      }
    }
    return messages;
  };

  const bulkQuestionValid = (question) =>
    bulkQuestionValidationMessages(question).length === 0;

  const saveBulkQuestions = async () => {
    const questionsToSave = bulkQuestions.filter(bulkQuestionStarted);
    if (!questionsToSave.length || questionsToSave.some((question) => !bulkQuestionValid(question))) {
      toast.error("Doldurulan tüm soruları kontrol edin");
      return;
    }

    setBulkSaving(true);
    try {
      const payload = questionsToSave.map((question) => {
        const filledOptions = question.options
          .map((option, originalIndex) => ({ option, originalIndex }))
          .filter(({ option }) => option.trim());
        return {
          ...question,
          options:
            question.qtype === "free_text"
              ? []
              : filledOptions.map(({ option }) => option),
          correct_index:
            question.qtype === "free_text"
              ? null
              : filledOptions.findIndex(
                  ({ originalIndex }) => originalIndex === question.correct_index,
                ),
        };
      });
      await api.post("/questions/bulk", { questions: payload });
      setBulkModal(false);
      setBulkQuestions([]);
      toast.success(`${payload.length} soru havuza eklendi`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.response?.data?.error || "Sorular kaydedilemedi");
    } finally {
      setBulkSaving(false);
    }
  };

  const openEdit = (q) => {
    const currentCategory = categories.find((category) => category.id === q.category_id);
    setForm({
      text: q.text,
      qtype: q.qtype,
      options: q.options?.length ? q.options : ["", ""],
      correct_index: q.correct_index ?? 0,
      category_id: currentCategory?.isDefault ? "" : (q.category_id || ""),
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
            <button data-testid="add-bulk-questions-btn" className={btnSecondary} onClick={openBulkQuestions}>
              <span className="flex items-center gap-2"><ListPlus className="w-4 h-4" /> Toplu Soru Ekle</span>
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
            <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={categoryPickerOpen}
                  data-testid="category-filter"
                  className={`${inputCls} flex min-w-56 items-center justify-between gap-3 text-left sm:w-64 ${categoryPickerOpen ? "ring-2 ring-brand-500 border-transparent" : ""}`}
                >
                  <span className="min-w-0 truncate">{selectedCategory?.name || "Tüm kategoriler"}</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl p-0 shadow-xl">
                <Command>
                  <CommandInput placeholder="Kategori ara..." data-testid="category-search-input" />
                  <CommandList className="max-h-80 p-1">
                    <CommandEmpty>Kategori bulunamadı.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="tüm kategoriler"
                        onSelect={() => {
                          setCategoryFilter("all");
                          setCategoryPickerOpen(false);
                        }}
                        className="rounded-lg px-3 py-2.5"
                      >
                        <CheckCircle2 className={`h-4 w-4 ${categoryFilter === "all" ? "text-brand-600" : "text-transparent"}`} />
                        <span className="flex-1 font-medium">Tüm kategoriler</span>
                        <span className="text-xs text-slate-400">{questions.length} soru</span>
                      </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading="Kategoriler">
                      {categories.map((category) => (
                        <CommandItem
                          key={category.id}
                          value={`${category.name} ${category.description || ""}`}
                          onSelect={() => {
                            setCategoryFilter(category.id);
                            setCategoryPickerOpen(false);
                          }}
                          className="items-start rounded-lg px-3 py-2.5"
                        >
                          <CheckCircle2 className={`mt-0.5 h-4 w-4 ${categoryFilter === category.id ? "text-brand-600" : "text-transparent"}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-navy-950">{category.name}</span>
                            {category.description && <span className="mt-0.5 block truncate text-xs text-slate-400">{category.description}</span>}
                          </span>
                          <span className="mt-0.5 whitespace-nowrap text-xs text-slate-400">{category.questionCount} soru</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
          <div className="flex gap-1 rounded-full bg-slate-100 p-1">
            <button aria-label="Kart görünümü" data-testid="view-cards" onClick={() => setViewMode("cards")} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${viewMode === "cards" ? "bg-white text-navy-950 shadow-sm" : "text-slate-500"}`}><LayoutGrid className="w-3.5 h-3.5" /> Kartlar</button>
            <button aria-label="Kategori görünümü" data-testid="view-categories" onClick={() => { setCategoryPickerOpen(false); setCategoryFilter("all"); setViewMode("categories"); }} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium ${viewMode === "categories" ? "bg-white text-navy-950 shadow-sm" : "text-slate-500"}`}><Tags className="w-3.5 h-3.5" /> Kategoriler</button>
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

      <Dialog open={bulkModal} onOpenChange={(open) => { if (!bulkSaving) setBulkModal(open); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Toplu Soru Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-slate-500">
              En fazla 50 soruyu tek işlemde ekleyebilirsiniz. Tamamen boş bırakılan kartlar kaydedilmez.
            </p>
            {bulkQuestions.map((question, questionIndex) => (
              <section key={question.draft_id} className="rounded-2xl border border-navy-900/10 bg-slate-50/70 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-navy-950">Soru {questionIndex + 1}</h3>
                  {bulkQuestions.length > 1 && (
                    <button
                      type="button"
                      aria-label={`${questionIndex + 1}. soruyu kaldır`}
                      onClick={() => setBulkQuestions((current) => current.filter((item) => item.draft_id !== question.draft_id))}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">Kategori</span>
                    <select
                      data-testid={`bulk-question-category-${questionIndex}`}
                      className={inputCls}
                      value={question.category_id}
                      onChange={(e) => updateBulkQuestion(question.draft_id, { category_id: e.target.value })}
                    >
                      <option value="">Genel (varsayılan)</option>
                      {categories.filter((category) => !category.isDefault).map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">Soru tipi</span>
                    <select
                      data-testid={`bulk-question-type-${questionIndex}`}
                      className={inputCls}
                      value={question.qtype}
                      onChange={(e) => updateBulkQuestion(question.draft_id, { qtype: e.target.value })}
                    >
                      <option value="multiple_choice">Çoktan Seçmeli</option>
                      <option value="free_text">Serbest Metin</option>
                    </select>
                  </label>
                </div>
                <textarea
                  data-testid={`bulk-question-text-${questionIndex}`}
                  className={inputCls + " mt-3 min-h-[76px]"}
                  placeholder="Soru metni"
                  value={question.text}
                  onChange={(e) => updateBulkQuestion(question.draft_id, { text: e.target.value })}
                />
                {question.qtype === "multiple_choice" && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-slate-400">Seçenekler — doğru cevabı işaretleyin</p>
                    {question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`bulk-correct-${question.draft_id}`}
                          checked={question.correct_index === optionIndex}
                          onChange={() => updateBulkQuestion(question.draft_id, { correct_index: optionIndex })}
                          className="accent-emerald-600"
                        />
                        <input
                          className={inputCls}
                          placeholder={`Seçenek ${optionIndex + 1}`}
                          value={option}
                          onChange={(e) => updateBulkOption(question.draft_id, optionIndex, e.target.value)}
                        />
                        {question.options.length > 2 && (
                          <button
                            type="button"
                            aria-label="Seçeneği sil"
                            onClick={() => updateBulkQuestion(question.draft_id, {
                              options: question.options.filter((_, index) => index !== optionIndex),
                              correct_index: 0,
                            })}
                            className="p-2 text-slate-300 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateBulkQuestion(question.draft_id, { options: [...question.options, ""] })}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      + Seçenek ekle
                    </button>
                  </div>
                )}
                {bulkQuestionValidationMessages(question).length > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-xs leading-relaxed text-slate-600 shadow-sm animate-in fade-in slide-in-from-top-1 duration-500">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                    <div>
                      {bulkQuestionValidationMessages(question).map((message) => (
                        <p key={message}>{message}</p>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ))}
            <button
              type="button"
              data-testid="bulk-add-another-question"
              disabled={bulkQuestions.length >= 50}
              onClick={() => setBulkQuestions((current) => {
                const previous = current[current.length - 1];
                return [
                  ...current,
                  newBulkDraft(previous?.category_id || "", previous?.qtype || "multiple_choice"),
                ];
              })}
              className="w-full rounded-xl border border-dashed border-brand-300 px-4 py-3 text-sm font-medium text-brand-700 hover:border-brand-500 hover:bg-brand-50/50 disabled:opacity-40"
            >
              + Başka bir soru ekle
            </button>
            <div className="sticky bottom-0 -mx-1 flex flex-col gap-3 rounded-xl border border-navy-900/10 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-slate-500">
                {bulkQuestions.filter(bulkQuestionStarted).some((question) => !bulkQuestionValid(question)) ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-500 animate-in fade-in slide-in-from-bottom-1 duration-500">
                    <Info className="h-3.5 w-3.5 text-sky-500" />
                    Kaydetmeden önce eksik alanları tamamlayın.
                  </span>
                ) : (
                  <>{bulkQuestions.filter(bulkQuestionStarted).length} soru kaydedilecek</>
                )}
              </span>
              <button
                data-testid="bulk-questions-save-btn"
                className={btnPrimary + " sm:min-w-48"}
                disabled={
                  bulkSaving ||
                  bulkQuestions.filter(bulkQuestionStarted).length === 0 ||
                  bulkQuestions.filter(bulkQuestionStarted).some((question) => !bulkQuestionValid(question))
                }
                onClick={saveBulkQuestions}
              >
                {bulkSaving ? "Sorular kaydediliyor..." : "Soruları Kaydet"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modal} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader><DialogTitle>{modal?.question_id ? "Soruyu Düzenle" : "Yeni Soru"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {!modal?.question_id && (
              <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3.5 py-3 text-xs leading-relaxed text-slate-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                <span>Kategori seçmezseniz soru Genel kategorisine eklenir. Soru tipini seçip içeriği doldurarak başlayabilirsiniz.</span>
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">Kategori</span>
              <select data-testid="question-category-select" className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Genel (varsayılan)</option>
                {categories.filter((category) => !category.isDefault).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <textarea data-testid="question-text-input" className={inputCls + " min-h-[80px]"} placeholder="Soru metni" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
            <select data-testid="question-type-select" className={inputCls} value={form.qtype} onChange={(e) => setForm({ ...form, qtype: e.target.value })}>
              <option value="multiple_choice">Çoktan Seçmeli</option>
              <option value="free_text">Serbest Metin</option>
            </select>
            <p className="-mt-2 text-xs leading-relaxed text-slate-400">
              {form.qtype === "multiple_choice"
                ? "En az iki seçenek ekleyin ve doğru cevabı işaretleyin."
                : "Serbest metin sorularında seçenek veya doğru cevap tanımlamanız gerekmez."}
            </p>
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
            {bulkQuestionValidationMessages(form).length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2.5 text-xs leading-relaxed text-slate-600 shadow-sm animate-in fade-in slide-in-from-top-1 duration-500">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
                <div>
                  {bulkQuestionValidationMessages(form).map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              </div>
            )}
            <button data-testid="question-save-btn" className={btnPrimary + " w-full"} disabled={!bulkQuestionStarted(form) || !bulkQuestionValid(form)} onClick={save}>
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
