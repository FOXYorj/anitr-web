<div align="center">

<img src="https://img.shields.io/badge/Go-1.21+-00ADD8?style=for-the-badge&logo=go&logoColor=white"/>
<img src="https://img.shields.io/badge/Vanilla_JS-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black"/>
<img src="https://img.shields.io/badge/License-GPL_v3-blue?style=for-the-badge"/>
<img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey?style=for-the-badge"/>

# 🎌 AnitrWeb — Premium Anime İzleme Platformu - V 1.0.1

> **Türkçe altyazılı anime izlemenin en gelişmiş, en şık yolu.**  
> Go tabanlı backend + Vanilla JS frontend ile yapılmış, kendi kendine barındırılabilen (self-hosted) bir anime streaming uygulaması.

[✨ Özellikler](#-özellikler) · [🚀 Kurulum](#-kurulum) · [⚙️ Yapılandırma](#️-yapılandırma) · [📡 API Referansı](#-api-referansı)

</div>

---

## ✨ Özellikler

### 🎬 İzleme Deneyimi

| Özellik | Açıklama |
|---------|----------|
| **Çoklu Video Kaynağı** | AnimeciX, Anizium, Anizium Free ve OpenAnime arasında tek tıkla geçiş |
| **Kaldığın Yerden Devam** | Video pozisyonu otomatik kaydedilir, tam saniye hassasiyetle devam eder  |
| **Otomatik Sonraki Bölüm** | Bölüm bitince 5 saniye geri sayım ile sonraki bölüme geçiş |
| **Türkçe Altyazı Desteği** | Altyazı boyutu ayarlanabilir |
| **Dublaj / Altyazı Seçimi** | Sub ve Dub arasında anında geçiş |
| **videojs Video Oynatıcı** | Modern, tam özellikli HTML5 video oynatıcı |
| **Ambient Arka Plan** | Video esnasında dinamik renk uyumu |
| **Klavye Kısayolları** | Space (oynat/durdur), Ok tuşları (±10s), F (tam ekran), M (sessiz) |

---

### 🏠 Ana Sayfa 

| Bölüm | Açıklama |
|-------|----------|
| **Sinematik Hero Banner** | Yüksek çözünürlüklü arka plan, parallax efekti, otomatik slayt geçişi |
| **Kaldığın Yerden Devam Et** | İzleme geçmişi carousel; her kartta ilerleme çubuğu ve bölüm bilgisi |
| **En Çok İzlenenler** | MyAnimeList API ile gerçek zamanlı top anime listesi |
| **Bu Sezon Animeler** | Güncel sezon animeleri carousel |
| **Tür Bazlı Satırlar** | Aksiyon, Komedi, Romantik, Fantazi, Dram kategorileri |
| **AI Öneri Bölümü** | Kişiselleştirilmiş yapay zeka önerileri (sayfa altında) |
| **Skeleton Loader** | Yükleme sırasında şık iskelet animasyonlar (Netflix gibi) |

---

### 🔍 Keşif & Arama

- **Anlık Arama**: Yazarken canlı öneri kutusu, anime poster + başlık
- **Kısayol Desteği**: `Ctrl+F` ile her yerden arama kutusuna odaklanma
- **Anime Listesi**: Kaynaktaki tüm animeleri sayfalı şekilde listeleme
- **Rastgele Anime**: Tek tıkla rastgele anime açma
- **Keşfet Modu**: Kaynak bazlı popüler anime keşfi

---

### 🤝 Sosyal Özellikler

#### 👥 Arkadaş Sistemi
- Sunucudaki tüm kullanıcıları görme
- Kullanıcı adıyla arkadaş ekleme / çıkarma
- Arkadaş listesi modal paneli
- Gerçek zamanlı aktif kullanıcı sayacı (yeşil nokta ile)

#### 🎥 Watch2Gether (W2G) — Birlikte İzleme Odaları
- Oda oluşturma ve arkadaşları davet etme
- WebSocket tabanlı gerçek zamanlı senkronizasyon
- Birden fazla kullanıcının aynı anda aynı videoyu izlemesi
- Oda listesi ve katılma sistemi
- Oda içi mesajlaşma

---

### 👤 Kullanıcı Profili & Senkronizasyon

- **Kayıt / Giriş Sistemi**: Kullanıcı adı tabanlı hesap yönetimi
- **Profil Düzenleme**: Kullanıcı adı ve bilgilerini güncelleme
- **Bulut Senkronizasyon**: İzleme geçmişi ve favori listesi sunucuya kaydedilir
- **Çok Cihaz Desteği**: Telefon ve bilgisayar arasında otomatik senkron
- **Anonim Mod**: Giriş yapmadan da kullanılabilir (local storage)

---

### 📊 Kişisel İstatistikler

- Toplam izlenen bölüm sayısı
- Toplam izleme süresi (saat/dakika)
- En çok izlenen tür
- En son izlenenler listesi
- Favori animeler koleksiyonu
- İzleme listesi (Watchlist) yönetimi

---

### 📅 MyAnimeList (MAL) Entegrasyonu

- **MAL Profil Bağlantısı**: MAL kullanıcı adıyla giriş
- **Watchlist Senkronu**: MAL'daki izleme listesini içeri aktar
- **MAL Önerileri**: MAL algoritmasına göre kişiselleştirilmiş öneri
- **Top Animeler**: MAL'ın en iyi anime sıralaması
- **Sezonluk Animeler**: Dönemsel en iyi animeler
- **Tür Filtreleme**: MAL türlerine göre filtreleme

---

### 🤖 Yapay Zeka Önerileri

- **OpenAI / Gemini / openrouter** desteği — kendi API anahtarın ile
- Kişisel izleme geçmişine dayalı öneri üretimi
- Özelleştirilebilir AI prompt
- Ana sayfanın alt bölümünde şık kart tasarımı

---

### 🗓️ Yayın Takvimi

- Haftanın günlerine göre anime yayın takvimi
- Bugünün animeleri vurgulama
- Türkçe gün isimleri

---

### 📥 İndirme Sistemi

- Episode linklerini indirme kuyruğuna ekleme
- İndirme listesi modal paneli
- İlerleme takibi

---

### ⚙️ Ayarlar Paneli

| Ayar | Açıklama |
|------|----------|
| **Varsayılan Kaynak** | AnimeciX / Anizium / Anizium Free / OpenAnime |
| **Ses Türü** | Altyazılı (Sub) / Dublaj (Dub) |
| **Otomatik Sonraki Bölüm** | Açık/Kapalı toggle |
| **Banner Otomatik Döndür** | Hero banner slayt otomasyonu |
| **Altyazı Boyutu** | Slider ile 12px–40px arası |
| **Navbar Düzeni** | Üst / Yan bar seçimi |
| **Mobil Görünüm** | Mobil optimizasyona zorla |
| **AI Ayarları** | Provider seçimi, API anahtarı, prompt özelleştirme |

---

### 🎨 Premium Arayüz Tasarımı

- **OLED Siyah Tema** — tam siyah arka plan, derin sinematik görünüm
- **Glassmorphism** — buzlu cam efektli navbar, modal ve kartlar
- **3D Hover Animasyonları** — anime kartları üzerinde parlama ve yükseltme efekti
- **Premium Layout** — hero banner + yatay carousel satırları
- **Glow Efektleri** — butonlar ve ikonlarda altın sarısı ışıma
- **Smooth Transitions** — tüm geçişlerde cubic-bezier animasyon
- **Responsive Tasarım** — masaüstü, tablet ve telefon uyumlu
- **Skeleton Loaders** — içerik yüklenmeden önce animasyonlu yer tutucular
- **3-Sütun Navbar** — Logo sol | Arama orta | Aksiyon sağ

---

## 🚀 Kurulum

### Gereksinimler
- **Go 1.23+** (derlemek için)
- **Git** (indirmek için)

---

### Yöntem 1: Kaynaktan Derleme

#### Adım 1: Repoyu Klonla
```bash
git clone https://github.com/FOXYorj/anitr-web.git
cd anitr-web
```

#### Adım 2: Derle ve Çalıştır
Uygulamayı derlemek için Go kurulu olmalıdır:
```bash
go build -o anitr_web.exe main.go
```
Çalıştırmak için:
```bash
# Windows
.\anitr_web.exe

# Linux / macOS (build -o anitr_web ile derledikten sonra)
./anitr_web
```

**Not:** Web arayüzüne erişmek için tarayıcınızda `http://localhost:8081` adresine gidebilirsiniz. Gerekirse `-port` parametresi ile farklı bir port belirtebilirsiniz.

---

### Yöntem 3: Doğrudan Go ile Çalıştır
```bash
go run .
```

---

## ▶️ Çalıştırma

### Varsayılan Port (8081)
```bash
anitr-cli
```

### Özel Port ile
```bash
# Linux/macOS
PORT=3000 anitr-cli

# Windows (PowerShell)
$env:PORT = "3000"; .\anitr-cli.exe
```

Uygulama başladığında tarayıcınızda `localhost` adresine gidin.

---

## 🐳 Docker ile Çalıştırma
```bash
docker build -t anitr-cli .
docker run -p 8081:8081 anitr-cli
```

---


## 📷Ekran Görüntüleri

<img width="700" height="400" alt="Ekran görüntüsü 2026-06-23 011651" src="https://github.com/user-attachments/assets/20a32ee0-983b-4305-9fd0-94b30da01363" />



<img width="700" height="400" alt="Ekran görüntüsü 2026-06-23 011620" src="https://github.com/user-attachments/assets/011bed62-d40c-45ad-be26-87c8c5461b57" />



<img width="700" height="400" alt="Ekran görüntüsü 2026-06-23 011530" src="https://github.com/user-attachments/assets/3de07aa0-73d1-42da-a7f4-66c8b7d76c1b" />



<img width="700" height="400" alt="Ekran görüntüsü 2026-06-23 011500" src="https://github.com/user-attachments/assets/9006a61b-5446-42a5-bf0f-047f89acd024" />



<img width="700" height="400" alt="Ekran görüntüsü 2026-06-23 011238" src="https://github.com/user-attachments/assets/628bacc2-8d4d-492a-a67a-455ece4fb7d9" />



<img width="700" height="400" alt="Ekran görüntüsü 2026-06-23 011144" src="https://github.com/user-attachments/assets/9efcf9aa-9a43-48b2-95a6-4dbf4171b384" />





### Uygulama Ayarları (Tarayıcıda)

Sağ üst köşedeki ⚙️ simgesine tıklayarak tüm ayarlara erişebilirsin.

---

## 📡 API Referansı

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `GET` | `/api/search` | Anime ara (`?q=&source=`) |
| `GET` | `/api/popular` | Popüler animeler |
| `GET` | `/api/discover` | Anime keşfet (sayfalı) |
| `GET` | `/api/anime` | Anime detayları |
| `GET` | `/api/seasons` | Sezon listesi |
| `GET` | `/api/episodes` | Bölüm listesi |
| `GET` | `/api/watch` | Video stream linki |
| `GET` | `/api/sources` | Mevcut kaynaklar |
| `GET` | `/api/mal/top` | MAL top animeler |
| `GET` | `/api/mal/seasonal` | MAL sezonluk animeler |
| `GET` | `/api/mal/genre` | Türe göre animeler |
| `GET` | `/api/mal/recommendations` | MAL önerileri |
| `GET` | `/api/mal/watchlist` | MAL watchlist |
| `GET` | `/api/mal/schedule` | Yayın takvimi |
| `POST` | `/api/auth/register` | Kullanıcı kaydı |
| `POST` | `/api/auth/login` | Kullanıcı girişi |
| `GET/POST` | `/api/user/data` | Kullanıcı verisi okuma/yazma |
| `POST` | `/api/user/ping` | Aktif kullanıcı bildirimi |
| `GET` | `/api/users` | Tüm kullanıcılar |
| `POST` | `/api/friends/add` | Arkadaş ekleme |
| `POST` | `/api/friends/remove` | Arkadaş çıkarma |
| `GET` | `/api/w2g/rooms` | W2G oda listesi |
| `POST` | `/api/w2g/join` | W2G odaya katıl |
| `WS` | `/api/w2g/ws` | W2G WebSocket |
| `GET` | `/api/proxy` | Video proxy |

---

## 🎨 Renk Paleti

```css
--bg:          #050505    /* OLED siyah arka plan    */
--surface:     #0e0e12    /* Kart yüzeyi             */
--accent:      #e8a020    /* Altın sarısı vurgu      */
--accent-2:    #f59e0b    /* İkincil vurgu           */
--accent-glow: rgba(232,160,32,0.25)  /* Işıma efekti */
```

## 🛠️ Kullanılan Teknolojiler

| Teknoloji | Kullanım |
|-----------|----------|
| **Go** | HTTP sunucu, scraping, API katmanı |
| **Vanilla JS** | SPA mantığı, state yönetimi |
| **CSS3** | Glassmorphism, animasyonlar, responsive layout |
| **Plyr** | Video oynatıcı |
| **Font Awesome** | İkon seti |
| **Jikan API** | MyAnimeList veri kaynağı |
| **WebSocket** | W2G gerçek zamanlı senkron |
| **Discord RPC** | Rich Presence entegrasyonu |

---

## 🔐 Gizlilik

- Tüm veriler **kendi sunucunda** tutulur — hiçbir 3. taraf servise gönderilmez
- AI özelliği için API anahtarı yalnızca tarayıcı local storage'da tutulur
- Docker ile tamamen izole ortamda çalıştırılabilir

---

## 🙏 Teşekkürler

Bu proje, **[prayjofir/anitr-cli](https://github.com/prayjofir/anitr-cli)** projesinin altyapısı üzerine inşa edilmiştir.

<div align="center">

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   Bu projenin kalbi, prayjofir'in anitr-cli              ║
║   projesidir. Anime kaynak scraping motoru,              ║
║   sezon/bölüm yapısı ve temel Go mimarisi                ║
║   olmadan AnitrWeb var olamazdı.                         ║
║                                                          ║
║   🔗 github.com/prayjofir/anitr-cli                      ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

</div>

| Katkı | Açıklama |
|-------|----------|
| **🔧 Kaynak Motoru** | AnimeciX, Anizium ve diğer kaynakların scraper altyapısı |
| **📦 Go Mimarisi** | Backend paket yapısı ve modüler tasarım |
| **🎞️ Sezon/Bölüm API'si** | Anime, sezon ve bölüm veri modelleri |
| **⚡ Temel İş Mantığı** | Video link çözümleme ve kaynak yönetimi |

> AnitrWeb, bu CLI aracına **web arayüzü, çok kullanıcılı destek, sosyal özellikler ve premium tasarım** ekleyerek onu tarayıcıya taşıyan bir uzantıdır.

---

## 👥 Katkıda Bulunanlar

| Kullanıcı | Katkı |
|-----------|-------|
| **[prayjofir](https://github.com/prayjofir)** | Orijinal proje sahibi, temel altyapı ve scraping motoru |
| **[FOXYorj](https://github.com/FOXYorj)** | AnitrWeb geliştirmesi |

---

## �� Lisans

Bu proje **GNU General Public License v3.0** altında lisanslanmıştır.

---

<div align="center">

**AnitrWeb** — *Kendi sunucunda, kendi kurallarınla anime izle.* 🎌

<br/>

Built with ❤️ on top of [prayjofir/anitr-cli](https://github.com/prayjofir/anitr-cli)

</div>
