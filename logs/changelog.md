# 📋 Değişiklik Günlüğü (Changelog)

Bu dosya, projede yapılan tüm değişiklikleri tarih damgalarıyla birlikte kaydeder.

---
## [2026-07-15 22:50 +03:00] — Bildirim Gizleme, Keep-Alive ve Veri Kalıcılığı Güvenliği

### 🛠️ Giderilen Hatalar ve Yapılan Düzenlemeler
- **Bildirim Arayüzü Gizlendi (Görev 1):** `admin.html` içindeki "Bildirim Gönder" sekmesi ve içerik paneli `style="display:none"` ile gizlendi. Sekme yapısı 2 sekmeli (Ürünler ve Rezervasyonlar) hale getirilerek genişlikler %50 olarak güncellendi.
- **Keep-Alive Sistemi (Görev 2):** `.github/workflows/keepalive.yml` dosyası oluşturuldu. Render backend servisinin uyku moduna geçmesini engellemek için her 10 dakikada bir otomatik ping gönderimi ayarlandı.
- **Veri Kalıcılığı ve Reset Koruması (Görev 3):** 
    - `backend/db.js` içindeki `runSeeds()` fonksiyonu, `INSERT` işlemlerinde `ON CONFLICT DO NOTHING` (PostgreSQL) ve `INSERT OR IGNORE` (SQLite) kısıtlamalarıyla güçlendirildi.
    - Seeding işlemi öncesindeki `COUNT(*) === 0` kontrolü doğrulanarak, mevcut verilerin üzerine yazma riski tamamen ortadan kaldırıldı.
    - `server.js` kontrol edilerek herhangi bir otomatik/zamanlanmış sıfırlama tetikleyicisi olmadığı teyit edildi.

---
## [2026-07-14 14:45 +03:00] — Admin Paneli Onarımı (Sekmeler ve Görünüm)

### 🛠️ Giderilen Hatalar ve Yapılan Düzenlemeler
- **Admin Paneli Sekme Yapısı:** "Rezervasyonlar" ve "Bildirim Gönder" sekmelerinin boş görünmesi veya kaybolması sorunu giderildi. `admin.html` içindeki malformed (hatalı kapanmış) HTML blokları temizlendi ve `adminRezList` konteyneri geri getirildi.
- **CSS Genişlik Düzeltmeleri:** 3 sekmeli yeni yapıya geçişten sonra bozulan slider genişlikleri (`300%`) ve sekme içerik genişlikleri (`33.333%`) hem `style.css` hem de `admin.html` içindeki dahili stillerde düzeltildi.
- **Push Bildirim İyileştirmeleri:** 
    - `loadPushDashboardData` fonksiyonuna dizi (`Array.isArray`) ve `null` kontrolleri eklenerek JavaScript'in "Cannot set properties of null" hatasıyla çökmesi engellendi.
    - Bildirim sekmelerindeki istatistik paneli (Abone sayısı, Gönderim, CTR) yeniden oluşturuldu.
    - Bildirim onay modalindeki (`pushConfirmModal`) ID çakışmaları ve yapısal bozukluklar giderildi.
- **Stabilite:** Admin paneli açıldığında sekmelerin senkronize ve pürüzsüz kayması sağlandı.

---
## [2026-07-13 — Backend Deploy & Veritabanı Bağlantısı]

### Yapılanlar
- GitHub repo oluşturuldu: https://github.com/hasaca-bot/dayikatik-backend
- Render Web Service kuruldu: https://dayikatik-api.onrender.com
- Neon PostgreSQL bağlandı (DATABASE_URL env var olarak Render Dashboard'a girildi)
- `db.js` — `data/menu.json` path'i düzeltildi (`../data` → `data`, repo kökü referansı)
- `render.yaml` — Blueprint yerine direkt Web Service olarak deploy edildi
- Doğrulama: 35 ürün, 4 kategori veritabanından döndü
- CRUD testi: POST/GET/DELETE başarılı
- `index.html` ve `admin.html` zaten doğru API URL'sini içeriyordu (değişiklik gerekmedi)

---
## [2026-07-13 08:15 +03:00] — PostgreSQL DDL Tip Uyuşmazlığı ve CORS İyileştirmeleri

### 🛠️ Giderilen Hatalar ve Yapılan Düzenlemeler
- `backend/db.js` — PostgreSQL için oluşturulan ürünler tablosunda (`products`), `created_at` ve `updated_at` kolonlarının veri tipleri `TEXT` yerine `TIMESTAMP` olarak değiştirildi. PostgreSQL DDL'inde `TEXT DEFAULT CURRENT_TIMESTAMP` ifadesi tip uyuşmazlığı hatası (`column "created_at" is of type text but default expression is of type timestamp with time zone`) üreterek backend'in Render üzerinde başlatılırken çökmesine sebep oluyordu. Bu düzeltmeyle çökme sorunu giderildi.
- `backend/server.js` — CORS izin listesi (origins), kullanıcının tarayıcı geçmişinde yer alan ve Netlify üzerinde kullanılan tüm farklı test domainlerini (`hasacadesign.netlify.app`, `dayikatikornek.netlify.app`, `resonant-elf-d2b58b.netlify.app`, `glittering-raindrop-435319.netlify.app`) ve dinamik deploy preview alt alan adlarını (wildcard eşleşmeli regex ile) kapsayacak şekilde güncellendi.
- `.gitignore` — Gereksiz dosyaların (`node_modules`, SQLite `.db` dosyaları vb.) Git reponuza gönderilmesini engellemek için kök dizine eklendi.
- `git init` — `dayikatikwebsitesi - Kopya` dizininde yeni bir yerel Git deposu başlatıldı ve tüm kod tabanı (`data/menu.json` dahil) ilk commit ile yerel olarak kaydedildi.

---
## [2026-07-13 00:05 +03:00] — Bulut Backend & Çift Veritabanı Altyapısı Geçişi

### ➕ Eklenen Dosyalar
- `render.yaml` — Render.com üzerinden tek tıkla Express backend API'si ve PostgreSQL veritabanını dağıtacak Blueprint konfigürasyonu.

### 📝 Düzenlenen Dosyalar
- `index.html` — `window.API_BASE` çevre tespiti ve `fetch` interceptor katmanı eklendi. Hardcoded localhost referansları temizlendi.
- `admin.html` — `window.API_BASE` çevre tespiti ve `fetch` interceptor katmanı eklendi. Hardcoded localhost referansları temizlendi.
- `backend/db.js` — Hem yerel geliştirme (SQLite) hem de canlı ortam (PostgreSQL) veritabanı sürücülerini asenkron ortak arayüz ile destekleyecek şekilde sıfırdan yazıldı.
- `backend/server.js` — Veritabanı sorguları asenkron modele geçirildi. CORS kuralları Netlify canlı domainini içerecek şekilde güncellendi, PORT dinamikleştirildi ve dinleme IP adresi 0.0.0.0 olarak bağlandı.
- `backend/package.json` — PostgreSQL (`pg`) sürücüsü bağımlılıklara eklendi. Node sürüm gereksinimi belirtildi.
- `README.md` — Yeni çift modlu veritabanı altyapısı, bulut API entegrasyonu ve Render dağıtım yönergeleri eklendi.

### ⚙️ Açıklama
- Frontend ve Backend arasındaki localhost bağımlılığı tamamen kaldırıldı. Sayfalar artık canlı Netlify sitesinden Render üzerindeki HTTPS API'sine otomatik olarak istek yapmaktadır.
- Yerel testler için SQLite (`node:sqlite`) desteği korunurken, canlı ortamda kalıcı veri depolama için PostgreSQL desteği eklendi.
- Tüm SQL parametre ve bağlantı modelleri dinamik hale getirilerek iki veritabanı arasındaki sözdizimi farkları görünmez kılındı.

---
## [2026-07-12 22:25 +03:00] — Otomatik Dil Seçimi ve Vazgeç Buton Güncellemesi

### 📝 Düzenlenen Dosyalar
- `index.html` — Tarayıcı diline göre otomatik Türkçe/İngilizce dil tespiti eklendi. Ürün düzenleme modülündeki "Vazgeç" butonu Turkish dilinde "Tamam" olarak güncellendi (İngilizce'de "Cancel" olarak kaldı).
- `admin.html` — `index.html` ile uyumlu dil algılama algoritması ve ürün düzenleme modülü "Vazgeç" -> "Tamam" buton metni güncellemesi yapıldı.

### ⚙️ Açıklama
- Tarayıcı dili `tr` veya `tr-TR` olan kullanıcılar için sitenin ilk açılışta otomatik Türkçe, diğer diller için ise otomatik İngilizce açılması sağlandı. Dil tercihi ilk tespitten sonra localStorage ile kalıcı hale getirildi.
- Ürün düzenleme formundaki ikincil eylem butonu (vazgeç/kapat) metni Türkçe dilinde "Tamam" olarak değiştirildi. Mevcut işlevsel davranışlar ve diğer "Vazgeç" butonları bu değişiklikten etkilenmemiştir.

---

## [2026-07-12 19:15 +03:00] — Node.js Express + SQLite Geçişi

### ➕ Eklenen Dosyalar
- `backend/package.json` — Express, CORS bağımlılıkları tanımlandı.
- `backend/db.js` — SQLite DatabaseSync tabanlı veritabanı şeması ve seed işlemleri tanımlandı.
- `backend/seedData.js` — İngilizce/Türkçe UI çevirileri ve kategorilerin statik seed verisi tanımlandı.
- `backend/server.js` — Express API sunucusu; Ürünler, Kategoriler, Rezervasyonlar ve Çeviriler için REST API sağlandı, statik sayfalar servis edildi.

### 📝 Düzenlenen Dosyalar
- `index.html` — `localStorage` bağımlılıkları temizlenip dynamic API endpoints çağrıları eklendi.
- `admin.html` — Yönetici arayüzünde `localStorage` temizlenip dynamic CRUD endpoints çağrıları entegre edildi.
- `README.md` — Yeni veritabanı mimarisi, Express API yapısı, kurulum ve çalıştırma yönergeleri eklendi.

### ⚙️ Açıklama
- `localStorage` tabanlı güvensiz ve geçici veri saklama yapısından SQLite veritabanı altyapısına geçiş yapıldı.
- `node:sqlite` yerleşik modülü kullanılarak Windows üzerinde Python/C++ derleme bağımlılıkları olmadan sıfır-konfigürasyon veri tabanı sağlandı.
- Admin paneli üzerinden yapılan tüm kategori, ürün ve rezervasyon işlemleri anında SQLite veritabanına kaydedilmekte ve tüm istemcilerde tutarlı olarak gösterilmektedir.
- dynamic API endpoints ve statik sayfalar için `no-store, no-cache` başlıkları eklenerek tarayıcı cache kaynaklı veri uyuşmazlığı giderilmiştir.

---


## [2026-07-09 23:34 +03:00] — Proje Başlangıcı

### ➕ Eklenen Dosyalar
- `logs/changelog.md` — Değişiklik günlüğü dosyası oluşturuldu.

### 📝 Açıklama
- Proje klasörüne `logs/` dizini eklendi.
- Bundan sonra yapılacak tüm değişiklikler bu dosyaya tarih damgası ve detaylarıyla kaydedilecektir.

---

## [2026-07-09 23:49 +03:00] — UI UX Pro Max Skill Kurulumu

### 🔧 Yüklenen Yazılımlar
- `Python 3.13.14` — `winget install Python.Python.3.13` ile kuruldu
  - Konum: `C:\Users\hasan_y4hfwna\AppData\Local\Programs\Python\Python313\python.exe`
  - Not: Eski Python 3.4.4 (`C:\Python34`) PATH'te hâlâ mevcut

### ➕ Eklenen Dosyalar/Klasörler
- `.agents/skills/ui-ux-pro-max/` — Ana AI tasarım skill'i (SKILL.md, data/, scripts/)
- `.agents/skills/banner-design/` — Banner tasarım skill'i
- `.agents/skills/brand/` — Marka kimliği skill'i
- `.agents/skills/design/` — Kapsamlı tasarım skill'i
- `.agents/skills/design-system/` — Tasarım sistemi skill'i
- `.agents/skills/slides/` — Sunum skill'i
- `.agents/skills/ui-styling/` — UI styling skill'i

### 📝 Açıklama
- GitHub repo `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git` incelendi
- `npx ui-ux-pro-max-cli init --ai antigravity` komutu ile Antigravity platformu için skill kuruldu
- Python 3.13 yüklendi (skill scriptleri f-string kullanıyor, Python 3.6+ gerekli)
- Search ve design-system scriptleri başarıyla test edildi
- Geçici klonlanan repo (`temp-skill-repo/`) temizlendi

### ✅ Test Sonuçları
- `search.py "modern dashboard" --domain style` → ✅ Başarılı
- `search.py "e-commerce website" --design-system -p "Test Project"` → ✅ Başarılı

### ✅ Önemli Not (ÇÖZÜLDÜ)
- ~~Sistemde eski Python 3.4.4 PATH'te öncelikli olduğu için tam yol kullanılması gerekiyordu~~
- **Çözüldü:** Yönetici PowerShell ile `C:\Python34` PATH'ten kaldırıldı
- Artık `python` komutu doğrudan **Python 3.13.14** çalıştırıyor ✅

---

## [2026-07-10 15:20 +03:00] — index.html Projeye Aktarıldı (Analiz & Import)

### ➕ Eklenen Dosyalar
- `index.html` — Masaüstündeki `index (1).html` dosyasından kopyalandı

### 📝 Açıklama
- Masaüstündeki `index (1).html` dosyası detaylı analiz edildi
- Dosya **Dayı Katık Tantuni & Döner** restoranının tek sayfalık web sitesi
- ~918KB boyutunda, tüm görseller base64 olarak gömülü
- 10 ana bölüm: Top Bar, Hero Carousel (7 slayt), Stats, Menü, Rezervasyon (Telegram Bot), Yorumlar (12 adet), Bilgi/İletişim, Footer, Bottom Nav
- Tasarım: Mobile-first, koyu tema, responsive (768px breakpoint)
- SEO: Schema.org (Restaurant), Open Graph, meta etiketleri, Google Site Verification
- Telegram Bot entegrasyonu ile rezervasyon sistemi mevcut
- Dosya `index.html` olarak projeye aktarıldı

### ⚠️ Notlar
- Telegram Bot Token dosyada açık metin olarak mevcut (güvenlik riski)
- Menü verileri JavaScript'te hardcoded
- Görseller base64 — ayrı dosyalara çıkarılması performansı artırır

---

## [2026-07-09 23:55 +03:00] — README.md Oluşturuldu (AI Bağlam Yükleme)

### ➕ Eklenen Dosyalar
- `README.md` — AI'ın hesap değişikliğinde projeyi anlayabilmesi için bağlam yükleme dosyası

### 📝 Açıklama
- Antigravity'de hesaplar arası geçiş yapıldığında sohbet geçmişi kayboluyor
- AI yeni oturumda projeyi tanıyamıyor, adaptasyon sorunu yaşanıyor
- README.md, AI'a şu talimatları veriyor:
  1. README'yi oku → proje amacını ve kuralları öğren
  2. `logs/changelog.md` oku → geçmiş değişiklikleri öğren
  3. Tüm dosyaları analiz et → mevcut yapıyı anla
  4. Kullanıcıya hazır olduğunu bildir
- Kullanıcı "README'yi oku" dediğinde AI otomatik olarak projeye adapte olacak

---

## [2026-07-10 19:00 +03:00] — Menü Veritabanı & Detay Paneli

### ➕ Eklenen Dosyalar
- `data/menu.json` — Menü ürünlerinin JSON veritabanı (kategori, fiyat, besin değerleri, alerjen bilgisi)

### 🔄 Değiştirilen Dosyalar
- `index.html` — Kapsamlı güncelleme

### 📝 Açıklama
- Menü verileri JavaScript'ten ayrıştırılarak `data/menu.json` dosyasına taşındı
- `fetch()` ile JSON veritabanından dinamik veri çekme sistemi kuruldu
- Her ürün için detay paneli (slide-in overlay) eklendi:
  - Ürün görseli, açıklama, fiyat
  - Besin değerleri tablosu (kalori, protein, karbonhidrat, yağ)
  - Makro dağılım donut grafiği (Chart.js benzeri CSS donut)
  - Alerjen bilgisi kutusu
  - İçindekiler listesi
- Deep link desteği (`#detay-{id}`) ve tarayıcı geri butonu uyumu
- Yerel sunucu `python -m http.server 8085` ile CORS sorunları çözüldü

---

## [2026-07-10 20:00 +03:00] — Premium Arayüz İyileştirmeleri

### 🔄 Değiştirilen Dosyalar
- `index.html` — Arayüz ve tasarım güncellemesi

### 📝 Açıklama
- **Kategori filtrelerinden "Tümü" seçeneği kaldırıldı** — Varsayılan olarak "Menüler" aktif
- **Detay paneli logo animasyonu** — Panel açılırken logo scale+rotate mikro-animasyonu
- **Makro donut grafiği renkleri güncellendi:**
  - Protein: Soft Yeşil (`#81C784`)
  - Karbonhidrat: Sıcak Amber (`#FFB74D`)
  - Yağ: Ateş Turuncusu (`#FF5722`)
- **Premium iç çerçeve dokusu** — Besin tablosu, makro kartı, alerjen kutusu arka planları yarı saydam cam dokusuna çevrildi

---

## [2026-07-10 22:30 +03:00] — Topbar Onarımı, Kategori Dropdown & Tema Switcher

### 🔄 Değiştirilen Dosyalar
- `index.html` — HTML yapısı onarımı + yeni bileşenler

### 📝 Açıklama
- **HTML/CSS yapısal onarım:**
  - Önceki düzenlemelerde yanlışlıkla silinen `</style>`, `</head>`, `<body>` etiketleri geri eklendi
  - Topbar header HTML bloğu yeniden oluşturuldu
- **Uiverse.io Tema Switcher:**
  - Topbar'a şık ay/güneş animasyonlu toggle switch eklendi
  - Tıklandığında `body.theme-bw` sınıfı ile tema değişir
  - Tercih `localStorage` ile saklanır
- **Kategori Seçim Dropdown Menüsü:**
  - Eski yatay kayan butonlar yerine modern dropdown menü yapısı kuruldu
  - Animasyonlu açılma/kapanma (slide-down + fade-in)
  - Seçilen kategoriye göre menü kartları filtrelenir
  - Dropdown buton metni seçime göre güncellenir
- **Floating Bottom Nav (iOS tarzı):**
  - Alt bar, buğulu arka plan (`backdrop-filter: blur(20px)`) ile yüzen dock tasarımına dönüştürüldü
  - Yuvarlatılmış köşeler ve ince kenar çizgisi
- **Instagram SVG simgesi:** Düşük kaliteli raster ikon yerine kaliteli SVG kullanıldı

---

## [2026-07-10 23:55 +03:00] — Logo Onarımı, Satyamchaudharydev Switch & Açık Tema İyileştirmeleri

### 🔄 Değiştirilen Dosyalar
- `index.html` — Logo onarımı + Açık Tema CSS/JS + Yeni Switch Entegrasyonu

### 📝 Açıklama
- **Bozuk Logo & Favicon Onarımı:**
  - Topbar'daki Dayı Katık logosu kırık base64 dizisi nedeniyle görünmüyordu.
  - Orijinal `index (1).html` dosyasından tam logo base64 verisi kopyalanarak düzeltildi.
  - Favicon da aynı yöntemle onarıldı.
  - PowerShell scripti (`scratch/fix_logo.ps1`) ile otomatik onarım yapıldı.
- **Satyamchaudharydev Switch Entegrasyonu:**
  - Uiverse.io moon/sun switch'i kaldırıldı, yerine kullanıcının istediği satyamchaudharydev tasarımı yeni switch entegre edildi.
  - Switch stiliyle tam uyumlu CSS ve check-state animasyonları uygulandı.
- **Sol Üst Logonun Kararmama Düzeltmesi:**
  - Açık temada logonun kararmasını sağlayan `body.theme-bw .topbar-logo img { filter: invert(1)... }` kuralı tamamen kaldırıldı. Logo artık her iki temada da orijinal renk ve parlaklığında görünür.
- **Açık Tema Renk, Çizgi ve Çerçeve Hatalarının Giderilmesi:**
  - Açık temada arka planın bej (`#FAF6F0`), yazı renginin ise koyu espresso kahve (`#2C1A10`) olması için `--cream` ve `--dark` değişkenleri tersine çevrildi.
  - Kart, çerçeve ve kutuların (`.nutrition-table`, `.macro-donut-container`, `.detail-allergens-container`, `.ingredients-text`, `.detail-menu-info`) arka planları açık temada görünmeyen eski açık renkler yerine şeffaf koyu bej/kahve (`rgba(44, 26, 16, 0.03)`) ve sınır çizgileri belirgin (`rgba(44, 26, 16, 0.08)`) hale getirildi.
  - Detay paneli, besin değerleri tablosu metinleri, makro dağılım etiketleri, içerik metinleri ve dropdown/rezervasyon formu form elemanları açık temada %100 okunabilir olacak şekilde renk kontrastları düzenlendi.
  - Telefon butonunun (`.topbar-phone`) scrolled ve not scrolled durumlarındaki metin ve çerçeve renkleri temaya duyarlı hale getirildi.
- **Tema Toggle JS fonksiyonu eklendi:**
  - `toggleMonochromeTheme()` fonksiyonu tema geçişini yönetir.
  - `DOMContentLoaded` ile sayfa yüklendiğinde `localStorage`'dan tema yüklenir.
  - Switch checkbox durumu tema ile senkronize.

---

## [2026-07-11 00:05 +03:00] — Kategori Yapısı İyileştirmesi & 'Menüler' Seçeneğinin Kaldırılması

### 🔄 Değiştirilen Dosyalar
- `index.html` — Kategori dropdown ve varsayılan yükleme mantığı
- `data/menu.json` — Ürünlerin kategorileri güncellendi

### 📝 Açıklama
- **'Menüler' Kategorisinin Kaldırılması ve Dağıtılması:**
  - Eskiden bağımsız bir kategori olan ve yalnızca kombo menüleri (dürüm + patates + içecek) gösteren "Menüler" (`menuler`) seçeneği, kullanıcıların aradıkları yiyeceğe göre filtreleme yapmasını zorlaştırdığı için kaldırıldı.
  - `data/menu.json` veritabanındaki 10 adet kombo menü ürünü, kendi asıl yiyecek türlerine göre yeniden sınıflandırıldı:
    - Tavuk döner içeren tüm menüler (Katık Tavuk Döner Dürüm Menü 1, Zurna Tavuk Menü 2 vb.) `"tavuk"` kategorisine taşındı.
    - Et döner içeren tüm menüler (Katık Et Döner Dürüm Menü 1 vb.) `"et"` kategorisine taşındı.
- **Arayüz ve Varsayılan Yükleme Güncellemesi:**
  - Dropdown kategoriler listesinden "Menüler" seçeneği silindi.
  - Sitenin açılışında varsayılan olarak seçilen kategori **"Tantuni"** yapıldı ve sayfa yüklendiğinde doğrudan Tantuni kartları listelenecek şekilde ayarlandı.
  - Dropdown butonunun varsayılan metni ve durumu "Tantuni" olarak güncellendi.
  - Kullanıcılar artık tavuk döner dürüm ararken kombo menüleri de doğrudan "Tavuk Döner" kategorisinde görebilmektedir.

---

## [2026-07-11 00:15 +03:00] — Yönetici Paneli (Admin Panel) Entegrasyonu & Dinamik Veritabanı Yönetimi

### 🔄 Değiştirilen Dosyalar
- `index.html` — Yönetici Kontrol Paneli, CRUD mantığı ve yerel veritabanı entegrasyonu.

### 📝 Açıklama
- **localStorage Tabanlı Veritabanı:** Yemek verileri tarayıcının `localStorage` (anahtar: `menuData`) belleğinde saklanır. Boşsa `menu.json` fetch edilir.
- **Yönetici Kontrol Paneli Arayüzü:** Ürünlerde anlık arama, yeni ürün ekleme, listedeki ürünler için düzenle ve sil butonları bulunur.
- **Ürün Düzenleme/Ekleme Formu:** Ürün adı, fiyatı, kategorisi, görseli, besin değerleri ve alerjen bilgileri güncellenebilir.

---

## [2026-07-11 00:30 +03:00] — Yönetici Paneli Özel Minimal Stepper ve Alerjen Buton Entegrasyonu

### 🔄 Değiştirilen Dosyalar
- `index.html` — Sayı artırma (stepper) ve alerjen seçici butonları için CSS stilleri, HTML form güncellemeleri ve JavaScript kontrol fonksiyonları eklendi.

### 📝 Açıklama
- **Estetik Sayı Artırma (Custom Stepper):**
  - Tarayıcının varsayılan, kaba spinner ok tuşları (`input[type="number"]`) CSS ile tamamen gizlendi.
  - Yerine minimalist, şık, yanlarında `-` ve `+` butonları olan `.custom-stepper` bileşeni yerleştirildi (Fiyat, Kalori, Protein, Karbonhidrat, Yağ vb. tüm sayısal alanlar için).
  - JavaScript ile stepUp/stepDown mantığı entegre edildi. Fiyat stepper'ı 5'er 5'er, enerji stepper'ı 10'ar 10'ar, makro stepper'ları ise 0.5/0.1 hassasiyetle artırıp azaltacak şekilde yapılandırıldı.
- **İnteraktif Alerjen Seçim Kutucukları (Allergen Badges):**
  - Virgülle ayrılmış düz metin alerjen girdisi tamamen kaldırıldı.
  - Yerine Gluten, Süt/Laktoz, Soya, Yumurta, Hardal, Kereviz ve Susam için tıklanabilir estetik badge butonlar (`.allergen-badge-btn`) eklendi.
  - Seçilen alerjenler aktif (kırmızı) renge dönerek vurgulanır; seçilmeyenler pasif (gri) renkte kalır.
  - JavaScript `openAdminForm` ve `saveAdminProduct` fonksiyonları bu buton durumlarını okuyacak ve `localStorage`'a yazacak şekilde güncellendi.

---

## [2026-07-11] — Pürüzsüz Tab Animasyonları & Rezervasyon Yönetim Paneli

### ✨ Detay Sayfası Tab Kayma Animasyonu
- **Kayan Turuncu Çizgi (Tab Indicator):**
  - Eski `::after` pseudo-element tabanlı aktif çizgi kaldırıldı (bu, çizginin ortada kaybolmasına neden oluyordu).
  - Yerine tek bir `<div class="detail-tab-indicator">` elemanı eklendi. Yüzde tabanlı `left` pozisyonu ve `cubic-bezier(0.25, 1, 0.5, 1)` geçişi ile sekme değiştirirken turuncu çizgi pürüzsüzce kayar — hiç kaybolmaz.
- **İçerik Paneli Yatay Kaydırma (Content Slider):**
  - Tab içerikleri `display:none/block` yerine, `flex` konteyner ve `translateX` ile yatay slider yapısına taşındı.
  - `.detail-tab-content-wrapper` (overflow:hidden) ve `.detail-tab-content-slider` (300% genişlik, flex) ile 3 panel yan yana dizildi.
  - Aktif olmayan paneller %35 opaklıkla soluklaşır, aktif panel %100 opaklıkla parlak gösterilir.
  - `switchDetailTab()` fonksiyonu, tıklanan sekmenin index'ini bulup hem indicator hem slider'ı senkronize olarak kaydırır.

### 🍽️ Admin Paneli Rezervasyon Yönetimi
- **Sekmeli Yapı:**
  - Yönetim paneline "Ürün Yönetimi" ve "Rezervasyonlar" olmak üzere iki sekme eklendi.
  - Rezervasyonlar sekmesinde okunmamış sayısını gösteren kırmızı bildirim rozeti (badge) bulunur.
  - "Yeni Ürün Ekle" butonu yalnızca ürünler sekmesinde görünür.
- **Yerel Veri Depolama:**
  - Müşteri tarafından yapılan her rezervasyon, Telegram API isteğinden bağımsız olarak `localStorage('reservationsData')` altında JSON olarak saklanır.
  - Bu sayede internet bağlantısı kopsa bile rezervasyon kaydı kaybolmaz.
- **Rezervasyon Kartı Özellikleri:**
  - Ad, telefon, tarih, saat, kişi sayısı ve not bilgileri şık bir kart tasarımında gösterilir.
  - Okunmamış kartlar turuncu sol kenarlıkla vurgulanır.
  - ✅ butonu ile "Okundu" olarak işaretlenebilir.
  - Sürükle-bırak (Drag & Drop) ile çöp kutusu alanına bırakılarak silinebilir.
- **Çöp Kutusu Alanı (Trash Zone):**
  - Kesikli kenarlıklı, animasyonlu bir alan. Kart üzerine sürüklendiğinde büyüyerek kırmızıya döner.
  - Bırakıldığında rezervasyon kalıcı olarak silinir ve liste anında güncellenir.

---

## [2026-07-11 10:30 +03:00] — Admin Arayüz İyileştirmeleri, Modern Tarih Seçici, Otomatik Cihaz Teması Algılama & Rezervasyon Senkronizasyonu

### 🔄 Değiştirilen Dosyalar
- `index.html` — Tarih seçimi tekli date input alanına dönüştürüldü, kısıtlayıcı JS kodu ve aydınlık/karanlık tema senkronizasyonu eklendi.

### 📝 Açıklama
- **Modern Rezervasyon Tarih Seçici:** Eski tip üçlü select (gün/ay/yıl) açılır kutuları yerine, mobil ve masaüstü uyumlu, şık ve premium tasarımlı tekli `<input type="date">` alanına geçildi. Takvim simgesi turuncu/kızıl (Ember) marka tonlarıyla uyumlu olacak şekilde CSS filtreleri ile özelleştirildi.
- **Geçmiş Tarih Kısıtlaması:** Rezervasyon yapılırken kullanıcıların yalnızca bugünün ve gelecekteki önümüzdeki tarihleri seçebilmesi sağlandı; geçmiş tarihler seçilemeyecek şekilde engellendi (`min` özniteliği dinamik olarak bugünün tarihi yapıldı).
- **Otomatik Cihaz Teması Algılama (Aydınlık/Karanlık):** Sayfa yüklendiğinde el ile seçilmiş bir tema yoksa, cihazın varsayılan renk şeması (`prefers-color-scheme`) algılanarak aydınlık ya da karanlık mod (admin paneli dahil) otomatik uygulanır. Sistem teması değiştiğinde sayfa teması da dinamik olarak güncellenir.
- **Sekmeler Arası Tema Senkronizasyonu:** Birden fazla sekme/pencere açıkken, herhangi bir sekmede tema değiştirildiğinde tüm açık sekmelerdeki temalar anında senkronize edilir.
- **Şifresiz Yönetici Paneli Girişi:** Kullanıcı talebi üzerine şifre giriş modali atlandı. Footer'daki linke tıklandığında veya url sonuna `#admin` / `#yonetici` eklendiğinde doğrudan yönetim paneline geçiş yapılır.
- **Yeni Ürün Ekle Butonunun Taşınması:** "Yeni Ürün Ekle" butonu listenin en başına yerleştirildi.
- **Odakla Açılan Kategori Ekleme Paneli:** Arama çubuğuna odaklanıldığında (onfocus) hemen altında aşağı doğru kayarak açılan şık bir panelde "Yeni Kategori Ekle" butonu sunulur. Odak dışına çıkıldığında panel pürüzsüzce kapanır.
- **Kategori Bazlı Ürün Listeleme:** Admin ürün listesinde arama çubuğunun yanına bir kategori seçici dropdown (`#adminCategoryFilter`) eklenerek ürünlerin kategoriye göre süzülebilmesi sağlandı.
- **Anlık Rezervasyon Senkronizasyonu:** Yeni rezervasyon yapıldığı anda açık olan admin panelindeki rezervasyon listesi ve bildirim rozeti sayfa yenilenmesine gerek kalmadan anlık olarak güncellenir. Ayrıca farklı sekmelerde açık olan admin panellerini senkronize etmek için `storage` event listener eklendi.
- **Menüyü Sıfırla Butonunun Kaldırılması:** Menüyü varsayılana sıfırlama butonu kullanıcı isteğiyle arayüzden ve koddan kaldırılmıştır.

---

## [2026-07-11 11:24 +03:00] — Yönetici Giriş Güvenliği & Arayüz Onarımları

### 🔄 Değiştirilen Dosyalar
- `index.html` — Footer linki kaldırıldı, `#admin` deep link şifre koruması eklendi, sayfa yerleşim hataları giderildi.

### 📝 Açıklama
- **Yönetici Girişinin Gizlenmesi:** Footer alanında yer alan "Yönetici Girişi" linki arayüzden tamamen kaldırılarak sıradan ziyaretçilerden gizlendi.
- **Deep Link Şifre Koruması:** URL sonuna eklenen `#admin` veya `#yonetici` linkleri tıklandığında (veya masaüstündeki `.bat` dosyası çalıştırıldığında) doğrudan yönetim paneline geçiş engellendi. Bu istekler artık kullanıcıyı `dayikatik123` şifresini girmesi için güvenli **Yönetici Girişi** şifre modaline yönlendirir.
- **Harita & Footer Arayüz Onarımı:** index.html'in footer alanındaki eksik kapanış etiketleri ve Google Haritalar iframe'inin yerleşimi düzeltilerek sayfa kararlılığı sağlandı.

---

## [2026-07-11 11:36 +03:00] — Tarih Seçimi Özel Dropdown Entegrasyonu

### 🔄 Değiştirilen Dosyalar
- `index.html` — Tarih alanındaki native takvim seçici kaldırıldı, üçlü özel dropdown (Gün, Ay, Yıl) yapısına geçildi ve JS rezervasyon mantığı güncellendi.

### 📝 Açıklama
- **Özel Tasarım Tarih Açılır Kutuları (Gün, Ay, Yıl):** Native date input alanı yerine, rezervasyon formuna marka kimliği ve SAAT dropdown stilleriyle tam uyumlu üç adet premium **Custom Select** bileşeni (Gün, Ay, Yıl) entegre edildi.
- **Dinamik Tarih/Geçmiş Kısıtlaması:** JavaScript ile seçilen yıla ve aya göre gün sayısı dinamik olarak sınırlandırıldı (örn. Şubat ayı seçildiğinde Gün listesi 28 veya 29'a düşer). Ayrıca, içinde bulunduğumuz yıl ve ay seçildiğinde bugünden önceki (geçmiş) günlerin seçilmesi dinamik olarak engellendi.
- **JS & Telegram Rezervasyon Onarımı:** `sendRezervasyon` fonksiyonu bu yeni girdileri okuyacak, mesajı düzgün biçimlendirecek ve rezervasyon başarıyla yapıldığında tüm dropdown alanlarını sıfırlayacak şekilde güncellendi.



## [2026-07-11 12:05 +03:00] � Instagram �leti�im �konu �yile�tirmesi

### ?? De�i�tirilen Dosyalar
- `index.html` � �leti�im b�l�m� Instagram ikonu.

### ?? A��klama
- **Instagram �konu SVG'ye �evrildi:** �leti�im b�l�m�nde yer alan d���k ��z�n�rl�kl� Instagram ikonu, markaya uygun, net ve kaliteli SVG format�nda modern bir ikon ile de�i�tirildi.


## [2026-07-11 13:40 +03:00] — Yönetici Paneli Arayüz ve Detay Paneli Yazı Tipi İyileştirmeleri

### 🔄 Değiştirilen Dosyalar
- index.html — Google Fonts entegrasyonu, el yazısı (cursive) stil güncellemeleri, yönetim paneli slider stil onarımı, dropdown kaydırma/kapanma sorunu çözümü.

### 📝 Açıklama
- **El Yazısı (Cursive) Fontu Entegrasyonu:** Yemek detay panelinin alt kısmında yer alan "Dayı Katık, Tantuni & Döner, Lezzet bizim işimiz!" yazısı için Google Fonts üzerinden **Dancing Script** el yazısı fontu entegre edilerek daha samimi ve estetik bir arayüz görünümü sağlandı.
- **Yönetim Paneli Bölünme (50/50) Hatası Giderildi:** Ürün Yönetimi ve Rezervasyonlar pencerelerinin yan yana sıkışıp 50/50 bölünmüş görünmesi sorunu, .admin-tab-content-slider yapısına lex-shrink: 0 eklenerek çözüldü. Artık her sekme ekran genişliğinin tamamını kaplayacak şekilde tam genişlikte çalışıyor.
- **Dropdown Listeleri Kaydırma ve Kapanma Sorunu Çözüldü:** Yönetim panelindeki "Tüm Kategoriler" ve diğer tarih seçici dropdown listeleri aşağı kaydırılmaya çalışıldığında veya dropdown içine tıklandığında listenin kendi kendine kapanması sorunu giderildi. Document click event dinleyicisinin dropdown içi tıklamaları (ve kaydırma hareketlerini) tetiklemesi e.target.closest('.custom-select-container') kontrolüyle engellendi.

## [2026-07-11 22:20 +03:00] — İngilizce Dil Modu, Telegram Rezervasyon Senkronizasyonu & PC Admin Arayüz Onarımı

### 🔄 Değiştirilen Dosyalar
- [index.html](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/index.html) — Dil seçici entegre edildi, i18n altyapısı yazıldı, Telegram veritabanı senkronizasyonu eklendi, PC admin paneli CSS yerleşimi düzeltildi.

### 📋 Açıklama
- **Dil Seçim Butonu ve İngilizce Modu:** Üst barda yer alan eski tema değiştirici buton kaldırıldı, yerine dinamik dil toggle butonu (`.lang-btn`) eklendi. Butona tıklandığında sayfa içeriği (kategoriler, menü kartları, detay pencereleri, rezervasyon formları, hata/başarı mesajları, tarih dropdown'ları) yerel oturumda (`localStorage` ile korunarak) anında Türkçe ve İngilizce arasında çevrilir.
- **Telegram Pinned KV Rezervasyon Senkronizasyonu:** Rezervasyon listesi anlık olarak Telegram botunun sabitlenmiş (pinned) veritabanı mesajı ile senkronize edilir. 10 saniyelik periyodik arka plan taraması ile sunucu ve yerel cihazlardaki veriler otomatik olarak birleştirilir. Rozet sayımları ve admin arayüzü anlık olarak güncellenir.
- **PC Admin Paneli Yerleşim Hatası Giderildi:** Masaüstü bilgisayarlarda admin paneli açıldığında ortaya çıkan CSS `inset: 0` ve `left: 50%` çakışması, `right: auto` kuralı eklenerek giderildi. Panel artık PC ekranlarında tam ortalanmış ve kusursuz görüntülenir.
- **Tarih & Saat Seçicileri Çevirisi:** Rezervasyon formundaki Gün, Ay, Yıl ve Saat seçicilerinin varsayılan boş etiketleri seçilen dile göre otomatik olarak ("Day", "Month", "Year", "Select") güncellenir.


## [2026-07-11 22:34 +03:00] — Masaüstü Kısayol Batch Dosyası Eklendi

### ➕ Eklenen Dosyalar
- [Dayi_Katik_Web_Sitesi.bat](file:///c:/Users/hasan_y4hfwna/Desktop/Dayi_Katik_Web_Sitesi.bat) — Masaüstüne interaktif kısayol batch dosyası eklendi.

### 📋 Açıklama
- **Masaüstü Yönlendirici Kısayol Menüsü:** Masaüstüne, tek tıklamayla canlı web sitesini, canlı yönetici panelini veya yerel (local) `index.html` önizleme dosyasını varsayılan tarayıcıda açmayı sağlayan şık, Türkçe karakter destekli (UTF-8/chcp 65001) interaktif bir `.bat` dosyası oluşturuldu.


## [2026-07-11 22:38 +03:00] — Masaüstü Yerel Sunucu (Localhost:12000) Batch Dosyası Eklendi

### ➕ Eklenen Dosyalar
- [Dayi_Katik_Yerel_Sunucu.bat](file:///c:/Users/hasan_y4hfwna/Desktop/Dayi_Katik_Yerel_Sunucu.bat) — Masaüstüne yerel HTTP sunucusunu başlatan batch dosyası eklendi.

### 📋 Açıklama
- **Yerel HTTP Sunucusu (Port 12000):** Masaüstüne, sistemde yüklü olan Python 3.13.14 üzerinden projenin çalışma dizinini `http://localhost:12000` adresinde yerel olarak sunan ve varsayılan tarayıcıda otomatik açan pratik bir `.bat` kısayolu oluşturuldu.


## [2026-07-11 22:52 +03:00] — JS Alert Sözdizimi Hatası Giderildi

### 🛠️ Değiştirilen Dosyalar
- [index.html](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/index.html) — `sendRezervasyon` fonksiyonundaki JS sözdizimi (syntax) hatası giderildi.

### 📋 Açıklama
- **Sözdizimi Hatası Giderildi (Uncaught SyntaxError):** `sendRezervasyon()` fonksiyonu içerisindeki alert/innerHTML mesajlarının sonuna yanlışlıkla eklenen fazla `';` karakterleri temizlendi. Bu hata giderilerek sitenin tamamen yüklenmesini engelleyen JS motoru blokajı kaldırıldı ve arayüzün normal şekilde yüklenip çalışması sağlandı.


## [2026-07-11 23:00 +03:00] — Arayüz & Çeviri İyileştirmeleri (Logo, Reviews Kaldırma & Mobil Nav Çevirisi)

### 🛠️ Değiştirilen Dosyalar
- [index.html](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/index.html) — Logo geri getirildi, Gerçek Deneyimler bölümü kaldırıldı, mobil alt menü ve çalışma günleri çevirileri tamamlandı.

### 📋 Açıklama
- **Logo Kurtarma:** Önceki toplu değişiklikte bozulan ve SVG etiketiyle çakışan sol üstteki site logosunun base64 veri yapısı ve HTML'i footer ile senkronize edilerek tamamen düzeltildi ve geri getirildi.
- **Yorumlar (Gerçek Deneyimler) Bölümünün Kaldırılması:** Kullanıcı isteği doğrultusunda "Gerçek Deneyimler" bölümü hem HTML (`#reviews` section) hem de JS (yorum verileri ve rendering mekanizması) katmanlarından tamamen silindi.
- **İngilizce Dil Modu Eksiklerinin Tamamlanması:**
  - Mobil alt menü etiketleri (Rezerve, Menü, Sipariş, Ara, İletişim) dile göre dinamik yerelleştirildi.
  - Çalışma Saatleri altındaki haftalık günler (Monday, Tuesday...) ve iletişim bölümü etiketleri ("Bize Ulaşın" -> "Contact Us" vb.) `i18nData` sözlüğüne eklenerek İngilizce dil modunda Türkçe kalması sorunu giderildi.


## [2026-07-11 23:02 +03:00] — JS i18n Sözdizimi Hatası Giderildi

### 🛠️ Değiştirilen Dosyalar
- [index.html](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/index.html) — `en` sözlük bloğundaki virgül eksiği giderildi.

### 📋 Açıklama
- **Virgül Eksiği Giderildi (Uncaught SyntaxError):** İngilizce dil sözlüğü (`en`) içerisindeki `sunday: "Sunday"` anahtarından sonra unutulan virgül karakteri yerleştirildi. Bu sayede tüm sayfa betiğinin yüklenmesini engelleyen JS sözdizimi hatası tamamen giderilmiş oldu.


## [2026-07-11 23:09 +03:00] — Orijinal Logolar Geri Yüklendi

### 🛠️ Değiştirilen Dosyalar
- [index.html](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/index.html) — Orijinal base64 logosu (6650 karakterlik) hem üst hem alt logo alanlarına geri yazıldı.

### 📋 Açıklama
- **Orijinal Logo Kurtarma:** Önceki oturumlarda bozulan ve `styleguides.` gibi alakasız metinlerle sonlanan bozuk base64 logoları yerine, orijinal `dayikatikwebsitesi` klasöründeki temiz base64 logoları okunarak sayfanın sol üst ve en alt alanlarındaki `img` etiketlerine başarıyla yerleştirildi. Artık logolar eskisi gibi kusursuz şekilde görünmektedir.


## [2026-07-11 23:38 +03:00] — Sağ Üstteki Arama (Telefon) Özelliği Kaldırıldı

### 🛠️ Değiştirilen Dosyalar
- [index.html](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/index.html) — Sağ üst tarafta yer alan ve telefon araması yapmayı sağlayan "Ara" butonu kaldırıldı.

### 📋 Açıklama
- **Telefon Arama/Arama Butonunun Kaldırılması:** Sitenin sağ üst kısmında yer alan ve mobil/masaüstü cihazlarda "Ara" (Call) şeklinde görünen telefon dialer ikonu ve bağlantısı, kullanıcı isteği üzerine tamamen kaldırılmıştır. Artık sağ üstte yalnızca dil seçeneği butonu yer almaktadır.


## [2026-07-12 11:10 +03:00] — Kapsamlı Dil & Yerelleştirme İyileştirmeleri

### 🛠️ Değiştirilen Dosyalar
- [index.html](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/index.html) — Rezervasyon formundaki aylar, gün/ay/yıl seçici başlıkları, harita dili ve alt bilgi buton etiketleri yerelleştirildi.

### 📋 Açıklama
- **Ay İsimlerinin Yerelleştirilmesi:** Rezervasyon takviminde listelenen ay adları (Ocak $
ightarrow$ January, Şubat $
ightarrow$ February vb.) `monthTranslations` haritası aracılığıyla dile göre dinamik hale getirildi. Rezervasyon onayında gönderilen Telegram mesajındaki ay isimleri de seçili dile göre senkronize edildi.
- **Tarih Seçici Yerelleştirmesi:** Tarih seçici dropdown başlıklarının ve varsayılan seçeneklerinin ("Yıl" / "Year", "Ay" / "Month", "Gün" / "Day") dile göre dinamik değişmesi sağlandı.
- **Google Maps Dil Senkronizasyonu:** Sayfadaki gömülü Google Haritalar iframe kaynağına `hl` dil parametresi bağlanarak harita arayüzünün dilinin (TR/EN) ana sayfa diliyle birlikte otomatik değişmesi sağlandı.
- **Maps Butonu ve Getir Etiketi Yerelleştirmesi:** İletişim kartı altındaki "Google Maps'te Aç" butonu ve Getir Yemek altındaki "Online sipariş" (Online order) ifadesi i18n altyapısına eklenerek dinamik hale getirildi.


## [2026-07-12 11:16 +03:00] — Masaüstüne Yönetici Paneli Başlatma Kısayolu Eklendi

### 🛠️ Eklene Dosyalar
- [Dayi_Katik_Yonetici_Paneli.bat](file:///c:/Users/hasan_y4hfwna/Desktop/Dayi_Katik_Yonetici_Paneli.bat) — Masaüstünde doğrudan yönetici giriş ekranını tetikleyen batch dosyası.

### 📋 Açıklama
- **Otomatik Sunucu Kontrollü Kısayol:** Masaüstüne eklenen yeni batch dosyası aracılığıyla, yerel sunucunun (port 12000) açık olup olmadığı otomatik denetlenir. Sunucu aktifse tarayıcıda doğrudan `#admin` hash yönlendirmesiyle yönetici giriş ekranı tetiklenir; sunucu kapalıysa sunucuyu arka planda sessizce başlatıp ardından sayfayı açar.


## [2026-07-12 11:18 +03:00] — Kısayol Batch Dosyası Uyumluluk Güncellemesi

### 🛠️ Değiştirilen Dosyalar
- [Dayi_Katik_Yonetici_Paneli.bat](file:///c:/Users/hasan_y4hfwna/Desktop/Dayi_Katik_Yonetici_Paneli.bat) — Karakter kodlama sorunlarını ve uyumluluk hatalarını önlemek için ASCII tabanlı komut yapısına geçildi.

### 📋 Açıklama
- **ASCII Karakter Yapısı ve Hata Giderme:** Windows terminal (cmd) ortamının yerel kod sayfalarıyla uyumsuzluk yaratan Türkçe karakterler (ı, ş, ç vb.) batch dosyasından temizlenerek standart ASCII karakterlerine dönüştürüldü. Böylece çift tıklandığında anında kapanma/çökme hatası giderildi.
- **Daha Hassas Dinleme Sorgusu:** Sunucu durumunu kontrol etmek için kullanılan sorgu `findstr LISTENING | findstr :12000` komutu ile daha hassas hale getirildi ve bekleme süreci ping sorgusu ile stabilleştirildi.


## [2026-07-12 11:21 +03:00] — Yönetici Paneli Çift Dil Ürün Yönetimi Desteği

### 🛠️ Değiştirilen Dosyalar
- [index.html](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/index.html) — Ürün düzenleme formuna İngilizce alanlar eklendi ve JS kaydetme/yükleme mantığı güncellendi.

### 📋 Açıklama
- **Çift Dilli Ürün Yönetimi:** Yönetici paneli ürün düzenleme/ekleme formuna İngilizce modlar için ayrı alanlar eklendi:
  - Ürün Adı (Türkçe / İngilizce)
  - Açıklama (Türkçe / İngilizce)
  - Porsiyon Ölçüsü (Türkçe / İngilizce)
  - İçindekiler (Türkçe / İngilizce)
- **Dinamik Veri Entegrasyonu:** Admin panelinde girilen İngilizce veriler, `itemTranslations` sözlüğüne dinamik olarak eklenir ve `localStorage` üzerinde `itemTranslationsData` anahtarıyla tarayıcıda kalıcı olarak saklanır.
- **Kusursuz Geriye Dönük Uyumluluk (Fallback):** Veri tabanında İngilizce karşılığı olmayan veya boş bırakılan alanlar için otomatik olarak Türkçe değerler varsayılan olarak kullanılır. Böylelikle sistemde herhangi bir veri kaybı veya kırılma yaşanması engellenmiştir.
