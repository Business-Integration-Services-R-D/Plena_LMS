import { AssignmentTarget, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureStorage, uploadObject } from "../src/lib/storage";

const prisma = new PrismaClient();

const SAMPLE_VIDEO_URL = "https://samplelib.com/lib/preview/mp4/sample-5s.mp4";

async function fetchSampleVideo(): Promise<Buffer> {
  try {
    const res = await fetch(SAMPLE_VIDEO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch {
    // Ağ yoksa oynatılabilir olmayan ama şemayı dolduran minimal dosya.
    return Buffer.from(
      "00000018667479706d703432000000006d7034320000000866726565000000086d646174",
      "hex",
    );
  }
}

async function upsertUser(
  email: string,
  name: string,
  password: string,
  role: Role,
) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, active: true },
    create: { email, name, passwordHash, role, active: true },
  });
}

async function upsertPool(
  name: string,
  description: string,
  categoryId: string,
  questions: {
    prompt: string;
    choices: { text: string; isCorrect: boolean }[];
  }[],
) {
  const pool = await prisma.questionPool.upsert({
    where: { name },
    update: { description },
    create: { name, description },
  });

  const existing = await prisma.question.count({ where: { poolId: pool.id } });
  if (existing === 0) {
    for (const [idx, q] of questions.entries()) {
      await prisma.question.create({
        data: {
          poolId: pool.id,
          categoryId,
          prompt: q.prompt,
          sortOrder: idx,
          choices: { create: q.choices },
        },
      });
    }
  }

  return pool;
}

async function upsertCategory(name: string, description: string) {
  return prisma.category.upsert({
    where: { name },
    update: { description },
    create: { name, description },
  });
}

async function upsertQuestionCategory(name: string, description: string) {
  return prisma.questionCategory.upsert({
    where: { name },
    update: { description },
    create: { name, description },
  });
}

async function upsertCourse(
  title: string,
  description: string,
  poolId: string,
  storageKey: string,
  videoBuf: Buffer,
  durationSec: number,
  categoryId?: string,
) {
  const existing = await prisma.course.findFirst({ where: { title } });
  if (existing) return existing;

  await uploadObject(storageKey, videoBuf, "video/mp4");

  const passPercent = 80;
  const maxAttempts = 3;

  return prisma.course.create({
    data: {
      title,
      description,
      categoryId: categoryId ?? null,
      passPercent,
      maxAttempts,
      questionPoolId: poolId,
      questionCount: 0,
      video: {
        create: {
          storageKey,
          fileName: `${storageKey.split("/").pop()}`,
          contentType: "video/mp4",
          durationSec,
          sizeBytes: videoBuf.length,
        },
      },
      // Sınav ayarlarının kaynağı Exam'dir.
      exam: {
        create: {
          passPercent,
          maxAttempts,
          questionPoolId: poolId,
          questionCount: 0,
        },
      },
    },
  });
}

/** Atamayı oluşturur ve hedeflenen kullanıcılara Enrollment yayar. */
async function assign(opts: {
  courseId: string;
  target: AssignmentTarget;
  userId?: string;
  groupId?: string;
  startsAt: Date;
  dueAt: Date | null;
  assignedById: string;
}) {
  const assignment = await prisma.assignment.upsert({
    where:
      opts.target === AssignmentTarget.USER
        ? { courseId_userId: { courseId: opts.courseId, userId: opts.userId! } }
        : { courseId_groupId: { courseId: opts.courseId, groupId: opts.groupId! } },
    update: { startsAt: opts.startsAt, dueAt: opts.dueAt },
    create: {
      courseId: opts.courseId,
      target: opts.target,
      userId: opts.userId ?? null,
      groupId: opts.groupId ?? null,
      startsAt: opts.startsAt,
      dueAt: opts.dueAt,
      assignedById: opts.assignedById,
    },
  });

  const userIds =
    opts.target === AssignmentTarget.USER
      ? [opts.userId!]
      : (
          await prisma.groupMember.findMany({
            where: { groupId: opts.groupId! },
            select: { userId: true },
          })
        ).map((m) => m.userId);

  for (const userId of userIds) {
    await prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId: opts.courseId } },
      update: {
        assignmentId: assignment.id,
        startsAt: opts.startsAt,
        dueAt: opts.dueAt,
      },
      create: {
        userId,
        courseId: opts.courseId,
        assignmentId: assignment.id,
        startsAt: opts.startsAt,
        dueAt: opts.dueAt,
      },
    });
  }

  return assignment;
}

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("Depolama hazırlanıyor...");
  await ensureStorage();

  console.log("Kullanıcılar...");
  const admin = await upsertUser(
    "admin@marti.demo",
    "Sistem Yöneticisi",
    "Admin123!",
    Role.ADMIN,
  );
  const members = await Promise.all([
    upsertUser("kaptan1@marti.demo", "Kaptan Ahmet", "Kaptan123!", Role.USER),
    upsertUser("kaptan2@marti.demo", "Kaptan Ayşe", "Kaptan123!", Role.USER),
    upsertUser("kaptan3@marti.demo", "Kaptan Mehmet", "Kaptan123!", Role.USER),
  ]);

  console.log("Ekipler...");
  const group = await prisma.group.upsert({
    where: { name: "Kuru Yük Kaptanları" },
    update: {},
    create: {
      name: "Kuru Yük Kaptanları",
      description: "Kuru yük filosunda görevli kaptanlar",
    },
  });
  for (const member of members.slice(0, 2)) {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: member.id } },
      update: {},
      create: { groupId: group.id, userId: member.id },
    });
  }

  console.log("Soru kategorileri...");
  const seyirQuestionCategory = await upsertQuestionCategory(
    "Seyir Güvenliği",
    "Manevra, köprüüstü ve seyir emniyeti soruları.",
  );
  const acilQuestionCategory = await upsertQuestionCategory(
    "Acil Durum",
    "Yangın, terk ve acil müdahale soruları.",
  );

  console.log("Soru havuzları...");
  const manevraPool = await upsertPool(
    "Güvenli Manevra Havuzu",
    "Liman yaklaşımı ve manevra soruları",
    seyirQuestionCategory.id,
    [
      {
        prompt: "Liman yaklaşımında ilk öncelik nedir?",
        choices: [
          { text: "Hız artırmak", isCorrect: false },
          { text: "Durum farkındalığı ve iletişim", isCorrect: true },
          { text: "Eğlence yayınlarını açmak", isCorrect: false },
        ],
      },
      {
        prompt: "Eğitim videosu tamamlanmadan teste geçilebilir mi?",
        choices: [
          { text: "Evet", isCorrect: false },
          { text: "Hayır", isCorrect: true },
          { text: "Sadece admin izniyle", isCorrect: false },
        ],
      },
    ],
  );

  const acilPool = await upsertPool(
    "Acil Durum Havuzu",
    "Yangın ve terk prosedürleri soruları",
    acilQuestionCategory.id,
    [
      {
        prompt: "Acil durum alarmında ilk adım nedir?",
        choices: [
          { text: "Alarmı doğrula ve prosedürü uygula", isCorrect: true },
          { text: "Gemiyi terk et", isCorrect: false },
          { text: "Hiçbir şey yapma", isCorrect: false },
        ],
      },
      {
        prompt: "Test geçme barajı bu PoC'de varsayılan olarak nedir?",
        choices: [
          { text: "%50", isCorrect: false },
          { text: "%80", isCorrect: true },
          { text: "%100", isCorrect: false },
        ],
      },
    ],
  );

  console.log("Örnek video indiriliyor...");
  const videoBuf = await fetchSampleVideo();

  console.log("Eğitimler...");
  const seyirCategory = await upsertCategory(
    "Seyir Güvenliği",
    "Manevra, köprüüstü ve seyir emniyeti eğitimleri.",
  );
  const acilCategory = await upsertCategory(
    "Acil Durum",
    "Yangın, terk ve acil müdahale eğitimleri.",
  );

  const course1 = await upsertCourse(
    "Güvenli Manevra Temelleri",
    "Liman yaklaşımında temel güvenlik kuralları ve iletişim protokolü.",
    manevraPool.id,
    "seed/guvenli-manevra.mp4",
    videoBuf,
    5,
    seyirCategory.id,
  );
  const course2 = await upsertCourse(
    "Acil Durum Tatbikatı",
    "Yangın ve terk prosedürlerinin kısa hatırlatması.",
    acilPool.id,
    "seed/acil-durum.mp4",
    videoBuf,
    5,
    acilCategory.id,
  );

  console.log("Atamalar...");
  // Ekibe atama: iki üyeye birden yayılır.
  await assign({
    courseId: course1.id,
    target: AssignmentTarget.GROUP,
    groupId: group.id,
    startsAt: daysFromNow(-1),
    dueAt: daysFromNow(14),
    assignedById: admin.id,
  });

  // Kişiye atama.
  await assign({
    courseId: course2.id,
    target: AssignmentTarget.USER,
    userId: members[2].id,
    startsAt: daysFromNow(-1),
    dueAt: daysFromNow(7),
    assignedById: admin.id,
  });

  // Henüz açılmamış atama: kaptan bu eğitimi listesinde göremez.
  await assign({
    courseId: course2.id,
    target: AssignmentTarget.USER,
    userId: members[0].id,
    startsAt: daysFromNow(7),
    dueAt: daysFromNow(30),
    assignedById: admin.id,
  });

  console.log("Seed tamamlandı.");
  console.log(`Admin: ${admin.email} / Admin123!`);
  console.log("Kaptanlar: kaptan1-3@marti.demo / Kaptan123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
