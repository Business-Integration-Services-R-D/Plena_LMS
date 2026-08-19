import { RetakePolicy, ScoringMode } from "@prisma/client";
import { checkWindow, type EnrollmentWindow } from "./window";

/**
 * Sınav kuralları. Saf fonksiyonlar: DB'ye dokunmaz.
 *
 * Sınav ayarlarının kaynağı Exam tablosudur. Exam kaydı olmayan eski
 * eğitimlerde Course üzerindeki eski alanlara düşülür.
 */

export type ExamSettings = {
  questionPoolId: string | null;
  /** 0 = havuzdaki tüm sorular. */
  questionCount: number;
  passPercent: number;
  /** 0 = sınırsız deneme. */
  maxAttempts: number;
  durationMinutes: number | null;
  retakePolicy: RetakePolicy;
  scoringMode: ScoringMode;
};

type CourseFallback = {
  questionPoolId: string | null;
  questionCount: number;
  passPercent: number;
  maxAttempts: number;
};

type ExamRow = CourseFallback & {
  durationMinutes: number | null;
  retakePolicy: RetakePolicy;
  scoringMode: ScoringMode;
};

/** Exam varsa onu, yoksa Course üzerindeki eski ayarları döner. */
export function resolveExamSettings(
  course: CourseFallback,
  exam: ExamRow | null | undefined,
): ExamSettings {
  if (exam) {
    return {
      questionPoolId: exam.questionPoolId,
      questionCount: exam.questionCount,
      passPercent: exam.passPercent,
      maxAttempts: exam.maxAttempts,
      durationMinutes: exam.durationMinutes,
      retakePolicy: exam.retakePolicy,
      scoringMode: exam.scoringMode,
    };
  }

  return {
    questionPoolId: course.questionPoolId,
    questionCount: course.questionCount,
    passPercent: course.passPercent,
    maxAttempts: course.maxAttempts,
    durationMinutes: null,
    retakePolicy: RetakePolicy.TEST_ONLY,
    scoringMode: ScoringMode.AUTO,
  };
}

/**
 * Kullanıcıya kaç soru sorulacak. questionCount 0 ise havuzun tamamı sorulur;
 * havuzda olandan fazla soru istenemez.
 */
export function effectiveQuestionCount(
  settings: Pick<ExamSettings, "questionCount">,
  poolTotal: number,
): number {
  if (settings.questionCount <= 0) return poolTotal;
  return Math.min(settings.questionCount, poolTotal);
}

export type ExamGateInput = EnrollmentWindow & {
  videoCompleted: boolean;
  attemptCount: number;
};

export type ExamGate =
  | { allowed: true }
  | { allowed: false; reason: string; status: 403 };

function denied(reason: string): ExamGate {
  return { allowed: false, reason, status: 403 };
}

/**
 * Kullanıcı şu an teste girebilir mi?
 *
 * Sırasıyla: atama penceresi açık olmalı, eğitim içeriği tamamlanmış olmalı ve
 * deneme hakkı kalmış olmalı. Testi zaten geçmiş kullanıcı deneme hakkından
 * bağımsız olarak sonucunu görmeye devam edebilir.
 */
export function checkExamGate(
  enrollment: ExamGateInput,
  settings: Pick<ExamSettings, "maxAttempts">,
  now: Date = new Date(),
): ExamGate {
  const window = checkWindow(enrollment, now);
  if (!window.open) return denied(window.reason);

  if (!enrollment.videoCompleted) {
    return denied("Eğitim içeriği tamamlanmadan teste geçilemez");
  }

  const { maxAttempts } = settings;
  if (
    !enrollment.passed &&
    maxAttempts > 0 &&
    enrollment.attemptCount >= maxAttempts
  ) {
    return denied(
      `Deneme hakkınız doldu (${maxAttempts}). Yönetici ile iletişime geçin.`,
    );
  }

  return { allowed: true };
}

export type GradedAnswer = {
  questionId: string;
  choiceId: string | null;
  textAnswer: string | null;
  isCorrect: boolean;
};

export type GradedAttempt = {
  answers: GradedAnswer[];
  correctCount: number;
  wrongCount: number;
  scorePercent: number;
  passed: boolean;
};

export type GradableQuestion = {
  id: string;
  type?: "MULTIPLE_CHOICE" | "FREE_TEXT";
  /** PER_QUESTION modunda ağırlık; verilmezse 1 sayılır. */
  points?: number;
  choices: Array<{ id: string; isCorrect: boolean }>;
};

/** Sorunun skora katkısı. AUTO modunda her soru eşit ağırlık taşır. */
function questionWeight(
  question: GradableQuestion,
  scoringMode: ScoringMode,
): number {
  if (scoringMode === ScoringMode.AUTO) return 1;
  const points = question.points ?? 1;
  return points > 0 ? points : 0;
}

/**
 * Cevapları puanlar. Cevaplanmamış veya doğru şıkkı tanımsız soru yanlış sayılır.
 * Serbest metin (FREE_TEXT) soruların doğru cevabı yoktur; boş olmayan cevap
 * sorunun tam puanını kazanır.
 */
export function gradeAttempt(
  questions: GradableQuestion[],
  submitted: Array<{ questionId: string; choiceId?: string | null; textAnswer?: string | null }>,
  passPercent: number,
  scoringMode: ScoringMode = ScoringMode.AUTO,
): GradedAttempt {
  const answers: GradedAnswer[] = questions.map((question) => {
    const given = submitted.find((a) => a.questionId === question.id);
    if (question.type === "FREE_TEXT") {
      const textAnswer = given?.textAnswer?.trim() || null;
      return {
        questionId: question.id,
        choiceId: null,
        textAnswer,
        isCorrect: Boolean(textAnswer),
      };
    }
    const correctChoice = question.choices.find((c) => c.isCorrect);
    return {
      questionId: question.id,
      choiceId: given?.choiceId ?? null,
      textAnswer: null,
      isCorrect: Boolean(
        given && correctChoice && given.choiceId === correctChoice.id,
      ),
    };
  });

  const correctIds = new Set(
    answers.filter((a) => a.isCorrect).map((a) => a.questionId),
  );
  let totalWeight = 0;
  let earnedWeight = 0;
  for (const question of questions) {
    const weight = questionWeight(question, scoringMode);
    totalWeight += weight;
    if (correctIds.has(question.id)) earnedWeight += weight;
  }

  const correctCount = correctIds.size;
  const scorePercent = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;

  return {
    answers,
    correctCount,
    wrongCount: questions.length - correctCount,
    scorePercent,
    passed: totalWeight > 0 && scorePercent >= passPercent,
  };
}

/**
 * Başarısız denemeden sonra kullanıcının videoyu baştan izlemesi gerekiyor mu?
 * VIDEO_AND_TEST politikasında ilerleme sıfırlanır, izlenen toplam süre korunur.
 */
export function requiresRewatchAfterFailure(
  settings: Pick<ExamSettings, "retakePolicy">,
  passed: boolean,
): boolean {
  return !passed && settings.retakePolicy === RetakePolicy.VIDEO_AND_TEST;
}
