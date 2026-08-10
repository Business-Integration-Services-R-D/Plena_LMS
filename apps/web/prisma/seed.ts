import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureStorage, uploadObject } from "../src/lib/storage";

const prisma = new PrismaClient();

const SAMPLE_VIDEO_URL =
  "https://samplelib.com/lib/preview/mp4/sample-5s.mp4";

async function fetchSampleVideo(): Promise<Buffer> {
  try {
    const res = await fetch(SAMPLE_VIDEO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch {
    // Minimal offline fallback
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
    update: { name, passwordHash, role, active: true },
    create: { email, name, passwordHash, role, active: true },
  });
}

async function seedCourse(
  title: string,
  description: string,
  storageKey: string,
  videoBuf: Buffer,
  durationSec: number,
  questions: {
    prompt: string;
    choices: { text: string; isCorrect: boolean }[];
  }[],
) {
  const existing = await prisma.course.findFirst({ where: { title } });
  if (existing) return existing;

  await uploadObject(storageKey, videoBuf, "video/mp4");

  return prisma.course.create({
    data: {
      title,
      description,
      passPercent: 80,
      video: {
        create: {
          storageKey,
          fileName: `${storageKey}.mp4`,
          contentType: "video/mp4",
          durationSec,
          sizeBytes: videoBuf.length,
        },
      },
      questions: {
        create: questions.map((q, idx) => ({
          prompt: q.prompt,
          sortOrder: idx,
          choices: { create: q.choices },
        })),
      },
    },
  });
}

async function main() {
  console.log("Ensuring storage...");
  await ensureStorage();

  console.log("Seeding users...");
  const admin = await upsertUser(
    "admin@marti.demo",
    "Sistem Yöneticisi",
    "Admin123!",
    Role.ADMIN,
  );
  const captains = await Promise.all([
    upsertUser("kaptan1@marti.demo", "Kaptan Ahmet", "Kaptan123!", Role.CAPTAIN),
    upsertUser("kaptan2@marti.demo", "Kaptan Ayşe", "Kaptan123!", Role.CAPTAIN),
    upsertUser("kaptan3@marti.demo", "Kaptan Mehmet", "Kaptan123!", Role.CAPTAIN),
  ]);

  console.log("Fetching sample video...");
  const videoBuf = await fetchSampleVideo();

  const course1 = await seedCourse(
    "Güvenli Manevra Temelleri",
    "Liman yaklaşımında temel güvenlik kuralları ve iletişim protokolü.",
    "seed/guvenli-manevra.mp4",
    videoBuf,
    5,
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

  const course2 = await seedCourse(
    "Acil Durum Tatbikatı",
    "Yangın ve terk prosedürlerinin kısa hatırlatması.",
    "seed/acil-durum.mp4",
    videoBuf,
    5,
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

  for (const captain of captains) {
    for (const course of [course1, course2]) {
      await prisma.assignment.upsert({
        where: {
          userId_courseId: { userId: captain.id, courseId: course.id },
        },
        update: {},
        create: { userId: captain.id, courseId: course.id },
      });
      await prisma.watchProgress.upsert({
        where: {
          userId_courseId: { userId: captain.id, courseId: course.id },
        },
        update: {},
        create: { userId: captain.id, courseId: course.id },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`Admin: ${admin.email} / Admin123!`);
  console.log("Captains: kaptan1-3@marti.demo / Kaptan123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
