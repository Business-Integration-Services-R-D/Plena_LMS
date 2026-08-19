import { describe, expect, it } from "vitest";
import {
  checkExamGate,
  gradeAttempt,
  requiresRewatchAfterFailure,
  resolveExamSettings,
  type ExamGateInput,
} from "./exam";

const NOW = new Date("2026-06-15T12:00:00Z");
const YESTERDAY = new Date("2026-06-14T12:00:00Z");
const TOMORROW = new Date("2026-06-16T12:00:00Z");

function enrollment(overrides: Partial<ExamGateInput> = {}): ExamGateInput {
  return {
    startsAt: YESTERDAY,
    dueAt: TOMORROW,
    passed: false,
    videoCompleted: true,
    attemptCount: 0,
    ...overrides,
  };
}

describe("resolveExamSettings", () => {
  const course = {
    questionPoolId: "pool-eski",
    questionCount: 5,
    passPercent: 70,
    maxAttempts: 2,
  };

  it("Exam kaydı varsa onun ayarlarını kullanır", () => {
    const settings = resolveExamSettings(course, {
      questionPoolId: "pool-yeni",
      questionCount: 10,
      passPercent: 90,
      maxAttempts: 3,
      durationMinutes: 30,
      retakePolicy: "VIDEO_AND_TEST",
      scoringMode: "PER_QUESTION",
    });

    expect(settings.questionPoolId).toBe("pool-yeni");
    expect(settings.passPercent).toBe(90);
    expect(settings.durationMinutes).toBe(30);
    expect(settings.retakePolicy).toBe("VIDEO_AND_TEST");
    expect(settings.scoringMode).toBe("PER_QUESTION");
  });

  it("Exam kaydı yoksa Course üzerindeki eski ayarlara düşer", () => {
    const settings = resolveExamSettings(course, null);

    expect(settings.questionPoolId).toBe("pool-eski");
    expect(settings.questionCount).toBe(5);
    expect(settings.passPercent).toBe(70);
    expect(settings.maxAttempts).toBe(2);
    expect(settings.retakePolicy).toBe("TEST_ONLY");
    expect(settings.durationMinutes).toBeNull();
  });

  it("baraj puanını sabit bir değere zorlamaz", () => {
    const settings = resolveExamSettings(
      { ...course, passPercent: 55 },
      null,
    );

    expect(settings.passPercent).toBe(55);
  });
});

describe("checkExamGate", () => {
  it("eğitim içeriği tamamlanmadan testi açmaz", () => {
    const gate = checkExamGate(
      enrollment({ videoCompleted: false }),
      { maxAttempts: 0 },
      NOW,
    );

    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toContain("Eğitim içeriği");
  });

  it("eğitim içeriği tamamlandıysa testi açar", () => {
    expect(checkExamGate(enrollment(), { maxAttempts: 0 }, NOW).allowed).toBe(true);
  });

  it("başlangıç tarihi gelmemişse video bitmiş olsa da açmaz", () => {
    const gate = checkExamGate(
      enrollment({ startsAt: TOMORROW, dueAt: null }),
      { maxAttempts: 0 },
      NOW,
    );

    expect(gate.allowed).toBe(false);
  });

  it("deneme hakkı dolduğunda kapatır", () => {
    const gate = checkExamGate(
      enrollment({ attemptCount: 3 }),
      { maxAttempts: 3 },
      NOW,
    );

    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toContain("Deneme hakkınız doldu");
  });

  it("hak dolmadan önceki son denemeye izin verir", () => {
    const gate = checkExamGate(
      enrollment({ attemptCount: 2 }),
      { maxAttempts: 3 },
      NOW,
    );

    expect(gate.allowed).toBe(true);
  });

  it("maxAttempts=0 sınırsız deneme demektir", () => {
    const gate = checkExamGate(
      enrollment({ attemptCount: 99 }),
      { maxAttempts: 0 },
      NOW,
    );

    expect(gate.allowed).toBe(true);
  });

  it("testi geçmiş kullanıcıyı deneme limiti nedeniyle engellemez", () => {
    const gate = checkExamGate(
      enrollment({ attemptCount: 5, passed: true }),
      { maxAttempts: 3 },
      NOW,
    );

    expect(gate.allowed).toBe(true);
  });
});

describe("gradeAttempt", () => {
  const questions = [
    { id: "q1", choices: [{ id: "a", isCorrect: true }, { id: "b", isCorrect: false }] },
    { id: "q2", choices: [{ id: "c", isCorrect: false }, { id: "d", isCorrect: true }] },
    { id: "q3", choices: [{ id: "e", isCorrect: true }, { id: "f", isCorrect: false }] },
    { id: "q4", choices: [{ id: "g", isCorrect: true }, { id: "h", isCorrect: false }] },
  ];

  it("doğru ve yanlışları sayıp yüzde hesaplar", () => {
    const result = gradeAttempt(
      questions,
      [
        { questionId: "q1", choiceId: "a" },
        { questionId: "q2", choiceId: "d" },
        { questionId: "q3", choiceId: "e" },
        { questionId: "q4", choiceId: "h" },
      ],
      80,
    );

    expect(result.correctCount).toBe(3);
    expect(result.wrongCount).toBe(1);
    expect(result.scorePercent).toBe(75);
    expect(result.passed).toBe(false);
  });

  it("baraja tam oturan skoru geçmiş sayar", () => {
    const result = gradeAttempt(
      questions,
      [
        { questionId: "q1", choiceId: "a" },
        { questionId: "q2", choiceId: "d" },
        { questionId: "q3", choiceId: "e" },
        { questionId: "q4", choiceId: "g" },
      ],
      100,
    );

    expect(result.scorePercent).toBe(100);
    expect(result.passed).toBe(true);
  });

  it("cevaplanmayan soruyu yanlış sayar ve boş şık kaydeder", () => {
    const result = gradeAttempt(
      questions,
      [{ questionId: "q1", choiceId: "a" }],
      80,
    );

    expect(result.correctCount).toBe(1);
    expect(result.wrongCount).toBe(3);
    expect(result.answers.find((a) => a.questionId === "q2")?.choiceId).toBeNull();
  });

  it("her soru için tam olarak bir cevap kaydı üretir", () => {
    const result = gradeAttempt(questions, [], 80);

    expect(result.answers).toHaveLength(questions.length);
  });

  it("soru yoksa sıfıra bölme yapmaz ve geçmiş saymaz", () => {
    const result = gradeAttempt([], [], 0);

    expect(result.scorePercent).toBe(0);
    expect(result.passed).toBe(false);
  });

  it("serbest metinde dolu cevabı doğru, boş cevabı yanlış sayar", () => {
    const mixed = [
      questions[0],
      { id: "ft", type: "FREE_TEXT" as const, choices: [] },
    ];

    const answered = gradeAttempt(
      mixed,
      [
        { questionId: "q1", choiceId: "a" },
        { questionId: "ft", textAnswer: "  kendi cumlelerimle cevap  " },
      ],
      100,
    );
    expect(answered.scorePercent).toBe(100);
    expect(answered.answers.find((a) => a.questionId === "ft")?.textAnswer).toBe(
      "kendi cumlelerimle cevap",
    );

    const blank = gradeAttempt(
      mixed,
      [
        { questionId: "q1", choiceId: "a" },
        { questionId: "ft", textAnswer: "   " },
      ],
      100,
    );
    expect(blank.scorePercent).toBe(50);
    expect(blank.passed).toBe(false);
  });

  it("AUTO modunda soru puanlarini yok sayar", () => {
    const weighted = [
      { ...questions[0], points: 9 },
      { ...questions[1], points: 1 },
    ];

    const result = gradeAttempt(
      weighted,
      [{ questionId: "q1", choiceId: "a" }],
      80,
      "AUTO",
    );

    expect(result.scorePercent).toBe(50);
  });

  it("PER_QUESTION modunda soru puanlarina gore agirlik verir", () => {
    const weighted = [
      { ...questions[0], points: 9 },
      { ...questions[1], points: 1 },
    ];

    const heavyCorrect = gradeAttempt(
      weighted,
      [{ questionId: "q1", choiceId: "a" }],
      80,
      "PER_QUESTION",
    );
    expect(heavyCorrect.scorePercent).toBe(90);
    expect(heavyCorrect.passed).toBe(true);

    const lightCorrect = gradeAttempt(
      weighted,
      [{ questionId: "q2", choiceId: "d" }],
      80,
      "PER_QUESTION",
    );
    expect(lightCorrect.scorePercent).toBe(10);
    expect(lightCorrect.passed).toBe(false);
  });
});

describe("requiresRewatchAfterFailure", () => {
  it("VIDEO_AND_TEST politikasında başarısız denemeden sonra videoyu tekrar ister", () => {
    expect(requiresRewatchAfterFailure({ retakePolicy: "VIDEO_AND_TEST" }, false)).toBe(true);
  });

  it("başarılı denemeden sonra video tekrarı istemez", () => {
    expect(requiresRewatchAfterFailure({ retakePolicy: "VIDEO_AND_TEST" }, true)).toBe(false);
  });

  it("TEST_ONLY politikasında video tekrarı istemez", () => {
    expect(requiresRewatchAfterFailure({ retakePolicy: "TEST_ONLY" }, false)).toBe(false);
  });
});
