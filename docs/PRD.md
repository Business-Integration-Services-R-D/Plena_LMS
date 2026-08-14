# Plena LMS — Kurumsal Eğitim Platformu PRD

## Orijinal Problem Tanımı
Türkçe kurumsal LMS (whiteboard tasarımından): 2 kullanıcı tipi (admin/employee). Admin kullanıcı oluşturur, aktivasyon gönderir, gruplar kurar, soru havuzu yönetir (çoktan seçmeli + serbest metin), video'lu eğitim oluşturur (mp4, max 250MB), videoda ileri sarma yasak, belirli anlarda checkpoint soruları (süre aşımında başa/önceki checkpoint'e dönüş), sürekli izleme takibi ve loglama, video sonu quiz (soru havuzundan), kişi/grup bazlı atama (ileri tarihli + hatırlatma periyodu), denetim raporları. Employee: giriş, atanmış eğitimler, izleme, checkpoint, quiz.

## Kullanıcı Tercihleri
- Auth: Emergent-managed Google OAuth (admin e-posta allowlist tanımlar; kayıtlı olmayan e-posta 403)
- E-posta: MOCK (email_logs koleksiyonu, /admin/notifications ekranı) — ileride gerçek entegrasyon
- Video depolama: sunucu diski (/app/backend/uploads/videos) — ileride S3'e taşınacak
- UI: Türkçe, Apple-minimal (beyaz/gri, hafif gölge, Notion/WeTransfer temizliği)

## Mimari
- FastAPI + MongoDB (motor), React 19 + Tailwind + shadcn, custom uuid id'ler, {"_id":0} projeksiyonu
- Anti-skip: client guard (seek engeli) + server-side heartbeat anti-cheat (elapsed*1.5+3 clamp) + checkpoint gating (cevaplanmamış checkpoint ötesine max_position geçemez)
- Video streaming: Range destekli /api/videos/{id}, auth zorunlu
- Hatırlatma: backend asyncio loop (30 dk'da bir), reminder_days periyodu
- Seed admin: tugberkkalay@gmail.com

- **Rapor Dışa Aktarma (Haziran 2026)**: GET /api/reports/trainings/{id}/export?fmt=pdf|excel — reportlab (DejaVuSans, Türkçe karakter destekli, yatay A4) + openpyxl; Raporlar ekranında eğitim seçilince PDF/Excel indirme butonları
## Yapılanlar (Haziran 2026 — MVP)
- **Tasarım v2 (kullanıcı geri bildirimi)**: Notion tarzı yeniden tasarım — gri sidebar (#F7F7F5), sıcak beyaz zemin (#FAFAF9), hairline border + katmanlı yumuşak gölgeli kartlar (.n-card / .n-card-hover), Instrument Sans tipografi, hover'da yükselen kartlar
- Google login + rol bazlı yönlendirme, e-posta allowlist
- Kullanıcı CRUD + mock aktivasyon + tekrar gönderme; Grup CRUD
- Soru havuzu CRUD (çoktan seçmeli/doğru cevap, serbest metin)
- Eğitim oluşturma, mp4 upload (250MB, süre otomatik), checkpoint yerleştirme (dk:sn, timeout, başarısızlıkta başa/önceki nokta), quiz builder (geçme notu opsiyonel)
- Atama: kişi/grup, ileri tarihli (start_at öncesi çalışana görünmez), son tarih, hatırlatma periyodu, mock bilgilendirme maili
- Çalışan: Eğitimlerim listesi (ilerleme %), anti-skip player (kaldığı yerden devam, checkpoint modal + geri sayım, başarısızlıkta rewind), quiz + sonuç/tekrar deneme
- Raporlama: genel bakış istatistikleri, eğitim bazlı tablo (izleme %, süre, checkpoint, hata, quiz notu), atama bazlı denetim kaydı (olay günlüğü + quiz cevapları), bildirim logları
- Test: 37/37 backend, frontend smoke %100 (iteration_1.json)

## Backlog / Sonraki Fazlar
- P0: Gerçek e-posta entegrasyonu (Resend/SendGrid)
- P1: S3 video depolama; soru import (CSV/Excel — whiteboard'daki "Import"); serbest metin quiz cevapları için manuel değerlendirme ekranı
- P2: Mail template editörü (whiteboard'daki "Mail Template"); KPI panosu; sertifika üretimi; SCORM
