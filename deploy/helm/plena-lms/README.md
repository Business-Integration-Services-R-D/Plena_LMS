# Plena LMS Helm paketi

Bu chart aşağıdaki bileşenleri kurar:

- React/nginx frontend
- Next.js API/backend
- PostgreSQL tabanlı kuyruktan çalışan FFmpeg video worker
- `/api` ve `/` yollarını ayıran Ingress

PostgreSQL chart dışında yönetilir. Medya depolama için iki seçenek vardır:

- Eclit/Kubernetes: `STORAGE_DRIVER=local` ve backend ile worker'a aynı RWX SMB
  Persistent Volume bağlanır.
- Object storage: `STORAGE_DRIVER=s3` kullanılır ve backend ile worker aynı
  bucket'a erişir.

Local/PV modunda MP4/WebM videolar 16 MiB parçalarla, en fazla 2 GB olarak yüklenir.
Yükleme uygulama içinde sayfalar arasında gezinirken devam eder. Video worker
kaynak dosyayı doğrudan ortak volume'dan okuyarak gereksiz `/tmp` kopyasını
oluşturmaz.

## 1. İmajları oluştur ve registry'ye gönder

```bash
docker build -t REGISTRY/plena-lms-backend:TAG backend
docker build -t REGISTRY/plena-lms-frontend:TAG frontend
docker push REGISTRY/plena-lms-backend:TAG
docker push REGISTRY/plena-lms-frontend:TAG
```

Backend imajı FFmpeg/FFprobe içerir ve hem API hem worker tarafından kullanılır.

## 2. Secret oluştur

```bash
kubectl create namespace plena-lms
kubectl -n plena-lms create secret generic plena-lms-secrets \
  --from-literal=DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DB?schema=public&sslmode=require' \
  --from-literal=AUTH_SECRET='CHANGE_ME' \
  --from-literal=RESEND_API_KEY='re_CHANGE_ME'
```

S3 modu kullanılıyorsa EKS'te statik AWS anahtarı yerine IRSA service account
annotation kullanın. Diğer Kubernetes ortamlarında gerekirse aynı Secret'a
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_USE_SSL` ve
`S3_FORCE_PATH_STYLE` değerleri eklenebilir.

## 3. Değerleri ayarla

Örneği kopyalayın ve kurumunuza göre doldurun:

```bash
cp deploy/helm/plena-lms/values-production.example.yaml values-production.yaml
```

`values-production.yaml` içinde en az imaj, domain ve depolama değerlerini
değiştirin. Eclit/RWX PVC örneği:

```yaml
backend:
  image:
    repository: REGISTRY/plena-lms-backend
    tag: TAG
frontend:
  image:
    repository: REGISTRY/plena-lms-frontend
    tag: TAG

config:
  appUrl: https://lms.example.com
  corsAllowedOrigins: https://lms.example.com
  storageDriver: local
  s3Bucket: ""
  emailFrom: Plena LMS <noreply@example.com>

persistence:
  enabled: true
  existingClaim: plena-lms-smb
  mountPath: /app/storage/videos

ingress:
  host: lms.example.com
  tls:
    enabled: true
    secretName: plena-lms-tls

```

PVC `ReadWriteMany` erişim modunda olmalı ve farklı node'lardaki backend ile
video-worker pod'ları tarafından aynı içerikle görülebilmelidir. Worker için
varsayılan geçici alan 8 GiB'dir.

## 4. Kur

```bash
helm upgrade --install plena-lms deploy/helm/plena-lms \
  --namespace plena-lms \
  --create-namespace \
  -f values-production.yaml

helm test plena-lms --namespace plena-lms
```

Paylaşılabilir Helm arşivi oluşturmak için:

```bash
mkdir -p dist
helm lint deploy/helm/plena-lms
helm package deploy/helm/plena-lms --destination dist
```

Arkadaşınız arşivi şu şekilde kurabilir:

```bash
helm upgrade --install plena-lms dist/plena-lms-0.1.0.tgz \
  --namespace plena-lms \
  --create-namespace \
  -f values-production.yaml
```

Backend başlangıçta `prisma migrate deploy` çalıştırır. Yeni MP4/WebM yüklenir yüklenmez
orijinal dosya aktif olur; worker H.264 720p çıktıyı hazırlayıp en az %5 küçülme
sağlarsa DB işaretçisini atomik değiştirir. Orijinal dosya varsayılan olarak 24
saat sonra silinir. İş başarısız olursa orijinal video aktif kalır.

Durumu izlemek için:

```bash
kubectl -n plena-lms get pods
kubectl -n plena-lms logs deployment/plena-lms-plena-lms-video-worker -f
```
