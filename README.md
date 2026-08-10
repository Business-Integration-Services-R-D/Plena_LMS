# Martı Cloud LMS — Denenebilir PoC

50 kaptan için zorunlu video izleme, video sonu test ve denetim loglarını gösteren cloud LMS PoC’si.

## Şu an: Docker’sız lokal çalıştırma

Önkoşul: Node.js 20+

```bash
cd apps/web
npm install
npm run db:setup
npm run dev
```

Açılış: [http://localhost:3000](http://localhost:3000)

Lokal mod: **SQLite** + **dosya deposu** (`apps/web/storage/videos`). Docker / MinIO sonra eklenecek.

## Demo hesaplar

| Rol | E-posta | Şifre |
|-----|---------|-------|
| Admin | `admin@marti.demo` | `Admin123!` |
| Kaptan | `kaptan1@marti.demo` | `Kaptan123!` |
| Kaptan | `kaptan2@marti.demo` | `Kaptan123!` |
| Kaptan | `kaptan3@marti.demo` | `Kaptan123!` |

## 15 dakikalık deneme senaryosu

1. `kaptan1@marti.demo` ile giriş yap.
2. **Güvenli Manevra Temelleri** eğitimini aç.
3. Timeline’dan ileri sarmayı dene — engellenmeli.
4. Videoyu sonuna kadar izle (örnek ~5 sn).
5. **Teste başla** → soruları cevapla → sonucu gör.
6. Çıkış yap, `admin@marti.demo` ile giriş yap.
7. **Denetim** sayfasında izleme/sınav loglarını kontrol et.
8. **Excel indir** / **CSV indir** ile export al.

## PoC’de ne var?

- Admin: kullanıcı, eğitim/video yükleme, soru, atama, denetim export
- Kaptan: atanan eğitimler, no-seek player, resume, %100 sonrası test
- Sunucu tarafı anti-skip (`maxReachedSec` + heartbeat)
- Auth korumalı video proxy
- Zaman damgalı izleme + sınav logları, Excel/CSV export

## Docker (sonra)

`docker-compose.yml` hazır; WSL + BIOS sanallaştırma tamamlanınca:

```bash
docker compose up --build
# http://localhost:8080
```

Not: Docker moduna geçerken Prisma provider’ı tekrar `postgresql` yapılacak ve `STORAGE_DRIVER=s3` kullanılacak.
