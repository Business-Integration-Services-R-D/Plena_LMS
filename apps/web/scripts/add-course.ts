import { PrismaClient } from "@prisma/client";
import { ensureStorage, uploadObject } from "../src/lib/storage";

const prisma = new PrismaClient();

async function main() {
  await ensureStorage();
  const title = "Gemi Haberleşme Protokolleri";
  const existing = await prisma.course.findFirst({ where: { title } });
  if (existing) {
    console.log(`EXISTS\t${existing.id}\t${existing.title}`);
    return;
  }

  let videoBuf: Buffer;
  try {
    const res = await fetch(
      "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
    );
    if (!res.ok) throw new Error(String(res.status));
    videoBuf = Buffer.from(await res.arrayBuffer());
  } catch {
    videoBuf = Buffer.from(
      "00000018667479706d703432000000006d7034320000000866726565000000086d646174",
      "hex",
    );
  }

  const key = "seed/gemi-haberlesme.mp4";
  await uploadObject(key, videoBuf, "video/mp4");

  const course = await prisma.course.create({
    data: {
      title,
      description:
        "VHF / bridge haberleşme temel kuralları ve standart ifade örnekleri.",
      passPercent: 80,
      video: {
        create: {
          storageKey: key,
          fileName: "gemi-haberlesme.mp4",
          contentType: "video/mp4",
          durationSec: 5,
          sizeBytes: videoBuf.length,
        },
      },
      questions: {
        create: [
          {
            prompt: "Bridge haberleşmede öncelik nedir?",
            sortOrder: 0,
            choices: {
              create: [
                { text: "Kısa, net ve standart ifade", isCorrect: true },
                { text: "Uzun açıklama", isCorrect: false },
                { text: "Sessiz kalmak", isCorrect: false },
              ],
            },
          },
          {
            prompt: "Eğitim bitmeden test açılır mı?",
            sortOrder: 1,
            choices: {
              create: [
                { text: "Evet", isCorrect: false },
                { text: "Hayır", isCorrect: true },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(`CREATED\t${course.id}\t${course.title}`);
  console.log("Atama yok — Admin > Atamalar üzerinden sen atayabilirsin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
