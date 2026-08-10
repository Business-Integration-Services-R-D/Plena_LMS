"use client";

import { FormEvent, useEffect, useState } from "react";
import { addQuestionAction, createCourseAction } from "./actions";

type Course = {
  id: string;
  title: string;
  description: string;
  passPercent: number;
  video?: { durationSec: number; fileName: string } | null;
  questions: { id: string; prompt: string }[];
  _count: { assignments: number };
};

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [passPercent, setPassPercent] = useState("80");
  const [file, setFile] = useState<File | null>(null);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState("Doğru cevap|1\nYanlış A|0\nYanlış B|0");
  const [msg, setMsg] = useState("");
  const [readingDuration, setReadingDuration] = useState(false);

  function formatDuration(totalSec: number) {
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes} dk ${seconds.toString().padStart(2, "0")} sn`;
  }

  async function load() {
    const res = await fetch("/api/admin/courses");
    const data = await res.json();
    setCourses(data);
    if (!selectedCourse && data[0]) setSelectedCourse(data[0].id);
  }

  useEffect(() => {
    void load();
  }, []);

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

  async function onAddQuestion(e: FormEvent) {
    e.preventDefault();
    if (!selectedCourse) {
      setMsg("Önce bir eğitim seçin");
      return;
    }
    const parsed = choices
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [text, flag] = line.split("|");
        return { text: (text || "").trim(), isCorrect: flag?.trim() === "1" };
      });
    const result = await addQuestionAction({
      courseId: selectedCourse,
      prompt,
      choices: parsed,
    });
    if (result.ok) {
      setMsg("Soru eklendi");
      setPrompt("");
      await load();
    } else {
      setMsg(result.error || "Soru eklenemedi");
    }
  }

  return (
    <div className="space-y-6">
      {msg ? <p className="rounded-xl bg-sea-50 px-4 py-2 text-sm text-sea-800">{msg}</p> : null}
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
                  value={
                    durationSec
                      ? formatDuration(Number(durationSec))
                      : ""
                  }
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
            <button
              type="submit"
              disabled={readingDuration || !durationSec}
              className="rounded-xl bg-sea-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {readingDuration ? "Süre okunuyor..." : "Yükle"}
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-sea-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Soru ekle</h2>
          <form onSubmit={onAddQuestion} className="mt-4 space-y-3">
            <select
              className="w-full rounded-xl border border-sea-200 px-3 py-2"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
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
            <textarea
              className="h-28 w-full rounded-xl border border-sea-200 px-3 py-2 font-mono text-xs"
              value={choices}
              onChange={(e) => setChoices(e.target.value)}
              placeholder="Şık|1 (doğru) veya Şık|0"
            />
            <button type="submit" className="rounded-xl bg-sea-700 px-4 py-2 text-white">
              Soru kaydet
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Eğitim listesi</h2>
        <div className="mt-4 space-y-3">
          {courses.map((c) => (
            <div key={c.id} className="rounded-2xl border border-sea-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{c.title}</h3>
                <span className="text-xs text-sea-500">
                  {formatDuration(c.video?.durationSec || 0)} · {c.questions.length} soru ·{" "}
                  {c._count.assignments} atama · baraj %{c.passPercent}
                </span>
              </div>
              <p className="mt-1 text-sm text-sea-600">{c.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
