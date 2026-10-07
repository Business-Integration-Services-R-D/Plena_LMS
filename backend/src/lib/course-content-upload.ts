import {
  AuditAction,
  EnrollmentStatus,
  VideoCompressionJobStatus,
  VideoProcessingStatus,
} from "@prisma/client";
import type { SessionUser } from "./auth";
import { recordAudit } from "./audit";
import { prisma } from "./prisma";

export class CourseContentUploadError extends Error {}

/** Publish an already-stored course file and enqueue video optimization. */
export async function publishCourseContent(input: {
  actor: SessionUser;
  courseId: string;
  storageKey: string;
  fileName: string;
  contentType: "video/mp4" | "video/webm" | "application/pdf";
  durationSec: number;
  pageCount: number | null;
  sizeBytes: number;
}) {
  const course = await prisma.course.findUnique({
    where: { id: input.courseId },
    include: { video: true },
  });
  if (!course) throw new CourseContentUploadError("Eğitim bulunamadı");

  const isPdf = input.contentType === "application/pdf";
  const previousWasPdf = Boolean(course.video?.pageCount);
  const contentKindChanged = Boolean(course.video) && previousWasPdf !== isPdf;
  const contentReplaced = Boolean(course.video);

  const video = await prisma.$transaction(async (tx) => {
    const current = await tx.video.findUnique({ where: { courseId: input.courseId } });
    const mediaVersion = (current?.mediaVersion ?? 0) + 1;
    const videoData = {
      storageKey: input.storageKey,
      sourceStorageKey: isPdf ? null : input.storageKey,
      fileName: input.fileName,
      contentType: input.contentType,
      durationSec: input.durationSec,
      pageCount: input.pageCount,
      sizeBytes: input.sizeBytes,
      sourceSizeBytes: isPdf ? null : input.sizeBytes,
      processingStatus: isPdf
        ? VideoProcessingStatus.READY
        : VideoProcessingStatus.QUEUED,
      processingError: null,
      mediaVersion,
    };
    const saved = current
      ? await tx.video.update({ where: { id: current.id }, data: videoData })
      : await tx.video.create({ data: { courseId: input.courseId, ...videoData } });

    await tx.videoCompressionJob.updateMany({
      where: {
        videoId: saved.id,
        status: VideoCompressionJobStatus.QUEUED,
      },
      data: {
        status: VideoCompressionJobStatus.STALE,
        error: "Yeni bir eğitim içeriği yüklendi",
      },
    });

    if (!isPdf) {
      await tx.videoCompressionJob.create({
        data: {
          videoId: saved.id,
          sourceStorageKey: input.storageKey,
          sourceSizeBytes: input.sizeBytes,
          mediaVersion,
        },
      });
    }

    if (contentReplaced) {
      await tx.checkpoint.deleteMany({ where: { courseId: input.courseId } });
      await tx.enrollment.updateMany({
        where: { courseId: input.courseId },
        data: {
          status: EnrollmentStatus.NOT_STARTED,
          positionSec: 0,
          maxReachedSec: 0,
          watchedPercent: 0,
          totalWatchedSec: 0,
          videoCompleted: false,
          attemptCount: 0,
          bestScorePercent: null,
          lastCorrectCount: null,
          lastWrongCount: null,
          passed: false,
          firstStartedAt: null,
          lastActivityAt: null,
          completedAt: null,
        },
      });
    }

    return saved;
  });

  await recordAudit({
    action: AuditAction.ADMIN_UPDATED_COURSE,
    actor: input.actor,
    entityType: "Course",
    entityId: input.courseId,
    metadata: {
      contentUploaded: true,
      contentType: input.contentType,
      contentKindChanged,
      contentReplaced,
      pageCount: input.pageCount,
      storageKey: input.storageKey,
      sizeBytes: input.sizeBytes,
    },
  });

  return video;
}
