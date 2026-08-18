import {
  EnrollmentStatus,
  NotificationKind,
  Prisma,
} from "@prisma/client";
import { prisma } from "./prisma";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_APP_TIMEZONE = "Europe/Istanbul";

function timezone() {
  const configured = process.env.APP_TIMEZONE || DEFAULT_APP_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: configured }).format();
    return configured;
  } catch {
    console.error(
      `Geçersiz APP_TIMEZONE değeri "${configured}", ${DEFAULT_APP_TIMEZONE} kullanılacak`,
    );
    return DEFAULT_APP_TIMEZONE;
  }
}

function calendarParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

export function calendarDateKey(
  date: Date,
  timeZone = DEFAULT_APP_TIMEZONE,
) {
  const { year, month, day } = calendarParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function calendarDaysBetween(
  from: Date,
  to: Date,
  timeZone = DEFAULT_APP_TIMEZONE,
) {
  const fromParts = calendarParts(from, timeZone);
  const toParts = calendarParts(to, timeZone);
  const fromDay = Date.UTC(
    fromParts.year,
    fromParts.month - 1,
    fromParts.day,
  );
  const toDay = Date.UTC(toParts.year, toParts.month - 1, toParts.day);
  return Math.round((toDay - fromDay) / DAY_MS);
}

export function trainingStartDedupeKey(
  enrollmentId: string,
  startsAt: Date,
) {
  return `enrollment:${enrollmentId}:start:${startsAt.toISOString()}`;
}

export function dueReminderDedupeKey(
  enrollmentId: string,
  dueAt: Date,
  now: Date,
  timeZone = DEFAULT_APP_TIMEZONE,
) {
  return `enrollment:${enrollmentId}:due:${calendarDateKey(dueAt, timeZone)}:${calendarDateKey(now, timeZone)}`;
}

export function dueReminderDays(input: {
  now: Date;
  dueAt: Date | null;
  reminderDays: number;
  passed: boolean;
  status: EnrollmentStatus;
  timeZone?: string;
}) {
  if (
    !input.dueAt ||
    input.reminderDays <= 0 ||
    input.passed ||
    input.status === EnrollmentStatus.COMPLETED ||
    input.dueAt <= input.now
  ) {
    return null;
  }

  const daysRemaining = calendarDaysBetween(
    input.now,
    input.dueAt,
    input.timeZone || DEFAULT_APP_TIMEZONE,
  );
  return daysRemaining >= 1 && daysRemaining <= input.reminderDays
    ? daysRemaining
    : null;
}

export async function syncUserNotifications(
  userId: string,
  now = new Date(),
) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      userId,
      startsAt: { lte: now },
      course: { active: true },
    },
    select: {
      id: true,
      courseId: true,
      startsAt: true,
      dueAt: true,
      reminderDays: true,
      status: true,
      passed: true,
      course: { select: { title: true } },
    },
  });

  const timeZone = timezone();
  const notifications: Prisma.UserNotificationCreateManyInput[] = [];

  for (const enrollment of enrollments) {
    notifications.push({
      userId,
      kind: NotificationKind.TRAINING_STARTED,
      dedupeKey: trainingStartDedupeKey(
        enrollment.id,
        enrollment.startsAt,
      ),
      title: "Eğitiminiz başladı",
      body: `"${enrollment.course.title}" eğitiminiz başladı. Eğitimi tamamlamak için şimdi başlayabilirsiniz.`,
      link: `/trainings/${enrollment.courseId}/watch`,
      occurredAt: enrollment.startsAt,
      metadata: {
        enrollmentId: enrollment.id,
        courseId: enrollment.courseId,
        courseTitle: enrollment.course.title,
      },
    });

    const daysRemaining = dueReminderDays({
      now,
      dueAt: enrollment.dueAt,
      reminderDays: enrollment.reminderDays,
      passed: enrollment.passed,
      status: enrollment.status,
      timeZone,
    });
    if (daysRemaining === null || !enrollment.dueAt) continue;

    notifications.push({
      userId,
      kind: NotificationKind.DUE_REMINDER,
      dedupeKey: dueReminderDedupeKey(
        enrollment.id,
        enrollment.dueAt,
        now,
        timeZone,
      ),
      title: `Eğitimi tamamlamak için son ${daysRemaining} gün`,
      body: `"${enrollment.course.title}" eğitiminin son tarihi yaklaşıyor.`,
      link: `/trainings/${enrollment.courseId}/watch`,
      occurredAt: now,
      metadata: {
        enrollmentId: enrollment.id,
        courseId: enrollment.courseId,
        courseTitle: enrollment.course.title,
        dueAt: enrollment.dueAt.toISOString(),
        daysRemaining,
      },
    });
  }

  if (notifications.length === 0) return 0;
  const result = await prisma.userNotification.createMany({
    data: notifications,
    skipDuplicates: true,
  });
  return result.count;
}
