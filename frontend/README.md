# Frontend — Plena LMS

React/CRACO tabanlı kullanıcı arayüzüdür. Lokal geliştirmede
`http://localhost:3000` üzerinde çalışır ve API isteklerini
`REACT_APP_BACKEND_URL` ile backend'e gönderir.

## Lokal çalıştırma

Repo kökünden `./start-local.sh` önerilir. Sadece frontend'i başlatmak için:

```bash
yarn install
yarn start
```

Gerekli lokal ortam değişkenleri `frontend/.env.example` dosyasındadır.

## Production build

```bash
yarn build
```

Çıktı `frontend/build/` altında oluşturulur. Production deployment'ında Caddy
bu statik dosyaları servis eder ve `/api/*` isteklerini Next.js backend'e
yönlendirir.

## Önemli dizinler

- `src/pages/admin/` — kullanıcı, eğitim, atama ve raporlama ekranları
- `src/pages/employee/` — çalışan eğitim ve sınav ekranları
- `src/components/` — video/PDF oynatıcıları ve ortak UI bileşenleri
- `src/lib/api.js` — frontend sözleşmesini gerçek Next.js API'lerine bağlayan adapter
