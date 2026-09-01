"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { addQuestionAction, createCourseAction, createPoolAction } from "./actions";

type Course = {
  id: string;
  title: string;
  description: string;
  passPercent: number;
  maxAttempts: number;
  questionCount: number;
  durationMinutes: number | null;
  retakePolicy: string;
  category: { id: string; name: string } | null;
  video?: { durationSec: number; fileName: string } | null;
  pool: { id: string; name: string; total: number } | null;
  assignmentCount: number;
  enrollmentCount: number;
};

type Category = {
  id: string;
  name: string;
  description: string;
  courseCount: number;
};

type QuestionCategory = {
  id: string;
  name: string;
  description: string;
  questionCount: number;
};

type Pool = {
  id: string;
  name: string;
  description: string;
  questionCount: number;
  courseCount: number;
  questions: { id: string; prompt: string; choices: { id: string; text: string; isCorrect: boolean }[] }[];
};

function formatDuration(totalSec: number) {
  const minutes = Math.floor(totalSec / 60);
  const seconds = Math.round(totalSec % 60);
  return `${minutes} dk ${String(seconds).padStart(2, "0")} sn`;
}

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [questionCategories, setQuestionCategories] = useState<QuestionCategory[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [passPercent, setPassPercent] = useState("80");
  const [maxAttempts, setMaxAttempts] = useState("3");
  const [coursePoolId, setCoursePoolId] = useState("");
  const [questionCount, setQuestionCount] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [examDurationMinutes, setExamDurationMinutes] = useState("");
  const [retakePolicy, setRetakePolicy] = useState("TEST_ONLY");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [readingDuration, setReadingDuration] = useState(false);

  const [poolName, setPoolName] = useState("");
  const [poolDescription, setPoolDescription] = useState("");

  const [selectedPool, setSelectedPool] = useState("");
  const [selectedQuestionCategory, setSelectedQuestionCategory] = useState("");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState(["", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);

  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [c, p, cat, questionCat] = await Promise.all([
      fetch("/api/admin/courses").then((r) => r.json()),
      fetch("/api/admin/pools").then((r) => r.json()),
      fetch("/api/admin/categories").then((r) => r.json()),
      fetch("/api/admin/question-categories").then((r) => r.json()),
    ]);
    setCourses(c);
    setPools(p);
    setCategories(cat);
    setQuestionCategories(questionCat);
    setSelectedPool((prev) => prev || (p as Pool[])[0]?.id || "");
    setCoursePoolId((prev) => prev || (p as Pool[])[0]?.id || "");
  }, []);

  async function onCreateCategory() {
    const name = newCategoryName.trim();
    if (name.length < 2) {
      setMsg("Kategori adı en az 2 karakter olmalı");
      return;
    }
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setMsg((await res.json()).error || "Kategori oluşturulamadı");
      return;
    }
    const created: Category = await res.json();
    setNewCategoryName("");
    setCategoryId(created.id);
    setMsg("Kategori oluşturuldu");
    await load();
  }

  useEffect(() => {
    void load();
  }, [load]);

  function readVideoDuration(selected: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(selected);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const seconds = Math.max(1, Math.ceil(video.duration));
        URL.revokeObjectURL(url);
        resolve(seconds);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Video süresi okunamadı"));
      };
      video.src = url;
    });
  }

  async function onVideoSelected(selected: File | null) {
    setFile(selected);
    setDurationSec("");
    if (!selected) return;
    setReadingDuration(true);
    try {
      const seconds = await readVideoDuration(selected);
      setDurationSec(String(seconds));
      setMsg(`Video süresi otomatik alındı: ${formatDuration(seconds)}`);
    } catch {
      setMsg("Video süresi okunamadı — dosyayı tekrar seçin");
      setFile(null);
    } finally {
      setReadingDuration(false);
    }
  }

  async function onCreateCourse(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!durationSec) {
      setMsg("Video süresi henüz hazır değil");
      return;
    }
    setMsg("Yükleniyor...");

    const form = new FormData();
    form.set("title", title);
    form.set("description", description);
    form.set("durationSec", durationSec);
    form.set("passPercent", passPercent);
    form.set("maxAttempts", maxAttempts);
    form.set("questionPoolId", coursePoolId);
    form.set("questionCount", questionCount);
    form.set("categoryId", categoryId);
    form.set("durationMinutes", examDurationMinutes || "0");
    form.set("retakePolicy", retakePolicy);
    form.set("video", file);

    const result = await createCourseAction(form);
    if (result.ok) {
      setMsg("Eğitim oluşturuldu");
      setTitle("");
      setDescription("");
      setDurationSec("");
      setFile(null);
      await load();
    } else {
      setMsg(result.error || "Eğitim oluşturulamadı");
    }
  }

  async function onCreatePool(e: FormEvent) {
    e.preventDefault();
    const result = await createPoolAction({
      name: poolName,
      description: poolDescription,
    });
    if (result.ok) {
      setMsg("Soru havuzu oluşturuldu");
      setPoolName("");
      setPoolDescription("");
      await load();
    } else {
      setMsg(result.error);
    }
  }

  function updateChoice(index: number, value: string) {
    setChoices((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  function addChoice() {
    setChoices((prev) => [...prev, ""]);
  }

  function removeChoice(index: number) {
    setChoices((prev) => prev.filter((_, i) => i !== index));
    // Doğru cevap silinen şıktan sonraysa işaret kaymasın.
    setCorrectIndex((prev) => {
      if (index === prev) return 0;
      return index < prev ? prev - 1 : prev;
    });
  }

  async function onAddQuestion(e: FormEvent) {
    e.preventDefault();
    if (!selectedPool) {
      setMsg("Önce bir soru havuzu oluşturun");
      return;
    }

    const filled = choices
      .map((text, index) => ({ text: text.trim(), index }))
      .filter((c) => c.text.length > 0);

    if (filled.length < 2) {
      setMsg("En az 2 şık doldurmalısınız");
      return;
    }
    if (!filled.some((c) => c.index === correctIndex)) {
      setMsg("Doğru cevap olarak işaretlediğiniz şık boş, lütfen doldurun");
      return;
    }

    const result = await addQuestionAction({
      poolId: selectedPool,
      categoryId: selectedQuestionCategory,
      prompt,
      choices: filled.map((c) => ({
        text: c.text,
        isCorrect: c.index === correctIndex,
      })),
    });

    if (result.ok) {
      setMsg("Soru havuza eklendi");
      setPrompt("");
      setChoices(["", "", ""]);
      setCorrectIndex(0);
      await load();
    } else {
      setMsg(result.error);
    }
  }

  return (
    <div className="space-y-6">
      {msg ? (
        <p className="rounded-xl bg-sea-50 px-4 py-2 text-sm text-sea-800">{msg}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-sea-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Yeni eğitim + video</h2>
          <form onSubmit={onCreateCourse} className="mt-4 space-y-3">
            <input
              className="w-full rounded-xl border border-sea-200 px-3 py-2"
              placeholder="Başlık"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <textarea
              className="w-full rounded-xl border border-sea-200 px-3 py-2"
              placeholder="Açıklama"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <label className="block flex-1 text-sm">
                <span className="mb-1 block text-sea-600">Kategori</span>
                <select
                  className="w-full rounded-xl border border-sea-200 px-3 py-2"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Kategorisiz</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block flex-1 text-sm">
                <span className="mb-1 block text-sea-600">Yeni kategori</span>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-xl border border-sea-200 px-3 py-2"
                    placeholder="Kategori adı"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => void onCreateCategory()}
                    className="rounded-xl border border-sea-200 px-3 py-2 text-sm"
                  >
                    Ekle
                  </button>
                </div>
              </label>
            </div>

            <input
              type="file"
              accept="video/mp4,video/webm"
              onChange={(e) => void onVideoSelected(e.target.files?.[0] || null)}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-sea-600">Süre</span>
                <input
                  className="w-full rounded-xl border border-sea-200 bg-sea-50 px-3 py-2"
                  type="text"
                  value={durationSec ? formatDuration(Number(durationSec)) : ""}
                  readOnly
                  placeholder={readingDuration ? "Okunuyor..." : "Dosya seçince dolar"}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-sea-600">Geçme %</span>
                <input
                  className="w-full rounded-xl border border-sea-200 px-3 py-2"
                  type="number"
                  min={1}
                  max={100}
                  value={passPercent}
                  onChange={(e) => setPassPercent(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-sea-600">Soru havuzu</span>
                <select
                  className="w-full rounded-xl border border-sea-200 px-3 py-2"
                  value={coursePoolId}
                  onChange={(e) => setCoursePoolId(e.target.value)}
                >
                  <option value="">Havuz yok</option>
                  {pools.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.questionCount} soru)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-sea-600">Sorulacak soru (0 = hepsi)</span>
                <input
                  className="w-full rounded-xl border border-sea-200 px-3 py-2"
                  type="number"
                  min={0}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-sea-600">Deneme hakkı (0 = sınırsız)</span>
                <input
                  className="w-full rounded-xl border border-sea-200 px-3 py-2"
                  type="number"
                  min={0}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-sea-600">Sınav süresi dk (boş = sınırsız)</span>
                <input
                  className="w-full rounded-xl border border-sea-200 px-3 py-2"
                  type="number"
                  min={1}
                  value={examDurationMinutes}
                  onChange={(e) => setExamDurationMinutes(e.target.value)}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-sea-600">Tekrar kuralı</span>
              <select
                className="w-full rounded-xl border border-sea-200 px-3 py-2"
                value={retakePolicy}
                onChange={(e) => setRetakePolicy(e.target.value)}
              >
                <option value="TEST_ONLY">Sadece testi tekrar çözsün</option>
                <option value="VIDEO_AND_TEST">Videoyu baştan izleyip teste girsin</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={readingDuration || !durationSec}
              className="rounded-xl bg-sea-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {readingDuration ? "Süre okunuyor..." : "Yükle"}
            </button>
          </form>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-sea-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Yeni soru havuzu</h2>
            <form onSubmit={onCreatePool} className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-sea-200 px-3 py-2"
                placeholder="Havuz adı (ör. Emniyet Temel)"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                required
              />
              <input
                className="w-full rounded-xl border border-sea-200 px-3 py-2"
                placeholder="Açıklama"
                value={poolDescription}
                onChange={(e) => setPoolDescription(e.target.value)}
              />
              <button
                type="submit"
                className="rounded-xl border border-sea-300 px-4 py-2 text-sea-800"
              >
                Havuz oluştur
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-sea-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Havuza soru ekle</h2>
            <form onSubmit={onAddQuestion} className="mt-4 space-y-3">
              <select
                className="w-full rounded-xl border border-sea-200 px-3 py-2"
                value={selectedPool}
                onChange={(e) => setSelectedPool(e.target.value)}
              >
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.questionCount} soru)
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-xl border border-sea-200 px-3 py-2"
                value={selectedQuestionCategory}
                onChange={(e) => setSelectedQuestionCategory(e.target.value)}
              >
                <option value="">Genel (varsayılan)</option>
                {questionCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.questionCount} soru)
                  </option>
                ))}
              </select>
              <textarea
                className="w-full rounded-xl border border-sea-200 px-3 py-2"
                placeholder="Soru metni"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                required
              />

              <div className="space-y-2">
                <p className="text-sm text-sea-600">
                  Şıkları yazın, doğru cevabı solundaki daireden işaretleyin.
                </p>
                {choices.map((choice, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <label
                      className="flex cursor-pointer items-center gap-2"
                      title="Doğru cevap olarak işaretle"
                    >
                      <input
                        type="radio"
                        name="correctChoice"
                        className="h-4 w-4 accent-emerald-600"
                        checked={correctIndex === index}
                        onChange={() => setCorrectIndex(index)}
                      />
                      <span className="w-4 text-sm font-medium text-sea-500">
                        {String.fromCharCode(65 + index)}
                      </span>
                    </label>
                    <input
                      className={`flex-1 rounded-xl border px-3 py-2 ${
                        correctIndex === index
                          ? "border-emerald-400 bg-emerald-50"
                          : "border-sea-200"
                      }`}
                      placeholder={`${index + 1}. şık`}
                      value={choice}
                      onChange={(e) => updateChoice(index, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeChoice(index)}
                      disabled={choices.length <= 2}
                      className="rounded-lg px-2 py-1 text-sm text-rose-700 disabled:opacity-30"
                      title="Şıkkı sil"
                    >
                      Sil
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addChoice}
                  className="text-sm text-sea-700 hover:underline"
                >
                  + Şık ekle
                </button>
              </div>

              <button
                type="submit"
                className="rounded-xl bg-sea-700 px-4 py-2 text-white"
              >
                Soru kaydet
              </button>
            </form>
          </section>
        </div>
      </div>

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Eğitim listesi</h2>
        <div className="mt-4 space-y-3">
          {courses.map((c) => (
            <div key={c.id} className="rounded-2xl border border-sea-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">
                  {c.title}
                  {c.category ? (
                    <span className="ml-2 rounded-full bg-sea-100 px-2 py-0.5 text-xs font-normal text-sea-700">
                      {c.category.name}
                    </span>
                  ) : null}
                </h3>
                <span className="text-xs text-sea-500">
                  {formatDuration(c.video?.durationSec || 0)} ·{" "}
                  {c.pool
                    ? `${c.pool.name}: ${c.questionCount || c.pool.total} soru`
                    : "havuz atanmamış"}{" "}
                  · {c.enrollmentCount} kayıt · baraj %{c.passPercent}
                  {c.durationMinutes ? ` · sınav ${c.durationMinutes} dk` : ""}
                  {c.retakePolicy === "VIDEO_AND_TEST" ? " · tekrar: video+test" : ""}
                </span>
              </div>
              <p className="mt-1 text-sm text-sea-600">{c.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Soru havuzları</h2>
        <div className="mt-4 space-y-3">
          {pools.map((p) => (
            <div key={p.id} className="rounded-2xl border border-sea-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{p.name}</h3>
                <span className="text-xs text-sea-500">
                  {p.questionCount} soru · {p.courseCount} eğitimde kullanılıyor
                </span>
              </div>
              <ol className="mt-2 space-y-2 text-sm text-sea-600">
                {p.questions.map((q, i) => (
                  <li key={q.id}>
                    <span className="font-medium text-sea-800">
                      {i + 1}. {q.prompt}
                    </span>
                    <ul className="mt-1 space-y-0.5 pl-5">
                      {q.choices.map((c, ci) => (
                        <li
                          key={c.id}
                          className={
                            c.isCorrect ? "font-medium text-emerald-700" : undefined
                          }
                        >
                          {String.fromCharCode(65 + ci)}) {c.text}
                          {c.isCorrect ? " ✓" : ""}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
