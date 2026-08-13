# Plena LMS

Tek repo, iki katman:

- `frontend/` — Plena arayüzü (CRA, http://localhost:3000). Kullanıcıların gördüğü tek arayüz budur.
- `backend/` — LMS backend'i (Next.js API + Prisma + PostgreSQL, http://localhost:3001). Sadece API olarak kullanılır; kendi sayfaları artık kullanılmaz.
- `docs/` — proje dokümanları (PRD, yönerge, sunum, tasarım notları).

`frontend/src/lib/api.js`, arayüzün beklediği eski FastAPI sözleşmesini backend API'sine çeviren adapter'dır.

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

- Ortam dosyaları gitignore'dadır: `frontend/.env` (`REACT_APP_BACKEND_URL=http://localhost:3001`) ve `backend/.env` (`DATABASE_URL`, `CORS_ALLOWED_ORIGINS=http://localhost:3000` vb.).
- Yüklenen videolar `backend/storage/videos/` altında, veritabanı verisi `.tools/pg/data/` altında tutulur; ikisi de gitignore'dadır.
- `backend/docker-compose.yml` Postgres + MinIO + Caddy ile konteynerli kurulum içindir (lokal geliştirmede kullanılmaz).
