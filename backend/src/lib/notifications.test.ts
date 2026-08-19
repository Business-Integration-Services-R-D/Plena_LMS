import { EnrollmentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  calendarDateKey,
  calendarDaysBetween,
  dueReminderDays,
  dueReminderDedupeKey,
  trainingStartDedupeKey,
} from "./notifications";

const ISTANBUL = "Europe/Istanbul";

describe("notification calendar helpers", () => {
  it("uses the Istanbul calendar day instead of UTC", () => {
    expect(
      calendarDateKey(new Date("2026-08-18T21:30:00.000Z"), ISTANBUL),
    ).toBe("2026-08-19");
  });

  it("calculates calendar-day countdowns across different clock times", () => {
    const now = new Date("2026-08-18T22:30:00.000Z"); // 19 Aug, 01:30
    const dueAt = new Date("2026-08-21T20:00:00.000Z"); // 21 Aug, 23:00

    expect(calendarDaysBetween(now, dueAt, ISTANBUL)).toBe(2);
  });

  it("returns daily 3, 2, 1 countdown values inside the configured window", () => {
    const dueAt = new Date("2026-08-22T09:00:00.000Z");
    const remaining = [
      "2026-08-19T09:00:00.000Z",
      "2026-08-20T09:00:00.000Z",
      "2026-08-21T09:00:00.000Z",
    ].map((now) =>
      dueReminderDays({
        now: new Date(now),
        dueAt,
        reminderDays: 3,
        passed: false,
        status: EnrollmentStatus.NOT_STARTED,
        timeZone: ISTANBUL,
      }),
    );

    expect(remaining).toEqual([3, 2, 1]);
  });

  it("suppresses reminders outside the window and after completion", () => {
    const base = {
      now: new Date("2026-08-19T09:00:00.000Z"),
      dueAt: new Date("2026-08-22T09:00:00.000Z"),
      reminderDays: 2,
      passed: false,
      status: EnrollmentStatus.NOT_STARTED,
      timeZone: ISTANBUL,
    };

    expect(dueReminderDays(base)).toBeNull();
    expect(
      dueReminderDays({
        ...base,
        reminderDays: 3,
        passed: true,
      }),
    ).toBeNull();
    expect(
      dueReminderDays({
        ...base,
        reminderDays: 3,
        status: EnrollmentStatus.COMPLETED,
      }),
    ).toBeNull();
  });

  it("builds stable event keys that change with the event day", () => {
    const dueAt = new Date("2026-08-22T09:00:00.000Z");
    const first = dueReminderDedupeKey(
      "enrollment-1",
      dueAt,
      new Date("2026-08-19T09:00:00.000Z"),
      ISTANBUL,
    );
    const second = dueReminderDedupeKey(
      "enrollment-1",
      dueAt,
      new Date("2026-08-20T09:00:00.000Z"),
      ISTANBUL,
    );

    expect(first).not.toBe(second);
    expect(
      trainingStartDedupeKey(
        "enrollment-1",
        new Date("2026-08-19T09:00:00.000Z"),
      ),
    ).toContain("enrollment-1:start");
  });
});
