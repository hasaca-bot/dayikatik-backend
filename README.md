# 🌐 Dayı Katık Web Sitesi

## 🤖 AI İÇİN: ÖNCE BUNU OKU!

> **Bu projeyi ilk kez mi görüyorsun? Aşağıdaki adımları takip et.**
> Kullanıcı hesaplar arası geçiş yaptığında sohbet geçmişi kayboluyor.
> Bu dosya, yeni oturumda AI'ın projeyi anlamasını sağlar.

### ⚡ Hızlı Bağlam Yükleme (AI Talimatları)

1. **Bu README'yi oku** — Projenin amacını ve kuralları öğren
2. **Changelog'u oku** — `logs/changelog.md` dosyasını oku, tüm geçmiş değişiklikleri ve notları öğren
3. **Proje dosyalarını analiz et** — Klasör yapısını tara, mevcut dosyaları incele
4. **Amacı anla** — Aşağıdaki proje bilgilerini kavra
5. **Kullanıcıya hazır olduğunu bildir** — Kısa bir özet ver ve devam et

```
Kullanıcı sana "README'yi oku" veya "projeyi tanı" dediğinde yukarıdaki adımları uygula.
```

---

## 📋 Proje Bilgileri

| Alan | Değer |
|------|-------|
| **Proje Adı** | Dayı Katık Web Sitesi |
| **Canlı URL** | [dayikatik.netlify.app](https://dayikatik.netlify.app) |
| **Backend API URL** | [dayikatik-api.onrender.com](https://dayikatik-api.onrender.com) |
| **Platform** | Netlify (Frontend) + Render.com (Backend + PostgreSQL) |
| **Dil** | Türkçe (kullanıcı ile Türkçe konuş) |
| **Kullanıcı** | Hasan |
| **Çalışma Dizini** | `c:\Users\hasan_y4hfwna\Desktop\dayikatikwebsitesi - Kopya` |

---

## 🎯 Projenin Amacı

Bu proje **Dayı Katık Tantuni & Döner** restoranının (Safranbolu, Karabük) tek sayfalık profesyonel web sitesidir. Site tamamen işlevsel olup ön yüz Netlify üzerinde, arka yüz ise Render.com üzerinde bulutta çalışmaktadır.

### ✨ Temel Özellikler

- 🎠 **Hero Carousel** — Otomatik kayan ürün görselleri
- 🍖 **Dinamik Menü Sistemi** — `data/menu.json` dosyasından yüklenen ürünler, kategori filtresi, detay paneli
- 📊 **Besin Değerleri** — Kalori, makro besinler, alerjen bilgisi, içindekiler
- 📅 **Rezervasyon Formu** — Tarih, saat, kişi sayısı seçimi
- 🗺️ **Konum & İletişim** — Google Maps, telefon, Instagram bağlantısı
- ⭐ **Müşteri Yorumları** — Yıldız puanlı değerlendirme bölümü
- 🌗 **Tema Değiştirme** — Koyu (varsayılan) ve açık (premium light) tema geçişi
- 📱 **Mobil Uyumlu** — Responsive tasarım, floating bottom nav dock
- 🔐 **Admin Paneli** — Ürün yönetimi (ekleme/düzenleme/silme), kategori yönetimi, rezervasyon görüntüleme
- 🔍 **SEO Optimizasyonu** — Meta etiketler, Open Graph, yapılandırılmış veri (Schema.org Restaurant)
- 🛒 **Sipariş Entegrasyonu** — Getir bağlantısı

---

## 📁 Proje Yapısı

```
dayikatikwebsitesi/
├── .agents/                    # AI skill dosyaları
├── backend/                    # Node.js + Express Backend
│   ├── node_modules/           # Backend bağımlılıkları
│   ├── dayikatik.db            # SQLite Veritabanı dosyası (Local dev modunda kullanılır)
│   ├── db.js                   # Çift Modlu Veritabanı Sınıfı (SQLite / PostgreSQL)
│   ├── seedData.js             # Varsayılan dil çevirileri ve kategoriler seed verisi
│   ├── server.js               # REST API endpoints (asenkron destekli) & Statik dosya sunucusu
│   └── package.json            # Node projesi yapılandırması & pg / cors / express bağımlılıkları
├── data/
│   ├── menu.json               # İlk kurulumda veritabanına aktarılan menü verileri
│   └── menu_default.json       # Varsayılan yedek menü verileri
├── logs/
│   └── changelog.md            # TÜM değişikliklerin kaydı (MUTLAKA OKU!)
├── index.html                  # Ana web sitesi (~1MB, bulut API'sine entegre, localStorage kaldırıldı)
├── admin.html                  # Admin web arayüzü (~1MB, bulut API'sine entegre, localStorage kaldırıldı)
├── render.yaml                 # Render.com otomatik deploy & PostgreSQL kurulum yapılandırması
├── README.md                   # Bu dosya (AI bağlam yükleme ve kurulum kılavuzu)
└── desktop.ini                 # Windows sistem dosyası
```

---

## 🏗️ Teknik Mimari

### Ön Uç (Frontend)
Ön yüz Netlify üzerinde barındırılmaktadır. localhost bağımlılığı tamamen kaldırılmıştır:
- **Çevre/Ortam Algılama (Runtime API Base):** `index.html` ve `admin.html` sayfaları çalıştıkları alan adını algılar:
  - `localhost` veya `127.0.0.1` ise `window.API_BASE = ""` (relative path - yerel geliştirme)
  - Diğer durumlarda `window.API_BASE = "https://dayikatik-api.onrender.com"` (canlı bulut sunucusu)
- **Fetch Interceptor:** Sayfaların en tepesine eklenen interceptor sayesinde, mevcut koddaki hiçbir `fetch('/api/...')` çağrısını bozmadan, istekler otomatik olarak `window.API_BASE` adresiyle canlandırılır.

### Arka Uç (Backend)
- **Node.js + Express**
- **Çift Modlu Veritabanı Katmanı (`backend/db.js`):**
  - Ortam değişkenlerinde `DATABASE_URL` tanımlıysa **PostgreSQL (pg)** kütüphanesi ile buluttaki veritabanına bağlanır.
  - `DATABASE_URL` tanımlı değilse yerel **SQLite (`node:sqlite`)** kullanarak sıfır-konfigürasyon yerel geliştirme modunda çalışır.
  - Her iki veritabanı sürücüsü de ortak asenkron arayüz sunar, böylece `server.js` kodunda değişiklik yapmadan sorunsuz çalışır.
- **Parametrik Güvenli Sorgular:** Hem SQLite (`?`) hem PostgreSQL (`$1, $2`) parametre yapılarını otomatik yöneten dinamik SQL eşleştirici entegre edilmiştir.
- **Otomatik Migration & Seed:** Veritabanına ilk bağlantıda tablolar yoksa oluşturulur ve default kategoriler, menü verileri ve statik UI çevirileri otomatik yüklenir.
- **CORS Kuralları:** Netlify canlı alan adı (`https://dayikatik.netlify.app`) ve yerel geliştirme portları açıkça CORS izin listesine eklenmiştir.

---

## 🔧 Kurulum ve Çalıştırma

### Bağımlılıkların Kurulması
Proje dizininde `backend` klasörüne gidip bağımlılıkları yükleyin:
```bash
cd backend
npm install
```

### Yerel Sunucunun Başlatılması (SQLite Geliştirme Modu)
Sunucuyu yerel olarak SQLite veritabanı ile çalıştırmak için:
```bash
cd backend
npm run dev
```
Sunucu çalıştıktan sonra web sitesine **`http://localhost:12000`** adresinden erişebilirsiniz.

### Bulut Sunucusunun Başlatılması (PostgreSQL Canlı Modu)
Render.com veya benzeri bir bulut sunucusunda çalıştırırken aşağıdaki çevre değişkenlerini ekleyin:
- `PORT` = Sunucu portu
- `DATABASE_URL` = PostgreSQL bağlantı URI'si (örn. `postgres://user:pass@host:port/db`)

---

## ☁️ Buluta Dağıtım (Deployment)

Proje kök dizininde bulunan [render.yaml](file:///c:/Users/hasan_y4hfwna/Desktop/dayikatikwebsitesi%20-%20Kopya/render.yaml) dosyası sayesinde Render.com üzerinde **"Blueprints"** sekmesinden tek tıkla canlı Express API'sini ve kalıcı PostgreSQL veritabanını deploy edebilirsiniz.

---

## 🔧 Teknik Ortam

- **Node.js/npm:** Yüklü (v25.8.2)
- **Veritabanı:** PostgreSQL (bulutta) / SQLite (yerelde)
- **OS:** Windows
- **Shell:** PowerShell

---

## 📜 Kurallar

1. **Changelog zorunlu** — Yaptığın HER değişikliği `logs/changelog.md` dosyasına tarih damgası ile kaydet
2. **Türkçe konuş** — Kullanıcı ile her zaman Türkçe iletişim kur
3. **Mevcut kodları bozma** — Değişiklik yaparken var olan yapıyı koru
4. **Test et** — Yaptığın değişiklikleri test et ve sonuçları changelog'a yaz
5. **README'yi güncelle** — Büyük yapısal değişikliklerde bu dosyayı da güncelle

---

> **Son güncelleme:** 2026-07-13 00:05 +03:00

