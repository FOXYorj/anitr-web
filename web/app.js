/* ============================================================
   ANITR WEB - app.js  (Temiz, Hatasız Yeniden Yazım)
   ============================================================ */

// API Base logic
const API_BASE = window.location.protocol === 'file:' 
    ? 'http://localhost:8081/api' 
    : window.location.origin + '/api';

// ── DOM Refs ─────────────────────────────────────────────
const homeView      = document.getElementById('homeView');
const animeListView = document.getElementById('animeListView');
const watchView     = document.getElementById('watchView');
const malView       = document.getElementById('malView');
const cinematicHero = document.getElementById('cinematicHero');
const heroSlider    = document.getElementById('heroSlider');
const continueWatch = document.getElementById('continueWatching');
const cwContainer   = document.getElementById('cwContainer');
const mainContent   = document.getElementById('mainContent');
let animePlayer   = document.getElementById('animePlayer');
const searchInput   = document.getElementById('searchInput');
const searchBtn     = document.getElementById('searchBtn');
const suggestions   = document.getElementById('searchSuggestions');
const loader        = document.getElementById('loader');
const drawer        = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawerTitle   = document.getElementById('drawerTitle');
const drawerContent = document.getElementById('drawerContent');
const settingsModal = document.getElementById('settingsModal');
const noteModal     = document.getElementById('noteModal');
const statsModal    = document.getElementById('statsModal');
const achievementPopup = document.getElementById('achievementPopup');
const achievementsModal = document.getElementById('achievementsModal');

// ── State ─────────────────────────────────────────────────
// Varsayılan kaynak ayarlardan alınacak
let currentSource     = localStorage.getItem('anitr_defaultSource') || 'AnimeciX';
let currentSourceKey  = currentSource.replace(/\s+/g, '_');
// Sadece desteklenen kaynaklar: AnimeciX, Anizium, Anizium Free
const VALID_SOURCES = ['AnimeciX', 'Anizium', 'Anizium Free'];
// Kaynak değiştiğinde kaldığı yerden devam et verilerini ayır
let currentSourceHistoryKey = 'anitr_history_' + currentSourceKey;
let currentSourcePositionsKey = 'anitr_positions_' + currentSourceKey;
let hls               = null;
let plyr              = null;
let currentEpisodes   = [];
let currentAnime      = {};
let currentSIdx       = 0;
let currentEIdx       = 0;
let currentEpisodeKey = null;
let currentEpisode    = null;
// Flag to disable ended event temporarily
let disableEndedEvent = false;
let allAnimeData      = [];
let searchTimeout     = null;
let heroSlides        = [];
let heroIdx           = 0;
let heroTimer         = null;

// ── Anime List Pagination ─────────────────────────────────
let animeListPage = 1;
let isAnimeListLoading = false;
let hasMoreAnime = true;

// ── MAL State ─────────────────────────────────────────────
let malConnected = false;
let malUser = "";

// ── Popular Anime Pagination ──────────────────────────────
let popularPage = 2; // Ana sayfa sayfa 1'i çekti, buton 2'den başlar

// ── Helper Functions ───────────────────────────────────────
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function getSubtitleSettings() {
    const saved = localStorage.getItem('anitr_subtitle_settings');
    return saved ? JSON.parse(saved) : {
        fontSize: 20,
        backgroundOpacity: 0.7,
        fontFamily: 'Inter, sans-serif',
        textColor: '#ffffff',
        backgroundColor: '#000000',
        position: 'bottom'
    };
}

function applySubtitleSettings(settings) {
    // Plyr captions stilini ayarla
    const style = document.createElement('style');
    style.id = 'custom-subtitle-styles';
    const existingStyle = document.getElementById('custom-subtitle-styles');
    if (existingStyle) existingStyle.remove();
    
    const bgRgb = hexToRgb(settings.backgroundColor);
    const bgColor = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${settings.backgroundOpacity})`;
    
    style.textContent = `
        .plyr__captions .plyr__caption {
            font-size: ${settings.fontSize}px !important;
            font-family: ${settings.fontFamily} !important;
            color: ${settings.textColor} !important;
            background-color: ${bgColor} !important;
            padding: 0.3em 0.6em !important;
            border-radius: 0.3em !important;
        }
        .plyr__caption {
            ${settings.position === 'top' ? 'top: 10% !important; bottom: auto !important;' : ''}
        }
    `;
    document.head.appendChild(style);
}

// ── Auth & Sync System ────────────────────────────────────
let currentUser = localStorage.getItem('anitr_currentUser') || '';
let anonymousId = localStorage.getItem('anitr_anonymousId');
if (!anonymousId) {
    anonymousId = 'anon_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('anitr_anonymousId', anonymousId);
}
let isAuthModeLogin = true;
let syncTimeout = null;
let activeUsersInterval = null;
let activeUsersData = [];

function normalizeSourceName(sourceName) {
    return VALID_SOURCES.includes(sourceName) ? sourceName : 'AnimeciX';
}

async function pingActiveUsers() {
    try {
        const res = await fetch(API_BASE + '/user/ping?username=' + encodeURIComponent(currentUser || anonymousId));
        if (res.ok) {
            const data = await res.json();
            activeUsersData = data.users || [];
            const countEl = document.getElementById('activeUsersCount');
            if (countEl) countEl.textContent = data.active_users;
        }
    } catch (e) {
        // ignore errors silently
    }
}

// Online rooms state
let onlineRooms = [];
let onlineRoomsInterval = null;

function showOnlineRooms() {
    drawerTitle.textContent = '🌐 Online Odalar';
    drawerContent.innerHTML = '<div style="padding: 2rem; text-align: center;"><div class="spinner"></div></div>';
    openDrawer();
    loadOnlineRooms();
}

async function loadOnlineRooms() {
    try {
        const data = await fetchAPI('/w2g/rooms');
        if (data && data.rooms) {
            drawerContent.innerHTML = data.rooms.length
                ? data.rooms.map(room => `
                    <div class="drawer-item" style="cursor: pointer; gap: 1rem; padding: 1rem;">
                        <img src="${room.animeImage || 'https://via.placeholder.com/50x70'}" alt="${room.animeTitle}" 
                             style="width: 50px; height: 70px; object-fit: cover; border-radius: 8px; flex-shrink: 0; cursor: pointer;"
                             ${room.animeId ? `onclick="event.stopPropagation(); goToAnimeFromRoom('${room.animeId}', '${room.animeSlug}', ${room.isMovie})"` : ''}>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: bold; color: var(--text); margin-bottom: 0.25rem;">${room.name}</div>
                            <div style="font-size: 0.85rem; color: var(--text2); margin-bottom: 0.25rem; ${room.animeId ? 'cursor: pointer;' : ''}"
                                 ${room.animeId ? `onclick="event.stopPropagation(); goToAnimeFromRoom('${room.animeId}', '${room.animeSlug}', ${room.isMovie})"` : ''}>
                                <i class="fa-solid fa-play-circle" style="margin-right: 0.25rem; color: var(--accent);"></i> ${room.animeTitle || 'Anime seçilmedi'}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text3);">
                                <i class="fa-solid fa-user" style="margin-right: 0.25rem;"></i> Kuran: ${room.hostUsername || 'Bilinmiyor'}
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
                            <div style="background: var(--accent); color: #111; padding: 0.25rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: bold;">
                                <i class="fa-solid fa-users" style="margin-right: 0.25rem;"></i> ${room.userCount}
                            </div>
                            <button class="btn-primary" style="font-size: 0.75rem; padding: 0.5rem 1rem; border-radius: 8px;" onclick="event.stopPropagation(); joinRoom('${room.name}', '${room.name}')">
                                <i class="fa-solid fa-right-to-bracket" style="margin-right: 0.25rem;"></i> Katıl
                            </button>
                        </div>
                    </div>
                `).join('')
                : '<p style="color:var(--text3);padding:2rem;text-align:center">Şu anda aktif oda yok.</p>';
        }
    } catch (e) {
        console.error('Online odalar yüklenirken hata:', e);
        drawerContent.innerHTML = '<p style="color:var(--text3);padding:2rem;text-align:center">Odalar yüklenemedi.</p>';
    }
}

function goToAnimeFromRoom(animeId, animeSlug, isMovie) {
    closeDrawer();
    showAnimeDetail(animeId, animeSlug, isMovie);
}

function joinRoom(roomId, roomName) {
    closeDrawer();
    document.getElementById('w2gRoomName').value = roomName;
    openW2GModal('join');
}

function showActiveUsers() {
    drawerTitle.textContent = '👥 Aktif Kullanıcılar';
    drawerContent.innerHTML = activeUsersData.length
        ? activeUsersData.map(u => {
            const isMe = u === currentUser || u === anonymousId;
            return '<div class="drawer-item" style="cursor:default; justify-content: space-between;">' +
                '<div style="display:flex; align-items:center; gap:10px;">' +
                '<div style="width:10px; height:10px; background:#10b981; border-radius:50%;"></div>' +
                '<span>' + u + (isMe ? ' (Sen)' : '') + '</span>' +
                '</div>' +
                '<span style="font-size:0.75rem; color:var(--text3);">Çevrimiçi</span>' +
                '</div>';
        }).join('')
        : '<p style="color:var(--text3);padding:2rem;text-align:center">Aktif kullanıcı bilgisi alınamadı.</p>';
    openDrawer();
}

function showAboutProject() {
    drawerTitle.textContent = 'ℹ️ Proje Hakkında';
    drawerContent.innerHTML = `
        <div style="padding: 1.5rem; color: var(--text2); line-height: 1.6;">
            <div style="text-align: center; margin-bottom: 2rem;">
                <i class="fa-solid fa-play" style="font-size: 3rem; color: var(--accent); margin-bottom: 1rem;"></i>
                <h2 style="color: var(--text); font-weight: 800;">Anitr<span style="color: var(--accent);">Web</span></h2>
                <p style="font-size: 0.9rem; color: var(--text3);">v1.0.0 - Açık Kaynak Anime Platformu</p>
            </div>
            
            <div style="background: var(--surface2); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
                <h4 style="color: var(--text); margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-code"></i> Geliştirici
                </h4>
                <a href="https://github.com/FOXYorj" target="_blank" style="display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--text2); transition: color 0.2s;">
                    <i class="fa-brands fa-github" style="font-size: 1.5rem; color: var(--text);"></i>
                    <span>FOXYorj</span>
                </a>
            </div>

            <div style="background: var(--surface2); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem;">
                <h4 style="color: var(--text); margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-database"></i> Veri Sistemi
                </h4>
                <p style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--text3);">Bu projenin temel veri çekme sistemi ve backend yapısı prayjofir tarafından geliştirilen anitr-cli tabanlıdır.</p>
                <a href="https://github.com/prayjofir" target="_blank" style="display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--text2); transition: color 0.2s;">
                    <i class="fa-brands fa-github" style="font-size: 1.5rem; color: var(--text);"></i>
                    <span>prayjofir</span>
                </a>
            </div>

            <p style="margin-top: 2rem; font-size: 0.8rem; text-align: center; color: var(--text3);">
                &copy; 2024 Anitr Project. MIT Lisansı ile korunmaktadır.
            </p>
        </div>
    `;
    openDrawer();
}

async function syncToServer() {
    const userToSync = currentUser || 'local';
    // Tüm kaynakların pozisyon verilerini birleştirerek gönder
    const allPositions = {};
    const allHistory = {};
    const allWatched = {};
    for (const src of VALID_SOURCES) {
        const sourceKey = src.replace(/\s+/g, '_');
        const srcPositions = ls.getRaw('anitr_positions_' + sourceKey, {});
        const srcHistory = ls.getRaw('anitr_history_' + sourceKey, []);
        const srcWatched = ls.getRaw('anitr_watched_' + sourceKey, []);
        Object.assign(allPositions, srcPositions);
        allHistory[src] = srcHistory;
        allWatched[src] = srcWatched;
    }
    const data = {
        history: allHistory,
        positions: allPositions,
        watched: allWatched,
        watchlist: ls.getRaw('anitr_watchlist', []),
        favorites: ls.getRaw('anitr_favorites', []),
        notes: ls.getRaw('anitr_notes', {})
    };
    try {
        await fetch(API_BASE + '/user/data?username=' + encodeURIComponent(userToSync), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error('Sync error', e);
    }
}

function triggerSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(syncToServer, 2000);
}

async function loadFromServer(username) {
    showLoader();
    try {
        const res = await fetch(API_BASE + '/user/data?username=' + encodeURIComponent(username));
        if (res.ok) {
            const data = await res.json();
            if (data.history) {
                if (Array.isArray(data.history)) {
                    ls.setRaw(currentSourceHistoryKey, data.history);
                } else {
                    for (const src of VALID_SOURCES) {
                        const sourceHistory = data.history[src];
                        if (Array.isArray(sourceHistory)) {
                            ls.setRaw('anitr_history_' + src.replace(/\s+/g, '_'), sourceHistory);
                        }
                    }
                }
            }
            // Pozisyonlar tüm kaynaklar için birleşik gelir, currentSource'a yaz
            if (data.positions) {
                for (const src of VALID_SOURCES) {
                    ls.setRaw('anitr_positions_' + src.replace(/\s+/g, '_'), data.positions);
                }
            }
            if (data.watched) {
                for (const src of VALID_SOURCES) {
                    const sourceWatched = data.watched[src];
                    if (Array.isArray(sourceWatched)) {
                        ls.setRaw('anitr_watched_' + src.replace(/\s+/g, '_'), sourceWatched);
                    }
                }
            }
            if (data.watchlist) ls.setRaw('anitr_watchlist', data.watchlist);
            if (data.favorites) ls.setRaw('anitr_favorites', data.favorites);
            if (data.notes)     ls.setRaw('anitr_notes', data.notes);
        }
    } catch (e) {
        console.error('Load error', e);
    }
    hideLoader();
    renderContinueWatching();
}

function getPrefixedKey(k) {
    return currentUser ? (currentUser + '_' + k) : k;
}

// ── localStorage helpers ──────────────────────────────────
const ls = {
  getRaw: (k, def) => { try { return JSON.parse(localStorage.getItem(getPrefixedKey(k))) ?? def; } catch { return def; } },
  setRaw: (k, v)   => { localStorage.setItem(getPrefixedKey(k), JSON.stringify(v)); },
  get: (k, def) => { return ls.getRaw(k, def); },
  set: (k, v)   => { ls.setRaw(k, v); if(k !== 'anitr_settings') triggerSync(); }
};

// ── ACHIEVEMENTS SYSTEM (Başarı Rozetleri) ────────────────
const ACHIEVEMENTS = [
  { id: 'first_login', title: 'Yeni Başlayan', desc: 'İlk kez kayıt oldun!', icon: 'fa-user-plus', check: () => true },
  { id: 'first_anime', title: 'İlk Adım', desc: 'İlk animeyi izlemeye başladın!', icon: 'fa-play', check: () => getHistory().length >= 1 },
  { id: '5_anime', title: 'İzlemeye Devam', desc: '5 farklı anime izledin!', icon: 'fa-fire', check: () => getHistory().length >= 5 },
  { id: '10_anime', title: 'Anime Sever', desc: '10 farklı anime izledin! Harika!', icon: 'fa-star', check: () => getHistory().length >= 10 },
  { id: '25_anime', title: 'Gerçek Fan', desc: '25 farklı anime izledin! Teşekkürler!', icon: 'fa-crown', check: () => getHistory().length >= 25 },
  { id: 'first_favorite', title: 'Beğeni Kutusu', desc: 'İlk favorini ekledin!', icon: 'fa-heart', check: () => getFavorites().length >= 1 },
  { id: '5_favorites', title: 'Favori Koleksiyoncusu', desc: '5 favori anime ekledin!', icon: 'fa-heart-pulse', check: () => getFavorites().length >= 5 },
  { id: 'first_watchlist', title: 'Planlayıcı', desc: 'İlk animesini izleme listene ekledin!', icon: 'fa-bookmark', check: () => getWatchlist().length >= 1 },
];

function getUnlockedAchievements() { return ls.get('anitr_achievements', []); }
function setUnlockedAchievements(achievements) { ls.set('anitr_achievements', achievements); }

function unlockAchievement(achievementId) {
    const unlocked = getUnlockedAchievements();
    if (unlocked.includes(achievementId)) return;
    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (!achievement) return;
    unlocked.push(achievementId);
    setUnlockedAchievements(unlocked);
    showAchievementPopup(achievement);
}

function checkAllAchievements() {
    const unlocked = getUnlockedAchievements();
    for (const achievement of ACHIEVEMENTS) {
        if (!unlocked.includes(achievement.id) && achievement.check()) {
            unlockAchievement(achievement.id);
        }
    }
}

function showAchievementPopup(achievement) {
    document.getElementById('achievementPopupIcon').className = `fa-solid ${achievement.icon}`;
    document.getElementById('achievementPopupTitle').textContent = achievement.title;
    document.getElementById('achievementPopupDesc').textContent = achievement.desc;
    achievementPopup.classList.remove('hidden');
    setTimeout(() => { achievementPopup.classList.add('hidden'); }, 5000);
}

function renderAchievements() {
    const unlocked = getUnlockedAchievements();
    const container = document.getElementById('achievementsContainer');
    container.innerHTML = `
        <div class="achievements-grid">
            ${ACHIEVEMENTS.map(a => {
                const isUnlocked = unlocked.includes(a.id);
                return `
                    <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
                        <div class="achievement-card-icon">
                            <i class="fa-solid ${isUnlocked ? a.icon : 'fa-lock'}"></i>
                        </div>
                        <div class="achievement-card-title">${a.title}</div>
                        <div class="achievement-card-desc">${isUnlocked ? a.desc : '???'}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function openAchievementsModal() {
    renderAchievements();
    achievementsModal.classList.remove('hidden');
}

function closeAchievementsModal() {
    achievementsModal.classList.add('hidden');
}

// ── Auth UI Logic ─────────────────────────────────────────
function showAuthModal(cancellable = true) {
    document.getElementById('authModal').classList.remove('hidden');
    document.getElementById('authUsername').value = '';
    document.getElementById('authPassword').value = '';
    document.getElementById('authCloseBtn').style.display = cancellable ? 'block' : 'none';
    if(currentUser) {
        document.getElementById('authTitle').innerHTML = '<i class="fa-solid fa-user-circle"></i> Profil: ' + currentUser;
        
        // Profil detaylarını oluştur
        const histCount = getHistory().length;
        const favCount = getFavorites().length;
        const wlCount = getWatchlist().length;
        const watchedCount = getWatched().length;

        const profileHtml = `
            <div style="text-align:center; margin-bottom: 2rem;">
                <div style="width: 80px; height: 80px; border-radius: 50%; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; margin: 0 auto 1rem auto; box-shadow: 0 0 20px var(--accent-glow);">
                    ${currentUser.charAt(0).toUpperCase()}
                </div>
                <h2 style="margin-bottom: 0.5rem;">${currentUser}</h2>
                <span class="meta-badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.5);">Aktif Üye</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
                <div style="background: var(--surface); padding: 1rem; border-radius: var(--radius); text-align: center; border: 1px solid var(--border);">
                    <i class="fa-solid fa-clock-rotate-left" style="font-size: 1.5rem; color: var(--accent); margin-bottom: 0.5rem;"></i>
                    <div style="font-size: 1.2rem; font-weight: bold;">${histCount}</div>
                    <div style="color: var(--text3); font-size: 0.85rem;">İzlenen Seri</div>
                </div>
                <div style="background: var(--surface); padding: 1rem; border-radius: var(--radius); text-align: center; border: 1px solid var(--border);">
                    <i class="fa-solid fa-check-double" style="font-size: 1.5rem; color: #10b981; margin-bottom: 0.5rem;"></i>
                    <div style="font-size: 1.2rem; font-weight: bold;">${watchedCount}</div>
                    <div style="color: var(--text3); font-size: 0.85rem;">Biten Bölüm</div>
                </div>
                <div style="background: var(--surface); padding: 1rem; border-radius: var(--radius); text-align: center; border: 1px solid var(--border);">
                    <i class="fa-solid fa-heart" style="font-size: 1.5rem; color: #ef4444; margin-bottom: 0.5rem;"></i>
                    <div style="font-size: 1.2rem; font-weight: bold;">${favCount}</div>
                    <div style="color: var(--text3); font-size: 0.85rem;">Favoriler</div>
                </div>
                <div style="background: var(--surface); padding: 1rem; border-radius: var(--radius); text-align: center; border: 1px solid var(--border);">
                    <i class="fa-solid fa-bookmark" style="font-size: 1.5rem; color: #3b82f6; margin-bottom: 0.5rem;"></i>
                    <div style="font-size: 1.2rem; font-weight: bold;">${wlCount}</div>
                    <div style="color: var(--text3); font-size: 0.85rem;">Listede</div>
                </div>
            </div>
        `;
        
        // Remove old profile content if it exists
        const oldProfile = document.getElementById('profileContent');
        if (oldProfile) oldProfile.remove();

        const profileDiv = document.createElement('div');
        profileDiv.id = 'profileContent';
        profileDiv.innerHTML = profileHtml;
        
        document.getElementById('authUsername').parentElement.before(profileDiv);

        document.getElementById('authSubmitBtn').innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Çıkış Yap';
        document.getElementById('authSubmitBtn').style.background = 'rgba(239, 68, 68, 0.2)';
        document.getElementById('authSubmitBtn').style.color = '#ef4444';
        document.getElementById('authSubmitBtn').style.border = '1px solid rgba(239, 68, 68, 0.5)';

        document.getElementById('authSubmitBtn').onclick = handleLogout;
        document.getElementById('authToggleText').style.display = 'none';
        document.getElementById('authToggleLink').style.display = 'none';
        document.getElementById('authUsername').parentElement.style.display = 'none';
        document.getElementById('authPassword').parentElement.style.display = 'none';
    } else {
        const oldProfile = document.getElementById('profileContent');
        if (oldProfile) oldProfile.remove();

        isAuthModeLogin = true;
        updateAuthModeUI();
        document.getElementById('authSubmitBtn').onclick = handleAuthSubmit;
        document.getElementById('authToggleText').style.display = 'inline';
        document.getElementById('authToggleLink').style.display = 'inline';
        document.getElementById('authUsername').parentElement.style.display = 'block';
        document.getElementById('authPassword').parentElement.style.display = 'block';
    }
}

function closeAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
}

function toggleAuthMode() {
    isAuthModeLogin = !isAuthModeLogin;
    updateAuthModeUI();
}

function updateAuthModeUI() {
    if (isAuthModeLogin) {
        document.getElementById('authTitle').innerHTML = '<i class="fa-solid fa-user"></i> Giriş Yap';
        document.getElementById('authSubmitBtn').textContent = 'Giriş Yap';
        document.getElementById('authToggleText').textContent = 'Hesabın yok mu? ';
        document.getElementById('authToggleLink').textContent = 'Kayıt Ol';
    } else {
        document.getElementById('authTitle').innerHTML = '<i class="fa-solid fa-user-plus"></i> Kayıt Ol';
        document.getElementById('authSubmitBtn').textContent = 'Kayıt Ol';
        document.getElementById('authToggleText').textContent = 'Zaten hesabın var mı? ';
        document.getElementById('authToggleLink').textContent = 'Giriş Yap';
    }
}

async function handleAuthSubmit() {
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    if (!username || !password) {
        showToast('⚠️ Kullanıcı adı ve şifre gereklidir.');
        return;
    }

    const endpoint = isAuthModeLogin ? '/auth/login' : '/auth/register';
    showLoader();
    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        hideLoader();

        if (res.ok) {
            currentUser = data.username;
            localStorage.setItem('anitr_currentUser', currentUser);
            showToast('✅ ' + data.message);
            updateNavbarProfile();
            closeAuthModal();
            await loadFromServer(currentUser);
            
            // Unlock achievement if registering
            if (!isAuthModeLogin) {
                unlockAchievement('first_login');
            }
            
            if(document.getElementById('homeView').classList.contains('hidden') && document.getElementById('watchView').classList.contains('hidden')) {
                loadHome();
            } else {
                loadHome(); // just reload home to refresh UI
            }
        } else {
            showToast('❌ ' + (data.error || 'İşlem başarısız'));
        }
    } catch (e) {
        hideLoader();
        showToast('❌ Sunucuya bağlanılamadı');
    }
}

function handleLogout() {
    currentUser = '';
    localStorage.removeItem('anitr_currentUser');
    showToast('👋 Çıkış yapıldı.');
    closeAuthModal();
    renderContinueWatching();
    updateNavbarProfile();
}

function updateNavbarProfile() {
    const profileBtn = document.getElementById('profileBtnNav');
    if (!profileBtn) return;
    
    // Rengi profileNameColor ile eşleştir
    let colorStyle = profile.nameColor ? `color: ${profile.nameColor};` : 'color: white;';

    if (currentUser) {
        profileBtn.innerHTML = `<img src="${profile.avatar}" alt="Profile" style="width: 28px; height: 28px; border-radius:50%; margin-right:6px; object-fit:cover;"> <span style="${colorStyle} font-weight:bold;">${currentUser}</span>`;
        profileBtn.title = 'Profil: ' + currentUser;
    } else {
        profileBtn.innerHTML = `<img src="${profile.avatar}" alt="Profile" style="width: 28px; height: 28px; border-radius:50%; margin-right:6px; object-fit:cover;"> <span style="${colorStyle} font-weight:bold;">${profile.username}</span>`;
        profileBtn.title = 'Profil: ' + profile.username;
    }
}

const getFavorites = () => ls.get('anitr_favorites', []);
const getHistory   = () => ls.get(currentSourceHistoryKey,   []);
const getWatched   = () => ls.get('anitr_watched_' + currentSourceKey,   []);
const getWatchlist = () => ls.get('anitr_watchlist', []);
const getNotes     = () => ls.get('anitr_notes',     {});
const getTheme     = () => localStorage.getItem('anitr_theme') || 'dark';

const appSettings = {
    audio: 'tr',
    autoNext: true,
    bannerAuto: true,
    mobileView: false,
    defaultSource: 'AnimeciX'
};
Object.assign(appSettings, ls.get('anitr_settings', {}));

currentSource = normalizeSourceName(appSettings.defaultSource);
currentSourceKey = currentSource.replace(/\s+/g, '_');
currentSourceHistoryKey = 'anitr_history_' + currentSourceKey;
currentSourcePositionsKey = 'anitr_positions_' + currentSourceKey;

function saveFavorites(v) { ls.set('anitr_favorites', v); }
function saveHistory(v)   { ls.set(currentSourceHistoryKey,   v); }
function saveWatched(v)   { ls.set('anitr_watched_' + currentSourceKey,   v); }
function saveWatchlist(v) { ls.set('anitr_watchlist', v); }
function saveNotes(v)     { ls.set('anitr_notes',     v); }

// ═══════════════════════════════════════════════════════
//  RESUME PLAYBACK — Basit, Doğrudan localStorage
//  Her bölüm için ayrı key: 'anitr_ts_<epKey>'
// ═══════════════════════════════════════════════════════
function savePosition(key, time) {
    if (!key || time < 5) return;
    const preciseTime = Math.round(time * 100) / 100;
    // Doğrudan localStorage'a yaz (karmaşık prefix/source sistemi bypass)
    localStorage.setItem('anitr_ts_' + key, String(preciseTime));

    // History objesine de yaz (UI'da göstermek için)
    try {
        const hist = ls.getRaw(currentSourceHistoryKey, []);
        for (let i = 0; i < hist.length; i++) {
            const epKeyTemp = (hist[i].slug || hist[i].id) + '_s' + (hist[i].sIdx || 0) + '_e' + (hist[i].eIdx || 0);
            if (epKeyTemp === key) {
                hist[i].lastWatchedSec = preciseTime;
                const m = Math.floor(preciseTime / 60);
                const s = Math.floor(preciseTime % 60).toString().padStart(2, '0');
                hist[i].lastWatchedMinute = `${m}:${s}`;
                break;
            }
        }
        ls.setRaw(currentSourceHistoryKey, hist);
    } catch(e) {}

    // Sunucuya debounced yaz
    _debouncedPositionSync();
}

function getPosition(key) {
    if (!key) return 0;
    // Önce yeni basit sisteme bak
    const direct = parseFloat(localStorage.getItem('anitr_ts_' + key));
    if (!isNaN(direct) && direct > 0) return direct;
    // Eski sisteme de bak (geriye dönük uyumluluk)
    const pos = ls.getRaw(currentSourcePositionsKey, {});
    return pos[key] || 0;
}

function getPositions() {
    return ls.get(currentSourcePositionsKey, {});
}

function clearPosition(key) {
    if (!key) return;
    // Doğrudan sil
    localStorage.removeItem('anitr_ts_' + key);
    // Eski sistemden de sil
    try {
        const pos = ls.getRaw(currentSourcePositionsKey, {});
        delete pos[key];
        ls.setRaw(currentSourcePositionsKey, pos);
    } catch(e) {}
    // History'den de kaldır
    try {
        const hist = ls.getRaw(currentSourceHistoryKey, []);
        for (let i = 0; i < hist.length; i++) {
            const epKeyTemp = (hist[i].slug || hist[i].id) + '_s' + (hist[i].sIdx || 0) + '_e' + (hist[i].eIdx || 0);
            if (epKeyTemp === key) {
                delete hist[i].lastWatchedSec;
                delete hist[i].lastWatchedMinute;
                break;
            }
        }
        ls.setRaw(currentSourceHistoryKey, hist);
    } catch(e) {}
    syncToServer();
}

let _lastSyncTime = 0;
let _positionSyncTimer = null;
function _debouncedPositionSync() {
    const now = Date.now();
    // Her 5 saniyede bir kaydet
    if (now - _lastSyncTime >= 5000) {
        _lastSyncTime = now;
        syncToServer();
    } else {
        clearTimeout(_positionSyncTimer);
        _positionSyncTimer = setTimeout(() => {
            _lastSyncTime = Date.now();
            syncToServer();
        }, 5000);
    }
}
// Kapanış/yenileme: son pozisyonu yaz
window.addEventListener('beforeunload', () => {
    if (typeof animePlayer !== 'undefined' && animePlayer && animePlayer.currentTime > 5) {
        savePosition(currentEpisodeKey, animePlayer.currentTime);
    }
    syncToServer();
});

// Sekme arka plana geçince de kaydet (mobil / tab switch)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        if (typeof animePlayer !== 'undefined' && animePlayer && animePlayer.currentTime > 5) {
            savePosition(currentEpisodeKey, animePlayer.currentTime);
        }
        syncToServer();
    }
});

function getPosition(key) {
    const pos = getPositions();
    return key ? (pos[key] || 0) : 0;
}

// ── Settings ──────────────────────────────────────────────
let profile = {
    username: 'Anime Sever',
    nameColor: '#4ECDC4',
    bio: '',
    avatar: 'https://api.dicebear.com/8.x/avataaars/svg?seed=anitr',
    banner: '',
    showWatchedAnime: true,
    showCurrentWatching: true,
    currentAnime: null
};

function saveSettings() {
    const prevSource = currentSource;
    
    appSettings.audio             = document.getElementById('settingAudio').value;
    appSettings.autoNext          = document.getElementById('settingAutoNext').checked;
    appSettings.bannerAuto        = document.getElementById('settingBannerAuto').checked;
    appSettings.mobileView        = document.getElementById('settingMobileView') ? document.getElementById('settingMobileView').checked : false;
    appSettings.defaultSource     = normalizeSourceName(document.getElementById('settingDefaultSource') ? document.getElementById('settingDefaultSource').value : 'AnimeciX');
    appSettings.navbarLayout      = document.getElementById('settingNavbarLayout') ? document.getElementById('settingNavbarLayout').value : 'top';
    appSettings.aiEnabled         = document.getElementById('settingAIEnabled') ? document.getElementById('settingAIEnabled').checked : true;
    appSettings.aiProvider        = document.getElementById('settingAIProvider') ? document.getElementById('settingAIProvider').value : 'openai';
    appSettings.aiApiKey          = document.getElementById('settingAIApiKey') ? document.getElementById('settingAIApiKey').value : '';
    appSettings.aiPrompt          = document.getElementById('settingAIPrompt') ? document.getElementById('settingAIPrompt').value : '';
    
    // Save subtitle settings to existing localStorage key
    const subtitleSettings = {
        fontSize: parseInt(document.getElementById('settingSubSize').value) || 20,
        textColor: document.getElementById('settingSubColor').value || '#ffffff',
        backgroundColor: document.getElementById('settingSubBgColor').value || '#000000',
        backgroundOpacity: (parseInt(document.getElementById('settingSubBgOpacity').value) || 70) / 100,
        fontFamily: (document.getElementById('settingSubFont').value || 'Inter') + ', sans-serif',
        position: document.getElementById('settingSubPosition').value || 'bottom'
    };
    localStorage.setItem('anitr_subtitle_settings', JSON.stringify(subtitleSettings));
    
    ls.set('anitr_settings', appSettings);
    
    // Uygula
    document.getElementById('subSizeVal').textContent = subtitleSettings.fontSize + 'px';
    document.getElementById('subColorVal').textContent = subtitleSettings.textColor;
    document.getElementById('subBgOpacityVal').textContent = `%${Math.round(subtitleSettings.backgroundOpacity * 100)}`;
    document.documentElement.style.setProperty('--sub-size', subtitleSettings.fontSize + 'px');
    
    // Apply subtitle styles to Plyr
    applySubtitleSettings(subtitleSettings);
    
    // Kaynak değişti mi kontrol et
    if (prevSource !== appSettings.defaultSource) {
        currentSource = appSettings.defaultSource;
        currentSourceKey = currentSource.replace(/\s+/g, '_');
        localStorage.setItem('anitr_defaultSource', currentSource);
        
        // Kaynak değişti, kaldığı yerden devam et verilerini güncelle
        updateSourceSpecificData();
        
        showToast(`⚙️ Varsayılan kaynak değiştirildi: ${currentSource}`);
        loadHome(); // Ana sayfayı yeniden yükle
    } else {
        showToast('⚙️ Ayarlar kaydedildi.');
    }
    
    if (appSettings.bannerAuto) startHeroTimer(); else stopHeroTimer();
    
    document.body.setAttribute('data-nav-layout', appSettings.navbarLayout || 'top');
    
    if (appSettings.mobileView || window.innerWidth <= 768) {
        document.body.classList.add('mobile-view');
        document.querySelector('.mobile-bottom-bar').classList.remove('hidden');
    } else {
        document.body.classList.remove('mobile-view');
        document.querySelector('.mobile-bottom-bar').classList.add('hidden');
    }
}

function updateSourceSpecificData() {
    // Kaynağa özel veri anahtarlarını güncelle
    currentSourceHistoryKey = 'anitr_history_' + currentSourceKey;
    currentSourcePositionsKey = 'anitr_positions_' + currentSourceKey;
    
    // Geçmiş ve pozisyonları kaynağa özel olarak güncelle
    renderContinueWatching();
}

function loadSettingsUI() {
    document.getElementById('settingAudio').value       = appSettings.audio || 'sub';
    document.getElementById('settingAutoNext').checked  = appSettings.autoNext !== false;
    document.getElementById('settingBannerAuto').checked = appSettings.bannerAuto !== false;
    
    // Load subtitle settings from existing localStorage key
    const subtitleSettings = (function getSubtitleSettings() {
        const saved = localStorage.getItem('anitr_subtitle_settings');
        return saved ? JSON.parse(saved) : {
            fontSize: 20,
            backgroundOpacity: 0.7,
            fontFamily: 'Inter, sans-serif',
            textColor: '#ffffff',
            backgroundColor: '#000000',
            position: 'bottom'
        };
    })();
    
    const subSizeInput = document.getElementById('settingSubSize');
    if (subSizeInput) {
        subSizeInput.value = subtitleSettings.fontSize;
        document.getElementById('subSizeVal').textContent = subtitleSettings.fontSize + 'px';
        document.documentElement.style.setProperty('--sub-size', subtitleSettings.fontSize + 'px');
    }
    const subColorInput = document.getElementById('settingSubColor');
    if (subColorInput) {
        subColorInput.value = subtitleSettings.textColor;
        document.getElementById('subColorVal').textContent = subtitleSettings.textColor;
    }
    const subBgColorInput = document.getElementById('settingSubBgColor');
    if (subBgColorInput) {
        subBgColorInput.value = subtitleSettings.backgroundColor;
    }
    const subBgOpacityInput = document.getElementById('settingSubBgOpacity');
    if (subBgOpacityInput) {
        subBgOpacityInput.value = Math.round(subtitleSettings.backgroundOpacity * 100);
        document.getElementById('subBgOpacityVal').textContent = `%${Math.round(subtitleSettings.backgroundOpacity * 100)}`;
    }
    const subFontInput = document.getElementById('settingSubFont');
    if (subFontInput) {
        // Extract just the font name (without ', sans-serif')
        const fontName = subtitleSettings.fontFamily.split(',')[0].trim();
        subFontInput.value = fontName;
    }
    const subPositionInput = document.getElementById('settingSubPosition');
    if (subPositionInput) {
        subPositionInput.value = subtitleSettings.position;
    }
    
    // Apply subtitle styles initially
    applySubtitleSettings(subtitleSettings);

    const sourceSelect = document.getElementById('settingDefaultSource');
    if (sourceSelect) {
        sourceSelect.value = appSettings.defaultSource || 'AnimeciX';
    }

    const navLayoutSelect = document.getElementById('settingNavbarLayout');
    if (navLayoutSelect) {
        navLayoutSelect.value = appSettings.navbarLayout || 'top';
    }

    const aiEnabledToggle = document.getElementById('settingAIEnabled');
    if (aiEnabledToggle) {
        aiEnabledToggle.checked = appSettings.aiEnabled !== false;
    }
    
    const aiProviderSelect = document.getElementById('settingAIProvider');
    if (aiProviderSelect) {
        aiProviderSelect.value = appSettings.aiProvider || 'openai';
    }
    const aiApiKeyInput = document.getElementById('settingAIApiKey');
    if (aiApiKeyInput) {
        aiApiKeyInput.value = appSettings.aiApiKey || '';
    }
    const aiPromptInput = document.getElementById('settingAIPrompt');
    if (aiPromptInput) {
        aiPromptInput.value = appSettings.aiPrompt || '';
    }
    
    // Load profile
    const savedProfile = ls.get('anitr_profile');
    if (savedProfile) {
        profile = { ...profile, ...savedProfile };
    }
    
    document.body.setAttribute('data-nav-layout', appSettings.navbarLayout || 'top');
}

// --- Profile Functions ---
function showProfileModal() {
    loadProfileUI();
    document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.add('hidden');
}

function loadProfileUI() {
    document.getElementById('profileUsername').value = profile.username || '';
    document.getElementById('profileNameColor').value = profile.nameColor || '#ffffff';
    document.getElementById('profileBio').value = profile.bio || '';
    document.getElementById('profileDiscord').value = profile.discord || '';
    document.getElementById('profileFavGenre').value = profile.favGenre || '';
    document.getElementById('profileShowWatchedAnime').checked = profile.showWatchedAnime !== false;
    document.getElementById('profileShowCurrentWatching').checked = profile.showCurrentWatching !== false;
    
    if (profile.avatar) {
        document.getElementById('profileAvatar').src = profile.avatar;
    }
    if (profile.banner) {
        document.getElementById('profileBanner').src = profile.banner;
        document.getElementById('profileBannerWrapper').style.display = 'block';
    }
    
    document.getElementById('profileUsername').style.color = profile.nameColor || '#ffffff';
    document.getElementById('profileNameColor').addEventListener('change', () => {
        document.getElementById('profileUsername').style.color = document.getElementById('profileNameColor').value;
    });
    
    // Handle file uploads
    document.getElementById('profileAvatarInput').addEventListener('change', handleAvatarUpload);
    document.getElementById('profileBannerInput').addEventListener('change', handleBannerUpload);
    
    updateProfileCurrentWatching();
}

function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            profile.avatar = event.target.result;
            document.getElementById('profileAvatar').src = profile.avatar;
        };
        reader.readAsDataURL(file);
    }
}

function handleBannerUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            profile.banner = event.target.result;
            document.getElementById('profileBanner').src = profile.banner;
            document.getElementById('profileBannerWrapper').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function saveProfile() {
    profile.username = document.getElementById('profileUsername').value;
    profile.nameColor = document.getElementById('profileNameColor').value;
    profile.bio = document.getElementById('profileBio').value;
    profile.discord = document.getElementById('profileDiscord').value;
    profile.favGenre = document.getElementById('profileFavGenre').value;
    profile.showWatchedAnime = document.getElementById('profileShowWatchedAnime').checked;
    profile.showCurrentWatching = document.getElementById('profileShowCurrentWatching').checked;
    
    ls.set('anitr_profile', profile);
    showToast('✅ Profili kaydedildi!');
    closeProfileModal();
    updateNavbarProfile();
}

function updateProfileCurrentWatching() {
    const container = document.getElementById('profileCurrentWatching');
    if (!container) return;
    
    if (!profile.showCurrentWatching || !profile.currentAnime) {
        container.innerHTML = '<p style="color: var(--text3); text-align: center;">Şu an bir anime izlemiyorsunuz.</p>';
        return;
    }
    
    const anime = profile.currentAnime;
    container.innerHTML = `
        <div class="anime-rec-card" style="display: flex; gap: 0.75rem; align-items: center; padding: 0.75rem; background: var(--surface2); border-radius: 8px;">
            <img src="${anime.img || anime.poster}" alt="${anime.title}" style="width: 60px; height: 84px; object-fit: cover; border-radius: 6px;">
            <div style="flex: 1;">
                <div style="font-weight: bold; color: var(--text);">${anime.title}</div>
                <div style="font-size: 0.85rem; color: var(--text3);">${anime.episode ? `Bölüm: ${anime.episode}` : 'Bölüm seçilmedi'}</div>
            </div>
        </div>
    `;
}

// updateNavbarProfile removed because it's defined above
function openSettings()  { settingsModal.classList.remove('hidden'); }
function closeSettings() { settingsModal.classList.add('hidden'); }

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // ⚠️ file:// protokolü uyarısı
    if (window.location.protocol === 'file:') {
        document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#09090e;color:#fff;font-family:Inter,sans-serif;gap:1.5rem;text-align:center;padding:2rem">
                <div style="font-size:4rem">⚠️</div>
                <h1 style="font-size:1.8rem;font-weight:700">Yanlış Açılış Yöntemi</h1>
                <p style="color:rgba(255,255,255,0.6);max-width:500px;line-height:1.6">Bu siteyi doğrudan dosyadan açtın. Tarayıcı güvenlik politikaları nedeniyle <code style="background:rgba(255,255,255,0.1);padding:0.2em 0.5em;border-radius:4px">file://</code> protokolüyle API'ye bağlanılamaz.</p>
                <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:1.5rem 2rem;font-size:1.1rem">
                    <p style="color:rgba(255,255,255,0.5);margin-bottom:0.5rem;font-size:0.85rem">Doğru adres:</p>
                    <a href="http://localhost:8080" style="color:#6366f1;font-size:1.3rem;font-weight:700;text-decoration:none">http://localhost:8080</a>
                </div>
                <p style="color:rgba(255,255,255,0.4);font-size:0.85rem">Anitr sunucusunu <code style="background:rgba(255,255,255,0.1);padding:0.2em 0.5em;border-radius:4px">go run main.go</code> komutuyla çalıştırdıktan sonra bu linke tıkla.</p>
            </div>
        `;
        return;
    }
    applyTheme(getTheme());
    loadSettingsUI();
    updateNavbarProfile();
    initScrollToTop();
    
    try {
        await loadFromServer(currentUser || 'local');
    } catch (e) {
        console.error('Veriler yüklenemedi', e);
    }
    
    checkMALStatus();
    loadHome();

    pingActiveUsers();
    activeUsersInterval = setInterval(pingActiveUsers, 15000);

    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSearch(); });
    searchInput.addEventListener('input', handleSuggest);
    searchInput.addEventListener('blur', () => setTimeout(() => suggestions.classList.add('hidden'), 200));

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (!statsModal.classList.contains('hidden'))    { closeStats(); return; }
            if (!noteModal.classList.contains('hidden'))     { closeNoteModal(); return; }
            if (!settingsModal.classList.contains('hidden')) { closeSettings(); return; }
            if (!drawer.classList.contains('hidden'))        { closeDrawer(); return; }
            if (!document.getElementById('profileModal').classList.contains('hidden')) { closeProfileModal(); return; }
            if (!document.getElementById('downloadModal').classList.contains('hidden')) { closeDownloadModal(); return; }
            if (!document.getElementById('downloadsModal').classList.contains('hidden')) { closeDownloadsModal(); return; }
        }
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); searchInput.focus(); }
        if (e.ctrlKey && e.key === 'h') { e.preventDefault(); showHistory(); }
    });
});

// ── Scroll To Top ─────────────────────────────────────────
function initScrollToTop() {
    const btn = document.createElement('button');
    btn.id = 'scrollTopBtn';
    btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i>';
    btn.title = 'Yukarı çık';
    btn.style.cssText = 'position:fixed;bottom:5rem;right:2rem;z-index:500;' +
        'background:var(--accent);color:#fff;border:none;width:44px;height:44px;' +
        'border-radius:50%;cursor:pointer;font-size:1rem;display:none;align-items:center;' +
        'justify-content:center;box-shadow:0 4px 16px var(--accent-glow);transition:all 0.2s;';
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => {
        btn.style.display = window.scrollY > 400 ? 'flex' : 'none';
    });
}

// ── Views ─────────────────────────────────────────────────
function clearProfileCurrentAnime() {
    profile.currentAnime = null;
    ls.set('anitr_profile', profile);
    updateProfileCurrentWatching();
}
function showHomeView() {
    leaveW2GRoom();
    clearProfileCurrentAnime();
    setAmbientBackground(null);
    homeView.classList.remove('hidden');
    animeListView.classList.add('hidden');
    watchView.classList.add('hidden');
    malView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    if (plyr)  { try { plyr.destroy(); } catch (e) {} plyr = null; }
    if (hls)   { hls.destroy(); hls = null; }
    // Mobil alt barda aktif sekmeyi güncelle
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mobile-nav-btn')[0].classList.add('active');
}
function showAnimeListViewContainer() {
    leaveW2GRoom();
    clearProfileCurrentAnime();
    animeListView.classList.remove('hidden');
    homeView.classList.add('hidden');
    watchView.classList.add('hidden');
    malView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    if (plyr)  { try { plyr.destroy(); } catch (e) {} plyr = null; }
    if (hls)   { hls.destroy(); hls = null; }
}
function showWatchView() {
    watchView.classList.remove('hidden');
    homeView.classList.add('hidden');
    animeListView.classList.add('hidden');
    malView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showMALView() {
    leaveW2GRoom();
    clearProfileCurrentAnime();
    malView.classList.remove('hidden');
    homeView.classList.add('hidden');
    animeListView.classList.add('hidden');
    watchView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    checkMALStatus();
    if (malUser) {
        loadMALList();
    }
}

function showScheduleView() {
    leaveW2GRoom();
    clearProfileCurrentAnime();
    const sv = document.getElementById('scheduleView');
    if (sv) sv.classList.remove('hidden');
    homeView.classList.add('hidden');
    animeListView.classList.add('hidden');
    watchView.classList.add('hidden');
    malView.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadSchedule();
    if (plyr) { try { plyr.destroy(); } catch (e) {} plyr = null; }
    if (hls)  { hls.destroy(); hls = null; }
}

// ── Theme ─────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('anitr_theme', theme);
    const icon = document.querySelector('#themeBtn i');
    if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

function setAmbientBackground(imgUrl) {
    const ambientBg = document.getElementById('ambientBackground');
    if (!ambientBg) return;
    
    if (imgUrl) {
        ambientBg.style.backgroundImage = `url('${imgUrl}')`;
        ambientBg.style.opacity = '1';
    } else {
        ambientBg.style.opacity = '0';
    }
}

function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

// ── Loader ────────────────────────────────────────────────
function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }

// ── API ───────────────────────────────────────────────────
async function fetchAPI(path, options = {}) {
    const retries = options.retries || 2;
    const delay = options.delay || 1000;
    
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(API_BASE + path, {
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            if (!res.ok) { 
                console.warn('API non-OK:', res.status, path); 
                if (res.status === 429 && i < retries) {
                    await new Promise(r => setTimeout(r, delay * (i + 1)));
                    continue;
                }
                return null; 
            }
            return await res.json();
        } catch (err) {
            console.error('API Error:', path, err);
            if (i < retries) {
                await new Promise(r => setTimeout(r, delay * (i + 1)));
            }
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════
// HERO BANNER  (Hareketli, Sağdan Sola Geçiş)
// ═══════════════════════════════════════════════════════════
function buildWelcomeSlide() {
    return {
        type: 'welcome',
        title: 'Anitr\'e Hoş Geldiniz! 🎌',
        desc: 'Binlerce anime tek platformda. Altyazılı, dublajlı, ücretsiz.',
        bg: 'transparent',
        extra: `<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.5rem">
            <div class="hero-stat"><i class="fa-solid fa-tv"></i> Binlerce Anime</div>
            <div class="hero-stat"><i class="fa-solid fa-subtitles"></i> Türkçe Altyazı</div>
            <div class="hero-stat"><i class="fa-solid fa-bolt"></i> Hızlı İzleme</div>
        </div>`
    };
}

let cinematicHeroes = [];
let currentCinematicIndex = 0;

async function initHeroBanner() {
    // Cinematic Hero Logic
    try {
        // En popüler / güncel animeleri Jikan'dan çek
        const response = await fetch('https://api.jikan.moe/v4/seasons/now?limit=25');
        const data = await response.json();
        
        if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
            // Karıştır ve 7-8 tanesini seç
            cinematicHeroes = data.data.sort(() => 0.5 - Math.random()).slice(0, 8);
            currentCinematicIndex = 0;
        }
    } catch (e) {
        console.error("Hero banner verisi çekilemedi:", e);
    }

    renderCinematicHero();

    // Add Parallax Listener
    const cinematicHero = document.getElementById('cinematicHero');
    const cinematicBg = document.getElementById('cinematicHeroBg');
    if (cinematicHero && cinematicBg && !cinematicHero.dataset.parallaxInit) {
        cinematicHero.dataset.parallaxInit = 'true';
        cinematicHero.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 20;
            const y = (e.clientY / window.innerHeight - 0.5) * 20;
            cinematicBg.style.transform = `translate(${x}px, ${y}px) scale(1.05)`;
        });
        cinematicHero.addEventListener('mouseleave', () => {
            cinematicBg.style.transform = `translate(0, 0) scale(1.05)`;
        });
    }
    if (appSettings.bannerAuto !== false) {
        startHeroTimer();
    }
}

window.renderCinematicHero = function() {
    const cinematicBg = document.getElementById('cinematicHeroBg');
    const cinematicTitle = document.getElementById('cinematicTitle');
    const cinematicDesc = document.getElementById('cinematicDesc');
    const cinematicMeta = document.getElementById('cinematicMeta');
    const cinematicActions = document.getElementById('cinematicActions');
    const cinematicDots = document.getElementById('cinematicDots');

    if (!cinematicBg) return;

    if (cinematicHeroes.length > 0) {
        const heroAnime = cinematicHeroes[currentCinematicIndex];
        const bgUrl = heroAnime.images?.jpg?.large_image_url || heroAnime.images?.jpg?.image_url || '';
        cinematicBg.style.backgroundImage = `url(${bgUrl})`;
        const safeTitle = (heroAnime.title || heroAnime.title_english || 'Bilinmiyor').replace(/'/g, "\\'");
        cinematicTitle.innerText = heroAnime.title || heroAnime.title_english || 'Bilinmiyor';
        cinematicDesc.innerText = (heroAnime.synopsis || '').slice(0, 220) + (heroAnime.synopsis && heroAnime.synopsis.length > 220 ? '...' : '');
        
        let metaHtml = '';
        if (heroAnime.score) metaHtml += `<span><i class="fa-solid fa-star" style="color:#f59e0b"></i> ${heroAnime.score}</span>`;
        if (heroAnime.episodes) metaHtml += `<span><i class="fa-solid fa-film"></i> ${heroAnime.episodes} Bölüm</span>`;
        if (heroAnime.genres) metaHtml += `<span class="hero-genres">${heroAnime.genres.slice(0, 3).map(g => g.name).join(' · ')}</span>`;
        cinematicMeta.innerHTML = metaHtml;

        cinematicActions.innerHTML = `
            <button class="btn-primary" onclick="searchAnimeByName('${safeTitle}')"><i class="fa-solid fa-play"></i> Hemen İzle</button>
            <button class="btn-secondary" style="padding:0.8rem 2rem;font-size:1rem;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);color:#fff;backdrop-filter:blur(8px);" onclick="searchAnimeByName('${safeTitle}')"><i class="fa-solid fa-circle-info"></i> Detaylar</button>
        `;

        if (cinematicDots) {
            cinematicDots.innerHTML = cinematicHeroes.map((_, i) =>
                `<div class="nf-dot ${i === currentCinematicIndex ? 'active' : ''}" onclick="jumpCinematicHero(${i})"></div>`
            ).join('');
        }
    } else {
        cinematicBg.style.background = '#111';
        cinematicTitle.innerText = "Anime Bulunamadı";
        cinematicDesc.innerText = "Lütfen internet bağlantınızı kontrol edip tekrar deneyin.";
        cinematicMeta.innerHTML = '';
        cinematicActions.innerHTML = '';
    }
}

window.jumpCinematicHero = function(idx) {
    currentCinematicIndex = idx;
    renderCinematicHero();
}

window.nextCinematicHero = function() {
    if(cinematicHeroes.length === 0) return;
    currentCinematicIndex = (currentCinematicIndex + 1) % cinematicHeroes.length;
    renderCinematicHero();
}

window.prevCinematicHero = function() {
    if(cinematicHeroes.length === 0) return;
    currentCinematicIndex = (currentCinematicIndex - 1 + cinematicHeroes.length) % cinematicHeroes.length;
    renderCinematicHero();
}

let _cinematicTimer = null;
window.startHeroTimer = function() {
    stopHeroTimer();
    _cinematicTimer = setInterval(() => {
        if (!document.getElementById('homeView').classList.contains('hidden')) {
            nextCinematicHero();
        }
    }, 5000); // 5 saniyede bir geç
}

window.stopHeroTimer = function() {
    if (_cinematicTimer) clearInterval(_cinematicTimer);
}

function searchAnimeByName(name) {
    searchInput.value = name;
    handleSearch();
}

// ═══════════════════════════════════════════════════════════
// HOME
// ═══════════════════════════════════════════════════════════
async function loadHome() {
    showHomeView();
    mainContent.innerHTML = '';
    continueWatch.classList.add('hidden');
    const cHero = document.getElementById('cinematicHero');
    if (cHero) cHero.classList.remove('hidden');

    renderContinueWatching();
    await initHeroBanner();

    showLoader();

    // Top Anime (MAL)
    await loadJikanSection('/mal/top', '🔥 Haftanın En Popülleri', true);
    // Seasonal Anime
    await loadJikanSection('/mal/seasonal', '🌸 Bu Sezonun Öne Çıkanları', true);
    // Genre rows
    await loadGenreSection('Action', '⚔️ Aksiyon');
    await loadGenreSection('Comedy', '😂 Komedi');
    await loadGenreSection('Romance', '💕 Romantik');
    await loadGenreSection('Fantasy', '🧙 Fantastik');
    await loadGenreSection('Drama', '🎭 Dram');
    await loadGenreSection('Slice of Life', '🍃 Günüllük Hayat');
    // All Time Top
    await loadJikanSection('/mal/top?type=alltime', '🏆 Tüm Zamanların En İyileri', true);

    // MAL Önerileri
    if (malUser) {
        const recPlaceholder = document.createElement('div');
        recPlaceholder.id = 'recPlaceholder';
        recPlaceholder.className = 'nf-section';
        recPlaceholder.innerHTML = `
            <h2 class="nf-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i> ✨ Sana Özel Öneriler</h2>
            <div style="background:var(--surface2);padding:2rem;border-radius:12px;text-align:center;">
                <div class="spinner" style="display:inline-block"></div>
                <p style="color:var(--text3);margin-top:0.75rem;font-size:0.85rem;">İzleme geçmişin analiz ediliyor...</p>
            </div>`;
        mainContent.appendChild(recPlaceholder);
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/mal/recommendations?username=${encodeURIComponent(malUser)}`);
                const data = res.ok ? await res.json() : null;
                const ph = document.getElementById('recPlaceholder');
                if (!ph) return;
                ph.remove();
                if (data && Array.isArray(data) && data.length > 0) renderJikanCarousel(data, '✨ Sana Özel Öneriler');
            } catch (e) { const ph = document.getElementById('recPlaceholder'); if (ph) ph.remove(); }
        })();
    }

    // AI Tavsiye Bölümü (en alta)
    const aiSection = document.createElement('div');
    aiSection.id = 'aiRecommendationSection';
    aiSection.className = 'nf-ai-section';
    aiSection.innerHTML = `
        <h2 class="nf-section-title" style="margin-bottom:1rem;"><i class="fa-solid fa-robot"></i> Ne izlesem?</h2>
        <div style="display:flex;gap:0.5rem;align-items:center;">
            <input type="text" id="aiRecommendationInput" class="ai-input" placeholder="Tavsiye iste... (Örn: uzay temalı aksiyon)" style="flex:1;padding:0.8rem 1rem;border-radius:10px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-family:inherit;font-size:0.95rem;">
            <button class="btn-primary" id="aiRecommendBtn" onclick="getAIRecommendations()" style="padding:0.8rem 1.5rem;"><i class="fa-solid fa-wand-magic-sparkles"></i> Öner</button>
        </div>
        <div id="aiRecommendationsContainer" class="ai-results" style="margin-top:1rem;max-height:300px;overflow-y:auto;"></div>
    `;
    mainContent.appendChild(aiSection);

    hideLoader();
}

async function loadJikanSection(endpoint, title, allowEmpty = true) {
    const tempId = 'jikan-sec-' + Math.random().toString(36).substr(2, 9);
    mainContent.insertAdjacentHTML('beforeend', renderSkeletonCarousel(title, tempId));
    try {
        const data = await fetchAPI(endpoint);
        const secEl = document.getElementById(tempId);
        if (data && Array.isArray(data) && data.length > 0) {
            const html = buildJikanCarouselHtml(data, title);
            if(secEl) secEl.outerHTML = html;
            else mainContent.insertAdjacentHTML('beforeend', html);
        } else if (!allowEmpty) {
            if(secEl) secEl.remove();
            console.warn(title + " için veri dönmedi.");
        } else {
            if(secEl) secEl.remove();
        }
    } catch (e) {
        const secEl = document.getElementById(tempId);
        if(secEl) secEl.remove();
        console.error(title + " yüklenirken hata:", e);
    }
}

async function loadGenreSection(genreName, displayTitle, allowEmpty = true) {
    const tempId = 'genre-sec-' + Math.random().toString(36).substr(2, 9);
    mainContent.insertAdjacentHTML('beforeend', renderSkeletonCarousel(displayTitle, tempId));
    try {
        const data = await fetchAPI('/mal/genre?name=' + encodeURIComponent(genreName));
        const secEl = document.getElementById(tempId);
        if (data && Array.isArray(data) && data.length > 0) {
            const html = buildJikanCarouselHtml(data, displayTitle);
            if(secEl) secEl.outerHTML = html;
            else mainContent.insertAdjacentHTML('beforeend', html);
        } else if (!allowEmpty) {
            if(secEl) secEl.remove();
            console.warn(displayTitle + " için veri dönmedi.");
        } else {
            if(secEl) secEl.remove();
        }
    } catch (e) {
        const secEl = document.getElementById(tempId);
        if(secEl) secEl.remove();
        console.error(displayTitle + " yüklenirken hata:", e);
    }
}

function renderSkeletonCarousel(sectionTitle, id) {
    let cards = [];
    for(let i=0; i<6; i++) {
        cards.push(`
        <div class="nf-card skeleton">
            <div class="nf-card-poster skeleton-image"></div>
            <div class="nf-card-overlay">
                <div class="skeleton-text"></div>
                <div class="skeleton-text short"></div>
            </div>
        </div>`);
    }
    return `
        <div class="nf-section" id="${id}">
            <h2 class="nf-section-title">${sectionTitle}</h2>
            <div class="nf-row-wrapper">
                <button class="nf-row-btn nf-btn-prev" onclick="scrollCarousel(this, -1)"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="nf-row">${cards.join('')}</div>
                <button class="nf-row-btn nf-btn-next" onclick="scrollCarousel(this, 1)"><i class="fa-solid fa-chevron-right"></i></button>
            </div>
        </div>
    `;
}

// ── Continue Watching ─────────────────────────────────────
function buildJikanCarouselHtml(data, sectionTitle) {
    const topData = data.slice(0, 20);

    const cards = topData.map((a) => {
        const safeTitle = (a.title || a.title_english || 'Bilinmiyor').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const img = (a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || a.image_url) || 'https://placehold.co/200x280/1a1a28/e8a020?text=?';
        const displayTitle = a.title || a.title_english || 'Bilinmiyor';
        const score = a.score || '-';
        let genreStr = '';
        if (Array.isArray(a.genres)) {
            genreStr = a.genres.slice(0, 2).map(g => typeof g === 'string' ? g : g.name).join(' · ');
        } else if (a.genres && typeof a.genres === 'string') {
            genreStr = a.genres;
        }
        return `<div class="nf-card" onclick="searchAnimeByName('${safeTitle}')">
            <div class="nf-card-score"><i class="fa-solid fa-star"></i> ${score}</div>
            <img class="nf-card-poster" src="${img}" alt="${displayTitle}" loading="lazy" onerror="this.src='https://placehold.co/200x280/1a1a28/e8a020?text=?'">
            <div class="nf-card-overlay">
                <button class="nf-card-play" onclick="event.stopPropagation();searchAnimeByName('${safeTitle}')"><i class="fa-solid fa-play"></i></button>
                <div class="nf-card-title">${displayTitle}</div>
                ${genreStr ? `<div class="nf-card-genre">${genreStr}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    return `
        <div class="nf-section">
            <h2 class="nf-section-title">${sectionTitle}</h2>
            <div class="nf-row-wrapper">
                <button class="nf-row-btn nf-btn-prev" onclick="scrollCarousel(this, -1)"><i class="fa-solid fa-chevron-left"></i></button>
                <div class="nf-row">${cards}</div>
                <button class="nf-row-btn nf-btn-next" onclick="scrollCarousel(this, 1)"><i class="fa-solid fa-chevron-right"></i></button>
            </div>
        </div>
    `;
}

// ── Continue Watching ─────────────────────────────────────
window.resumeWatch = function(id) {
    const hist = getHistory().find(h => String(h.id) === String(id));
    if (hist) {
        window._resumeWatchHistory = hist;
        quickPlay(hist.id, hist.slug, hist.isMovie, hist.title, hist.synopsis, hist.img);
    }
};

function renderContinueWatching() {
    const hist = getHistory();
    const statsEl = document.getElementById('homeStatsWidget');
    // Stats widget gizle (Netflix layoutta göstermiyoruz)
    if (statsEl) statsEl.classList.add('hidden');
    
    if (!hist.length) { continueWatch.classList.add('hidden'); return; }
    continueWatch.classList.remove('hidden');

    const positions = getPositions();
    const latestByAnime = {};
    hist.forEach(h => {
        const key = String(h.id);
        if (!latestByAnime[key] || (h.ep && latestByAnime[key].ep && h.eIdx > latestByAnime[key].eIdx)) {
            latestByAnime[key] = h;
        }
    });

    cwContainer.innerHTML = Object.values(latestByAnime).sort((a, b) => {
        const aTime = a.lastWatchedAt || a.lastWatched || 0;
        const bTime = b.lastWatchedAt || b.lastWatched || 0;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
    }).slice(0, 12).map(h => {
        const epKey = (h.slug || h.id) + '_s' + (h.sIdx || 0) + '_e' + (h.eIdx || 0);
        const savedSec = positions[epKey] || 0;
        const estimatedDuration = 1440;
        const progress = Math.min(100, Math.floor((savedSec / estimatedDuration) * 100));
        const resumeLabel = savedSec > 30
            ? `${Math.floor(savedSec/60)}:${Math.floor(savedSec%60).toString().padStart(2,'0')} / Bölüm ${(h.eIdx||0)+1}`
            : h.lastWatchedLabel || `Bölüm ${(h.eIdx||0)+1}`;
        const safeTitle = (h.title||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
        return `<div class="nf-cw-card" onclick="resumeWatch('${h.id}')">
            <img src="${h.img||'https://placehold.co/60x80/1a1a28/e8a020?text=?'}" alt="Poster" loading="lazy">
            <div class="nf-cw-info">
                <div class="nf-cw-title">${h.title||''}</div>
                <div class="nf-cw-ep">${resumeLabel}</div>
                ${progress > 0 ? `<div style="font-size:0.65rem;color:var(--accent);font-weight:700;">${progress}% İzlendi</div>` : ''}
            </div>
            <div class="nf-cw-progress"><div style="width:${progress}%"></div></div>
        </div>`;
    }).join('');
}
    
// ── Render Anime Grid ─────────────────────────────────────
function renderAnimeGrid(data, title, showFilter) {
    if (!data || !data.length) {
        mainContent.innerHTML = '<p style="color:var(--text3);padding:2rem">Sonuç bulunamadı.</p>';
        return;
    }
    const cards = data.map(a => {
        const titleVal = (a.Title    || a.title    || 'Bilinmiyor');
        const synopsis = (a.Synopsis || a.synopsis || '');
        const img      = (a.ImageURL || a.Img || a.img || a.image_url || 'https://placehold.co/200x280/1a1a28/e8a020?text=?');
        const slug     = (a.Slug     || a.slug     || '');
        const id       = a.ID || a.id || '';
        const isMovie  = !!(a.IsMovie || a.isMovie || a.TitleType === 'movie' || a.titleType === 'movie' || a.Type === 'movie' || a.type === 'movie');
        const genres   = a.Genres || a.genres || [];
        const genreStr = Array.isArray(genres) ? genres.slice(0, 2).join(', ') : '';

        // HTML attribute'ları için temizle
        const attrTitle    = titleVal.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const attrSynopsis = synopsis.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        const attrImg      = img.replace(/'/g, "\\'");
        const attrSlug     = slug.replace(/'/g, "\\'");

        return `<div class="anime-card" onclick="loadDetails('${id}','${attrSlug}',${isMovie},'${attrTitle}','${attrSynopsis}','${attrImg}')">
            <div class="card-poster-wrap">
                <img class="card-poster" src="${img}" alt="${attrTitle}" loading="lazy" onclick="event.stopPropagation();openLightbox('${attrImg}')">
                <div class="card-hover-overlay">
                    <button class="quick-play-btn" onclick="event.stopPropagation();quickPlay('${id}','${attrSlug}',${isMovie},'${attrTitle}','${attrSynopsis}','${attrImg}')" title="Hızlı Oynat"><i class="fa-solid fa-play"></i></button>
                    <button class="quick-wl-btn" onclick="event.stopPropagation();toggleWatchlistItem({id:'${id}',title:'${attrTitle}',img:'${attrImg}'})" title="Listeye Ekle"><i class="fa-solid fa-bookmark"></i></button>
                </div>
                ${isMovie ? '<span class="card-badge">Film</span>' : ''}
            </div>
            <div class="card-info">
                <div class="card-title">${titleVal}</div>
                ${genreStr ? `<div class="card-genre">${genreStr}</div>` : ''}
            </div></div>`;
    }).join('');

    mainContent.innerHTML = `
        <h2 class="section-title">${title}</h2>
        <div class="carousel-wrapper">
            <button class="carousel-btn left" onclick="scrollCarousel(this, -1)"><i class="fa-solid fa-chevron-left"></i></button>
            <div id="animeGrid" class="anime-carousel">
                ${cards}
            </div>
            <button class="carousel-btn right" onclick="scrollCarousel(this, 1)"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
    `;

    // Apply 3D tilt effect
    if (typeof VanillaTilt !== 'undefined') {
        VanillaTilt.init(mainContent.querySelectorAll('#animeGrid .anime-card'), {
            max: 12,
            speed: 400,
            glare: true,
            "max-glare": 0.25,
            scale: 1.05
        });
    }
}

function scrollCarousel(btn, dir) {
    const container = btn.parentElement.querySelector('.anime-carousel, .cw-container, .bento-ribbon-carousel, .nf-row');
    if (container) {
        container.scrollBy({ left: dir * Math.max(container.clientWidth * 0.8, 300), behavior: 'smooth' });
    }
}

// ── Lightbox (Yeni Özellik 1) ─────────────────────────────
function openLightbox(src) {
    if (!src) return;
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeLightbox() {
    document.getElementById('lightbox').classList.add('hidden');
    document.getElementById('lightboxImg').src = '';
    document.body.style.overflow = '';
}

// ── Trailer Modal (Yeni Özellik 3) ─────────────────────────
function openTrailerModal(youtubeId) {
    if (!youtubeId) return;
    document.getElementById('trailerIframe').src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1`;
    document.getElementById('trailerModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function closeTrailerModal() {
    document.getElementById('trailerModal').classList.add('hidden');
    document.getElementById('trailerIframe').src = '';
    document.body.style.overflow = '';
}

// ── Quick Play (Yeni Özellik 2) ───────────────────────────
async function quickPlay(id, slug, isMovie, title, synopsis, img) {
    showToast('⚡ Hızlı oynatma yükleniyor...');
    
    if (isMovie) {
        currentAnime    = { id, slug, isMovie, title, synopsis, img };
        currentEpisodes = [{ ID: '', Title: 'Film' }];
        watchEpisode(id, slug, isMovie, currentEpisodes[0], 0, 0, title, synopsis, img);
        return;
    }

    const qs = 'id=' + id + '&slug=' + encodeURIComponent(slug) + '&source=' + encodeURIComponent(currentSource);
    const seasonsData = await fetchAPI('/seasons?' + qs);
    if (!seasonsData || !Array.isArray(seasonsData) || !seasonsData.length) {
        showToast('❌ Bölümler alınamadı, detay sayfası açılıyor...');
        loadDetails(id, slug, isMovie, title, synopsis, img);
        return;
    }
    let startSIdx = seasonsData[0].Number !== undefined ? seasonsData[0].Number : 0;
    let startEIdx = 0;

    if (window._resumeWatchHistory && String(window._resumeWatchHistory.id) === String(id)) {
        startSIdx = window._resumeWatchHistory.sIdx !== undefined ? window._resumeWatchHistory.sIdx : startSIdx;
        startEIdx = window._resumeWatchHistory.eIdx || 0;
        window._resumeWatchHistory = null;
    }

    const sId = (seasonsData.find(s => s.Number === startSIdx) || seasonsData[0]).ID || (seasonsData.find(s => s.Number === startSIdx) || seasonsData[0]).id || id;
    const epsQs = 'season_id=' + sId + '&season_num=' + startSIdx + '&id=' + id + '&slug=' + encodeURIComponent(slug) + '&source=' + encodeURIComponent(currentSource);
    const eps = await fetchAPI('/episodes?' + epsQs);
    if (!eps || !Array.isArray(eps) || !eps.length) {
        loadDetails(id, slug, isMovie, title, synopsis, img);
        return;
    }

    setAmbientBackground(img);
    currentAnime    = { id, slug, isMovie, title, synopsis, img };
    currentEpisodes = eps;

    let startEp = eps[startEIdx] || eps[0];

    watchEpisode(id, slug, isMovie, startEp, startSIdx, startEIdx, title, synopsis, img);
}

// ── Watchlist (Yeni Özellik 3) ───────────────────────────
function toggleWatchlistItem(anime) {
    const list = getWatchlist();
    const idx  = list.findIndex(a => String(a.id) === String(anime.id));
    if (idx === -1) {
        list.unshift(anime);
        showToast('📋 İzleme listesine eklendi.');
    } else {
        list.splice(idx, 1);
        showToast('📋 İzleme listesinden çıkarıldı.');
    }
    saveWatchlist(list);
    updateDetailWLBtn(anime.id);
    updateWatchlistButton();
    checkAllAchievements();
}

function toggleWatchlistFromWatch() {
    if (!currentAnime.id) return;
    toggleWatchlistItem({ id: currentAnime.id, title: currentAnime.title, img: currentAnime.img, slug: currentAnime.slug });
}

function updateWatchlistButton() {
    const btn = document.getElementById('watchWatchlistBtn');
    if (!btn || !currentAnime.id) return;
    const isInWatchlist = getWatchlist().some(a => String(a.id) === String(currentAnime.id));
    btn.innerHTML = isInWatchlist ? '<i class="fa-solid fa-bookmark"></i> Listede' : '<i class="fa-regular fa-bookmark"></i> Liste';
}

function showWatchlist() {
    const list = getWatchlist();
    drawerTitle.textContent = '📋 İzleme Listesi';
    drawerContent.innerHTML = list.length
        ? list.map(a => {
            const safeTitle    = (a.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeSynopsis = (a.synopsis || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeImg      = (a.img || '').replace(/'/g, "\\'");
            const safeSlug     = (a.slug || '').replace(/'/g, "\\'");
            return '<div class="drawer-item" onclick="loadDetails(\'' + a.id + '\',\'' + safeSlug + '\',' + (a.isMovie || false) + ',\'' + safeTitle + '\',\'' + safeSynopsis + '\',\'' + safeImg + '\');closeDrawer()">' +
                '<img src="' + (a.img || 'https://placehold.co/40x56/1a1a28/e8a020?text=?') + '" alt="Poster">' +
                '<div class="drawer-item-info"><div class="drawer-item-title">' + (a.title || '') + '</div></div>' +
                '<button class="close-btn" onclick="event.stopPropagation();toggleWatchlistItem({id:\'' + a.id + '\'});showWatchlist()"><i class="fa-solid fa-xmark"></i></button>' +
                '</div>';
        }).join('')
        : '<p style="color:var(--text3);padding:2rem;text-align:center">İzleme listeniz boş.<br><small>Kart üzerindeki 🔖 ikonuna tıklayın.</small></p>';
    openDrawer();
    // Mobil alt barda aktif sekmeyi güncelle
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mobile-nav-btn')[2].classList.add('active');
}

// ── Random Anime (Yeni Özellik 4) ────────────────────────
async function loadRandom() {
    showToast('🎲 Rastgele anime aranıyor...');
    try {
        const jikanRes = await fetch('https://api.jikan.moe/v4/random/anime');
        const jikanData = await jikanRes.json();
        
        if (jikanData && jikanData.data && jikanData.data.title) {
            const title = jikanData.data.title;
            showToast('🎲 ' + title + ' aranıyor...');
            searchInput.value = title;
            handleSearch();
        } else {
            showToast('❌ Rastgele anime bulunamadı.');
        }
    } catch (e) {
        showToast('❌ API hatası, rastgele anime bulunamadı.');
    }
}

// ── Stats (Yeni Özellik 5) ────────────────────────────────
function showStats() {
    const watched   = getWatched();
    const history   = getHistory();
    const watchlist = getWatchlist();
    const favorites = getFavorites();
    const positions = getPositions();
    const totalSec  = Object.values(positions).reduce((a, b) => a + b, 0);
    const hours     = Math.floor(totalSec / 3600);
    const minutes   = Math.floor((totalSec % 3600) / 60);

    document.getElementById('statsBody').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding:1rem 0">
            <div class="stat-card"><i class="fa-solid fa-check-circle" style="color:#22c55e"></i><div class="stat-num">${watched.length}</div><div class="stat-label">İzlenen Bölüm</div></div>
            <div class="stat-card"><i class="fa-solid fa-clock" style="color:#e8a020"></i><div class="stat-num">${hours}sa ${minutes}dk</div><div class="stat-label">Toplam İzleme</div></div>
            <div class="stat-card"><i class="fa-solid fa-heart" style="color:#ef4444"></i><div class="stat-num">${favorites.length}</div><div class="stat-label">Favori Anime</div></div>
            <div class="stat-card"><i class="fa-solid fa-bookmark" style="color:#f59e0b"></i><div class="stat-num">${watchlist.length}</div><div class="stat-label">İzleme Listesi</div></div>
            <div class="stat-card" style="grid-column:span 2"><i class="fa-solid fa-history" style="color:#06b6d4"></i><div class="stat-num">${history.length}</div><div class="stat-label">Geçmişteki Anime</div></div>
        </div>
        <button class="btn-secondary" style="width:100%;margin-top:0.5rem" onclick="if(confirm('Tüm verileri sıfırla?')){resetAllUserData();}">
            <i class="fa-solid fa-trash"></i> Tüm Verileri Sıfırla
        </button>`;
    statsModal.classList.remove('hidden');
}
function closeStats() { statsModal.classList.add('hidden'); }

function resetAllUserData() {
    const theme = localStorage.getItem('anitr_theme');
    const anonymousId = localStorage.getItem('anitr_anonymousId');
    const currentUserValue = localStorage.getItem('anitr_currentUser');
    localStorage.clear();
    if (theme) localStorage.setItem('anitr_theme', theme);
    if (anonymousId) localStorage.setItem('anitr_anonymousId', anonymousId);
    if (currentUserValue) localStorage.setItem('anitr_currentUser', currentUserValue);
    closeStats();
    renderContinueWatching();
    updateNavbarProfile();
    loadSettingsUI();
    currentAnime = {};
    currentEpisodes = [];
    currentEpisodeKey = null;
    loadHome();
    showToast('🗑️ Veriler sıfırlandı.');
}

// ── Episode Notes (Yeni Özellik 6) ───────────────────────
function openNoteModal() {
    if (!currentEpisodeKey) { showToast('Önce bir bölüm açın.'); return; }
    const notes = getNotes();
    document.getElementById('noteTextarea').value = notes[currentEpisodeKey] || '';
    noteModal.classList.remove('hidden');
}
function closeNoteModal() { noteModal.classList.add('hidden'); }
function saveNote() {
    if (!currentEpisodeKey) return;
    const notes = getNotes();
    const text  = document.getElementById('noteTextarea').value.trim();
    if (text) notes[currentEpisodeKey] = text; else delete notes[currentEpisodeKey];
    saveNotes(notes);
    closeNoteModal();
    showToast('📝 Not kaydedildi.');
}

// ── Anime List Logic ─────────────────────────────────────
let allAnimeList = []; // Store all fetched animes for filtering

async function showAnimeListView() {
    showAnimeListViewContainer();
    const grid = document.getElementById('animeListGrid');
    grid.innerHTML = '';
    animeListPage = 1;
    hasMoreAnime = true;
    allAnimeList = []; // Reset the list
    
    // Initialize filter dropdowns
    initializeFilters();
    
    await loadMoreAnime();
}

function initializeFilters() {
    // Populate year filter
    const yearSelect = document.getElementById('yearFilter');
    yearSelect.innerHTML = '<option value="">Tüm Yıllar</option>';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 1990; y--) {
        yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
    }
    
    // Populate genre filter (sample genres, you can expand later)
    const genreSelect = document.getElementById('genreFilter');
    const genres = [
        'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy',
        'Sci-Fi', 'Slice of Life', 'Sports', 'Mystery', 'Horror', 'Supernatural',
        'Romance', 'Ecchi', 'Mecha', 'Music', 'Psychological', 'Thriller'
    ];
    genreSelect.innerHTML = '<option value="">Tüm Türler</option>';
    genres.forEach(g => {
        genreSelect.innerHTML += `<option value="${g}">${g}</option>`;
    });
}

let currentFilters = {
    genre: '',
    year: '',
    status: '',
    sort: ''
};

function applyFilters() {
    currentFilters = {
        genre: document.getElementById('genreFilter')?.value || '',
        year: document.getElementById('yearFilter')?.value || '',
        status: document.getElementById('statusFilter')?.value || '',
        sort: document.getElementById('sortFilter')?.value || ''
    };
    const grid = document.getElementById('animeListGrid');
    grid.innerHTML = '';
    renderAnimeListItems(filterAndSortAnimeList(allAnimeList));
}

function clearFilters() {
    document.getElementById('genreFilter').value = '';
    document.getElementById('yearFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('sortFilter').value = '';
    currentFilters = {
        genre: '', year: '', status: '', sort: '' };
    applyFilters();
}

async function loadMoreAnime() {
    if (isAnimeListLoading || !hasMoreAnime) return;
    
    isAnimeListLoading = true;
    const loader = document.getElementById('animeListLoader');
    loader.classList.remove('hidden');

    try {
        let url = `/discover?page=${animeListPage}&source=${encodeURIComponent(currentSource)}`;
        
        const data = await fetchAPI(url);
        
        if (data && Array.isArray(data) && data.length > 0) {
            allAnimeList = [...allAnimeList, ...data]; // Add to the full list
            animeListPage++;
            if (data.length < 10) hasMoreAnime = false;
            
            // Render filtered and sorted list
            const filteredData = filterAndSortAnimeList(allAnimeList);
            renderAnimeListItems(filteredData, true); // Clear existing grid
        } else {
            hasMoreAnime = false;
        }
    } catch (e) {
        console.error('Anime listesi yüklenemedi', e);
        showToast('❌ Animeler yüklenirken bir hata oluştu.');
    } finally {
        isAnimeListLoading = false;
        loader.classList.add('hidden');
    }
}

function filterAndSortAnimeList(animeList) {
    let filtered = [...animeList];
    
    // Filter by genre (check in title/synopsis, since we don't have genre data from API yet)
    if (currentFilters.genre) {
        const genreLower = currentFilters.genre.toLowerCase();
        filtered = filtered.filter(a => {
            const title = (a.Title || a.title || '').toLowerCase();
            const synopsis = (a.Synopsis || a.synopsis || '').toLowerCase();
            return title.includes(genreLower) || synopsis.includes(genreLower);
        });
    }
    
    // Filter by year (check in title/synopsis)
    if (currentFilters.year) {
        filtered = filtered.filter(a => {
            const title = (a.Title || a.title || '');
            const synopsis = (a.Synopsis || a.synopsis || '');
            return title.includes(currentFilters.year) || synopsis.includes(currentFilters.year);
        });
    }
    
    // Sort
    if (currentFilters.sort) {
        switch (currentFilters.sort) {
            case 'name':
                filtered.sort((a, b) => {
                    const titleA = (a.Title || a.title || '').toLowerCase();
                    const titleB = (b.Title || b.title || '').toLowerCase();
                    return titleA.localeCompare(titleB);
                });
                break;
            case 'year':
                filtered.sort((a, b) => {
                    // Try to extract year from title
                    const yearA = extractYear(a.Title || a.title || '');
                    const yearB = extractYear(b.Title || b.title || '');
                    return yearB - yearA;
                });
                break;
        }
    }
    
    return filtered;
}

function extractYear(title) {
    const match = title.match(/(199\d|20[0-2]\d)/);
    return match ? parseInt(match[0]) : 0;
}

function renderAnimeListItems(data, clearGrid = false) {
    const grid = document.getElementById('animeListGrid');
    
    if (clearGrid) {
        grid.innerHTML = '';
    }
    
    data.forEach(a => {
        const title    = (a.Title    || a.title    || 'Bilinmiyor');
        const synopsis = (a.Synopsis || a.synopsis || '');
        const img      = (a.ImageURL || a.Img || a.img || a.image_url || 'https://placehold.co/200x280/1a1a28/e8a020?text=?');
        const slug     = (a.Slug     || a.slug     || '');
        const id       = a.ID || a.id || '';
        const isMovie  = !!(a.IsMovie || a.isMovie || a.TitleType === 'movie' || a.titleType === 'movie' || a.Type === 'movie' || a.type === 'movie');

        // HTML attribute'ları için temizle (Satır sonlarını kaldır, tırnakları escape et)
        const attrTitle    = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const attrSynopsis = synopsis.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        const attrImg      = img.replace(/'/g, "\\'");
        const attrSlug     = slug.replace(/'/g, "\\'");

        const card = document.createElement('div');
        card.className = 'anime-card';
        card.onclick = () => loadDetails(id, slug, isMovie, title, synopsis, img);
        
        card.innerHTML = `
            <div class="card-poster-wrap">
                <img class="card-poster" src="${img}" alt="${attrTitle}" loading="lazy" onclick="event.stopPropagation();openLightbox('${attrImg}')">
                <div class="card-hover-overlay">
                    <button class="quick-play-btn" onclick="event.stopPropagation();quickPlay('${id}','${attrSlug}',${isMovie},'${attrTitle}','${attrSynopsis}','${attrImg}')" title="Hızlı Oynat"><i class="fa-solid fa-play"></i></button>
                    <button class="quick-wl-btn" onclick="event.stopPropagation();toggleWatchlistItem({id:'${id}',title:'${attrTitle}',img:'${attrImg}'})" title="Listeye Ekle"><i class="fa-solid fa-bookmark"></i></button>
                </div>
                ${isMovie ? '<span class="card-badge">Film</span>' : ''}
            </div>
            <div class="card-info">
                <div class="card-title">${title}</div>
            </div>`;
        grid.appendChild(card);
    });
}

// Infinite Scroll Event
window.addEventListener('scroll', () => {
    if (animeListView.classList.contains('hidden')) return;
    
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        loadMoreAnime();
    }
});

// ── Global Export ────────────────────────────────────────
window.showAnimeListView = showAnimeListView;
window.loadHome          = loadHome;
window.loadDetails       = loadDetails;
window.quickPlay         = quickPlay;
window.loadRandom        = loadRandom;
window.showWatchlist     = showWatchlist;
window.showFavorites     = showFavorites;
window.showHistory       = showHistory;
window.showStats         = showStats;
window.openSettings      = openSettings;
window.toggleTheme       = toggleTheme;
window.handleSearch      = handleSearch;
window.applyFilters      = applyFilters;
window.clearFilters      = clearFilters;
window.openAchievementsModal = openAchievementsModal;
window.closeAchievementsModal = closeAchievementsModal;

// ── Watchlist / History Views ──────────────────────────────
function showWatchlist() {
    homeView.classList.add('hidden');
    animeListView.classList.add('hidden');
    watchView.classList.add('hidden');
    document.getElementById('malView').classList.add('hidden');
    document.getElementById('scheduleView').classList.add('hidden');
    document.getElementById('historyView').classList.add('hidden');
    
    // Watchlist Logic
    const list = getWatchlist();
    if (!list.length) {
        mainContent.innerHTML = '<h2 class="section-title"><i class="fa-solid fa-bookmark"></i> İzleme Listem</h2><p style="color:var(--text3);padding:2rem;">Listeniz boş.</p>';
        return;
    }
    const cards = list.map(a => {
        const titleVal = (a.Title || a.title || 'Bilinmiyor').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const img = (a.ImageURL || a.Img || a.img || 'https://placehold.co/200x280/1a1a28/e8a020?text=?').replace(/'/g, "\\'");
        const slug = (a.Slug || a.slug || '').replace(/'/g, "\\'");
        const id = a.ID || a.id || '';
        return `<div class="anime-card" onclick="loadDetails('${id}','${slug}',false,'${titleVal}','','${img}')">
            <div class="card-poster-wrap">
                <img class="card-poster" src="${img}" alt="${titleVal}">
            </div>
            <div class="card-info">
                <div class="card-title">${titleVal}</div>
            </div>
        </div>`;
    }).join('');
    mainContent.innerHTML = `<h2 class="section-title"><i class="fa-solid fa-bookmark"></i> İzleme Listem</h2><div class="anime-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1rem; padding: 2rem;">${cards}</div>`;
}

function showHistory() {
    homeView.classList.add('hidden');
    animeListView.classList.add('hidden');
    watchView.classList.add('hidden');
    document.getElementById('malView').classList.add('hidden');
    document.getElementById('scheduleView').classList.add('hidden');
    document.getElementById('historyView').classList.remove('hidden');

    const historyContent = document.getElementById('historyContent');
    const hist = getHistory();

    if (!hist.length) {
        historyContent.innerHTML = '<p style="color:var(--text3);">Henüz hiçbir şey izlemediniz.</p>';
        return;
    }

    const cards = hist.map(h => {
        const titleVal = (h.title || 'Bilinmiyor').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const img = (h.img || 'https://placehold.co/200x280/1a1a28/e8a020?text=?').replace(/'/g, "\\'");
        const epLabel = h.lastWatchedLabel || `Bölüm ${(h.eIdx || 0) + 1}`;
        const dateStr = h.lastWatchedAt ? new Date(h.lastWatchedAt).toLocaleString('tr-TR') : 'Bilinmeyen Tarih';
        const savedSec = getPositions()[(h.slug || h.id) + '_s' + (h.sIdx || 0) + '_e' + (h.eIdx || 0)] || 0;
        const progress = Math.min(100, Math.floor((savedSec / 1440) * 100));
        const minStr = Math.floor(savedSec / 60) + ':' + String(savedSec % 60).padStart(2, '0');

        return `
        <div class="cw-card" style="margin-bottom: 1rem; width: 100%; max-width: none; cursor: default;">
            <div style="flex-shrink:0; cursor: pointer;" onclick="loadDetails('${h.id}','${h.slug}',${h.isMovie},'${titleVal}','','${img}')">
                <img src="${img}" style="width:80px;height:100px;border-radius:8px;object-fit:cover">
            </div>
            <div class="cw-info" style="flex-grow: 1;">
                <div class="cw-title" style="font-size: 1.1rem; margin-bottom: 0.3rem;">${titleVal}</div>
                <div class="cw-ep" style="font-size: 0.9rem; color: var(--accent);"><i class="fa-solid fa-play"></i> ${epLabel}</div>
                <div style="font-size: 0.8rem; color: var(--text3); margin-top: 0.4rem;"><i class="fa-solid fa-calendar"></i> ${dateStr}</div>
                ${savedSec > 0 ? `<div style="font-size:0.8rem; color:var(--accent); margin-top:0.4rem; font-weight:bold;"><i class="fa-solid fa-clock"></i> Kaldığın Süre: ${minStr} (%${progress})</div>` : ''}
            </div>
            <button class="btn-primary" onclick="resumeWatch('${h.id}')" style="margin-right: 1rem;">
                <i class="fa-solid fa-play"></i> Devam Et
            </button>
        </div>`;
    }).join('');

    historyContent.innerHTML = `<div style="display:flex; flex-direction:column; gap:1rem; max-width:800px; margin:0 auto;">${cards}</div>`;
}

// ── Search ────────────────────────────────────────────────
async function handleSearch() {
    const q = searchInput.value.trim();
    suggestions.classList.add('hidden');
    searchInput.blur();
    if (!q) { loadHome(); return; }

    // 🥚 EASTER EGG — "ANİTR" veya "ANITR" yazılınca
    if (q.toUpperCase().replace('İ', 'I') === 'ANITR' || q.toUpperCase() === 'ANİTR') {
        searchInput.value = '';
        showEasterEgg();
        return;
    }

    showHomeView();
    continueWatch.classList.add('hidden');
    // Arama sırasında hoşgeldin banner'ını gizle
    const cHero = document.getElementById('cinematicHero');
    if (cHero) cHero.classList.add('hidden');
    showLoader();
    mainContent.innerHTML = '';

    const data = await fetchAPI('/search?q=' + encodeURIComponent(q) + '&source=' + encodeURIComponent(currentSource));
    hideLoader();

    if (!data || !Array.isArray(data) || !data.length) {
        mainContent.innerHTML = '<h2 class="section-title">Arama: "' + q + '"</h2><p style="color:var(--text3);padding:1rem">Sonuç bulunamadı.</p>';
    } else {
        renderAnimeGrid(data, '🔍 Arama: "' + q + '"', false);
    }
    searchInput.value = '';
}

// 🥚 Easter Egg Modal
function showEasterEgg() {
    // Varsa eski modalı kaldır
    const existing = document.getElementById('easterEggModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'easterEggModal';
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 99998;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.85); backdrop-filter: blur(16px);
        animation: fadeIn 0.35s ease;
    `;
    modal.onclick = (e) => { if (e.target === modal) closeEasterEgg(); };

    modal.innerHTML = `
        <div style="
            text-align: center;
            padding: 3rem 4rem;
            background: linear-gradient(145deg, #1c1c24, #12121a);
            border: 1px solid rgba(232,160,32,0.3);
            border-radius: 24px;
            box-shadow: 0 0 80px rgba(232,160,32,0.18), 0 30px 80px rgba(0,0,0,0.6);
            animation: pageEnter 0.4s cubic-bezier(0.22,1,0.36,1);
            max-width: 340px;
            position: relative;
        ">
            <button onclick="closeEasterEgg()" style="
                position: absolute; top: 1rem; right: 1rem;
                background: rgba(255,255,255,0.06); border: none; color: var(--text3);
                width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 1rem;
                display: flex; align-items: center; justify-content: center;
            "><i class="fa-solid fa-xmark"></i></button>

            <div style="
                width: 120px; height: 120px; border-radius: 50%;
                margin: 0 auto 1.5rem;
                border: 3px solid #e8a020;
                box-shadow: 0 0 30px rgba(232,160,32,0.5), 0 0 60px rgba(232,160,32,0.2);
                overflow: hidden;
                animation: subtlePulse 2.5s ease-in-out infinite;
            ">
                <img src="slayervoxy.jpg" alt="SlayerVoxy"
                     style="width:100%; height:100%; object-fit:cover;"
                     onerror="this.src='https://placehold.co/120x120/1a1a28/e8a020?text=SV'">
            </div>

            <div style="
                font-size: 1.5rem; font-weight: 800;
                background: linear-gradient(135deg, #e8a020, #f59e0b, #fbbf24);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                margin-bottom: 0.4rem; letter-spacing: 0.03em;
            ">SlayerVoxy</div>

            <div style="color: var(--text3); font-size: 0.85rem; margin-bottom: 1.5rem;">
                🎌 Anitr'in web tabanını yapan kişi
            </div>

            <div style="
                font-size: 0.7rem; color: rgba(232,160,32,0.5);
                letter-spacing: 0.15em; text-transform: uppercase;
                border-top: 1px solid rgba(232,160,32,0.12);
                padding-top: 1rem; margin-top: 0.5rem;
            ">🥚 Easter Egg — Buldun!</div>
        </div>
    `;

    document.body.appendChild(modal);

    // Konfeti!
    if (window._launchConfetti) {
        window._launchConfetti(window.innerWidth / 2, window.innerHeight / 2);
    }

    // ESC ile kapat
    const escHandler = (e) => { if (e.key === 'Escape') { closeEasterEgg(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
}

function closeEasterEgg() {
    const modal = document.getElementById('easterEggModal');
    if (modal) {
        modal.style.animation = 'pageLeave 0.22s ease forwards';
        setTimeout(() => modal.remove(), 250);
    }
}
window.closeEasterEgg = closeEasterEgg;

async function handleSuggest() {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (q.length < 2) { suggestions.classList.add('hidden'); return; }
    searchTimeout = setTimeout(async () => {
        const data = await fetchAPI('/search?q=' + encodeURIComponent(q) + '&source=' + encodeURIComponent(currentSource));
        if (!data || !Array.isArray(data) || !data.length) { suggestions.classList.add('hidden'); return; }
        suggestions.classList.remove('hidden');
        suggestions.innerHTML = data.slice(0, 6).map(a => {
            const safeTitle = (a.Title || a.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const imgUrl = a.ImageURL || a.image_url || a.Img || a.img || '';
            return '<div class="suggestion-item" onclick="searchInput.value=\'' + safeTitle + '\';handleSearch()">' +
                (imgUrl ? '<img src="' + imgUrl + '" alt="" class="suggestion-img" onerror="this.style.display=\'none\'">' : '') +
                '<span class="suggestion-title">' + (a.Title || a.title || '') + '</span>' +
                '</div>';
        }).join('');
    }, 300);
}

// ── Favorites / History ───────────────────────────────────
function markWatched(key) {
    const w = getWatched();
    if (!w.includes(key)) { w.push(key); saveWatched(w); }
}

function addToHistory(anime) {
    let h = getHistory().filter(a => String(a.id) !== String(anime.id));
    h.unshift(anime);
    if (h.length > 30) h = h.slice(0, 30);
    saveHistory(h);
    checkAllAchievements();
}

function toggleFavorite(anime) {
    let favs = getFavorites();
    const idx = favs.findIndex(a => String(a.id) === String(anime.id));
    if (idx === -1) {
        favs.unshift(anime);
        showToast('❤️ Favorilere eklendi!');
    } else {
        favs.splice(idx, 1);
        showToast('💔 Favorilerden çıkarıldı.');
    }
    saveFavorites(favs);
    updateFavBtn();
    checkAllAchievements();
}

function toggleFavoriteFromWatch() {
    if (!currentAnime.id) return;
    toggleFavorite({ id: currentAnime.id, title: currentAnime.title, img: currentAnime.img, slug: currentAnime.slug });
}

function updateFavBtn() {
    const btn  = document.getElementById('watchFavBtn');
    if (!btn || !currentAnime.id) return;
    const isFav = getFavorites().some(a => String(a.id) === String(currentAnime.id));
    btn.innerHTML = isFav ? '<i class="fa-solid fa-heart"></i> Favoride' : '<i class="fa-regular fa-heart"></i> Favori';
    updateWatchlistButton();
}

function showHistory() {
    const hist = getHistory();
    drawerTitle.textContent = '🕐 İzleme Geçmişi';
    drawerContent.innerHTML = hist.length
        ? hist.map(h => {
            const safeTitle    = (h.title    || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeSynopsis = (h.synopsis || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeImg      = (h.img      || '').replace(/'/g, "\\'");
            const safeSlug     = (h.slug     || '').replace(/'/g, "\\'");
            return '<div class="drawer-item" onclick="loadDetails(\'' + h.id + '\',\'' + safeSlug + '\',' + h.isMovie + ',\'' + safeTitle + '\',\'' + safeSynopsis + '\',\'' + safeImg + '\');closeDrawer()">' +
                '<img src="' + (h.img || 'https://placehold.co/40x56/1a1a28/e8a020?text=?') + '" alt="Poster">' +
                '<div class="drawer-item-info"><div class="drawer-item-title">' + (h.title || '') + '</div><div style="color:var(--text3);font-size:0.8rem">' + (h.lastWatchedLabel || '') + '</div></div>' +
                '</div>';
        }).join('')
        : '<p style="color:var(--text3);padding:2rem;text-align:center">Geçmiş boş.</p>';
    openDrawer();
}

function showFavorites() {
    const favs = getFavorites();
    drawerTitle.textContent = '❤️ Favorilerim';
    drawerContent.innerHTML = favs.length
        ? favs.map(a => {
            const safeTitle    = (a.title    || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeSynopsis = (a.synopsis || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeImg      = (a.img      || '').replace(/'/g, "\\'");
            const safeSlug     = (a.slug     || '').replace(/'/g, "\\'");
            return '<div class="drawer-item" onclick="loadDetails(\'' + a.id + '\',\'' + safeSlug + '\',' + (a.isMovie || false) + ',\'' + safeTitle + '\',\'' + safeSynopsis + '\',\'' + safeImg + '\');closeDrawer()">' +
                '<img src="' + (a.img || 'https://placehold.co/40x56/1a1a28/e8a020?text=?') + '" alt="Poster">' +
                '<div class="drawer-item-info"><div class="drawer-item-title">' + (a.title || '') + '</div></div>' +
                '</div>';
        }).join('')
        : '<p style="color:var(--text3);padding:2rem;text-align:center">Favori listeniz boş.</p>';
    openDrawer();
    // Mobil alt barda aktif sekmeyi güncelle
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.mobile-nav-btn')[3].classList.add('active');
}

// ── Drawer ────────────────────────────────────────────────
function openDrawer() {
    drawer.classList.remove('hidden');
    drawerOverlay.classList.remove('hidden');
}
function closeDrawer() {
    drawer.classList.add('hidden');
    drawerOverlay.classList.add('hidden');
}

// ── Details Page ──────────────────────────────────────────
async function loadDetails(id, slug, isMovie, title, synopsis, img) {
    showHomeView();
    continueWatch.classList.add('hidden');
    showLoader();
    mainContent.innerHTML = '';
    currentSelectedSound = ''; // Başka animeye geçildiğinde önceki anlık seçimi sıfırla

    const safeTitle    = (title    || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeSynopsis = (synopsis || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeImg      = (img      || '').replace(/'/g, "\\'");
    const safeSlug     = (slug     || '').replace(/'/g, "\\'");

    const isFav = getFavorites().some(a => String(a.id) === String(id));
    const isWL  = getWatchlist().some(a => String(a.id) === String(id));
    
    // Check History for Resume button
    const histEntry = getHistory().find(h => String(h.id) === String(id));

    mainContent.innerHTML = `
        <div class="detail-hero" style="background-image:url('${img || ''}')">
            <div class="detail-overlay"></div>
            <div class="detail-content">
                <img class="detail-poster" src="${img || 'https://placehold.co/200x280/1a1a28/e8a020?text=?'}" alt="Poster" onclick="openLightbox('${safeImg}')">
                <div class="detail-info">
                    <h1 class="detail-title">${title || 'Bilinmiyor'}</h1>
                    <p class="detail-synopsis">${synopsis || 'Açıklama yok.'}</p>
                    <div class="detail-actions">
                        ${histEntry ? 
                            `<button class="btn-primary" id="playBtn" onclick="resumeWatch('${id}')" style="background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 4px 15px var(--accent-glow);">
                                <i class="fa-solid fa-play"></i> Kaldığın Yerden Devam Et (Bölüm ${histEntry.eIdx !== undefined ? histEntry.eIdx + 1 : 1})
                            </button>` 
                            : 
                            `<button class="btn-primary" id="playBtn"><i class="fa-solid fa-play"></i> İzle</button>`
                        }
                        <button class="btn-secondary" id="favBtnDetail" onclick="toggleFavorite({id:'${id}',title:'${safeTitle}',img:'${safeImg}',slug:'${safeSlug}'});updateDetailFavBtn('${id}')">
                            ${isFav ? '<i class="fa-solid fa-heart"></i> Favoride' : '<i class="fa-regular fa-heart"></i> Favori'}
                        </button>
                        <button class="btn-secondary" id="wlBtnDetail" onclick="toggleWatchlistItem({id:'${id}',title:'${safeTitle}',img:'${safeImg}',slug:'${safeSlug}'});updateDetailWLBtn('${id}')">
                            ${isWL ? '<i class="fa-solid fa-bookmark"></i> Listede' : '<i class="fa-regular fa-bookmark"></i> Listeye Ekle'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div id="seasonTabs" class="season-tabs"></div>
        <div id="episodesList" class="episodes-list"></div>`;

    hideLoader();

    if (isMovie) {
        document.getElementById('episodesList').innerHTML = '<p style="color:var(--text3);padding:1rem;font-size:1.1rem;"><i class="fa-solid fa-film"></i> Bu bir film. Doğrudan izleyebilirsiniz.</p>';
        const playFirstBtn = document.getElementById('playBtn');
        if (playFirstBtn) {
            playFirstBtn.onclick = () => {
                currentEpisodes = [{ ID: '', Title: 'Film' }];
                watchEpisode(id, slug, isMovie, currentEpisodes[0], 0, 0, title, synopsis, img);
            };
        }
        return;
    }

    const qs = (id ? 'id=' + id : '') + (slug ? '&slug=' + encodeURIComponent(slug) : '') + '&source=' + encodeURIComponent(currentSource);
    const seasonsData = await fetchAPI('/seasons?' + qs);

    if (!seasonsData || !Array.isArray(seasonsData) || !seasonsData.length) {
        document.getElementById('episodesList').innerHTML = '<p style="color:var(--text3);padding:1rem">Sezon bulunamadı.</p>';
        return;
    }

    currentAnime = { id, slug, isMovie, title, synopsis, img };

    const tabsEl = document.getElementById('seasonTabs');
    tabsEl.innerHTML = ''; // Temizle
    let firstClicked = false;
    
    // Backend API'si [ { Seasons: [1, 2, ...], Count: X } ] veya [ { Number: 1 }, { Number: 2 } ] dönebilir
    let seasonsToRender = [];
    seasonsData.forEach((s, i) => {
        if (s.Seasons && Array.isArray(s.Seasons)) {
            // AnimeciX tarzı (tek obje, içinde Seasons array var)
            s.Seasons.forEach(sNum => seasonsToRender.push(sNum));
        } else {
            // Anizium tarzı (her sezon ayrı bir obje)
            const sNum = s.Number !== undefined ? s.Number : i + 1;
            seasonsToRender.push(sNum);
        }
    });

    // Eğer dizi boşsa veya hatalı geldiyse varsayılan 1. sezonu ekle
    if (seasonsToRender.length === 0) seasonsToRender = [1];

    seasonsToRender.forEach((sNum) => {
        const btn  = document.createElement('button');
        btn.className = 'season-tab';
        btn.textContent = 'Sezon ' + sNum;
        btn.onclick = () => {
            document.querySelectorAll('.season-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadEpisodes(id, slug, sNum, isMovie, title, synopsis, img);
        };
        tabsEl.appendChild(btn);
        if (!firstClicked) { btn.click(); firstClicked = true; }
    });

    // Jikan API'den ekstra bilgileri çek (Trailer ve Karakterler)
    const extraInfoDiv = document.createElement('div');
    extraInfoDiv.id = 'jikanExtraInfo';
    extraInfoDiv.style.marginTop = '2rem';
    mainContent.appendChild(extraInfoDiv);

    fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`)
    .then(r => r.json())
    .then(data => {
        if (data && data.data && data.data.length > 0) {
            const malAnime = data.data[0];
            const malId = malAnime.mal_id;
            
            // Fragman (Trailer) Butonu Ekle
            if (malAnime.trailer && malAnime.trailer.youtube_id) {
                const actionsDiv = document.querySelector('.detail-actions');
                if (actionsDiv) {
                    const trailerBtn = document.createElement('button');
                    trailerBtn.className = 'btn-secondary';
                    trailerBtn.innerHTML = '<i class="fa-brands fa-youtube" style="color:#ef4444"></i> Fragman İzle';
                    trailerBtn.onclick = () => openTrailerModal(malAnime.trailer.youtube_id);
                    actionsDiv.appendChild(trailerBtn);
                }
            }

            // Karakterleri Çek
            fetch(`https://api.jikan.moe/v4/anime/${malId}/characters`)
            .then(r => r.json())
            .then(charData => {
                if (charData && charData.data && charData.data.length > 0) {
                    const chars = charData.data.slice(0, 10); // İlk 10 karakter
                    let charHtml = '<h3 style="margin-bottom:1rem;"><i class="fa-solid fa-users"></i> Karakterler</h3><div class="cw-container">';
                    chars.forEach(c => {
                        const imgUrl = c.character.images?.jpg?.image_url || 'https://placehold.co/60x80/1a1a28/e8a020?text=?';
                        charHtml += `
                            <div style="flex-shrink:0; text-align:center; width:80px;">
                                <img src="${imgUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; border:2px solid var(--border); margin-bottom:0.5rem;" alt="${c.character.name}">
                                <div style="font-size:0.75rem; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.character.name}</div>
                                <div style="font-size:0.65rem; color:var(--text3);">${c.role}</div>
                            </div>
                        `;
                    });
                    charHtml += '</div>';
                    document.getElementById('jikanExtraInfo').innerHTML = charHtml;
                }
            }).catch(e => console.log('Karakterler çekilemedi', e));
        }
    }).catch(e => console.log('Jikan detay çekilemedi', e));
}

function updateDetailFavBtn(id) {
    const btn = document.getElementById('favBtnDetail');
    if (!btn) return;
    const isFav = getFavorites().some(a => String(a.id) === String(id));
    btn.innerHTML = isFav ? '<i class="fa-solid fa-heart"></i> Favoride' : '<i class="fa-regular fa-heart"></i> Favori';
}
function updateDetailWLBtn(id) {
    const btn = document.getElementById('wlBtnDetail');
    if (!btn) return;
    const isWL = getWatchlist().some(a => String(a.id) === String(id));
    btn.innerHTML = isWL ? '<i class="fa-solid fa-bookmark"></i> Listede' : '<i class="fa-regular fa-bookmark"></i> Listeye Ekle';
}

function filterEpisodeList(query) {
    const normalizedQuery = (query || '').trim().toLowerCase();
    const episodeButtons = Array.from(document.querySelectorAll('#episodesList .episode-btn'));
    const sidebarButtons = Array.from(document.querySelectorAll('#watchEpisodesList .sidebar-ep-btn'));
    [...episodeButtons, ...sidebarButtons].forEach(btn => {
        const text = (btn.textContent || '').toLowerCase();
        btn.style.display = !normalizedQuery || text.includes(normalizedQuery) ? '' : 'none';
    });
}

// ── Episodes ──────────────────────────────────────────────
async function loadEpisodes(id, slug, seasonId, isMovie, animeTitle, synopsis, imgUrl) {
    const epsContainer = document.getElementById('episodesList');
    if (!epsContainer) return;
    epsContainer.innerHTML = Array(6).fill('<div class="skeleton"></div>').join('');

    const idArg   = id   ? 'id='   + id + '&season_id=' + id  : '';
    const slugArg = slug ? 'slug=' + encodeURIComponent(slug) : '';
    const seasonArg = seasonId !== undefined && seasonId !== null ? 'season_num=' + encodeURIComponent(seasonId) : '';
    const qs = [idArg, slugArg, seasonArg, 'source=' + encodeURIComponent(currentSource)].filter(Boolean).join('&');

    const epsData = await fetchAPI('/episodes?' + qs);
    hideLoader();

    currentSelectedSound = ''; // Başka animeye geçildiğinde önceki anlık seçimi sıfırla

    if (!epsData || !Array.isArray(epsData) || !epsData.length) {
        epsContainer.innerHTML = '<p style="color:var(--text3);padding:1rem">Bölüm bulunamadı.</p>';
        return;
    }

    currentEpisodes = epsData;
    const watched   = getWatched();
    epsContainer.innerHTML = '';
    filterEpisodeList(document.getElementById('episodeFilterInput')?.value || '');

    // Play first episode button
    const playFirstBtn = document.getElementById('playBtn');
    if (playFirstBtn) {
        playFirstBtn.onclick = () => watchEpisode(id, slug, isMovie, epsData[0], parseInt(seasonId) || 0, 0, animeTitle, synopsis, imgUrl);
    }

    epsData.forEach((ep, idx) => {
        const label     = ep.Title || ('Bölüm ' + (ep.Number || (idx + 1)));
        const key       = (slug || id) + '_s' + seasonId + '_e' + idx;
        const isWatched = watched.includes(key);
        const sIdx      = parseInt(seasonId) || 0;

        const btn = document.createElement('div');
        btn.className = 'episode-btn' + (isWatched ? ' watched' : '');
        btn.innerHTML = `
            <div style="display:flex;align-items:center;gap:0.75rem;">
                <div style="flex-shrink:0;width:50px;height:50px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--text2);font-size:1.2rem;">
                    ${idx + 1}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;color:var(--text);margin-bottom:0.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${label}
                    </div>
                    <div style="font-size:0.8rem;color:var(--text3);">
                        ${isWatched ? '<i class="fa-solid fa-check" style="color:#10b981;"></i> İzlendi' : '<i class="fa-regular fa-circle"></i> İzlenmedi'}
                    </div>
                </div>
                <div style="flex-shrink:0;">
                    <i class="fa-solid fa-play" style="color:var(--accent);font-size:1.2rem;"></i>
                </div>
            </div>
        `;
        btn.onclick = () => {
            watchEpisode(id, slug, isMovie, ep, sIdx, idx, animeTitle, synopsis, imgUrl);
            markWatched(key);
            btn.classList.add('watched');
        };
        epsContainer.appendChild(btn);
    });
}

let currentSelectedSound = '';

function changeWatchSound(sound) {
    currentSelectedSound = sound;
    const ep = currentEpisodes[currentEIdx];
    if (!ep) { showToast('❌ Bölüm verisi bulunamadı.'); return; }
    watchEpisode(currentAnime.id, currentAnime.slug, currentAnime.isMovie, ep, currentSIdx, currentEIdx, currentAnime.title, currentAnime.synopsis, currentAnime.img);
}

// ── Watch ─────────────────────────────────────────────────
async function watchEpisode(id, slug, isMovie, ep, sIdx, eIdx, animeTitle, synopsis, imgUrl) {
    if (!ep) { showToast('❌ Bölüm bilgileri eksik, lütfen tekrar deneyin.'); return; }
    currentEpisode = ep;
    const label  = ep.Title || ('Bölüm ' + (ep.Number || (eIdx + 1)));
    const epKey  = (slug || id) + '_s' + sIdx + '_e' + eIdx;

    addToHistory({ id, slug, isMovie, title: animeTitle, img: imgUrl, synopsis, lastWatchedLabel: label, ep, sIdx, eIdx });
    markWatched(epKey);

    showWatchView();
    document.getElementById('watchTitle').textContent       = '▶ Yükleniyor...';
    document.getElementById('watchAnimeTitle').textContent  = animeTitle || '';
    document.getElementById('watchSource').textContent      = currentSource;
    document.getElementById('watchSynopsis').textContent    = synopsis   || 'Açıklama yok.';

    // Debug Overlay (Ekranda direkt görünür)
    let debugEl = document.getElementById('resumeDebugOverlay');
    if (!debugEl) {
        debugEl = document.createElement('div');
        debugEl.id = 'resumeDebugOverlay';
        debugEl.style = 'position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.8); color:lime; font-family:monospace; padding:5px; z-index:9999; font-size:12px; pointer-events:none; border-radius:4px;';
        document.querySelector('.player-container').appendChild(debugEl);
    }
    debugEl.innerHTML = `epKey: ${epKey}<br>getPosition(): ${getPosition(epKey)}`;

    // Set ambient background!
    if (imgUrl) {
        const ambientEl = document.getElementById('watchAmbient');
        if (ambientEl) {
            ambientEl.style.backgroundImage = `url('${imgUrl}')`;
        }
    }

    currentSIdx       = sIdx;
    currentEIdx       = eIdx;
    currentEpisodeKey = epKey;
    currentAnime      = { id, slug, isMovie, title: animeTitle, synopsis, img: imgUrl };
    profile.currentAnime = { ...currentAnime, episode: label };
    ls.set('anitr_profile', profile);
    updateProfileCurrentWatching();

    updateManualResumeArea(); // Call this here to show the area if there's a saved position!
    updateFavBtn();
    populateSidebarEpisodes(id, slug, isMovie, animeTitle, synopsis, imgUrl);

    const resumeTime = getPosition(epKey);
    console.log('[RESUME] epKey:', epKey, '| resumeTime:', resumeTime, '| tüm pozisyonlar:', getPositions());
    if (resumeTime > 10) {
        showToast('⏩ ' + Math.floor(resumeTime / 60) + ':' + String(Math.floor(resumeTime % 60)).padStart(2, '0') + ' kaldığı yerden devam ediliyor...', 3000);
    }

    const urlArg  = ep.ID   ? 'url='  + encodeURIComponent(ep.ID) : '';
    const idArg   = id      ? 'id='   + id   : '';
    const slugArg = slug    ? 'slug=' + encodeURIComponent(slug) : '';
    const soundArg = currentSelectedSound ? 'sound=' + encodeURIComponent(currentSelectedSound) : '';
    const qs = [urlArg, slugArg, idArg, soundArg, 'is_movie=' + isMovie, 'source=' + encodeURIComponent(currentSource), 'season_index=' + sIdx, 'episode_index=' + eIdx].filter(Boolean).join('&');

    const watchData = await fetchAPI('/watch?' + qs);
    if (!watchData || !Array.isArray(watchData) || !watchData.length) {
        showToast('❌ Video alınamadı. Başka kaynak deneyin.');
        document.getElementById('watchTitle').textContent = '❌ ' + label + ' (Hata)';
        return;
    }

    let watch = watchData[0];
    if (appSettings.audio === 'dub' && !currentSelectedSound) {
        const dubSrc = watchData.find(w => w.TRCaption == null && w.Urls && w.Urls.length > 0 && w.Urls[0].includes('dub'));
        if (dubSrc) watch = dubSrc;
    }

    document.getElementById('watchTitle').textContent = label;
    openPlayer(watch, resumeTime);
}

// ── Sidebar Episodes ──────────────────────────────────────
function populateSidebarEpisodes(id, slug, isMovie, animeTitle, synopsis, imgUrl) {
    const sidebar = document.getElementById('watchEpisodesList');
    if (!sidebar) return;
    sidebar.innerHTML = '';
    const watched = getWatched();

    currentEpisodes.forEach((ep, idx) => {
        const label     = ep.Title || ('Bölüm ' + (ep.Number || (idx + 1)));
        const key       = (slug || id) + '_s' + currentSIdx + '_e' + idx;
        const isWatched = watched.includes(key);

        // Generate thumbnail (use anime img as fallback, or per-episode if available)
        const thumbnailUrl = imgUrl;

        const btn = document.createElement('div');
        btn.className = 'sidebar-ep-btn' + (isWatched ? ' watched' : '') + (idx === currentEIdx ? ' active' : '');
        btn.innerHTML = `
            <img class="ep-thumb" src="${thumbnailUrl}" alt="${label}" loading="lazy" onerror="this.style.background='var(--surface2)'">
            <div class="ep-info">
                <div class="ep-num">${idx + 1}</div>
                <div class="ep-title">${label}</div>
            </div>
        `;
        btn.onclick = () => watchEpisode(id, slug, isMovie, ep, currentSIdx, idx, animeTitle, synopsis, imgUrl);
        sidebar.appendChild(btn);

        if (idx === currentEIdx) {
            setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
        }
    });
}

function playNextEpisode() {
    try {
        console.log('=== playNextEpisode CALLED! ===');
        console.trace('Stack trace of playNextEpisode:');
        if (currentEIdx + 1 < currentEpisodes.length) {
            showToast('▶ Sıradaki bölüme geçiliyor...', 2000);
            setTimeout(() => {
                const nextEp = currentEpisodes[currentEIdx + 1];
                watchEpisode(currentAnime.id, currentAnime.slug, currentAnime.isMovie, nextEp, currentSIdx, currentEIdx + 1, currentAnime.title, currentAnime.synopsis, currentAnime.img);
            }, 2000);
        } else {
            showToast('✅ Bu sezonun son bölümüydü.');
        }
    } catch (e) {
        console.error('Error in playNextEpisode:', e);
    }
}

// ── Player ────────────────────────────────────────────────
function getManualPositionKey() {
    console.log('getManualPositionKey called with:');
    console.log('currentSourceKey:', currentSourceKey);
    console.log('currentEpisodeKey:', currentEpisodeKey);
    const key = `anitr_manual_pos_${currentSourceKey}_${currentEpisodeKey}`;
    console.log('Generated key:', key);
    return key;
}
function saveManualPosition() {
    try {
        console.log('=== saveManualPosition START ===');
        let currentTime = 0;
        // First try plyr's current time
        if (plyr && typeof plyr.currentTime === 'number') {
            currentTime = plyr.currentTime;
        }
        // Fallback to animePlayer
        else if (typeof animePlayer !== 'undefined' && animePlayer && typeof animePlayer.currentTime === 'number') {
            currentTime = animePlayer.currentTime;
        }
        console.log('currentTime:', currentTime);
        const t = Math.floor(currentTime);
        if (t <= 0) {
            showToast('❌ Lütfen önce videoyu oynatın ve bir konuma gelin');
            return;
        }
        const key = getManualPositionKey();
        console.log('saving to key:', key, 'value:', t);
        localStorage.setItem(key, t.toString());
        showToast(`✅ Konum kaydedildi: ${formatTime(t)}`);
        updateManualResumeArea();
        console.log('=== saveManualPosition END ===');
    } catch (e) {
        console.error('Error saving position:', e);
        showToast('❌ Konum kaydedilirken hata oluştu');
    }
}
function clearManualPosition() {
    try {
        console.log('clearManualPosition called!');
        localStorage.removeItem(getManualPositionKey());
        document.getElementById('manualResumeArea').classList.add('hidden');
        showToast("Kaydedilmiş konum kaldırıldı");
    } catch (e) {
        console.error('Error clearing manual position:', e);
        showToast('❌ Kaydedilmiş konum kaldırılırken hata oluştu');
    }
}
function resumeFromManualPosition() {
    try {
        console.log('=== resumeFromManualPosition START ===');
        const pos = getManualPosition();
        console.log('Saved position:', pos);
        if (!pos || pos <= 0) {
            showToast('❌ Kaydedilmiş konum yok');
            return;
        }
        if (!plyr) {
            showToast('❌ Oynatıcı henüz başlamadı');
            return;
        }
        // Block ended event temporarily
        disableEndedEvent = true;
        showToast(`⏩ ${formatTime(pos)} konumuna atlanıyor...`);
        // Plyr's seek() method handles waiting for video to load
        plyr.seek(pos);
        // Re-enable ended event after 1 second
        setTimeout(() => {
            disableEndedEvent = false;
        }, 1000);
        console.log('=== resumeFromManualPosition END ===');
    } catch (e) {
        console.error('Error in resumeFromManualPosition:', e);
        showToast('❌ Konumdan devam edilirken hata oluştu');
        disableEndedEvent = false;
    }
}
function updateManualResumeArea() {
    try {
        console.log('updateManualResumeArea called! currentSourceKey:', currentSourceKey, 'currentEpisodeKey:', currentEpisodeKey);
        const pos = getManualPosition();
        console.log('pos from storage:', pos);
        const area = document.getElementById('manualResumeArea');
        const text = document.getElementById('manualResumeText');
        if (pos && pos > 0) {
            text.textContent = `Kaydedilmiş konum: ${formatTime(pos)}`;
            area.classList.remove('hidden');
            console.log('showing manual resume area');
        } else {
            area.classList.add('hidden');
            console.log('hiding manual resume area');
        }
    } catch (e) {
        console.error('Error updating manual resume area:', e);
    }
}
function getManualPosition() {
    const key = getManualPositionKey();
    const val = localStorage.getItem(key);
    if (val) return parseInt(val, 10);
    return null;
}
function formatTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}
function openPlayer(watch, resumeAt) {
    resumeAt = resumeAt || 0;
    const urls      = watch.Urls      || [];
    const labels    = watch.Labels    || [];
    const trCaption = watch.TRCaption || null;
    const subtitles = watch.Subtitles || [];
    const opening   = watch.Opening   || null;
    const ending    = watch.Ending    || null;

    if (plyr) { try { plyr.destroy(); } catch (e) {} plyr = null; }
    if (hls)  { hls.destroy(); hls = null; }

    const container = document.querySelector('.video-container-page');
    container.innerHTML = '<video id="animePlayer" class="plyr" controls playsinline crossorigin="anonymous"></video><div id="subtitleSettingsPanel" class="subtitle-settings-panel hidden"></div>';
    // Assign to global animePlayer variable!
    animePlayer = document.getElementById('animePlayer');

    // Altyazı Ayarlarını Kaydet
    function saveSubtitleSettings(settings) {
        localStorage.setItem('anitr_subtitle_settings', JSON.stringify(settings));
        applySubtitleSettings(settings);
    }
    // Altyazı Ayarları Panelini Oluştur
    function setupSubtitleSettings() {
        const panel = document.getElementById('subtitleSettingsPanel');
        const settings = getSubtitleSettings();
        panel.innerHTML = `
            <div class="subtitle-settings-header">
                <h3><i class="fa-solid fa-closed-captioning"></i> Altyazı Ayarları</h3>
                <button onclick="toggleSubtitleSettings()" class="close-subtitle-settings">&times;</button>
            </div>
            <div class="subtitle-setting-item">
                <label>Yazı Boyutu: <span id="fontSizeValue">${settings.fontSize}px</span></label>
                <input type="range" id="subtitleFontSize" min="10" max="40" value="${settings.fontSize}" 
                    oninput="updateSubtitleSetting('fontSize', this.value)">
            </div>
            <div class="subtitle-setting-item">
                <label>Yazı Rengi:</label>
                <input type="color" id="subtitleTextColor" value="${settings.textColor}" 
                    oninput="updateSubtitleSetting('textColor', this.value)">
            </div>
            <div class="subtitle-setting-item">
                <label>Arka Plan Rengi:</label>
                <input type="color" id="subtitleBackgroundColor" value="${settings.backgroundColor}" 
                    oninput="updateSubtitleSetting('backgroundColor', this.value)">
            </div>
            <div class="subtitle-setting-item">
                <label>Arka Plan Şeffaflığı: <span id="bgOpacityValue">${Math.round(settings.backgroundOpacity * 100)}%</span></label>
                <input type="range" id="subtitleBgOpacity" min="0" max="100" value="${Math.round(settings.backgroundOpacity * 100)}" 
                    oninput="updateSubtitleSetting('backgroundOpacity', this.value / 100)">
            </div>
            <div class="subtitle-setting-item">
                <label>Yazı Tipi:</label>
                <select id="subtitleFontFamily" onchange="updateSubtitleSetting('fontFamily', this.value)">
                    <option value="Inter, sans-serif" ${settings.fontFamily.includes('Inter') ? 'selected' : ''}>Inter</option>
                    <option value="Arial, sans-serif" ${settings.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
                    <option value="Verdana, sans-serif" ${settings.fontFamily.includes('Verdana') ? 'selected' : ''}>Verdana</option>
                    <option value="Georgia, serif" ${settings.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
                    <option value="Times New Roman, serif" ${settings.fontFamily.includes('Times') ? 'selected' : ''}>Times New Roman</option>
                    <option value="Courier New, monospace" ${settings.fontFamily.includes('Courier') ? 'selected' : ''}>Courier New</option>
                </select>
            </div>
            <div class="subtitle-setting-item">
                <label>Altyazı Konumu:</label>
                <select id="subtitlePosition" onchange="updateSubtitleSetting('position', this.value)">
                    <option value="bottom" ${settings.position === 'bottom' ? 'selected' : ''}>Alt</option>
                    <option value="bottom-center" ${settings.position === 'bottom-center' ? 'selected' : ''}>Alt-Orta</option>
                    <option value="top" ${settings.position === 'top' ? 'selected' : ''}>Üst</option>
                </select>
            </div>
        `;
        
        // Ayar panelini açıp kapatacak buton ekle (plyr kontrollerine ekle)
        const settingsBtn = document.querySelector('.plyr__control--settings');
        if (settingsBtn) {
            const customBtn = document.createElement('button');
            customBtn.className = 'plyr__control';
            customBtn.innerHTML = '<i class="fa-solid fa-text-height"></i>';
            customBtn.setAttribute('aria-label', 'Altyazı Ayarları');
            customBtn.onclick = toggleSubtitleSettings;
            settingsBtn.parentNode.insertBefore(customBtn, settingsBtn.nextSibling);
        }
        applySubtitleSettings(settings);
    }
    function toggleSubtitleSettings() {
        const panel = document.getElementById('subtitleSettingsPanel');
        panel.classList.toggle('hidden');
    }
    window.toggleSubtitleSettings = toggleSubtitleSettings;
    function updateSubtitleSetting(key, value) {
        const settings = getSubtitleSettings();
        if (key === 'fontSize') {
            settings.fontSize = parseInt(value);
            const fontSizeEl = document.getElementById('fontSizeValue');
            if (fontSizeEl) fontSizeEl.textContent = value + 'px';
        } else if (key === 'backgroundOpacity') {
            settings.backgroundOpacity = parseFloat(value);
            const bgOpacityEl = document.getElementById('bgOpacityValue');
            if (bgOpacityEl) bgOpacityEl.textContent = Math.round(parseFloat(value) * 100) + '%';
        } else if (key === 'fontFamily') {
            settings.fontFamily = value;
        } else if (key === 'textColor') {
            settings.textColor = value;
        } else if (key === 'backgroundColor') {
            settings.backgroundColor = value;
        } else if (key === 'position') {
            settings.position = value;
        }
        saveSubtitleSettings(settings);
    }
    window.updateSubtitleSetting = updateSubtitleSetting;

    // Altyazıları topla ve ekle
    const tracks = [];
    if (subtitles && subtitles.length > 0) {
        subtitles.forEach(sub => {
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = sub.Label || sub.Group.toUpperCase();
            track.srclang = sub.Group;
            track.src = '/api/proxy?url=' + encodeURIComponent(sub.Link);
            if (sub.Group === 'tr') track.default = true;
            animePlayer.appendChild(track);
            tracks.push({ kind: 'captions', label: track.label, srclang: track.srclang, src: track.src, default: track.default });
        });
    } else if (trCaption) {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = 'Türkçe';
        track.srclang = 'tr';
        track.src = '/api/proxy?url=' + encodeURIComponent(trCaption);
        track.default = true;
        animePlayer.appendChild(track);
        tracks.push({ kind: 'captions', label: 'Türkçe', srclang: 'tr', src: track.src, default: true });
    }

    if (!urls.length) { showToast('❌ Oynatılabilir video bulunamadı.'); return; }

    const videoUrl = urls[0];
    const isM3u8   = videoUrl.includes('.m3u8');

    // ══ RESUME PLAYBACK: Hassas Zaman Takibi ══
    let _lastSavedSec = -1;
    function startSaving() {
        // timeupdate: her saniyede bir hassas zaman kaydet
        animePlayer.addEventListener('timeupdate', () => {
            const t = animePlayer.currentTime;
            const tFloor = Math.floor(t);
            // İlk 5 saniyeyi kaydetme
            if (t <= 5) return;
            // Her 2 saniyede bir kaydet (gereksiz yazımı önle)
            if (tFloor % 2 === 0 && tFloor !== _lastSavedSec) {
                _lastSavedSec = tFloor;
                // Milisaniye hassasiyetiyle kaydet
                savePosition(currentEpisodeKey, t);
                
                // Debug UI Güncelle
                const dEl = document.getElementById('resumeDebugOverlay');
                if (dEl) {
                    dEl.innerHTML = `epKey: ${currentEpisodeKey}<br>Saved: ${t.toFixed(2)}s<br>Pos in LS: ${localStorage.getItem('anitr_ts_'+currentEpisodeKey)}`;
                }

                // %95+ izlenmişse tamamlandı say ve pozisyonu sil
                const dur = animePlayer.duration;
                if (dur && dur > 0 && t / dur >= 0.95) {
                    clearPosition(currentEpisodeKey);
                    markWatched(currentEpisodeKey);
                }
            }
        });
    }
    startSaving();
    // beforeunload yedeği (üstteki global listener'a ek olarak)
    window.onbeforeunload = () => {
        if (animePlayer && animePlayer.currentTime > 5) {
            savePosition(currentEpisodeKey, animePlayer.currentTime);
        }
    };

    const plyrOpts = {
        controls: ['play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'volume', 'captions', 'settings', 'pip', 'fullscreen'],
        settings: ['captions', 'quality', 'speed'],
        speed:    { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        captions: { active: true, language: 'tr', update: true },
        i18n: { play:'Oynat', pause:'Duraklat', mute:'Sesi Kapat', speed:'Hız', quality:'Kalite', settings:'Ayarlar', fullscreen:'Tam Ekran', captions:'Altyazılar', disabled:'Kapalı', enabled:'Açık' }
    };

    // Intro/Outro Atlatma Butonları ve Mantığı
    function setupSkipButtons() {
        const skipContainer = document.createElement('div');
        skipContainer.className = 'player-skip-controls';
        container.appendChild(skipContainer);

        const updateSkips = () => {
            const curr = animePlayer.currentTime;
            skipContainer.innerHTML = '';
            
            if (opening) {
                const start = timeToSec(opening.Start);
                const end = timeToSec(opening.End);
                if (curr >= start && curr <= end) {
                    const btn = document.createElement('button');
                    btn.className = 'skip-btn';
                    btn.innerHTML = '<i class="fa-solid fa-forward"></i> Açılışı Atla';
                    btn.onclick = () => { animePlayer.currentTime = end; showToast('⏭ Açılış atlatıldı'); };
                    skipContainer.appendChild(btn);
                }
            }
            if (ending) {
                const start = timeToSec(ending.Start);
                const end = timeToSec(ending.End);
                if (curr >= start && curr <= end) {
                    const btn = document.createElement('button');
                    btn.className = 'skip-btn';
                    btn.innerHTML = '<i class="fa-solid fa-forward"></i> Kapanışı Atla';
                    btn.onclick = () => { animePlayer.currentTime = end; showToast('⏭ Kapanış atlatıldı'); };
                    skipContainer.appendChild(btn);
                }
            }
        };
        animePlayer.addEventListener('timeupdate', updateSkips);
    }

    function timeToSec(t) {
        if (!t || typeof t !== 'string') return 0;
        const parts = t.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    }

    // Kalite etiketini okunabilir hale getir (4K, 1080p vb.)
    function qualityLabel(h) {
        if (h >= 2160) return '4K (2160p)';
        if (h >= 1440) return '1440p (2K)';
        if (h >= 1080) return '1080p';
        if (h >= 720)  return '720p';
        if (h >= 480)  return '480p';
        if (h >= 360)  return '360p';
        return h + 'p';
    }

    if (Hls.isSupported() && isM3u8) {
        hls = new Hls({ 
            maxMaxBufferLength: 120, 
            enableWorker: true,
            startPosition: resumeAt > 10 ? resumeAt : -1 
        });
        hls.loadSource(videoUrl);
        hls.attachMedia(animePlayer);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            // Backend'den birden fazla URL (farklı manifest) geldiyse
            if (urls.length > 1 && labels.length === urls.length) {
                // labels'ı p cinsinden sayıya çevir (4K desteği ile)
                const qualityNums = labels.map(l => {
                    if (/4k/i.test(l)) return 2160;
                    if (/2k/i.test(l) || /1440/i.test(l)) return 1440;
                    const m = l.match(/(\d+)/);
                    return m ? parseInt(m[1]) : 720;
                });
                
                // 1080'in aslında 4K olması durumu: Menüde 1080'in üstüne 4K ekle
                if (qualityNums[0] === 1080 && !qualityNums.includes(2160)) {
                    qualityNums.unshift(2160);
                    urls.unshift(urls[0]); // 4K seçildiğinde aynı (aslında 4K olan 1080p) kaynağı yükle
                }

                const best = Math.max(...qualityNums);
                plyrOpts.quality = {
                    default: best,
                    options: qualityNums,
                    forced: true,
                    onChange: (q) => {
                        const idx = qualityNums.indexOf(q);
                        if (idx !== -1) {
                            const pos = animePlayer.currentTime;
                            hls.loadSource(urls[idx]);
                            animePlayer.addEventListener('loadedmetadata', () => { animePlayer.currentTime = pos; animePlayer.play(); }, { once: true });
                        }
                    }
                };
                plyrOpts.i18n = Object.assign(plyrOpts.i18n || {}, {
                    qualityLabel: (q) => qualityLabel(q)
                });
            } else {
                // Tek manifest - HLS level'larından kalite al
                const hlsQualities = hls.levels
                    .map(l => l.height)
                    .filter((v, i, a) => a.indexOf(v) === i && v > 0)
                    .sort((a, b) => b - a);

                // 1080'in aslında 4K olması durumu
                if (hlsQualities.includes(1080) && !hlsQualities.includes(2160)) {
                    hlsQualities.unshift(2160);
                }

                plyrOpts.quality = {
                    default:  hlsQualities[0] || 1080,
                    options:  hlsQualities.length ? hlsQualities : [2160, 1080, 720, 480, 360],
                    forced:   true,
                    onChange: q => {
                        // Eğer 4K seçildiyse ve gerçekte level olarak yoksa 1080'i oynat (çünkü 1080 = 4K)
                        const targetQ = (q === 2160 && !hls.levels.some(l => l.height === 2160)) ? 1080 : q;
                        hls.levels.forEach((lvl, li) => { if (lvl.height === targetQ) hls.currentLevel = li; });
                    }
                };
                plyrOpts.i18n = Object.assign(plyrOpts.i18n || {}, {
                    qualityLabel: (q) => qualityLabel(q)
                });
            }

            plyr = new Plyr(animePlayer, plyrOpts);
            finishSetup();
        });
    } else {
        // MP4 veya HLS desteklenmeyen durum
        if (urls.length > 1 && labels.length === urls.length) {
            let sources = urls.map((u, i) => {
                const sizeMatch = labels[i].match(/\d+/);
                return { src: u, type: isM3u8 ? 'application/x-mpegURL' : 'video/mp4', size: sizeMatch ? parseInt(sizeMatch[0]) : (1080 - i) };
            });

            // 1080 varsa üstüne 4K seçeneğini de ekle (1080 aslında 4K olduğu için aynı URL'yi kullanır)
            if (sources.some(s => s.size === 1080) && !sources.some(s => s.size === 2160)) {
                const source1080 = sources.find(s => s.size === 1080);
                sources.unshift({ ...source1080, size: 2160 });
            }

            sources = sources.sort((a, b) => b.size - a.size);

            plyr = new Plyr(animePlayer, plyrOpts);
            plyr.source = { type: 'video', title: 'Anime', sources: sources, tracks: tracks };
        } else {
            animePlayer.src = videoUrl;
            plyr = new Plyr(animePlayer, plyrOpts);
        }
        finishSetup();
    }

    function finishSetup() {
        updateManualResumeArea();
        console.log('finishSetup called!');
        
        plyr.on('ready', () => {
            console.log('Plyr is ready!');
            if (animePlayer.textTracks) {
                for (let i = 0; i < animePlayer.textTracks.length; i++) {
                    const tt = animePlayer.textTracks[i];
                    if (tt.language !== 'tr') tt.mode = 'hidden';
                }
            }
            
            // Add listener for settings button
            addCustomSettingsToPlyr();
            
            // Setup mutation observer to watch for settings menu!
            setupMutationObserver();
            
            setupSkipButtons();
            setupSubtitleSettings();
        });

        console.log('[RESUME] finishSetup içinde resumeAt:', resumeAt);
        
        // resumeAt > 10 ise video yüklendiğinde o saniyeye atla
        let _resumeApplied = false;
        const applyResume = () => {
            const dEl = document.getElementById('resumeDebugOverlay');
            if (dEl) dEl.innerHTML += `<br>applyResume(${resumeAt.toFixed(2)})`;

            if (resumeAt <= 10 || _resumeApplied) return;
            console.log('[RESUME] applyResume çağrıldı, resumeAt:', resumeAt, 'readyState:', animePlayer.readyState, 'duration:', animePlayer.duration);
            
            const doSeek = () => {
                try {
                    animePlayer.currentTime = resumeAt;
                    if (plyr && typeof plyr.currentTime === 'number') plyr.currentTime = resumeAt;
                    console.log('[RESUME] Seek yapıldı → currentTime:', animePlayer.currentTime);
                    // Seek başarılıysa bitir
                    if (Math.abs(animePlayer.currentTime - resumeAt) < 3) {
                        _resumeApplied = true;
                    }
                } catch(e) { console.warn('[RESUME] Seek hatası:', e); }
            };
            
            // Hemen dene
            doSeek();
            
            // Tekrar dene (HLS buffer yüklenmesini bekle)
            let attempts = 0;
            const seekInterval = setInterval(() => {
                attempts++;
                if (_resumeApplied || attempts > 30) {
                    clearInterval(seekInterval);
                    return;
                }
                doSeek();
            }, 300);
        };

        // Tüm olası yükleme eventlerine dinle
        animePlayer.addEventListener('loadedmetadata', applyResume, { once: true });
        animePlayer.addEventListener('canplay', applyResume, { once: true });
        animePlayer.addEventListener('loadeddata', applyResume, { once: true });
        if (plyr) {
            plyr.once('ready', applyResume);
            plyr.once('playing', applyResume);
        }
        // Eğer video zaten yüklü ise hemen dene
        if (animePlayer.readyState >= 2) applyResume();

        plyr.on('ended', () => {
            if (disableEndedEvent) {
                console.log('disableEndedEvent is true → skipping playNextEpisode!');
                return;
            }
            // Bölüm bitti: pozisyonu sıfırla (bir daha açılınca baştan başlasın)
            clearPosition(currentEpisodeKey);
            markWatched(currentEpisodeKey);
            if (appSettings.autoNext) playNextEpisode();
        });
        const keyboardHandler = (event) => {
            if (watchView.classList.contains('hidden')) return;
            const activeTag = document.activeElement && document.activeElement.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
            if (event.code === 'Space') {
                event.preventDefault();
                if (plyr.playing) plyr.pause(); else plyr.play();
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                animePlayer.currentTime = Math.max(0, animePlayer.currentTime - 10);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                animePlayer.currentTime = Math.min(animePlayer.duration || Infinity, animePlayer.currentTime + 10);
            } else if (event.key.toLowerCase() === 'f') {
                event.preventDefault();
                if (plyr.fullscreen) plyr.fullscreen.toggle();
            }
        };
        document.removeEventListener('keydown', window._anitrPlayerKeyboardHandler);
        window._anitrPlayerKeyboardHandler = keyboardHandler;
        document.addEventListener('keydown', keyboardHandler);
        startSaving();
        setupSkipButtons();
        animePlayer.play().catch(() => {});
    }

    function addCustomSettingsToPlyr() {
        console.log('addCustomSettingsToPlyr called');
        // Listen for settings button clicks
        const settingsBtn = document.querySelector('.plyr__control--settings');
        if (settingsBtn) {
            console.log('Settings button found, adding listener');
            settingsBtn.addEventListener('click', function() {
                console.log('Settings button clicked (from addCustomSettingsToPlyr)');
                setTimeout(injectCustomSettings, 50); 
                setTimeout(injectCustomSettings, 200); 
                setTimeout(injectCustomSettings, 400); // extra delay just in case!
            });
        }
    }

    function setupMutationObserver() {
        console.log('Setting up mutation observer');
        const observer = new MutationObserver((mutations) => {
            for (let mutation of mutations) {
                if (mutation.addedNodes) {
                    for (let node of mutation.addedNodes) {
                        if (node.classList && node.classList.contains('plyr__settings')) {
                            console.log('Settings menu added via mutation observer!');
                            injectCustomSettings();
                        }
                        if (node.querySelectorAll) {
                            const settingsMenus = node.querySelectorAll('.plyr__settings');
                            if (settingsMenus.length > 0) {
                                console.log('Found settings menu via query selector in mutation');
                                injectCustomSettings();
                            }
                        }
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function injectCustomSettings() {
        console.log('injectCustomSettings called');
        const settingsMenu = document.querySelector('.plyr__settings');
        if (!settingsMenu) {
            console.error('Settings menu not found!');
            return;
        }
        console.log('Settings menu found!');
        
        // Remove existing custom sections to prevent duplicates
        const existingCustomSections = settingsMenu.querySelectorAll('[data-custom-subtitle-setting]');
        console.log('Found existing custom sections:', existingCustomSections.length);
        existingCustomSections.forEach(el => el.remove());
        
        // Add custom sections
        const settings = getSubtitleSettings();
        console.log('Loaded settings:', settings);
        
        // Add Font Size
        const fontSizeHTML = `
            <div class="plyr__menu__section" data-custom-subtitle-setting>
                <div class="plyr__menu__item">
                    <span>Altyazı Boyutu</span>
                    <span>${settings.fontSize}px</span>
                </div>
                <div class="plyr__menu__item" style="padding: 0 1em 1em;">
                    <input type="range" id="customSubtitleFontSize" min="10" max="40" value="${settings.fontSize}" style="width:100%">
                </div>
            </div>
        `;
        
        // Add Background Opacity
        const bgOpacityHTML = `
            <div class="plyr__menu__section" data-custom-subtitle-setting>
                <div class="plyr__menu__item">
                    <span>Arka Plan Şeffaflığı</span>
                    <span>${Math.round(settings.backgroundOpacity * 100)}%</span>
                </div>
                <div class="plyr__menu__item" style="padding:0 1em 1em;">
                    <input type="range" id="customSubtitleBgOpacity" min="0" max="100" value="${Math.round(settings.backgroundOpacity * 100)}" style="width:100%">
                </div>
            </div>
        `;
        
        // Add Font Family
        const fontFamilyHTML = `
            <div class="plyr__menu__section" data-custom-subtitle-setting>
                <div class="plyr__menu__item">
                    <span>Yazı Tipi</span>
                    <span id="customSubtitleFontLabel">${settings.fontFamily.split(',')[0]}</span>
                </div>
                <div class="plyr__menu__item" style="padding: 0 1em 1em;">
                    <select id="customSubtitleFontFamily" style="width:100%; padding:0.5em;">
                        <option value="Arial, sans-serif" ${settings.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
                        <option value="Verdana, sans-serif" ${settings.fontFamily.includes('Verdana') ? 'selected' : ''}>Verdana</option>
                        <option value="Georgia, serif" ${settings.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
                        <option value="Times New Roman, serif" ${settings.fontFamily.includes('Times') ? 'selected' : ''}>Times New Roman</option>
                        <option value="Courier New, monospace" ${settings.fontFamily.includes('Courier') ? 'selected' : ''}>Courier New</option>
                    </select>
                </div>
            </div>
        `;
        
        // Add Text Color
        const textColorHTML = `
            <div class="plyr__menu__section" data-custom-subtitle-setting>
                <div class="plyr__menu__item">
                    <span>Yazı Rengi</span>
                    <input type="color" id="customSubtitleTextColor" value="${settings.textColor}" style="width:30px; height:25px; border:none;">
                </div>
            </div>
        `;
        
        // Insert before the last section
        const sections = settingsMenu.querySelectorAll('.plyr__menu__section');
        console.log('Total menu sections:', sections.length);
        if (sections.length > 0) {
            const lastSection = sections[sections.length - 1];
            lastSection.insertAdjacentHTML('beforebegin', fontSizeHTML + bgOpacityHTML + fontFamilyHTML + textColorHTML);
            console.log('Injected custom settings!');
        } else {
            settingsMenu.innerHTML += fontSizeHTML + bgOpacityHTML + fontFamilyHTML + textColorHTML;
            console.log('Appended custom settings to empty menu!');
        }
        
        // Add event listeners
        const sizeInput = document.getElementById('customSubtitleFontSize');
        if (sizeInput) {
            console.log('Adding size input listener');
            sizeInput.addEventListener('input', function() {
                const settings = getSubtitleSettings();
                settings.fontSize = parseInt(this.value);
                saveSubtitleSettings(settings);
                this.closest('.plyr__menu__section')
                    .querySelector('div:first-of-type span:last-child')
                    .textContent = this.value + 'px';
            });
        }
        
        const bgInput = document.getElementById('customSubtitleBgOpacity');
        if (bgInput) {
            console.log('Adding bg opacity input listener');
            bgInput.addEventListener('input', function() {
                const settings = getSubtitleSettings();
                settings.backgroundOpacity = parseInt(this.value) / 100;
                saveSubtitleSettings(settings);
                this.closest('.plyr__menu__section')
                    .querySelector('div:first-of-type span:last-child')
                    .textContent = this.value + '%';
            });
        }
        
        const fontSelect = document.getElementById('customSubtitleFontFamily');
        if (fontSelect) {
            console.log('Adding font select listener');
            fontSelect.addEventListener('change', function() {
                const settings = getSubtitleSettings();
                settings.fontFamily = this.value;
                saveSubtitleSettings(settings);
                const label = document.getElementById('customSubtitleFontLabel');
                if (label) label.textContent = this.value.split(',')[0];
            });
        }
        
        const colorInput = document.getElementById('customSubtitleTextColor');
        if (colorInput) {
            console.log('Adding color input listener');
            colorInput.addEventListener('input', function() {
                const settings = getSubtitleSettings();
                settings.textColor = this.value;
                saveSubtitleSettings(settings);
            });
        }
    }
}

// ══════════════════════════════════════════════════════════
// MYANIMELIST ENTEGRASYONU (Jikan Public List)
// ══════════════════════════════════════════════════════════

async function saveMALUsername() {
    const username = document.getElementById('malUsernameInput').value.trim();
    if (!username) return;
    
    // API Call to verify user
    try {
        showToast("MAL kullanıcısı doğrulanıyor...");
        const res = await fetch(`https://api.jikan.moe/v4/users/${encodeURIComponent(username)}`);
        if (!res.ok) {
            showToast(`MAL kullanıcısı bulunamadı: ${username}`);
            return;
        }
    } catch (e) {
        showToast("MAL doğrulama hatası!");
        return;
    }
    
    localStorage.setItem('anitr_mal_username', username);
    showToast("MAL Kullanıcı Adı Kaydedildi ✅");
    malUser = username;
    checkMALStatus();
}

function checkMALStatus() {
    const savedUser = localStorage.getItem('anitr_mal_username');
    const noUserDiv = document.getElementById('malNoUser');
    const tabsDiv   = document.getElementById('malTabs');

    if (savedUser) {
        malUser = savedUser;
        if (document.getElementById('malUsernameInput')) {
            document.getElementById('malUsernameInput').value = malUser;
        }
        const statusDiv = document.getElementById('malAuthStatus');
        if (statusDiv) statusDiv.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Bağlı Hesap: <b>${malUser}</b>`;
        const contentDiv = document.getElementById('malContent');
        if (contentDiv) contentDiv.classList.remove('hidden');
        if (noUserDiv) noUserDiv.style.display = 'none';
        if (tabsDiv)   tabsDiv.style.display = 'flex';
    } else {
        malUser = "";
        const statusDiv = document.getElementById('malAuthStatus');
        if (statusDiv) statusDiv.innerHTML = `<span style="color:var(--text3);">Hesap Bağlı Değil</span>`;
        const contentDiv = document.getElementById('malContent');
        if (contentDiv) contentDiv.classList.add('hidden');
        if (noUserDiv) noUserDiv.style.display = 'block';
        if (tabsDiv)   tabsDiv.style.display = 'none';
    }
}

let currentMALTab = 'watching';

function switchMALTab(status) {
    currentMALTab = status;
    // Sekme görünümü güncelle
    document.querySelectorAll('.mal-tab-btn').forEach(b => {
        b.classList.remove('btn-primary', 'active');
        b.classList.add('btn-secondary');
    });
    const activeBtn = document.getElementById('tab' + status.charAt(0).toUpperCase() + status.slice(1));
    if (activeBtn) {
        activeBtn.classList.remove('btn-secondary');
        activeBtn.classList.add('btn-primary', 'active');
    }
    loadMALList(status);
}

async function loadMALList(status = currentMALTab) {
    console.log('loadMALList called with status:', status, 'malUser:', malUser);
    if (!malUser) {
        console.log('No malUser, returning');
        return;
    }
    const grid = document.getElementById('malListGrid');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 3rem;"><div class="spinner" style="display:inline-block"></div><p style="margin-top:1rem; color:var(--text3);">Liste yükleniyor...</p></div>';
    
    try {
        const url = `${API_BASE}/mal/watchlist?username=${encodeURIComponent(malUser)}&status=${status}`;
        console.log('Fetching from:', url);
        const res = await fetch(url);
        console.log('Response status:', res.status, 'ok:', res.ok);
        
        if (!res.ok) {
            const errData = await res.json().catch(() => null);
            console.error('Error data:', errData);
            throw new Error(errData?.error || "Liste yüklenemedi (HTTP " + res.status + ")");
        }
        const data = await res.json();
        console.log('Received data:', data, 'length:', data.length);
        
        if (!data || data.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; color:var(--text3); text-align:center; padding:2rem;">Bu listede anime bulunamadı.</p>';
            return;
        }
        
        let html = '';
        data.forEach(item => {
            console.log('Processing item:', item);
            const img = (item.images?.jpg?.large_image_url || item.images?.jpg?.image_url) || '';
            const score = item.score ? item.score.toFixed(1) : '-';
            const safeTitle = (item.title || '').replace(/'/g, "\\'");
            html += `
            <div class="anime-card" onclick="searchMALAnime('${safeTitle}')">
                <div class="card-poster-wrap">
                    <img src="${img}" alt="${item.title || ''}" class="card-poster" loading="lazy" onerror="this.src='https://placehold.co/200x280/1a1a28/e8a020?text=?'">
                    <div class="card-badge"><i class="fa-solid fa-star"></i> ${score}</div>
                    <div class="card-hover-overlay">
                        <button class="quick-play-btn"><i class="fa-solid fa-search"></i></button>
                    </div>
                </div>
                <div class="card-info">
                    <div class="card-title">${item.title || ''}</div>
                </div>
            </div>`;
        });
        console.log('Generated HTML:', html);
        grid.innerHTML = html;
        
    } catch(err) {
        console.error('Error in loadMALList:', err);
        grid.innerHTML = `<p style="grid-column: 1/-1; color:#ef4444; text-align:center; padding:2rem;">${err.message}</p>`;
    }
}

// MAL'deki animeyi sistemde ara
function searchMALAnime(title) {
    searchInput.value = title;
    searchBtn.click();
    showHomeView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── WATCH2GETHER (W2G) ─────────────────────────────────────
let w2gWs = null;
let w2gCurrentRoom = null;
let w2gUsername = localStorage.getItem('w2gUsername') || '';
let w2gIsHost = false;
let w2gLocalAction = false; // Kendi hareketlerimizi sync'ten hariç tutmak için

function openW2GModal(type) {
    const modal = document.getElementById('w2gModal');
    const titleEl = document.getElementById('w2gModalTitle');
    const actionBtn = document.getElementById('w2gActionBtn');
    const usernameInput = document.getElementById('w2gUsername');
    usernameInput.value = w2gUsername;
    if (type === 'create') {
        titleEl.innerHTML = '<i class="fa-solid fa-users-line"></i> Oda Kur';
        actionBtn.innerHTML = '<i class="fa-solid fa-check"></i> Odayı Kur';
        actionBtn.dataset.action = 'create';
    } else {
        titleEl.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Odaya Katıl';
        actionBtn.innerHTML = '<i class="fa-solid fa-check"></i> Katıl';
        actionBtn.dataset.action = 'join';
    }
    modal.classList.remove('hidden');
}
function closeW2GModal() {
    document.getElementById('w2gModal').classList.add('hidden');
}
function handleW2GAction() {
    const action = document.getElementById('w2gActionBtn').dataset.action;
    const username = document.getElementById('w2gUsername').value.trim();
    const roomName = document.getElementById('w2gRoomName').value.trim();
    const password = document.getElementById('w2gPassword').value;

    if (!username || !roomName) {
        alert('Lütfen tüm alanları doldurun!');
        return;
    }
    w2gUsername = username;
    localStorage.setItem('w2gUsername', w2gUsername);
    w2gCurrentRoom = roomName;
    w2gIsHost = (action === 'create');
    connectW2G(action, roomName, password, username);
    closeW2GModal();
}
function connectW2G(action, roomName, password, username) {
    const isFile = window.location.protocol === 'file:';
    const wsProto = isFile ? 'ws:' : (window.location.protocol === 'https:' ? 'wss:' : 'ws:');
    const wsHost = isFile ? 'localhost:8080' : window.location.host;
    const wsUrl = `${wsProto}//${wsHost}/api/w2g/join`;
    w2gWs = new WebSocket(wsUrl);

    w2gWs.onopen = () => {
        console.log('W2G Connected');
        const msg = {
            type: action,
            roomName: roomName,
            password: password,
            username: username
        };
        if (action === 'create' && currentAnime) {
            msg.data = {
                animeTitle: currentAnime.title,
                animeImage: currentAnime.img,
                animeId: currentAnime.id,
                animeSlug: currentAnime.slug,
                isMovie: currentAnime.isMovie
            };
        }
        w2gWs.send(JSON.stringify(msg));
    };
    w2gWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleW2GMessage(data);
    };
    w2gWs.onclose = () => {
        console.log('W2G Disconnected');
        leaveW2GRoom();
    };
    w2gWs.onerror = (err) => {
        console.error('W2G Error:', err);
        alert('W2G bağlantısı başarısız!');
    };
}
function handleW2GMessage(msg) {
    console.log('W2G Message:', msg);
    switch(msg.type) {
        case 'joined':
            // Odaya katıldık
            document.getElementById('w2gStatus').textContent = `🛜 ${msg.roomName} odasında`;
            document.getElementById('w2gStatus').style.display = 'inline-block';
            document.getElementById('w2gChatContainer').classList.remove('hidden');
            document.getElementById('w2gCreateBtn').style.display = 'none';
            document.getElementById('w2gJoinBtn').style.display = 'none';
            // Eski mesajları göster
            if (msg.data && Array.isArray(msg.data)) {
                msg.data.forEach(m => addW2GMessage(m));
            }
            setupW2GPlayerListeners();
            break;
        case 'error':
            alert('Hata: ' + msg.data);
            leaveW2GRoom();
            break;
        case 'join':
        case 'leave':
            addW2GMessage({ type: 'system', username: msg.username, data: msg.data });
            break;
        case 'chat':
            addW2GMessage(msg);
            break;
        case 'play':
            if (!w2gLocalAction && plyr) {
                w2gLocalAction = true;
                plyr.play();
                setTimeout(() => w2gLocalAction = false, 100);
            }
            break;
        case 'pause':
            if (!w2gLocalAction && plyr) {
                w2gLocalAction = true;
                plyr.pause();
                setTimeout(() => w2gLocalAction = false, 100);
            }
            break;
        case 'seek':
            if (!w2gLocalAction && plyr && typeof msg.data === 'number') {
                w2gLocalAction = true;
                plyr.currentTime = msg.data;
                setTimeout(() => w2gLocalAction = false, 100);
            }
            break;
    }
}
function setupW2GPlayerListeners() {
    if (!plyr) return;
    plyr.on('play', () => {
        if (!w2gLocalAction) sendW2GPlayerEvent('play');
    });
    plyr.on('pause', () => {
        if (!w2gLocalAction) sendW2GPlayerEvent('pause');
    });
    plyr.on('seeked', () => {
        if (!w2gLocalAction) sendW2GPlayerEvent('seek', plyr.currentTime);
    });
}
function sendW2GPlayerEvent(type, data) {
    if (!w2gWs || w2gWs.readyState !== WebSocket.OPEN) return;
    w2gWs.send(JSON.stringify({
        type: type,
        roomName: w2gCurrentRoom,
        username: w2gUsername,
        data: data
    }));
}
function sendW2GMessage() {
    const input = document.getElementById('w2gMessageInput');
    const text = input.value.trim();
    if (!text || !w2gWs) return;
    w2gWs.send(JSON.stringify({
        type: 'chat',
        roomName: w2gCurrentRoom,
        username: w2gUsername,
        data: text
    }));
    input.value = '';
}
function addW2GMessage(msg) {
    const container = document.getElementById('w2gMessages');
    const el = document.createElement('div');
    el.classList.add('w2g-message');
    if (msg.type === 'system' || msg.type === 'join' || msg.type === 'leave') {
        el.classList.add('system');
        el.textContent = msg.data;
    } else {
        el.innerHTML = `<span class="msg-user">${msg.username}:</span> ${msg.data}`;
    }
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
}
function leaveW2GRoom() {
    if (w2gWs) {
        w2gWs.close();
        w2gWs = null;
    }
    w2gCurrentRoom = null;
    document.getElementById('w2gStatus').style.display = 'none';
    document.getElementById('w2gChatContainer').classList.add('hidden');
    document.getElementById('w2gMessages').innerHTML = '';
    document.getElementById('w2gCreateBtn').style.display = 'inline-flex';
    document.getElementById('w2gJoinBtn').style.display = 'inline-flex';
}

let downloads = [];
let selectedDownloadQuality = null;
let currentDownloadData = null;

function loadDownloads() {
    const saved = ls.get('anitr_downloads');
    if (saved) downloads = saved;
}

function saveDownloads() {
    ls.set('anitr_downloads', downloads);
}

function openDownloadModal() {
    if (!currentAnime || !currentEpisodeKey) {
        showToast('⚠️ Önce bir bölüm seçin!');
        return;
    }
    selectedDownloadQuality = null;
    document.getElementById('downloadModal').classList.remove('hidden');
    populateDownloadQualities();
}

function closeDownloadModal() {
    document.getElementById('downloadModal').classList.add('hidden');
}

async function populateDownloadQualities() {
    const container = document.getElementById('downloadQualityList');
    container.innerHTML = '<div style="text-align:center;padding:1rem;"><div class="spinner"></div></div>';
    
    const urlArg  = currentEpisode.ID   ? 'url='  + encodeURIComponent(currentEpisode.ID) : '';
    const idArg   = currentAnime.id      ? 'id='   + currentAnime.id   : '';
    const slugArg = currentAnime.slug    ? 'slug=' + encodeURIComponent(currentAnime.slug) : '';
    const soundArg = currentSelectedSound ? 'sound=' + encodeURIComponent(currentSelectedSound) : '';
    const qs = [urlArg, slugArg, idArg, soundArg, 'is_movie=' + currentAnime.isMovie, 'source=' + encodeURIComponent(currentSource), 'season_index=' + currentSIdx, 'episode_index=' + currentEIdx].filter(Boolean).join('&');

    const watchData = await fetchAPI('/watch?' + qs);
    if (!watchData || !Array.isArray(watchData)) {
        container.innerHTML = '<p style="color:var(--text3);text-align:center;">❌ Kaliteler yüklenemedi.</p>';
        return;
    }

    currentDownloadData = watchData;
    
    const qualities = [
        { label: '1080p', res: '1080', checked: true },
        { label: '720p', res: '720' },
        { label: '480p', res: '480' }
    ];

    container.innerHTML = qualities.map(q => `
        <label style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;border:1px solid var(--border);border-radius:8px;background:var(--surface2);cursor:pointer;">
            <input type="radio" name="downloadQuality" value="${q.res}" ${q.checked ? 'checked' : ''} onchange="selectedDownloadQuality = this.value">
            <span style="font-weight:500;">${q.label}</span>
        </label>
    `).join('');
    
    selectedDownloadQuality = qualities[0].res;
}

async function startDownload() {
    if (!currentDownloadData || !selectedDownloadQuality) {
        showToast('⚠️ Lütfen bir kalite seçin!');
        return;
    }

    const watch = currentDownloadData[0];
    const videoUrl = watch.Urls && watch.Urls.length > 0 ? watch.Urls[0] : null;

    if (!videoUrl) {
        showToast('❌ İndirme linki bulunamadı!');
        return;
    }

    const filename = `${currentAnime.title} - ${document.getElementById('watchTitle').textContent} (${selectedDownloadQuality}p).mp4`;
    
    try {
        showToast('⏳ İndirme başladı!');
        
        const downloadId = Date.now();
        const newDownload = {
            id: downloadId,
            animeId: currentAnime.id,
            animeTitle: currentAnime.title,
            episodeTitle: document.getElementById('watchTitle').textContent,
            image: currentAnime.img,
            quality: selectedDownloadQuality,
            status: 'downloading',
            progress: 0,
            url: videoUrl,
            filename: filename
        };

        downloads.unshift(newDownload);
        saveDownloads();
        
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = filename;
        a.click();
        
        newDownload.status = 'completed';
        saveDownloads();
        showToast('✅ İndirme tamamlandı!');
    } catch (err) {
        showToast('❌ İndirme başarısız!');
        console.error(err);
    }
}

function showDownloadsModal() {
    loadDownloads();
    renderDownloads();
    document.getElementById('downloadsModal').classList.remove('hidden');
}

function closeDownloadsModal() {
    document.getElementById('downloadsModal').classList.add('hidden');
}

function renderDownloads() {
    const container = document.getElementById('downloadsContainer');
    
    if (downloads.length === 0) {
        container.innerHTML = '<p style="color:var(--text3);text-align:center;padding:2rem;">Henüz bir şey indirmediniz.</p>';
        return;
    }

    container.innerHTML = downloads.map(dl => `
        <div style="display:flex;gap:0.75rem;padding:0.75rem;border:1px solid var(--border);border-radius:8px;background:var(--surface2);margin-bottom:0.75rem;">
            <img src="${dl.image}" alt="${dl.animeTitle}" style="width:50px;height:70px;object-fit:cover;border-radius:6px;">
            <div style="flex:1;">
                <div style="font-weight:500;">${dl.animeTitle}</div>
                <div style="font-size:0.85rem;color:var(--text2);margin-bottom:0.25rem;">${dl.episodeTitle}</div>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <span class="meta-badge" style="font-size:0.75rem;">${dl.quality}p</span>
                    <span class="meta-badge" style="font-size:0.75rem;background:${dl.status === 'completed' ? 'var(--success)' : 'var(--accent)'};">
                        ${dl.status === 'completed' ? '✅ Tamamlandı' : '⏳ İndiriliyor'}
                    </span>
                </div>
            </div>
            ${dl.status === 'completed' ? `<button class="btn-secondary" style="padding:0.5rem 1rem;" onclick="window.open('${dl.url}', '_blank')"><i class="fa-solid fa-play"></i> Aç</button>` : ''}
        </div>
    `).join('');
}

// ── AI Functions ─────────────────────────────────────────
async function callAIAPI(prompt) {
    if (!appSettings.aiEnabled) {
        showToast('⚠️ Yapay zeka özellikleri ayarlardan devre dışı bırakılmış!');
        return null;
    }
    const provider = appSettings.aiProvider;
    const apiKey = appSettings.aiApiKey;
    const customPrompt = appSettings.aiPrompt || '';
    if (!apiKey) {
        showToast('⚠️ Lütfen ayarlardan yapay zeka API anahtarını girin!');
        return null;
    }

    const systemPrompt = customPrompt || 'Sen bir anime uzmanısın. Kullanıcının sorularını samimi ve bilgilendirici bir şekilde cevapla. Cevaplarında markdown formatı kullanabilirsin. Cevapların kısa ve öz olsun, gereksiz uzatma.';

    try {
        if (provider === 'openai' || provider === 'openrouter') {
            const url = provider === 'openai'
                ? 'https://api.openai.com/v1/chat/completions'
                : 'https://openrouter.ai/api/v1/chat/completions';
            const model = provider === 'openai' ? 'gpt-3.5-turbo' : 'openai/gpt-3.5-turbo';

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.7
                })
            });

            if (!response.ok) throw new Error(`API Hatası: ${response.status}`);

            const data = await response.json();
            return data.choices[0].message.content.trim();
        } else if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `${systemPrompt}\n\nKullanıcı: ${prompt}`
                        }]
                    }]
                })
            });

            if (!response.ok) throw new Error(`API Hatası: ${response.status}`);
            const data = await response.json();
            return data.candidates[0].content.parts[0].text.trim();
        }
    } catch (error) {
        console.error('AI Hatası:', error);
        showToast(`⚠️ Yapay zeka isteği başarısız oldu: ${error.message}`);
        return null;
    }
    return null;
}

async function getAIRecommendations() {
    const inputEl = document.getElementById('aiRecommendationInput');
    const containerEl = document.getElementById('aiRecommendationsContainer');
    const query = inputEl.value.trim();
    if (!query) {
        showToast('⚠️ Lütfen bir istek yazın!');
        return;
    }

    containerEl.innerHTML = '<div style="text-align:center; padding:2rem;"><div class="spinner"></div></div>';

    const prompt = `Kullanıcı şu şekilde anime istiyor: "${query}".\n\nLütfen 5 farklı anime öner. Cevabını şu formatta JSON olarak ver (sadece JSON, başka hiçbir şey ekleme):\n{\n  "recommendations": [\n    {\n      "title": "Anime Adı",\n      "description": "Kısa açıklama (max 2 cümle)"\n    }\n  ]\n}`;

    const result = await callAIAPI(prompt);
    if (!result) {
        containerEl.innerHTML = '<p style="color:var(--text3); text-align:center;">Öneri alınamadı.</p>';
        return;
    }

    try {
        let jsonStr = result;
        if (jsonStr.includes('```json')) jsonStr = jsonStr.split('```json')[1].split('```')[0];
        else if (jsonStr.includes('```')) jsonStr = jsonStr.split('```')[1].split('```')[0];
        jsonStr = jsonStr.trim();
        const parsed = JSON.parse(jsonStr);
        containerEl.innerHTML = `<div class="anime-grid">${parsed.recommendations.map(rec => `
            <div class="anime-card" onclick="document.getElementById('searchInput').value='${rec.title.replace(/'/g, "\\'")}'; handleSearch()">
                <div class="anime-poster" style="background:linear-gradient(135deg, var(--accent), var(--accent-alt)); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; text-align:center; padding:1rem;">
                    <div>
                        <i class="fa-solid fa-film" style="font-size:3rem; margin-bottom:0.5rem;"></i><br>
                        <span style="font-size:0.9rem;">${rec.title.substring(0,30)}${rec.title.length > 30 ? '...' : ''}</span>
                    </div>
                </div>
                <div class="anime-info">
                    <div class="anime-title">${rec.title}</div>
                    <div class="anime-meta" style="color:var(--text2); font-size:0.85rem;">${rec.description}</div>
                </div>
            </div>`).join('')}</div>`;
    } catch (parseErr) {
        containerEl.innerHTML = `<div style="background:var(--surface2); padding:1.5rem; border-radius:12px; border:1px solid var(--border);">${marked.parse(result)}</div>`;
    }
}

function askAI(type) {
    const customContainer = document.getElementById('aiCustomQuestionContainer');
    if (type === 'custom') {
        customContainer.style.display = customContainer.style.display === 'none' ? 'block' : 'none';
        return;
    }

    const container = document.getElementById('aiAnalysisResults');
    container.innerHTML = '<div style="text-align:center; padding:2rem;"><div class="spinner"></div></div>';

    let prompt = '';
    const animeTitle = document.getElementById('watchAnimeTitle')?.textContent || '';
    const episodeTitle = document.getElementById('watchTitle')?.textContent || '';
    if (type === 'summary') {
        prompt = `${animeTitle} - ${episodeTitle} bölümünün özetini çıkar. Max 3 paragraf, anlaşılır ve detaylı olsun.`;
    } else if (type === 'characters') {
        prompt = `${animeTitle} animesinde bu bölümde görünen ana karakterleri listele. Her karakter için kısa bir açıklama ekle.`;
    }

    processAIAnalysis(prompt);
}

function submitAICustomQuestion() {
    const questionInput = document.getElementById('aiCustomQuestionInput');
    const question = questionInput.value.trim();
    if (!question) return;
    document.getElementById('aiAnalysisResults').innerHTML = '<div style="text-align:center; padding:2rem;"><div class="spinner"></div></div>';
    processAIAnalysis(question);
}

async function processAIAnalysis(prompt) {
    const container = document.getElementById('aiAnalysisResults');
    const result = await callAIAPI(prompt);
    if (!result) {
        container.innerHTML = '<p style="color:var(--text3); text-align:center;">Yanıt alınamadı.</p>';
        return;
    }
    container.innerHTML = `<div style="background:var(--surface2); padding:1.5rem; border-radius:12px; border:1px solid var(--border); line-height:1.7;">${marked.parse(result)}</div>`;
}

function goToAnimeFromRoom(animeId, animeSlug, isMovie) {
    if (!animeId) return;
    showAnimeDetail(animeId, animeSlug, isMovie);
}

// ── Keyboard Shortcuts (Yeni Özellik 2) ───────────────────
document.addEventListener('keydown', (e) => {
    // Sadece player açıkken çalışsın - use watchView instead!
    const watchView = document.getElementById('watchView');
    if (!plyr || !watchView || watchView.classList.contains('hidden')) return;

    // Arama kutusu veya input'a yazıyorsa engelleme
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.code) {
        case 'Space':
        case 'KeyK':
            e.preventDefault();
            plyr.togglePlay();
            break;
        case 'ArrowRight':
            e.preventDefault();
            plyr.forward(10);
            break;
        case 'ArrowLeft':
            e.preventDefault();
            plyr.rewind(10);
            break;
        case 'KeyF':
            e.preventDefault();
            plyr.fullscreen.toggle();
            break;
        case 'KeyM':
            e.preventDefault();
            plyr.muted = !plyr.muted;
            break;
        case 'KeyN':
            e.preventDefault();
            const nxtBtn = document.getElementById('nextEpBtn2');
            if (nxtBtn && !nxtBtn.disabled) nxtBtn.click();
            break;
    }
});

// ── Schedule (Yeni Özellik 3) ──────────────────────────────
async function loadSchedule() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;
    
    // Yüklendiyse tekrar çekme
    if (container.dataset.loaded === 'true') return;
    
    container.innerHTML = '<div style="text-align:center; padding: 3rem;"><div class="spinner"></div></div>';
    
    try {
        const res = await fetch(API_BASE + '/mal/schedule');
        
        if (!res.ok) {
            throw new Error(`Sunucu hatası: ${res.status} (Sunucuyu yeniden başlattığına emin ol)`);
        }
        
        const data = await res.json();
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:var(--text3);">Takvim verisi bulunamadı.</p>';
            return;
        }

        // Günlere göre grupla
        const days = {
            'Mondays': 'Pazartesi',
            'Tuesdays': 'Salı',
            'Wednesdays': 'Çarşamba',
            'Thursdays': 'Perşembe',
            'Fridays': 'Cuma',
            'Saturdays': 'Cumartesi',
            'Sundays': 'Pazar',
            'Other': 'Diğer'
        };
        
        const grouped = {};
        data.forEach(item => {
            let day = item.broadcast?.day || 'Other';
            if (!grouped[day]) grouped[day] = [];
            grouped[day].push(item);
        });
        
        // Pazartesiden pazara sırala
        const order = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays', 'Other'];
        
        let html = '';
        order.forEach(day => {
            if (grouped[day] && grouped[day].length > 0) {
                const trDay = days[day] || day;
                html += `
                <div style="margin-bottom: 2.5rem;">
                    <h3 style="color: var(--accent); margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">
                        <i class="fa-solid fa-calendar-day"></i> ${trDay}
                    </h3>
                    <div class="anime-grid">`;
                
                grouped[day].forEach(item => {
                    const img = (item.images?.jpg?.large_image_url || item.images?.jpg?.image_url) || '';
                    const score = item.score ? item.score.toFixed(1) : '-';
                    const title = (item.title || '').replace(/'/g, "\\'");
                    
                    html += `
                    <div class="anime-card" onclick="searchMALAnime('${title}')">
                        <div class="card-poster-wrap">
                            <img src="${img}" alt="${item.title || ''}" class="card-poster" loading="lazy">
                            <div class="card-badge"><i class="fa-solid fa-star"></i> ${score}</div>
                            <div class="card-hover-overlay">
                                <button class="quick-play-btn"><i class="fa-solid fa-search"></i></button>
                            </div>
                        </div>
                        <div class="card-info">
                            <div class="card-title">${item.title || ''}</div>
                        </div>
                    </div>`;
                });
                
                html += `</div></div>`;
            }
        });
        
        container.innerHTML = html;
        container.dataset.loaded = 'true';
        
    } catch (err) {
        container.innerHTML = `<p style="text-align:center; color:#ef4444;">Takvim yüklenirken hata oluştu: ${err.message}</p>`;
    }
}

/* ============================================================
   ✨ GÖRSEL ÖZELLİK 1 — FLOATING STARS (Canvas Arka Plan)
   ============================================================ */
(function initFloatingStars() {
    const canvas = document.getElementById('starsCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const STAR_COUNT = 110;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
        x:    Math.random() * window.innerWidth,
        y:    Math.random() * window.innerHeight,
        r:    Math.random() * 1.4 + 0.3,
        dx:   (Math.random() - 0.5) * 0.18,
        dy:   -(Math.random() * 0.22 + 0.04),
        alpha: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 0.012 + 0.003,
        twinkleDir: Math.random() > 0.5 ? 1 : -1,
    }));

    function drawStars() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(s => {
            // Twinkle
            s.alpha += s.twinkleSpeed * s.twinkleDir;
            if (s.alpha > 0.85 || s.alpha < 0.1) s.twinkleDir *= -1;

            // Move
            s.x += s.dx;
            s.y += s.dy;
            if (s.y < -5) { s.y = canvas.height + 5; s.x = Math.random() * canvas.width; }
            if (s.x < -5) s.x = canvas.width + 5;
            if (s.x > canvas.width + 5) s.x = -5;

            // Draw
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 230, 160, ${s.alpha})`;
            ctx.shadowBlur = 6;
            ctx.shadowColor = `rgba(232, 160, 32, ${s.alpha * 0.8})`;
            ctx.fill();
            ctx.shadowBlur = 0;
        });
        requestAnimationFrame(drawStars);
    }
    drawStars();
})();

/* ============================================================
   ✨ GÖRSEL ÖZELLİK 2 — 3D TILT CARD EFFECT
   ============================================================ */
(function init3DTilt() {
    const MAX_TILT = 12; // derece

    function applyTilt(card, e) {
        const rect   = card.getBoundingClientRect();
        const cx     = rect.left + rect.width  / 2;
        const cy     = rect.top  + rect.height / 2;
        const dx     = (e.clientX - cx) / (rect.width  / 2);
        const dy     = (e.clientY - cy) / (rect.height / 2);
        const rotateX = -dy * MAX_TILT;
        const rotateY =  dx * MAX_TILT;

        card.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px) scale(1.04)`;

        // Glare ışığı mouse konumuna göre kaydır
        const glare = card.querySelector('.card-glare');
        if (glare) {
            const gx = ((dx + 1) / 2) * 100;
            const gy = ((dy + 1) / 2) * 100;
            glare.style.background = `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.22) 0%, transparent 65%)`;
            glare.style.opacity = '1';
        }
    }

    function resetTilt(card) {
        card.style.transform = '';
        const glare = card.querySelector('.card-glare');
        if (glare) { glare.style.opacity = '0'; }
    }

    // MutationObserver ile dinamik eklenen kartlara da uygula
    function addTiltToCards(root) {
        root.querySelectorAll('.anime-card:not([data-tilt])').forEach(card => {
            card.dataset.tilt = '1';

            // Glare div ekle
            if (!card.querySelector('.card-glare')) {
                const glare = document.createElement('div');
                glare.className = 'card-glare';
                const wrap = card.querySelector('.card-poster-wrap');
                if (wrap) wrap.appendChild(glare);
            }

            card.addEventListener('mousemove',  e => applyTilt(card, e));
            card.addEventListener('mouseleave', () => resetTilt(card));
        });
    }

    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(n => {
            if (n.nodeType === 1) addTiltToCards(n);
        }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addTiltToCards(document.body);
})();

/* ============================================================
   ✨ GÖRSEL ÖZELLİK 3 — KONFETİ PATLAMASI (Favorilere Ekle)
   ============================================================ */
window._launchConfetti = function(x, y) {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const COLORS = ['#e8a020','#f59e0b','#fbbf24','#fde68a','#fff','#d4691e','#facc15'];
    const particles = Array.from({ length: 90 }, () => ({
        x, y,
        vx:    (Math.random() - 0.5) * 12,
        vy:    -(Math.random() * 14 + 6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size:  Math.random() * 8 + 4,
        rot:   Math.random() * 360,
        rotV:  (Math.random() - 0.5) * 14,
        gravity: 0.45,
        life:  1,
        decay: Math.random() * 0.018 + 0.008,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
    }));

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        particles.forEach(p => {
            if (p.life <= 0) return;
            alive = true;
            p.x  += p.vx;
            p.y  += p.vy;
            p.vy += p.gravity;
            p.rot += p.rotV;
            p.life -= p.decay;

            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            ctx.fillStyle = p.color;
            if (p.shape === 'rect') {
                ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        });
        if (alive) requestAnimationFrame(draw);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
};

// toggleFavorite'e konfeti entegrasyonu
(function patchToggleFavorite() {
    const orig = window.toggleFavorite;
    if (!orig) return;
    window.toggleFavorite = function(anime, event) {
        const favs = getFavorites();
        const isAdding = !favs.some(a => String(a.id) === String(anime.id));
        orig(anime);
        if (isAdding) {
            // Tıklanan buton konumundan konfeti fırlat
            let cx = window.innerWidth  / 2;
            let cy = window.innerHeight / 3;
            if (event && event.clientX) { cx = event.clientX; cy = event.clientY; }
            else {
                const btn = document.getElementById('favBtnDetail');
                if (btn) { const r = btn.getBoundingClientRect(); cx = r.left + r.width/2; cy = r.top + r.height/2; }
            }
            window._launchConfetti(cx, cy);
        }
    };
})();

// Detail fav buton onclick'ini de konfeti destekli yap
document.addEventListener('click', e => {
    const btn = e.target.closest('#favBtnDetail');
    if (btn) {
        // onclick'teki toggleFavorite çağrısı event olmadan yapılıyor; biz event'i buradan iletiyoruz
        window._lastFavEvent = { clientX: e.clientX, clientY: e.clientY };
    }
});

/* ============================================================
   ✨ GÖRSEL ÖZELLİK 4 — SAYFA GEÇİŞ ANİMASYONLARI (Morph)
   ============================================================ */
(function initPageTransitions() {
    // view listesi
    const views = ['homeView','animeListView','watchView','malView','scheduleView','historyView'];

    function getVisibleViews() {
        return views.map(id => document.getElementById(id)).filter(el => el && !el.classList.contains('hidden'));
    }

    // showHomeView, showMALView gibi fonksiyonları wrap ediyoruz
    const viewFns = ['showHomeView','showWatchView'];
    viewFns.forEach(fnName => {
        const orig = window[fnName];
        if (!orig) return;
        window[fnName] = function(...args) {
            const current = getVisibleViews();
            current.forEach(el => {
                el.classList.add('page-leave');
                setTimeout(() => el.classList.remove('page-leave'), 220);
            });
            setTimeout(() => {
                orig(...args);
                views.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && !el.classList.contains('hidden')) {
                        el.classList.add('page-enter');
                        setTimeout(() => el.classList.remove('page-enter'), 380);
                    }
                });
            }, 150);
        };
    });

    // loadHome, loadDetails gibi async fonksiyonlara da fade-in uygula
    const origLoadHome = window.loadHome;
    if (origLoadHome) {
        window.loadHome = async function(...args) {
            const mc = document.getElementById('mainContent');
            if (mc) { mc.style.opacity = '0'; mc.style.transition = 'opacity 0.3s'; }
            await origLoadHome(...args);
            if (mc) { mc.style.opacity = '1'; }
        };
    }
})();

/* ============================================================
   ✨ GÖRSEL ÖZELLİK 5 — GLASSMORPHISM + NAV SCROLL EFFECT
   (CSS zaten uygulandı; burada scroll'da yoğunluk artışı)
   ============================================================ */
(function initNavScrollEffect() {
    const nav = document.querySelector('.navbar');
    if (!nav) return;
    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY > 40;
        nav.style.boxShadow = scrolled
            ? '0 4px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)'
            : '0 2px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)';
        nav.style.backdropFilter = scrolled
            ? 'blur(40px) saturate(200%)'
            : 'blur(28px) saturate(160%)';
    }, { passive: true });
})();

// ── Friends System ────────────────────────────────────────
function showFriendsModal() {
    document.getElementById('friendsModal').classList.remove('hidden');
    loadFriendsList();
}

function closeFriendsModal() {
    document.getElementById('friendsModal').classList.add('hidden');
}

async function loadFriendsList() {
    const userListDiv = document.getElementById('friendsServerList');
    const myFriendsDiv = document.getElementById('friendsMyList');
    
    if(!userListDiv || !myFriendsDiv) return;

    userListDiv.innerHTML = '<div style="text-align:center; padding:2rem;"><div class="loading-spinner"></div></div>';
    
    // Load my profile to see my friends
    const localUser = currentUser || profile.username;
    let myFriends = [];
    
    try {
        const userRes = await fetchAPI(`/user/data?username=${localUser}`);
        if(userRes && userRes.friends) {
            myFriends = userRes.friends;
        }
    } catch(e) { console.error('Error loading my data', e); }

    try {
        const users = await fetchAPI(`/users?username=${localUser}`);
        
        if(!users || users.length === 0) {
            userListDiv.innerHTML = '<p style="text-align:center; color:var(--text3);">Sunucuda başka kimse yok.</p>';
        } else {
            userListDiv.innerHTML = users.map(u => {
                const isFriend = myFriends.includes(u);
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface2); padding:0.75rem 1rem; border-radius:8px; margin-bottom:0.5rem;">
                        <div style="font-weight:bold;">${u}</div>
                        ${isFriend 
                            ? `<button onclick="removeFriend('${u}')" class="btn-secondary" style="font-size:0.8rem; padding:0.4rem 0.8rem; background:rgba(239,68,68,0.2); color:#ef4444;"><i class="fa-solid fa-user-minus"></i> Çıkar</button>`
                            : `<button onclick="addFriend('${u}')" class="btn-primary" style="font-size:0.8rem; padding:0.4rem 0.8rem;"><i class="fa-solid fa-user-plus"></i> Ekle</button>`
                        }
                    </div>
                `;
            }).join('');
        }
        
        if(myFriends.length === 0) {
            myFriendsDiv.innerHTML = '<p style="text-align:center; color:var(--text3);">Henüz hiç arkadaşın yok.</p>';
        } else {
            myFriendsDiv.innerHTML = myFriends.map(f => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface2); padding:0.75rem 1rem; border-radius:8px; margin-bottom:0.5rem;">
                    <div style="font-weight:bold; color:var(--accent);"><i class="fa-solid fa-user-group"></i> ${f}</div>
                    <button onclick="removeFriend('${f}')" class="btn-secondary" style="font-size:0.8rem; padding:0.4rem 0.8rem; background:rgba(239,68,68,0.2); color:#ef4444;"><i class="fa-solid fa-user-minus"></i> Çıkar</button>
                </div>
            `).join('');
        }
        
    } catch(err) {
        userListDiv.innerHTML = '<p style="color:#ef4444;">Kullanıcılar yüklenemedi.</p>';
    }
}

async function addFriend(friendName) {
    const localUser = currentUser || profile.username;
    try {
        await fetchAPI('/friends/add', {
            method: 'POST',
            body: JSON.stringify({ username: localUser, friend: friendName })
        });
        showToast('✅ Arkadaş eklendi!');
        loadFriendsList();
    } catch(err) {
        showToast('❌ Eklenemedi: ' + err.message);
    }
}

async function removeFriend(friendName) {
    const localUser = currentUser || profile.username;
    try {
        await fetchAPI('/friends/remove', {
            method: 'POST',
            body: JSON.stringify({ username: localUser, friend: friendName })
        });
        showToast('🗑️ Arkadaş çıkarıldı!');
        loadFriendsList();
    } catch(err) {
        showToast('❌ Çıkarılamadı: ' + err.message);
    }
}

/* ============================================================
   ✨ GÖRSEL ÖZELLİK 8 — 3D SCROLL FOOTER (Uzaklaşma Efekti)
   ============================================================ */
(function init3DScrollFooter() {
    window.addEventListener('scroll', () => {
        const footer = document.getElementById('scroll3dFooter');
        const content = document.getElementById('scroll3dContent');
        if (!footer || !content) return;

        const rect = footer.getBoundingClientRect();
        const windowHeight = window.innerHeight;

        // If the footer is in the viewport
        if (rect.top < windowHeight && rect.bottom > 0) {
            let progress = 1 - (rect.top / windowHeight);
            progress = Math.max(0, Math.min(1, progress));

            // The deeper we scroll, the further back it goes (zooms out)
            const translateZ = 200 - (progress * 600);
            const rotateX = progress * 10; 
            
            content.style.transform = `translateZ(${translateZ}px) rotateX(${rotateX}deg)`;
            content.style.opacity = Math.min(1, progress * 1.5);
        }
    });
})();
