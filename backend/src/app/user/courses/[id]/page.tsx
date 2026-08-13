"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { VideoPlayer } from "@/components/VideoPlayer";

type PlayData = {
  course: { id: string; title: string; description: string; passPercent: number };
  video: { id: string; durationSec: number; url: string };
  progress: {
    positionSec: number;
    maxReachedSec: number;
    watchedPercent: number;
    completed: boolean;
  };
};

export default function CoursePlayPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<PlayData | null>(null);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/user/courses/${params.id}/play`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Yüklenemedi");
        return res.json();
      })
      .then((d: PlayData) => {
        setData(d);
        setCompleted(d.progress.completed);
      })
      .catch((e: Error) => setError(e.message));
  }, [params.id]);

  const onCompleted = useCallback(() => setCompleted(true), []);

  if (error) {
    return <p className="rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-sea-600">Video hazırlanıyor...</p>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-sea-200 bg-white p-5">
        <h2 className="text-xl font-semibold">{data.course.title}</h2>
        <p className="mt-2 text-sm text-sea-600">{data.course.description}</p>
      </section>

      <VideoPlayer
        courseId={data.course.id}
        src={data.video.url}
        durationSec={data.video.durationSec}
        initialPosition={data.progress.positionSec}
        maxReachedSec={data.progress.maxReachedSec}
        onCompleted={onCompleted}
      />

      <section className="rounded-2xl border border-sea-200 bg-white p-4 text-sm">
        {completed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-emerald-700">
              Video tamamlandı. Şimdi başarı testine geçebilirsiniz (baraj %{data.course.passPercent}).
            </p>
            <Link
              href={`/user/courses/${data.course.id}/quiz`}
              className="rounded-xl bg-sea-700 px-4 py-2 text-white"
            >
              Teste başla
            </Link>
          </div>
        ) : (
          <p className="text-sea-600">
            Test kilidi aktif: videoyu %100 izlemeden sınava geçilemez. İleri sarma kapalıdır.
          </p>
        )}
      </section>
    </div>
  );
}
