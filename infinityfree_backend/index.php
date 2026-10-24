<?php
session_start();
require_once 'config.php';

// Veritabanına 'token' sütunu ekleyelim (eğer yoksa)
$conn->query("ALTER TABLE users ADD COLUMN IF NOT EXISTS token VARCHAR(100) DEFAULT ''");

// Giriş ve Kayıt İşlemleri
$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    if (isset($_POST['register'])) {
        $username = $conn->real_escape_string($_POST['username']);
        $password = password_hash($_POST['password'], PASSWORD_DEFAULT);
        $token = bin2hex(random_bytes(16)); // Bağlantı anahtarı oluştur

        $check = $conn->query("SELECT id FROM users WHERE username='$username'");
        if ($check->num_rows > 0) {
            $error = "Bu kullanıcı adı zaten alınmış.";
        } else {
            $conn->query("INSERT INTO users (username, password, token) VALUES ('$username', '$password', '$token')");
            $success = "Kayıt başarılı! Şimdi giriş yapabilirsiniz.";
        }
    } elseif (isset($_POST['login'])) {
        $username = $conn->real_escape_string($_POST['username']);
        $password = $_POST['password'];

        $res = $conn->query("SELECT * FROM users WHERE username='$username'");
        if ($res->num_rows > 0) {
            $user = $res->fetch_assoc();
            if (password_verify($password, $user['password'])) {
                $_SESSION['user_id'] = $user['id'];
                header("Location: index.php");
                exit;
            }
        }
        $error = "Kullanıcı adı veya şifre hatalı.";
    } elseif (isset($_POST['update_profile'])) {
        $uid = $_SESSION['user_id'];
        $avatar = $conn->real_escape_string($_POST['avatar']);
        $bio = $conn->real_escape_string($_POST['bio']);
        $conn->query("UPDATE users SET avatar='$avatar', bio='$bio' WHERE id=$uid");
        $success = "Profil güncellendi.";
    } elseif (isset($_POST['logout'])) {
        session_destroy();
        header("Location: index.php");
        exit;
    }
}

$user = null;
if (isset($_SESSION['user_id'])) {
    $uid = $_SESSION['user_id'];
    $res = $conn->query("SELECT * FROM users WHERE id=$uid");
    $user = $res->fetch_assoc();
    // Eğer eski üyeyse ve token'ı yoksa oluştur
    if(empty($user['token'])) {
        $newToken = bin2hex(random_bytes(16));
        $conn->query("UPDATE users SET token='$newToken' WHERE id=$uid");
        $user['token'] = $newToken;
    }
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anitr Sosyal - Yeni Nesil Anime Deneyimi</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --bg: #0a0a0f;
            --bg-alt: #111118;
            --accent: #8b5cf6;
            --accent-hover: #7c3aed;
            --text: #f3f4f6;
            --text2: #9ca3af;
            --border: rgba(255, 255, 255, 0.1);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        body { background-color: var(--bg); color: var(--text); overflow-x: hidden; }
        
        /* Navbar */
        nav { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 5%; background: rgba(10, 10, 15, 0.8); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 100; border-bottom: 1px solid var(--border); }
        nav .logo { font-size: 1.5rem; font-weight: bold; color: var(--text); display: flex; align-items: center; gap: 10px; }
        nav .logo i { color: var(--accent); }
        .btn-primary { background: var(--accent); color: white; padding: 0.6rem 1.2rem; border-radius: 8px; text-decoration: none; border: none; cursor: pointer; transition: 0.2s; font-weight: 600; }
        .btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); }
        .btn-secondary { background: rgba(255,255,255,0.05); color: white; padding: 0.6rem 1.2rem; border-radius: 8px; text-decoration: none; border: 1px solid var(--border); cursor: pointer; transition: 0.2s; }
        .btn-secondary:hover { background: rgba(255,255,255,0.1); }
        
        /* Hero */
        .hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 6rem 1rem; background: radial-gradient(circle at top, rgba(139, 92, 246, 0.15) 0%, transparent 50%); }
        .hero h1 { font-size: 3.5rem; margin-bottom: 1rem; font-weight: 800; background: linear-gradient(to right, #fff, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .hero p { color: var(--text2); font-size: 1.2rem; max-width: 600px; margin-bottom: 2rem; line-height: 1.6; }
        .hero img { max-width: 900px; width: 100%; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); border: 1px solid var(--border); margin-top: 3rem; }

        /* Features */
        .features { padding: 5rem 5%; background: var(--bg-alt); }
        .section-title { text-align: center; font-size: 2.5rem; margin-bottom: 4rem; }
        .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 3rem; }
        .feature-card { background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 16px; padding: 2rem; text-align: center; transition: 0.3s; }
        .feature-card:hover { transform: translateY(-10px); border-color: var(--accent); background: rgba(139, 92, 246, 0.05); }
        .feature-icon { font-size: 3rem; color: var(--accent); margin-bottom: 1.5rem; }
        .feature-card img { width: 100%; border-radius: 8px; margin-top: 1.5rem; border: 1px solid var(--border); }

        /* Auth & Dashboard */
        .glass-panel { background: rgba(255,255,255,0.03); backdrop-filter: blur(16px); border: 1px solid var(--border); border-radius: 16px; padding: 3rem; max-width: 500px; margin: 0 auto; width: 100%; }
        .auth-section { padding: 5rem 1rem; background: var(--bg); display: flex; justify-content: center; }
        .input-group { margin-bottom: 1.5rem; text-align: left; }
        .input-group label { display: block; margin-bottom: 0.5rem; color: var(--text2); }
        .input-field { width: 100%; padding: 0.8rem 1rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; color: white; outline: none; transition: 0.2s; }
        .input-field:focus { border-color: var(--accent); }
        
        .alert { padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-weight: 600; }
        .alert-error { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
        .alert-success { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); }

        /* Dashboard Specific */
        .dashboard-panel { max-width: 800px; text-align: left; }
        .profile-header { display: flex; gap: 2rem; align-items: center; margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 1px solid var(--border); }
        .profile-avatar { width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid var(--accent); }
        .key-box { background: rgba(0,0,0,0.4); padding: 1.5rem; border-radius: 8px; border: 1px dashed var(--accent); display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .key-text { font-family: monospace; font-size: 1.2rem; color: var(--accent); letter-spacing: 2px; }
        
        footer { text-align: center; padding: 3rem; color: var(--text2); border-top: 1px solid var(--border); background: var(--bg-alt); }
    </style>
</head>
<body>

    <nav>
        <div class="logo"><i class="fa-solid fa-play"></i> Anitr Sosyal</div>
        <div>
            <?php if(!$user): ?>
                <a href="#auth" class="btn-secondary">Giriş Yap</a>
                <a href="#auth" class="btn-primary">Kayıt Ol</a>
            <?php else: ?>
                <span style="margin-right:15px;">Hoş geldin, <b><?= $user['username'] ?></b></span>
                <form method="post" style="display:inline;"><button type="submit" name="logout" class="btn-secondary">Çıkış Yap</button></form>
            <?php endif; ?>
        </div>
    </nav>

    <?php if(!$user): ?>
    <!-- Landing Page -->
    <div class="hero">
        <h1>Animeleri Birlikte Yaşayın</h1>
        <p>Anitr masaüstü uygulamanı buluta bağla. İzlediklerini senkronize et, arkadaşlar edin, mesajlaş ve MyAnimeList listeni tek tıkla yönet. Üstelik tamamen ücretsiz ve açık kaynak.</p>
        <a href="#auth" class="btn-primary" style="font-size: 1.2rem; padding: 1rem 2.5rem;">Hemen Hesap Oluştur</a>
        <!-- Tanıtım Görseli (Uygulamanın arayüzü) -->
        <img src="https://i.ibb.co/screenshot-app.png" alt="Anitr Arayüzü" onerror="this.style.display='none'"> 
    </div>

    <div class="features">
        <h2 class="section-title">Muhteşem Özellikler</h2>
        <div class="feature-grid">
            <div class="feature-card">
                <i class="fa-solid fa-calendar-days feature-icon"></i>
                <h3>Haftalık Yayın Takvimi</h3>
                <p>Hangi animenin hangi gün çıkacağını modern takvim üzerinden takip et. Günü gelen animeleri anında izle.</p>
                <!-- Kullanıcının attığı takvim görseli -->
            </div>
            <div class="feature-card">
                <i class="fa-solid fa-book-open feature-icon"></i>
                <h3>MyAnimeList Entegrasyonu</h3>
                <p>Kendi MAL listeni uygulamaya bağla, favorilerini yönet ve kaldığın yeri asla kaybetme.</p>
            </div>
            <div class="feature-card">
                <i class="fa-solid fa-server feature-icon"></i>
                <h3>Gelişmiş Kaynak Seçimi</h3>
                <p>Anizium ve AnimciX gibi sunucular arasında kolayca geçiş yap, kesintisiz HD izleme keyfini yaşa.</p>
            </div>
        </div>
    </div>

    <!-- Auth System -->
    <div id="auth" class="auth-section">
        <div class="glass-panel">
            <h2 style="text-align:center; margin-bottom: 2rem;">Aramıza Katıl</h2>
            
            <?php if($error): ?><div class="alert alert-error"><?= $error ?></div><?php endif; ?>
            <?php if($success): ?><div class="alert alert-success"><?= $success ?></div><?php endif; ?>

            <div style="display:flex; border-bottom:1px solid var(--border); margin-bottom: 2rem;">
                <button onclick="document.getElementById('loginForm').style.display='none'; document.getElementById('registerForm').style.display='block';" style="flex:1; background:none; border:none; color:white; padding:1rem; cursor:pointer; font-weight:bold;">Kayıt Ol</button>
                <button onclick="document.getElementById('registerForm').style.display='none'; document.getElementById('loginForm').style.display='block';" style="flex:1; background:none; border:none; color:var(--text2); padding:1rem; cursor:pointer;">Giriş Yap</button>
            </div>

            <!-- Register Form -->
            <form method="post" id="registerForm">
                <div class="input-group">
                    <label>Kullanıcı Adı</label>
                    <input type="text" name="username" class="input-field" required pattern="[a-zA-Z0-9_-]{3,20}" title="Sadece harf, rakam ve alt çizgi (3-20 karakter)">
                </div>
                <div class="input-group">
                    <label>Şifre</label>
                    <input type="password" name="password" class="input-field" required minlength="6">
                </div>
                <button type="submit" name="register" class="btn-primary" style="width:100%;">Hesap Oluştur</button>
            </form>

            <!-- Login Form -->
            <form method="post" id="loginForm" style="display:none;">
                <div class="input-group">
                    <label>Kullanıcı Adı</label>
                    <input type="text" name="username" class="input-field" required>
                </div>
                <div class="input-group">
                    <label>Şifre</label>
                    <input type="password" name="password" class="input-field" required>
                </div>
                <button type="submit" name="login" class="btn-primary" style="width:100%;">Giriş Yap</button>
            </form>
        </div>
    </div>

    <?php else: ?>
    <!-- Dashboard -->
    <div class="auth-section" style="min-height: 80vh;">
        <div class="glass-panel dashboard-panel">
            
            <?php if($success): ?><div class="alert alert-success"><?= $success ?></div><?php endif; ?>

            <div class="profile-header">
                <img src="<?= htmlspecialchars($user['avatar']) ?>" class="profile-avatar">
                <div>
                    <h1>@<?= htmlspecialchars($user['username']) ?></h1>
                    <p style="color:var(--text2); margin-top:0.5rem;"><?= htmlspecialchars($user['bio']) ?></p>
                </div>
            </div>

            <h3 style="margin-bottom:1rem; color:var(--accent);"><i class="fa-solid fa-key"></i> Bağlantı Anahtarın (Key)</h3>
            <p style="color:var(--text2); margin-bottom:1rem;">Bu anahtarı Anitr masaüstü uygulamasındaki "Bağlantı Anahtarı" kutusuna yapıştırarak hesabını anında bağlayabilirsin. <b>Kimseyle paylaşma!</b></p>
            <div class="key-box">
                <?php 
                    // Masaüstü uygulaması bağlanırken hem sunucu adresini hem tokeni bilsin diye birleştiriyoruz
                    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
                    $host = $_SERVER['HTTP_HOST'];
                    $path = dirname($_SERVER['REQUEST_URI']);
                    $apiUrl = $protocol . "://" . $host . rtrim($path, "/") . "/api.php";
                    
                    $connectionKey = base64_encode(json_encode(['url' => $apiUrl, 'token' => $user['token']]));
                ?>
                <span class="key-text" id="myKey"><?= $connectionKey ?></span>
                <button class="btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('myKey').innerText); alert('Kopyalandı!');"><i class="fa-solid fa-copy"></i> Kopyala</button>
            </div>

            <h3 style="margin-bottom:1rem; margin-top:3rem;">Profili Düzenle</h3>
            <form method="post">
                <div class="input-group">
                    <label>Avatar URL (Resim Linki)</label>
                    <input type="text" name="avatar" class="input-field" value="<?= htmlspecialchars($user['avatar']) ?>">
                </div>
                <div class="input-group">
                    <label>Hakkımda</label>
                    <input type="text" name="bio" class="input-field" value="<?= htmlspecialchars($user['bio']) ?>" maxlength="100">
                </div>
                <button type="submit" name="update_profile" class="btn-secondary">Değişiklikleri Kaydet</button>
            </form>

        </div>
    </div>
    <?php endif; ?>

    <footer>
        <p>Anitr Sosyal © 2026. Açık kaynak kodlu yerel anime platformu.</p>
    </footer>

</body>
</html>
