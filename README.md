# Plena LMS

Tek repo, iki katman:

- `frontend/` — Plena arayüzü (CRA, http://localhost:3000). Kullanıcıların gördüğü tek arayüz budur.
- `backend/` — LMS backend'i (Next.js API + Prisma + PostgreSQL, http://localhost:3001). Sadece API olarak kullanılır; kendi sayfaları artık kullanılmaz.
- `docs/` — proje dokümanları (PRD, yönerge ve tasarım notları).

`frontend/src/lib/api.js`, arayüzün beklediği eski FastAPI sözleşmesini backend API'sine çeviren adapter'dır.

## Güncel özellikler

- MP4 (en fazla 1 GB) ve PDF (en fazla 50 MB) eğitim içerikleri
- Video ileri sarma engeli ve PDF'de sıralı sayfa ilerlemesi
- Kontrol noktaları, sınavlar ve serbest metin cevapları
- Kullanıcı aktivasyonu, aktif/pasif hesap yönetimi ve grup atamaları
- Eğitim ve kişi bazlı ekran, PDF ve Excel raporları

## İlk kurulum

Repoyu ilk defa kuran biri için tek komut yeterlidir (macOS Apple Silicon):

```bash
git clone https://github.com/Business-Integration-Services-R-D/Plena_LMS.git
cd Plena_LMS
./setup.sh
```

Script şunları yapar (idempotenttir, tekrar çalıştırmak güvenlidir):

1. Node.js v22'yi `.tools/node` altına indirir (sistemde Node kurulu olması gerekmez) ve corepack ile yarn'ı etkinleştirir.
2. Gömülü PostgreSQL'i `.tools/pg` altına kurar ve veritabanı dizinini oluşturur.
3. `backend/.env` ve `frontend/.env` dosyalarını `.env.example` şablonlarından üretir (`AUTH_SECRET` otomatik oluşturulur).
4. Backend (`npm install`) ve frontend (`yarn install`) bağımlılıklarını kurar.
5. Veritabanı şemasını ve demo verileri yükler (`npm run db:setup`).

## Çalıştırma

```bash
./start-local.sh
```

Script sırasıyla gömülü PostgreSQL'i (:5432), backend API'sini (:3001) ve arayüzü (:3000) başlatır.

Giriş: http://localhost:3000

| Rol | E-posta | Şifre |
|-----|---------|-------|
| Admin | `admin@marti.demo` | `Admin123!` |
| Çalışan | `kaptan1@marti.demo` | `Kaptan123!` |

## Veritabanını sıfırlama / ilk kurulum

```bash
cd backend
npm run db:setup   # prisma db push + demo verisi
```

## Notlar

- Ortam dosyaları gitignore'dadır; şablonları repodadır: `frontend/.env.example` ve `backend/.env.example`. `./setup.sh` bunlardan gerçek `.env` dosyalarını üretir.
- Lokal modda yüklenen eğitim içerikleri `backend/storage/videos/` altında, veritabanı verisi `.tools/pg/data/` altında tutulur; ikisi de gitignore'dadır.
- Production adresi `https://lms.bislabs.tech`; dosyalar private S3 bucket'ta, veritabanı private RDS üzerinde tutulur.
- `backend/docker-compose.yml` Postgres + MinIO + Caddy ile konteynerli kurulum içindir (lokal geliştirmede kullanılmaz).
