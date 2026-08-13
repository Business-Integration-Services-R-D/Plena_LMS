"use client";

import { useEffect, useRef, useState } from "react";

type WatchEvent = "HEARTBEAT" | "PAUSE" | "SEEK_BLOCKED" | "EXIT" | "COMPLETE";

type Props = {
  courseId: string;
  src: string;
  durationSec: number;
  initialPosition: number;
  maxReachedSec: number;
  onCompleted: () => void;
};

export function VideoPlayer({
  courseId,
  src,
  durationSec,
  initialPosition,
  maxReachedSec,
  onCompleted,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const maxRef = useRef(maxReachedSec);
  const completedRef = useRef(false);
  const [watchedPercent, setWatchedPercent] = useState(
    Math.min(100, (maxReachedSec / Math.max(durationSec, 1)) * 100),
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    maxRef.current = maxReachedSec;
  }, [maxReachedSec]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const startAt = Math.min(initialPosition, maxReachedSec);
    const onLoaded = () => {
      video.currentTime = startAt;
    };
    video.addEventListener("loadedmetadata", onLoaded);
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [initialPosition, maxReachedSec, src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sendProgress = async (eventType: WatchEvent, positionSec?: number) => {
      await fetch(`/api/user/courses/${courseId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionSec: positionSec ?? video.currentTime,
          eventType,
        }),
      });
    };

    const markCompleted = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      maxRef.current = Math.max(maxRef.current, video.duration || durationSec);
      setWatchedPercent(100);
      onCompleted();
      void sendProgress("COMPLETE", maxRef.current);
    };

    const onTimeUpdate = () => {
      if (video.currentTime > maxRef.current + 0.35) {
        video.currentTime = maxRef.current;
        setMessage("İleri sarma engellendi — eğitimi sırayla izlemelisiniz.");
        return;
      }
      if (video.currentTime > maxRef.current) {
        maxRef.current = video.currentTime;
      }
      // Gerçek video süresi, kaydedilen tam sayı süreden kısa olabilir; bu yüzden
      // yüzdeyi oynatıcının bildirdiği süreye göre hesaplıyoruz.
      const total = Math.max(video.duration || durationSec, 1);
      const pct = Math.min(100, (maxRef.current / total) * 100);
      setWatchedPercent(pct);
      if (total - maxRef.current <= 0.5) markCompleted();
    };

    const onSeeking = () => {
      if (video.currentTime > maxRef.current + 0.35) {
        video.currentTime = maxRef.current;
        setMessage("İleri sarma engellendi — eğitimi sırayla izlemelisiniz.");
        void sendProgress("SEEK_BLOCKED");
      }
    };

    const interval = setInterval(() => {
      if (!video.paused) void sendProgress("HEARTBEAT");
    }, 2000);

    const onPause = () => {
      if (!completedRef.current) void sendProgress("PAUSE");
    };
    const onEnded = () => markCompleted();

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    return () => {
      clearInterval(interval);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      void sendProgress("EXIT");
    };
  }, [courseId, durationSec, onCompleted]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-sea-200 bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          className="aspect-video w-full"
          playsInline
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sea-100">
          <div
            className="h-full bg-sea-600 transition-all"
            style={{ width: `${watchedPercent}%` }}
          />
        </div>
        <span className="tabular-nums text-sea-700">{watchedPercent.toFixed(0)}%</span>
      </div>
      {message ? <p className="text-sm text-amber-700">{message}</p> : null}
    </div>
  );
}
