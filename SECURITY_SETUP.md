# Yönetici girişi ve yayın yapılandırması

30 Eylül 2026 düzeltmesiyle yönetim işlemleri sunucu tarafında doğrulanır. Eski, sayfa içine yazılmış yönetici parolası artık geçerli değildir. UI tasarımı değişmemiştir.

## Mevcut Render servisini güncelleme

1. Ortam değişkenlerine en az 16 karakterlik, bu uygulamaya özel rastgele `ADMIN_PASSWORD` ekleyin. Yönetici giriş ekranında bu parola kullanılır. Yeni Blueprint kurulumunda `render.yaml` bu değerin üretilmesini ister; mevcut serviste değer olduğunu ayrıca kontrol edin.
2. **Yeni** bir VAPID anahtar çifti üretip `VAPID_PUBLIC_KEY` ve `VAPID_PRIVATE_KEY` olarak kaydedin. Eski `data/vapid.json` anahtarını yeniden kullanmayın. Dosya kaynak koddan ve yayın paketinden kaldırıldı; Git geçmişindeki eski anahtar artık gizli kabul edilemez.
3. `NODE_ENV=production` kullanın. VAPID yapılandırılmadıysa müşteri menüsü/sipariş API'si çalışır, push yolları 503 döner. Yönetici parolası eksik veya 16 karakterden kısaysa giriş 503 döner; güvensiz varsayılan parola kullanılmaz.
4. `TRUST_PROXY` değerini gerçek ters proxy adresleri/CIDR'leriyle ayarlayın. Blueprint özel ağ proxy'leri için `loopback,linklocal,uniquelocal` kullanır. Farklı barındırmada bu listeyi doğrulayın; doğrudan internete açık Node sunucusunda boş bırakın. `true` veya gelişigüzel bir hop sayısı kullanmayın. Sağdan sola güvenilen proxy zinciri dışındaki ilk adres istemci IP'si olarak değerlendirilir: [Express proxy belgesi](https://expressjs.com/en/guide/behind-proxies.html).
5. Frontend farklı bir origin kullanıyorsa tam origin'i `CORS_ORIGINS` listesine ekleyin. Tüm Netlify/Render müşterilerini kapsayan wildcard izinler kaldırıldı. Bilinen proje adresleri ve localhost korunur. `PATCH` izinlidir.
6. Backend ve frontend değişikliklerini birlikte yayınlayın. Netlify `netlify.toml` üzerinden yalnızca `public-site/` çıktısını yayınlar; depo kökünü manuel olarak yüklemeyin.

Parola üretme örneği (depo kökünden):

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

VAPID üretme (backend dizininde `npm ci` sonrasında; sonucu gizli tutun):

```powershell
npx --no-install web-push generate-vapid-keys --json
```

VAPID değişiminden sonra siteyi yeniden açan, bildirim izni verilmiş tarayıcılar eski abonelik anahtarını karşılaştırıp yeni anahtarla yeniden abone olur. Henüz siteyi tekrar ziyaret etmemiş eski aboneliklere gönderim başarısız olabilir.

## Yerel çalışma

`backend/.env.example` dosyasını `backend/.env` olarak kopyalayıp `ADMIN_PASSWORD` değerini doldurun. `.env` Git dışında tutulur. Dosya `npm start` tarafından otomatik yüklenmez; Node'un ortam dosyası desteğiyle açıkça başlatın:

```powershell
cd backend
npm ci
node --env-file=.env server.js
```

Alternatif olarak ortam değişkenlerini kabukta ayarlayıp `npm start` çalıştırın. Üretim dışındaki SQLite çalışmasında VAPID anahtarları `backend/.private/` altında üretilir ve saklanır; Express bu dizini sunmaz.

Oturumlar sekiz saat geçerlidir; tarayıcıda yalnızca bellekte tutulur. Sayfa yenilenince tekrar giriş gerekir. Çıkış token'ı sunucuda geçersizleştirir. Sunucu yeniden başlatıldığında bütün oturumlar sonlanır. Bu oturum deposu mevcut tek süreçli dağıtım içindir; birden fazla uygulama örneğine ölçeklerken ortak oturum/rate-limit deposu gerekir.

## Veritabanı davranışı

- Sipariş ve kalemleri aynı transaction içinde kaydedilir. PostgreSQL transaction boyunca tek bağlantı kullanır; SQLite aynı bağlantıdaki diğer işlemleri sıraya alır.
- Aynı idempotency anahtarıyla eşzamanlı istekler tek, tamamlanmış siparişe döner.
- İlk katalog seed'i `app_migrations` ile işaretlenir. Yeniden başlatma, silinen ürünleri geri getirmez veya fiyatı 250 TL'ye zorlamaz. Ürünlerin tamamının bilerek silinmesi de korunur.
- Mevcut dolu katalog yükseltmede korunur. Yeni ürün/fiyat değişiklikleri yönetim API'sinden veya ayrıca hazırlanmış sürümlü migration'dan yapılmalıdır.
- Yetkili kullanıcının açıkça çağırdığı `/api/products/reset`, katalog/kategori/çevirileri varsayılana döndürmeye devam eder; işlem transaction içindedir.

## Doğrulama

`cd backend; npm test`: 29 test başarılı. Kapsam: mevcut sipariş akışları, yetkisiz yönetim erişimi, giriş/çıkış/oturum süresi, ürün yazımları, statik dosya izolasyonu, CORS, hata anında rollback, eşzamanlı tekrar istekleri, yeniden başlatma, proxy/endpoint rate limit ayrımı ve tarayıcı API token iletimi.

SQLite entegrasyon testleri gerçek yerel Express sunucusu ve geçici veritabanıyla çalışır. PostgreSQL bağlantı kullanımı/rollback birim testi vardır; gerçek PostgreSQL servisiyle entegrasyon testi bu ortamda çalıştırılmadı. Tarayıcı kodu sözdizimi ve oturum yardımcısı VM testleriyle kontrol edildi; gerçek tarayıcıda görsel değerlendirme yapılmadı. Canlı sisteme test siparişi veya bildirim gönderilmedi.

Statik yayın: `node backend/scripts/build-public.cjs`. Yalnızca izin listesindeki müşteri dosyaları kopyalanır; backend, yedekler, loglar, veritabanları ve anahtar dosyaları çıktıya dahil edilmez.
