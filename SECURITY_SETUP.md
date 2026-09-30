# Yönetici girişi ve yayın yapılandırması

30 Eylül 2026 düzeltmesiyle yönetim işlemleri sunucu tarafında doğrulanır. Eski, sayfa içine yazılmış yönetici parolası artık geçerli değildir. UI tasarımı değişmemiştir.

## Mevcut Render servisini güncelleme

1. Ortam değişkenlerine en az 6 karakterlik, bu uygulamaya özel `ADMIN_PASSWORD` ekleyin. Yönetici giriş ekranında bu parola kullanılır. Yeni Blueprint kurulumunda `render.yaml` bu değerin üretilmesini ister; mevcut serviste değer olduğunu ayrıca kontrol edin.
2. **Yeni** bir VAPID anahtar çifti üretip `VAPID_PUBLIC_KEY` ve `VAPID_PRIVATE_KEY` olarak kaydedin. Eski `data/vapid.json` anahtarını yeniden kullanmayın. Dosya kaynak koddan ve yayın paketinden kaldırıldı; Git geçmişindeki eski anahtar artık gizli kabul edilemez.
3. `NODE_ENV=production` kullanın. VAPID yapılandırılmadıysa müşteri menüsü/sipariş API'si çalışır, push yolları 503 döner. Yönetici parolası eksik veya 6 karakterden kısaysa giriş 503 döner; varsayılan parola kullanılmaz.
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

`cd backend; npm test`: 39 test başarılı. Kapsam: mevcut sipariş akışları, yetkisiz yönetim erişimi, giriş/çıkış/oturum süresi, ürün yazımları, statik dosya izolasyonu, CORS, hata anında rollback, eşzamanlı tekrar istekleri, yeniden başlatma, proxy/endpoint rate limit ayrımı ve tarayıcı API token iletimi.

SQLite entegrasyon testleri gerçek yerel Express sunucusu ve geçici veritabanıyla çalışır. PostgreSQL bağlantı kullanımı/rollback birim testi vardır; gerçek PostgreSQL servisiyle entegrasyon testi bu ortamda çalıştırılmadı. Tarayıcı kodu sözdizimi ve oturum yardımcısı VM testleriyle kontrol edildi; gerçek tarayıcıda görsel değerlendirme yapılmadı. Canlı sisteme test siparişi veya bildirim gönderilmedi.

Statik yayın: `node backend/scripts/build-public.cjs`. Yalnızca izin listesindeki müşteri dosyaları kopyalanır; backend, yedekler, loglar, veritabanları ve anahtar dosyaları çıktıya dahil edilmez.


## Boşta veritabanı maliyeti

- Her 30 saniyede çalışan bildirim tablosu taraması kaldırıldı. Push yapılandırması varsa uygulama açılışında bekleyen işler bir kez okunur; sonrasında yalnızca kayıtlı işin zamanı geldiğinde sorgu yapılır. Bekleyen iş yoksa bu görev veritabanını tekrar uyandırmaz. Push yapılandırması yoksa başlangıç taraması da yapılmaz.
- Yeni planlanan bildirim için bellekte tek seferlik zamanlayıcı kurulur; silinen işin zamanlayıcısı iptal edilir. Yeniden başlatmada veritabanında bekleyen işler geri yüklenir. Uzak tarihler Node zamanlayıcı sınırı nedeniyle bellekte parçalara ayrılır, bu sırada ek sorgu yapılmaz.
- Vadesi gelen gerçek bir işte geçici veritabanı hatası olursa on dakika sonra yeniden denenir. Aynı iş birden fazla süreçte biliniyorsa atomik durum geçişi çift gönderimi önler. Bu çözüm mevcut tek uygulama süreci içindir; başka süreçten doğrudan veritabanına eklenen işler ancak yeniden başlatmada keşfedilir.
- Yönetici sipariş yenilemesi yalnızca giriş yapılmış ve tarayıcı sekmesi görünürken çalışır; üst üste istek başlatmaz. Görünür yönetici ekranı açıkken sipariş kontrolü devam eder.
- Neon'da scale-to-zero açık olmalıdır. Bu değişiklik gereksiz sorguları kaldırır; gerçek trafik, açık yönetici ekranı veya başka bağlı uygulamalar varsa compute kullanımı sürer. Mevcut ücretli planı ve daha önce birikmiş ücreti değiştirmez.
- Zamanında otomatik bildirim için backend sürecinin çalışıyor olması gerekir. Render Free servisi uyurken zamanlayıcı çalışmaz; servis tekrar başladığında gecikmiş işler işlenir.
- Testler: sahte saatle 31 gün boşta sıfır ek sorgu, planlanmış gönderim, iptal, yeniden başlatma, uzun zamanlayıcı, çift süreçte tek gönderim ve geçici hata sonrası gecikmeli yeniden deneme doğrulandı. Gerçek Neon ölçümleri veya faturalama ayarları bu işlemde değiştirilmedi.
