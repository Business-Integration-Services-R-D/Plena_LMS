"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Quiz = {
  courseId: string;
  title: string;
  passPercent: number;
  maxAttempts: number;
  attemptNo: number;
  durationMinutes: number | null;
  retakePolicy: string;
  questions: {
    id: string;
    prompt: string;
    choices: { id: string; text: string }[];
  }[];
};

type Result = {
  attempt: {
    scorePercent: number;
    passed: boolean;
    attemptNo: number;
    correctCount: number;
    wrongCount: number;
  };
  passPercent: number;
  maxAttempts: number;
  attemptsLeft: number | null;
  mustRewatchVideo: boolean;
};

export default function QuizPage() {
  const params = useParams<{ id: string }>();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    void fetch(`/api/user/courses/${params.id}/quiz`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Test açılamadı");
        return res.json();
      })
      .then(setQuiz)
      .catch((e: Error) => setError(e.message));
  }, [params.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!quiz) return;
    const payload = {
      answers: quiz.questions.map((q) => ({
        questionId: q.id,
        choiceId: answers[q.id],
      })),
    };
    if (payload.answers.some((a) => !a.choiceId)) {
      setError("Tüm soruları cevaplayın");
      return;
    }
    const res = await fetch(`/api/user/courses/${params.id}/quiz`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Gönderilemedi");
      return;
    }
    setResult(data);
  }

  if (error && !quiz) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
        <p>{error}</p>
        <Link href={`/user/courses/${params.id}`} className="mt-3 inline-block underline">
          Videoya dön
        </Link>
      </div>
    );
  }

  if (!quiz) return <p className="text-sm text-sea-600">Test yükleniyor...</p>;

  if (result) {
    return (
      <section className="rounded-3xl border border-sea-200 bg-white p-6">
        <h2 className="text-xl font-semibold">Test sonucu</h2>
        <p className="mt-3 text-3xl font-semibold">
          %{result.attempt.scorePercent.toFixed(0)}{" "}
          <span className="text-base font-normal text-sea-600">
            ({result.attempt.passed ? "GEÇTİ" : "KALDI"})
          </span>
        </p>
        <p className="mt-2 text-sm text-sea-600">
          Deneme #{result.attempt.attemptNo} · {result.attempt.correctCount} doğru /{" "}
          {result.attempt.wrongCount} yanlış · baraj %{result.passPercent}
          {result.attemptsLeft !== null
            ? ` · kalan hak: ${result.attemptsLeft}`
            : ""}
        </p>

        {result.mustRewatchVideo ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Bu eğitimin tekrar kuralı gereği yeniden teste girmeden önce videoyu
            baştan izlemeniz gerekiyor.
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <Link href="/user" className="rounded-xl bg-sea-700 px-4 py-2 text-white">
            Eğitimlerime dön
          </Link>
          {!result.attempt.passed && result.mustRewatchVideo ? (
            <Link
              href={`/user/courses/${params.id}`}
              className="rounded-xl border border-sea-200 px-4 py-2"
            >
              Videoyu baştan izle
            </Link>
          ) : null}
          {!result.attempt.passed && !result.mustRewatchVideo ? (
            <button
              type="button"
              className="rounded-xl border border-sea-200 px-4 py-2"
              onClick={() => {
                setResult(null);
                setAnswers({});
                setError("");
              }}
            >
              Tekrar dene
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-xl font-semibold">{quiz.title} — Test</h2>
        <p className="mt-1 text-sm text-sea-600">
          Geçme barajı: %{quiz.passPercent} · Deneme #{quiz.attemptNo}
          {quiz.maxAttempts > 0 ? ` / ${quiz.maxAttempts}` : ""}
          {quiz.durationMinutes ? ` · süre ${quiz.durationMinutes} dk` : ""}
        </p>
      </section>

      {quiz.questions.map((q, idx) => (
        <section key={q.id} className="rounded-3xl border border-sea-200 bg-white p-5">
          <h3 className="font-medium">
            {idx + 1}. {q.prompt}
          </h3>
          <div className="mt-3 space-y-2">
            {q.choices.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-sea-100 px-3 py-2 hover:bg-sea-50"
              >
                <input
                  type="radio"
                  name={q.id}
                  value={c.id}
                  checked={answers[q.id] === c.id}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: c.id }))}
                />
                <span className="text-sm">{c.text}</span>
              </label>
            ))}
          </div>
        </section>
      ))}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button type="submit" className="rounded-xl bg-sea-700 px-5 py-2.5 text-white">
        Testi gönder
      </button>
    </form>
  );
}
