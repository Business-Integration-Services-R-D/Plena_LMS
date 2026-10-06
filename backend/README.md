# Backend — LMS API (Next.js + Prisma + PostgreSQL)

Plena arayüzünün (:3000) kullandığı API. http://localhost:3001 üzerinde çalışır; kendi sayfaları (login/admin) artık kullanılmaz.

## Lokal çalıştırma

Repo kökünden `./start-local.sh` önerilir. Sadece backend'i başlatmak için:

```bash
npm install
npm run db:setup     # ilk kurulum: prisma db push + demo verisi
npm run dev -- -p 3001
```

PostgreSQL, repo kökündeki gömülü kurulumdan çalışır (`.tools/pg`). Bağlantı bilgisi `.env` içindeki `DATABASE_URL`'dedir.

## Önemli dizinler

- `src/app/api/` — REST endpoint'leri (auth, admin, user)
- `src/lib/` — domain kuralları (video/PDF ilerlemesi, sınav, aktivasyon, depolama)
- `prisma/` — şema, migration'lar ve seed
- `storage/videos/` — lokal modda yüklenen MP4/PDF içerikleri (gitignore)

## İçerik sınırları

- MP4 video: en fazla 2 GB (local/PV modunda parçalı yükleme)
- PDF: en fazla 50 MB

Production ortamında içerikler S3/object storage veya ortak Persistent Volume
üzerinde tutulabilir. Kubernetes local/PV kurulumunda backend ve video worker
aynı RWX volume'u `LOCAL_STORAGE_ROOT` yolunda mount etmelidir.

## Testler

```bash
npm test   # vitest
```

## Docker (opsiyonel)

`docker-compose.yml` Postgres + MinIO + Caddy ile konteynerli kurulum içindir:

```bash
docker compose up --build
# http://localhost:8080
```
