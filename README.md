# Plena LMS

Tek repo, iki katman:

- `frontend/` — Plena arayüzü (CRA, http://localhost:3000). Kullanıcıların gördüğü tek arayüz budur.
- `edu_module/` — Martı LMS backend'i (Next.js API + Prisma + PostgreSQL, http://localhost:3001). Sadece API olarak kullanılır; kendi sayfaları artık kullanılmaz.

`frontend/src/lib/api.js`, arayüzün beklediği eski FastAPI sözleşmesini edu_module API'sine çeviren adapter'dır.

## Çalıştırma

```bash
./start-local.sh
```

Script sırasıyla gömülü PostgreSQL'i (:5432), edu_module API'sini (:3001) ve arayüzü (:3000) başlatır.

Giriş: http://localhost:3000

| Rol | E-posta | Şifre |
|-----|---------|-------|
| Admin | `admin@marti.demo` | `Admin123!` |
| Çalışan | `kaptan1@marti.demo` | `Kaptan123!` |

## Veritabanını sıfırlama / ilk kurulum

```bash
cd edu_module/apps/web
npm run db:setup   # prisma db push + demo verisi
```

## Notlar

- Ortam dosyaları gitignore'dadır: `frontend/.env` (`REACT_APP_BACKEND_URL=http://localhost:3001`) ve `edu_module/apps/web/.env` (`DATABASE_URL`, `CORS_ALLOWED_ORIGINS=http://localhost:3000` vb.).
- Yüklenen videolar `edu_module/apps/web/storage/videos/` altında, veritabanı verisi `edu_module/.tools/pg/data/` altında tutulur; ikisi de gitignore'dadır.
- Eski FastAPI + MongoDB backend'i bu branch'te kaldırılmıştır.
