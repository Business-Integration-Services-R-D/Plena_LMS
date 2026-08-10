"use client";

import { useEffect, useRef, useState } from "react";

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

    const sendProgress = async (eventType: "HEARTBEAT" | "END") => {
      await fetch(`/api/captain/courses/${courseId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionSec: video.currentTime,
          eventType,
        }),
      });
    };

    const onTimeUpdate = () => {
      if (video.currentTime > maxRef.current + 0.35) {
        // Block forward seek
        video.currentTime = maxRef.current;
        setMessage("İleri sarma engellendi — eğitimi sırayla izlemelisiniz.");
        return;
      }
      if (video.currentTime > maxRef.current) {
        maxRef.current = video.currentTime;
      }
      const pct = Math.min(100, (maxRef.current / Math.max(durationSec, 1)) * 100);
      setWatchedPercent(pct);
      if (pct >= 99.5) onCompleted();
    };

    const onSeeking = () => {
      if (video.currentTime > maxRef.current + 0.35) {
        video.currentTime = maxRef.current;
        setMessage("İleri sarma engellendi — eğitimi sırayla izlemelisiniz.");
      }
    };

    const interval = setInterval(() => {
      if (!video.paused) void sendProgress("HEARTBEAT");
    }, 4000);

    const onPause = () => void sendProgress("HEARTBEAT");
    const onEnded = () => {
      maxRef.current = durationSec;
      setWatchedPercent(100);
      onCompleted();
      void sendProgress("END");
    };

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
      void sendProgress("HEARTBEAT");
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
