/* ============================================================
   ANITR WEB - app.js  (Temiz, Hatasız Yeniden Yazım)
   ============================================================ */

// API Base logic



// ── Google Translate Helper ──────────────────────────────────────────
async function translateToTurkish(text) {
    if (!text) return '';
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const json = await res.json();
        return json[0].map(x => x[0]).join('');
    } catch(e) {
        console.error("Translate error:", e);
        return text;
    }
}

// ══════════════════════════════════════════════════════════
// ANILIST GRAPHQL ENTEGRASYONU
// ══════════════════════════════════════════════════════════
const ANILIST_URL = 'https://graphql.anilist.co';

async function fetchAniList(query, variables = {}) {
    try {
        const res = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query, variables })
        });
        const data = await res.json();
        return data.data;
    } catch (e) {
        console.error('AniList GraphQL Hatası:', e);
        return null;
    }
}
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
const searchInput   = document.getElementById('searchInput') || document.getElementById('largeSearchInput') || document.createElement('input');
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
let vjsPlayer         = null;  // Video.js player instance

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
    closePgModal();
    openPgModal(`
        <div class="pg-modal-header">
            <div class="pg-modal-title-group">
                <div class="pg-modal-icon pg-modal-icon-green"><i class="fa-solid fa-globe"></i></div>
                <div>
                    <h2 class="pg-modal-title">Online Odalar</h2>
                    <span class="pg-modal-subtitle">Canlı İzleme Odaları</span>
                </div>
            </div>
            <div class="pg-modal-actions">
                <button class="pg-action-btn" onclick="closePgModal();openW2GModal(&quot;create&quot;)">
                    <i class="fa-solid fa-plus"></i> Yeni Oda Kur
                </button>
                <button class="pg-close-btn" onclick="closePgModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="pg-modal-grid" id="pgRoomsGrid">
            <div class="pg-empty"><div class="spinner"></div><p>Odalar yükleniyor...</p></div>
        </div>
    `);
    loadOnlineRooms();
}

async function loadOnlineRooms() {
    const grid = document.getElementById('pgRoomsGrid');
    if (!grid) return;
    try {
        const data = await fetchAPI('/w2g/rooms');
        if (data && data.rooms && data.rooms.length) {
            grid.innerHTML = data.rooms.map(room => `
                <div class="pg-card pg-room-card">
                    <div class="pg-card-poster-wrap" onclick="event.stopPropagation();${room.animeId ? `closePgModal();goToAnimeFromRoom('${room.animeId}','${room.animeSlug}',${room.isMovie})` : ''}">
                        <img class="pg-card-poster" src="${room.animeImage || 'https://placehold.co/170x250/1a1a28/8b5cf6?text=?'}" alt="${room.animeTitle||'Oda'}" onerror="this.src='https://placehold.co/170x250/1a1a28/8b5cf6?text=?'">
                        <div class="pg-room-users"><i class="fa-solid fa-users"></i> ${room.userCount || 0}</div>
                    </div>
                    <div class="pg-card-info">
                        <div class="pg-card-title">${room.name}</div>
                        <div class="pg-card-meta"><i class="fa-solid fa-play" style="color:var(--accent)"></i> ${room.animeTitle || 'Anime seçilmedi'}</div>
                        <div class="pg-card-date"><i class="fa-solid fa-user"></i> ${room.hostUsername || 'Bilinmiyor'}</div>
                    </div>
                    <button class="pg-card-play-btn" onclick="event.stopPropagation();closePgModal();joinRoom('${room.name}','${room.name}')">
                        <i class="fa-solid fa-right-to-bracket"></i>
                    </button>
                </div>
            `).join('');
        } else {
            grid.innerHTML = '<div class="pg-empty"><i class="fa-solid fa-door-open"></i><p>Şu anda aktif oda yok.</p><button class="detail-btn-play" style="margin-top:1rem" onclick="closePgModal();openW2GModal(&quot;create&quot;)"><i class="fa-solid fa-plus"></i><span>İlk Odayı Sen Kur</span></button></div>';
        }
    } catch(e) {
        if (grid) grid.innerHTML = '<div class="pg-empty"><i class="fa-solid fa-wifi"></i><p>Odalar yüklenemedi.</p></div>';
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
    closeSettings();
    if(typeof closeDrawer === 'function') closeDrawer();
    const modal = document.getElementById('aboutProjectModal');
    if (modal) {
        modal.classList.remove('hidden');
        fetchGitHubProfiles();
    }
}

function closeAboutProject() {
    const modal = document.getElementById('aboutProjectModal');
    if (modal) {
        modal.classList.add('hidden');
        closeReposView();
    }
}

async function fetchGitHubProfiles() {
    const users = ['FOXYorj', 'prayjofir'];
    for (const username of users) {
        const card = document.getElementById(username === 'FOXYorj' ? 'ghProfileFoxy' : 'ghProfilePray');
        if (card && card.classList.contains('skeleton-card')) {
            card.innerHTML = '<div class="loader"></div>';
            try {
                const res = await fetch(`https://api.github.com/users/${username}`);
                const data = await res.json();
                
                card.classList.remove('skeleton-card');
                card.innerHTML = `
                    <img src="${data.avatar_url}" class="gh-avatar" alt="${data.login}">
                    <div class="gh-name">${data.name || data.login}</div>
                    <div class="gh-login">@${data.login}</div>
                    <div class="gh-bio">${data.bio || 'Açık Kaynak Geliştiricisi'}</div>
                    <div style="margin-top: 15px; font-size: 12px; color: var(--text3); display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-layer-group"></i> Projeleri Gör
                    </div>
                `;
                card.onclick = () => fetchGitHubRepos(data.login, data.name || data.login);
            } catch (e) {
                console.error("Github API error:", e);
                card.innerHTML = `<div>Veri alınamadı.</div>`;
            }
        }
    }
}

async function fetchGitHubRepos(username, displayName) {
    document.querySelector('.about-profiles-horizontal').style.display = 'none';
    const reposContainer = document.getElementById('ghReposContainer');
    const reposList = document.getElementById('ghReposList');
    document.getElementById('ghReposTitle').innerHTML = `<i class="fa-brands fa-github"></i> ${displayName} Projeleri`;
    
    reposContainer.classList.remove('hidden');
    reposList.innerHTML = '<div style="text-align:center; padding: 40px; width:100%; color: var(--text3); grid-column: span 2;"><div class="spinner"></div> Yükleniyor...</div>';
    
    try {
        const res = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=12`);
        const repos = await res.json();
        
        if (repos.length > 0) {
            reposList.innerHTML = repos.map(r => `
                <a href="${r.html_url}" target="_blank" class="gh-repo-item">
                    <div class="gh-repo-name"><i class="fa-solid fa-book-bookmark"></i> ${r.name}</div>
                    <div class="gh-repo-desc">${r.description || 'Açıklama bulunmuyor.'}</div>
                </a>
            `).join('');
        } else {
            reposList.innerHTML = '<div style="text-align:center; padding: 20px; width:100%; color: var(--text2); grid-column: span 2;">Hiç proje bulunamadı.</div>';
        }
    } catch (e) {
        reposList.innerHTML = '<div style="text-align:center; padding: 20px; width:100%; color: var(--text2); grid-column: span 2;">Projeler yüklenirken hata oluştu.</div>';
    }
}

function closeReposView() {
    document.getElementById('ghReposContainer').classList.add('hidden');
    document.querySelector('.about-profiles-horizontal').style.display = 'flex';
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
        profileBtn.innerHTML = `<img src="${profile.avatar || 'https://placehold.co/100x100/1a1a28/e8a020?text=' + currentUser[0].toUpperCase()}" onerror="this.src='https://placehold.co/100x100/1a1a28/e8a020?text=' + currentUser[0].toUpperCase()" alt="Profile" style="width: 32px; height: 32px; border-radius:30%; object-fit:cover; background:rgba(0,0,0,0.5); border: 2px solid ${profile.nameColor || 'var(--accent)'};">`;
        profileBtn.title = 'Profil: ' + currentUser;
    } else {
        profileBtn.innerHTML = `<img src="${profile.avatar || 'https://placehold.co/100x100/1a1a28/e8a020?text=P'}" alt="Profile" style="width: 32px; height: 32px; border-radius:30%; object-fit:cover; border: 2px solid ${profile.nameColor || 'var(--accent)'};">`;
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
    const directVal = localStorage.getItem('anitr_ts_' + key);
    const direct = parseFloat(directVal);
    console.log('[GET_POSITION] key:', key, 'directVal:', directVal, 'parsed:', direct);
    if (!isNaN(direct) && direct > 0) return direct;
    
    // Eski sisteme de bak (geriye dönük uyumluluk)
    const pos = ls.getRaw(currentSourcePositionsKey, {});
    console.log('[GET_POSITION] fallback to old system, val:', pos[key]);
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
    
    appSettings.cwStyle           = document.getElementById('settingCwStyle') ? document.getElementById('settingCwStyle').value : 'poster';
    appSettings.playerDebug       = document.getElementById('settingPlayerDebug') ? document.getElementById('settingPlayerDebug').checked : false;
    appSettings.screenShake     = document.getElementById('settingScreenShake') ? document.getElementById('settingScreenShake').checked : false;
    appSettings.audioOutput       = document.getElementById('settingAudioOutput') ? document.getElementById('settingAudioOutput').value : 'default';
    appSettings.showFillers       = document.getElementById('settingShowFillers') ? document.getElementById('settingShowFillers').checked : true;
    if (typeof anitrFillerRender === 'function') anitrFillerRender();
    
    if (appSettings.screenShake) {
        if (typeof initScreenShake === 'function') initScreenShake();
    } else {
        if (typeof stopScreenShake === 'function') stopScreenShake();
    }
    
    // Uygula
    applyAudioOutput();
    appSettings.ambientLight      = document.getElementById('settingAmbilight') ? document.getElementById('settingAmbilight').checked : false;
    
    ls.set('anitr_settings', appSettings);
    
    // Kaynak değişti mi kontrol et
    const playerEl = document.getElementById('animePlayer');
    if (playerEl) {
        playerEl.classList.remove('vjs-sub-small', 'vjs-sub-normal', 'vjs-sub-large', 'vjs-sub-xlarge');
        playerEl.classList.add(`vjs-sub-${appSettings.subtitleSize || 'normal'}`);
    }
    
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
    if (document.getElementById('settingSubtitleSize')) document.getElementById('settingSubtitleSize').value = appSettings.subtitleSize || 'normal';
    document.getElementById('settingAutoNext').checked  = appSettings.autoNext !== false;
    document.getElementById('settingBannerAuto').checked = appSettings.bannerAuto !== false;
    
    if (document.getElementById('settingCwStyle')) { document.getElementById('settingCwStyle').value = appSettings.cwStyle || 'poster'; }
    if (document.getElementById('settingPlayerDebug')) {
        document.getElementById('settingPlayerDebug').checked = appSettings.playerDebug === true;
    }
    if (document.getElementById('settingScreenShake')) {
        document.getElementById('settingScreenShake').checked = appSettings.screenShake === true;
    }
    if (document.getElementById('settingShowFillers')) {
        document.getElementById('settingShowFillers').checked = appSettings.showFillers !== false;
    }
    if (document.getElementById('settingAudioOutput')) {
        document.getElementById('settingAudioOutput').value = appSettings.audioOutput || 'default';
        loadAudioDevices();
    }
    if (document.getElementById('settingAmbilight')) {
        document.getElementById('settingAmbilight').checked = appSettings.ambientLight === true;
    }

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

async function saveProfile() {
    profile.username = document.getElementById('profileUsername').value;
    profile.nameColor = document.getElementById('profileNameColor').value;
    profile.bio = document.getElementById('profileBio').value;
    profile.discord = document.getElementById('profileDiscord').value;
    profile.favGenre = document.getElementById('profileFavGenre').value;
    profile.showWatchedAnime = document.getElementById('profileShowWatchedAnime').checked;
    profile.showCurrentWatching = document.getElementById('profileShowCurrentWatching').checked;
    
    ls.set('anitr_profile', profile);
    showToast('💾 Profili kaydediliyor...');
    
    if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            await supabaseClient.from('profiles').upsert({
                username: currentUser,
                name_color: profile.nameColor,
                bio: profile.bio,
                discord: profile.discord,
                fav_genre: profile.favGenre,
                show_watched: profile.showWatchedAnime,
                show_current: profile.showCurrentWatching,
                avatar_url: profile.avatar || '',
                banner_url: profile.banner || ''
            });
            showToast('✅ Profili buluta kaydedildi!');
        } catch(e) {
            console.error(e);
            showToast('⚠️ Buluta kaydedilemedi.');
        }
    }
    
    closeProfileModal();
    if(typeof updateNavbarProfile === 'function') updateNavbarProfile();
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

    // searchBtn.addEventListener('click', handleSearch);
    // searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSearch(); });
    // searchInput.addEventListener('input', handleSuggest);

    const lsi = document.getElementById('largeSearchInput');
    if (lsi) {
        lsi.addEventListener('keypress', e => { if (e.key === 'Enter') handleSearch(); });
        lsi.addEventListener('input', handleSuggest);
    }

    // searchInput.addEventListener('blur', () => setTimeout(() => suggestions.classList.add('hidden'), 200));

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
    if (vjsPlayer) { try { vjsPlayer.dispose(); } catch (e) {} vjsPlayer = null; }
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
    if (vjsPlayer) { try { vjsPlayer.dispose(); } catch (e) {} vjsPlayer = null; }
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
    if (vjsPlayer) { try { vjsPlayer.dispose(); } catch (e) {} vjsPlayer = null; }
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
let loaderStartTime = 0;
function showLoader() {
    loaderStartTime = Date.now();
    loader.classList.remove('hidden');
}
function hideLoader() {
    const elapsed = Date.now() - loaderStartTime;
    const minTime = 1200; // Minimum 1.2 saniye göster
    if (elapsed < minTime && loaderStartTime > 0) {
        setTimeout(() => loader.classList.add('hidden'), minTime - elapsed);
    } else {
        loader.classList.add('hidden');
    }
}

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
    try {
        // Kullanıcı isteği üzerine tüm bannerlar Kitsu'dan (yüksek kalite) çekilecek
        const res = await fetch('https://kitsu.io/api/edge/trending/anime?limit=10');
        const json = await res.json();
        
        if (json && json.data && json.data.length > 0) {
            const withBanners = json.data.filter(m => m.attributes && m.attributes.coverImage && (m.attributes.coverImage.original || m.attributes.coverImage.large));
            const mapped = withBanners.map(m => {
                const attr = m.attributes;
                return {
                    title: attr.canonicalTitle || attr.titles?.en_jp || 'Bilinmiyor',
                    title_english: attr.titles?.en || attr.canonicalTitle,
                    synopsis: attr.synopsis || 'Açıklama bulunmuyor.',
                    score: attr.averageRating ? (parseFloat(attr.averageRating) / 10).toFixed(1) : null,
                    images: { jpg: { large_image_url: attr.coverImage.original || attr.coverImage.large } }
                };
            });
            cinematicHeroes = mapped.sort(() => 0.5 - Math.random()).slice(0, 8);
            currentCinematicIndex = 0;
        }
    } catch (e) {
        console.error("Kitsu Hero banner verisi çekilemedi:", e);
    }

    renderCinematicHero();

    // Add Parallax Listener
    const cinematicHero = document.getElementById('cinematicHero');
    if (cinematicHero) {
        cinematicHero.addEventListener('mousemove', (e) => {
            const { clientX, clientY } = e;
            const { innerWidth, innerHeight } = window;
            const xOffset = (clientX / innerWidth - 0.5) * 15;
            const yOffset = (clientY / innerHeight - 0.5) * 15;
            const bg = document.getElementById('cinematicBg');
            if (bg && cinematicHeroes.length > 0) {
                bg.style.transform = `scale(1.05) translate(${xOffset}px, ${yOffset}px)`;
            }
        });
        cinematicHero.addEventListener('mouseleave', () => {
            const bg = document.getElementById('cinematicBg');
            if (bg) {
                bg.style.transform = `scale(1.05) translate(0px, 0px)`;
            }
        });
    }
}
function renderCinematicHero() {
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
        
        let metaArr = [];
        if (heroAnime.score) metaArr.push(`<span style="color:#10b981; font-weight:700;">${heroAnime.score} Puan</span>`);
        if (heroAnime.episodes) metaArr.push(`<span>${heroAnime.episodes} Bölüm</span>`);
        if (heroAnime.genres) metaArr.push(`<span>${heroAnime.genres.slice(0, 3).map(g => g.name).join(', ')}</span>`);
        cinematicMeta.innerHTML = metaArr.join('<span style="margin: 0 10px; color:rgba(255,255,255,0.3);">|</span>');
        

        
        const pFill = document.getElementById('heroProgressFill');
        if (pFill) {
            pFill.classList.remove('running');
            void pFill.offsetWidth; // trigger reflow
            pFill.classList.add('running');
        }
        cinematicActions.innerHTML = `
            <button class="prime-btn-hero play" onclick="searchAnimeByName('${safeTitle}')" style="display:flex; align-items:center; gap:10px; background:#fff; color:#000; border:none; padding:12px 28px; font-size:16px; font-weight:700; border-radius:6px; cursor:pointer; transition:0.2s;"><i class="fa-solid fa-play"></i> Oynat</button>
            <button class="prime-btn-hero info" onclick="searchAnimeByName('${safeTitle}')" style="display:flex; align-items:center; gap:10px; background:rgba(109, 109, 110, 0.7); color:#fff; border:none; padding:12px 28px; font-size:16px; font-weight:700; border-radius:6px; cursor:pointer; transition:0.2s; backdrop-filter:blur(10px);"><i class="fa-solid fa-circle-info"></i> Daha Fazla Bilgi</button>
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
    handleSearch(name);
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

    // Fetch Custom GitHub API data
    let animerankData = null;
    try {
        const arRes = await fetch(appSettings.homeDataSource === 'anitr' ? 'https://raw.githubusercontent.com/FOXYorj/anitr-web-api/main/index.php' : 'https://animerank.tv/api/discovery/home-rails');
        let arText = await arRes.text();
        if (arText.includes('echo <<<JSON')) {
            arText = arText.split('echo <<<JSON')[1];
            if (arText.includes('JSON;')) {
                arText = arText.split('JSON;')[0];
            }
        }
        const arJson = JSON.parse(arText);
        if (arJson.success && arJson.data && arJson.data.rails) {
            animerankData = arJson.data.rails;
        }
    } catch (e) {
        console.error("Custom API Hatası:", e);
    }

    // Hero banner'ı animerank verisiyle başlat
    await initHeroBanner(animerankData);

    showLoader();

    if (animerankData) {
        // Animerank.tv'den gelen kategorileri ekle
        for (let railKey in animerankData) {
            const rail = animerankData[railKey];
            if (rail.items && rail.items.length > 0) {
                // Veriyi buildJikanCarouselHtml'e uyumlu hale getir
                const mappedItems = rail.items.map(m => {
                    const getFullUrl = (url) => url.startsWith('/') ? 'https://raw.githubusercontent.com/FOXYorj/anitr-web-api/main' + url : url;
                    return {
                        title: m.title,
                        title_english: m.titleOriginal,
                        score: m.score ? m.score.toFixed(1) : '-',
                        genres: m.genres,
                        images: { jpg: { large_image_url: getFullUrl(m.poster) } },
                        description: m.description,
                        year: m.year
                    };
                });
                const html = buildJikanCarouselHtml(mappedItems, rail.title);
                mainContent.insertAdjacentHTML('beforeend', html);
            }
        }
    } else {
        // Yedek: Jikan API yerine statik özel kategoriler kullanıyoruz
        renderCustomCategories();
    }

    // MAL Önerileri
    if (malUser) {
        const recPlaceholder = document.createElement('div');
        recPlaceholder.id = 'recPlaceholder';
        recPlaceholder.className = 'nf-section';
        recPlaceholder.innerHTML = `
            <h2 class="nf-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i> ✨ Sana Özel Öneriler</h2>
            <div style="background:var(--surface2);padding:2rem;border-radius:12px;text-align:center;">
                <div class="spinner" style="display:inline-block"></div>
                <p id="recStatusText" style="color:var(--text3);margin-top:0.75rem;font-size:0.85rem;">İzleme geçmişin analiz ediliyor...</p>
            </div>`;
        mainContent.appendChild(recPlaceholder);
        (async () => {
            try {
                if (appSettings.aiEnabled && appSettings.aiApiKey) {
                    const stText = document.getElementById('recStatusText');
                    if (stText) stText.innerText = 'Yapay Zeka (AI) izleme zevkini analiz ediyor...';
                    
                    let watchHistoryText = '';
                    try {
                        const wlRes = await fetch(`${API_BASE}/mal/watchlist?username=${encodeURIComponent(malUser)}&status=completed`);
                        let wlData = await wlRes.json();
                        if (wlData && Array.isArray(wlData)) {
                            wlData.sort((a,b) => (b.score || 0) - (a.score || 0));
                            wlData = wlData.slice(0, 30);
                            watchHistoryText = wlData.map(a => `${a.title} (Puan: ${a.score})`).join(', ');
                        }
                    } catch(err) { console.log('MAL veri çekme hatası', err); }

                    if (watchHistoryText) {
                        const prompt = `Kullanıcının daha önce izlediği ve yüksek puan verdiği animeler şunlar: ${watchHistoryText}. Bu kullanıcının zevkini analiz ederek, ona İZLEMEDİĞİ ve ÇOK SEVECEĞİ 5 farklı anime öner. Sadece bir JSON array döndür. Format: [{"title":"Anime Adı","reason":"Neden önerdin kısaca"}]. Başka metin yazma, sadece saf JSON döndür.`;
                        const aiResponse = await callAIAPI(prompt);
                        let aiRecs = [];
                        if (aiResponse) {
                            try {
                                const cleanJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                                aiRecs = JSON.parse(cleanJson);
                            } catch (e) { console.error('AI JSON Parse Error', e); }
                        }
                        
                        if (aiRecs.length > 0) {
                            let recHtml = `<div class="nf-row">`;
                            aiRecs.forEach(rec => {
                                const safeTitle = rec.title.replace(/'/g, "\'");
                                recHtml += `
                                    <div class="nf-card ai-rec-card" onclick="searchAnimeByName('${safeTitle}')" style="border: 2px solid var(--accent); box-shadow: 0 0 15px rgba(139,92,246,0.3);">
                                        <div class="nf-card-score" style="background: var(--accent); color: white;"><i class="fa-solid fa-brain"></i> AI Önerisi</div>
                                        <div style="padding:1rem; height:100%; display:flex; flex-direction:column; justify-content:center; background: rgba(10,10,20,0.8);">
                                            <h3 style="font-size:16px; margin-bottom:8px; color:white;">${rec.title}</h3>
                                            <p style="font-size:13px; color:var(--text3); line-height:1.4;">${rec.reason}</p>
                                        </div>
                                    </div>
                                `;
                            });
                            recHtml += `</div>`;
                            recPlaceholder.innerHTML = `<h2 class="nf-section-title"><i class="fa-solid fa-wand-magic-sparkles"></i> ✨ Sana Özel Yapay Zeka Önerileri</h2>${recHtml}`;
                            return; // Başarılı
                        }
                    }
                }
                
                // Fallback (eski sistem)
                // const recRes = await fetch(`${API_BASE}/mal/recommendations?username=${encodeURIComponent(malUser)}`);
                const recRes = { json: async () => [] }; // Fallback cancelled to prevent 500 error
                const recData = await recRes.json();
                
                if (recData && recData.length > 0) {
                    const html = buildJikanCarouselHtml(recData, "✨ Sana Özel Öneriler");
                    recPlaceholder.outerHTML = html;
                } else {
                    recPlaceholder.outerHTML = '';
                }
            } catch (err) {
                console.error("Öneri hatası:", err);
                recPlaceholder.outerHTML = '';
            }
        })();
    }

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
        
        const synop = (a.synopsis || a.description || 'Açıklama bulunmuyor.').slice(0, 150) + '...';
        const releaseYear = a.year || (a.aired && a.aired.prop && a.aired.prop.from ? a.aired.prop.from.year : null) || '';
        
        return `<div class="prime-card prime-vertical" onclick="searchAnimeByName('${safeTitle}')">
            <div class="prime-img-wrap">
                <div class="nf-card-score" style="position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.8); padding:2px 6px; border-radius:4px; color:#f59e0b; font-size:12px; font-weight:700; z-index:2;"><i class="fa-solid fa-star"></i> ${score}</div>
                <img src="${img}" alt="${displayTitle}" loading="lazy" onerror="this.src='https://placehold.co/200x280/1a1a28/e8a020?text=?'">
            </div>
            <div class="prime-info">
                <div class="prime-title">${displayTitle}</div>
                
                <div class="prime-hover-content">
                    <div class="prime-actions" style="margin-bottom:8px;">
                        <div class="prime-btn play" onclick="event.stopPropagation();searchAnimeByName('${safeTitle}')" title="Detaylar"><i class="fa-solid fa-play"></i></div>
                        <div class="prime-btn" onclick="event.stopPropagation();toggleFavoriteFromId('${a.id || safeTitle}', this)" title="Favorilere Ekle"><i class="fa-solid fa-plus"></i></div>
                        <div class="prime-btn" style="margin-left: auto;" onclick="event.stopPropagation(); this.closest('.prime-card').classList.add('force-hide-hover'); setTimeout(() => { if(this.closest('.prime-card')) this.closest('.prime-card').classList.remove('force-hide-hover'); }, 1000);" title="Kapat"><i class="fa-solid fa-xmark"></i></div>
                    </div>
                    <div class="prime-meta" style="font-size:11px; margin-bottom:4px; color:var(--text3); display:flex; gap:6px; align-items:center;">
                        ${releaseYear ? `<span style="font-weight:700; color:#fff;">${releaseYear}</span>` : ''}
                        <span style="color:#a1a1aa;">${score} Puan</span>
                    </div>
                    <div class="prime-synopsis" style="font-size:10px; color: var(--text2);">
                        ${synop}
                    </div>
                </div>
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

async function renderContinueWatching() {
    const hist = getHistory();
    const statsEl = document.getElementById('homeStatsWidget');
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

    const items = Object.values(latestByAnime).sort((a, b) => {
        const aTime = a.lastWatchedAt || a.lastWatched || 0;
        const bTime = b.lastWatchedAt || b.lastWatched || 0;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
    }).slice(0, 12);

    const style = appSettings.cwStyle || 'poster';
    
    // Fetch TMDB for logos and total episodes
    const fetches = items.map(async (h) => {
        try {
            const t = h.title;
            const tmdbRes = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&query=${encodeURIComponent(t)}`);
            const tmdbData = await tmdbRes.json();
            if (tmdbData.results && tmdbData.results.length > 0) {
                const showId = tmdbData.results[0].id;
                const detailRes = await fetch(`https://api.themoviedb.org/3/tv/${showId}?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&append_to_response=images`);
                const detail = await detailRes.json();
                
                h.totalEpisodes = detail.number_of_episodes;
                
                if (detail.images && detail.images.logos && detail.images.logos.length > 0) {
                    const bestLogo = detail.images.logos.find(l => l.iso_639_1 === 'en') || detail.images.logos.find(l => l.iso_639_1 === 'ja') || detail.images.logos[0];
                    h.logoUrl = `https://image.tmdb.org/t/p/w500${bestLogo.file_path}`;
                }
            }
        } catch(e) {}
        return h;
    });
    await Promise.all(fetches);

    cwContainer.innerHTML = items.map(h => {
        const epKey = (h.slug || h.id) + '_s' + (h.sIdx || 0) + '_e' + (h.eIdx || 0);
        const savedSec = positions[epKey] || 0;
        const estimatedDuration = 1440;
        const progress = Math.min(100, Math.floor((savedSec / estimatedDuration) * 100));
        const epNum = (h.eIdx || 0) + 1;
        const resumeLabel = savedSec > 30
            ? `${h.lastWatchedLabel || 'Bölüm ' + epNum} · ${Math.floor(savedSec/60)}:${Math.floor(savedSec%60).toString().padStart(2,'0')}`
            : h.lastWatchedLabel || `Bölüm ${epNum}`;
        const safeTitle = (h.title||'').replace(/'/g,"&#39;");
        
        let coverImg = h.img || 'https://placehold.co/300x168/0c0c16/8b5cf6?text=?';
        let objectFit = 'cover';
        if (style === 'thumbnail' && h.kitsuThumb) {
            coverImg = h.kitsuThumb;
        } else if (style === 'logo' && h.logoUrl) {
            coverImg = h.logoUrl;
            objectFit = 'contain';
        }

        return `<div class="prime-card prime-vertical" onclick="resumeWatch('${h.id}')">
            <div class="prime-img-wrap">
                <img src="${h.img || coverImg}" alt="${safeTitle}" loading="lazy" onerror="this.src='https://placehold.co/200x280/1a1a28/e8a020?text=?'">
                <div class="nf-cw-progress" style="position:absolute; bottom:0; left:0; right:0; height:4px; background:rgba(255,255,255,0.2); z-index:3;"><div class="nf-cw-bar" style="height:100%; background:var(--accent); width:${progress}%"></div></div>
            </div>
            <div class="prime-info">
                <div class="prime-title">${h.title||'Bilinmiyor'}</div>
                
                <div class="prime-hover-content">
                    <div class="prime-actions" style="margin-bottom:8px;">
                        <div class="prime-btn play" onclick="event.stopPropagation();resumeWatch('${h.id}')" title="Devam Et"><i class="fa-solid fa-play"></i></div>
                        <div class="prime-btn" onclick="event.stopPropagation();toggleFavoriteFromId('${h.id}', this)" title="Favorilere Ekle"><i class="fa-solid fa-plus"></i></div>
                        <div class="prime-btn" style="margin-left: auto;" onclick="event.stopPropagation(); this.closest('.prime-card').classList.add('force-hide-hover'); setTimeout(() => { if(this.closest('.prime-card')) this.closest('.prime-card').classList.remove('force-hide-hover'); }, 1000);" title="Kapat"><i class="fa-solid fa-xmark"></i></div>
                    </div>
                    <div class="prime-meta" style="font-size:11px; margin-bottom:4px; color:var(--text3); display:flex; gap:6px; align-items:center;">
                        <span style="font-weight:700; color:#fff;">${resumeLabel}</span>
                    </div>
                </div>
            </div>
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
                    <button class="quick-wl-btn" onclick="event.stopPropagation();openAddToListModal({id:'${id}',title:'${attrTitle}',img:'${attrImg}',slug:'${attrSlug}'})" title="Listeye Ekle" title="Listeye Ekle"><i class="fa-solid fa-bookmark"></i></button>
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

function _oldToggleWatchlistFromWatch() {
    if (!currentAnime.id) return;
    toggleWatchlistItem({ id: currentAnime.id, title: currentAnime.title, img: currentAnime.img, slug: currentAnime.slug });
}

function updateWatchlistButton() {
    const btn = document.getElementById('watchWatchlistBtn');
    if (!btn || !currentAnime.id) return;
    const isInWatchlist = getWatchlist().some(a => String(a.id) === String(currentAnime.id));
    btn.innerHTML = isInWatchlist ? '<i class="fa-solid fa-bookmark"></i> Listede' : '<i class="fa-regular fa-bookmark"></i> Liste';
}


// ══════════════════════════════════════
// PAGE-WIDE MODAL HELPERS
// ══════════════════════════════════════
function openPgModal(html) {
    let overlay = document.getElementById('pgModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'pgModalOverlay';
        overlay.onclick = (e) => { if (e.target === overlay) closePgModal(); };
        document.body.appendChild(overlay);
    }
    let modal = document.getElementById('pgModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pgModal';
        overlay.appendChild(modal);
    }
    modal.innerHTML = html;
    overlay.classList.add('pg-open');
    // ESC to close
    const escH = (e) => { if (e.key === 'Escape') { closePgModal(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);
}

function closePgModal() {
    const overlay = document.getElementById('pgModalOverlay');
    if (overlay) {
        overlay.classList.remove('pg-open');
    }
}
window.closePgModal = closePgModal;
window.openPgModal = openPgModal;

function showWatchlist() {
    closePgModal();
    const list = getWatchlist();
    
    const grid = list.length
        ? list.map((a, idx) => {
            const t = (a.title || 'Bilinmiyor').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const img = a.img || 'https://placehold.co/170x250/1a1a28/8b5cf6?text=?';
            const slug = (a.slug || '').replace(/'/g, '&#39;');
            const id = a.id || '';
            return `<div class="pg-card" onclick="closePgModal();loadDetails('${id}','${slug}',${a.isMovie||false},'${t}','','${img}')">
                <div class="pg-card-num">${idx + 1}</div>
                <div class="pg-card-poster-wrap">
                    <img class="pg-card-poster" src="${img}" alt="${t}" onerror="this.src='https://placehold.co/170x250/1a1a28/8b5cf6?text=?'">
                    <div class="pg-card-play-icon"><i class="fa-solid fa-play"></i></div>
                </div>
                <div class="pg-card-info">
                    <div class="pg-card-title">${t}</div>
                    <div class="pg-card-meta"><i class="fa-solid fa-tv"></i> Anime</div>
                </div>
                <button class="pg-card-remove" title="Listeden Kaldır" onclick="event.stopPropagation();toggleWatchlistItem({id:'${id}',title:'${t}',img:'${img}',slug:'${slug}'});showWatchlist()">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>`;
        }).join('')
        : '<div class="pg-empty"><i class="fa-solid fa-bookmark"></i><p>İzleme listeniz boş.</p><small>Kart üzerindeki 🔖 ikonu ile ekleyebilirsiniz.</small></div>';

    const totalCount = list.length;
    openPgModal(`
        <div class="pg-modal-header">
            <div class="pg-modal-title-group">
                <div class="pg-modal-icon"><i class="fa-solid fa-bookmark"></i></div>
                <div>
                    <h2 class="pg-modal-title">İzleme Listem</h2>
                    <span class="pg-modal-subtitle">${totalCount} anime</span>
                </div>
            </div>
            <div class="pg-modal-actions">
                ${totalCount > 0 ? `
                <select class="pg-sort-select" onchange="sortWatchlist(this.value)">
                    <option value="default">📋 Sıralama</option>
                    <option value="az">🔤 A → Z</option>
                    <option value="za">🔤 Z → A</option>
                </select>
                <button class="pg-danger-btn" onclick="if(confirm('Tüm liste silinsin mi?')){saveWatchlist([]);showWatchlist();}">
                    <i class="fa-solid fa-trash"></i> Temizle
                </button>` : ''}
                <button class="pg-close-btn" onclick="closePgModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="pg-modal-grid">${grid}</div>
    `);

    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    if (document.querySelectorAll('.mobile-nav-btn')[2]) document.querySelectorAll('.mobile-nav-btn')[2].classList.add('active');
}

window.sortWatchlist = function(mode) {
    let list = getWatchlist();
    if (mode === 'az') list = [...list].sort((a,b) => (a.title||'').localeCompare(b.title||''));
    if (mode === 'za') list = [...list].sort((a,b) => (b.title||'').localeCompare(a.title||''));
    saveWatchlist(list);
    showWatchlist();
};


// ══════════════════════════════════════════════════════════
// LİSTELERİM SİSTEMİ
// ══════════════════════════════════════════════════════════

function generateListId() {
    return 'lst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

const getMyLists = () => ls.get('anitr_my_lists', []);
const saveMyLists = (v) => ls.set('anitr_my_lists', v);

// ── Ana Listelerim Sayfası ─────────────────────────────────
function showMyLists() {
    closePgModal();
    const lists = getMyLists();

    const totalItems = lists.reduce((sum, l) => sum + (l.animes || []).length, 0);

    const gridHtml = lists.length === 0
        ? `<div class="ml-empty">
            <div class="ml-empty-icon"><i class="fa-solid fa-layer-group"></i></div>
            <h3>Henüz listen yok</h3>
            <p>İlk listeni oluşturup içerik eklemeye başla.</p>
            <button class="ml-create-first-btn" onclick="createListModal()">
                <i class="fa-solid fa-plus"></i> İlk listeyi oluştur
            </button>
        </div>`
        : `<div class="ml-grid" id="myListsGrid">
            ${lists.map((lst, i) => buildListCard(lst, i)).join('')}
        </div>`;

    openPgModal(`
        <div class="pg-modal-header">
            <div class="pg-modal-title-group">
                <div class="pg-modal-icon"><i class="fa-solid fa-layer-group"></i></div>
                <div>
                    <h2 class="pg-modal-title">Listelerim</h2>
                    <span class="pg-modal-subtitle">${lists.length} liste · ${totalItems} içerik</span>
                </div>
            </div>
            <div class="pg-modal-actions">
                <select class="pg-sort-select" onchange="sortMyLists(this.value)" id="myListsSortSelect">
                    <option value="updated">Son Güncellenen</option>
                    <option value="az">A → Z</option>
                    <option value="count">Anime Sayısı</option>
                </select>
                <button class="ml-new-btn" onclick="createListModal()">
                    <i class="fa-solid fa-plus"></i> Yeni Liste
                </button>
                <button class="pg-close-btn" onclick="closePgModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="ml-body">${gridHtml}</div>
    `);

    // Animate cards on open
    setTimeout(() => {
        document.querySelectorAll('.ml-card').forEach((card, i) => {
            card.style.animationDelay = `${i * 60}ms`;
            card.classList.add('ml-card-enter');
        });
    }, 50);

    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
}

function buildListCard(lst, idx) {
    const animes = lst.animes || [];
    const count = animes.length;
    const covers = animes.slice(0, 4).map(a => a.img || 'https://placehold.co/100x140/1a1a28/8b5cf6?text=?');
    while (covers.length < 4) covers.push('');

    const collageHtml = `
        <div class="ml-card-collage">
            ${covers.map((c, ci) => c
                ? `<img src="${c}" loading="lazy" onerror="this.style.background='rgba(139,92,246,0.15)'">`
                : `<div class="ml-card-placeholder"><i class="fa-solid fa-image"></i></div>`
            ).join('')}
        </div>`;

    const safeId = lst.id;
    const safeName = (lst.name || '').replace(/'/g, "&#39;").replace(/"/g, "&quot;");

    return `<div class="ml-card" onclick="showListDetail('${safeId}')">
        ${collageHtml}
        <div class="ml-card-info">
            <div class="ml-card-name">${lst.name || 'İsimsiz Liste'}</div>
            <div class="ml-card-meta"><i class="fa-solid fa-tv"></i> ${count} anime</div>
        </div>
        <div class="ml-card-actions" onclick="event.stopPropagation()">
            <button class="ml-card-menu-btn" onclick="toggleListMenu('${safeId}', event)">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
            <div class="ml-card-menu hidden" id="menu_${safeId}">
                <button onclick="renameListPrompt('${safeId}')"><i class="fa-solid fa-pen"></i> Düzenle</button>
                <button class="danger" onclick="deleteListConfirm('${safeId}')"><i class="fa-solid fa-trash"></i> Sil</button>
            </div>
        </div>
    </div>`;
}

window.toggleListMenu = function(id, e) {
    e.stopPropagation();
    const menu = document.getElementById('menu_' + id);
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    document.querySelectorAll('.ml-card-menu').forEach(m => m.classList.add('hidden'));
    if (isHidden) menu.classList.remove('hidden');
};

document.addEventListener('click', () => {
    document.querySelectorAll('.ml-card-menu').forEach(m => m.classList.add('hidden'));
});

window.sortMyLists = function(mode) {
    let lists = getMyLists();
    if (mode === 'az') lists = [...lists].sort((a, b) => (a.name||'').localeCompare(b.name||''));
    else if (mode === 'count') lists = [...lists].sort((a, b) => (b.animes||[]).length - (a.animes||[]).length);
    else lists = [...lists].sort((a, b) => (b.updatedAt||0) - (a.updatedAt||0));
    saveMyLists(lists);
    showMyLists();
};

// ── Liste Oluşturma Modal ─────────────────────────────────
function createListModal() {
    const overlay = document.createElement('div');
    overlay.className = 'ml-dialog-overlay';
    overlay.innerHTML = `
        <div class="ml-dialog" id="createListDialog">
            <div class="ml-dialog-icon"><i class="fa-solid fa-layer-group"></i></div>
            <h3>Yeni Liste Oluştur</h3>
            <input class="ml-dialog-input" id="newListName" type="text" placeholder="Liste adı..."
                maxlength="40" autofocus onkeydown="if(event.key==='Enter')confirmCreateList()">
            <div class="ml-dialog-btns">
                <button class="ml-dialog-cancel" onclick="this.closest('.ml-dialog-overlay').remove()">İptal</button>
                <button class="ml-dialog-confirm" onclick="confirmCreateList()">
                    <i class="fa-solid fa-check"></i> Oluştur
                </button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    setTimeout(() => document.getElementById('newListName')?.focus(), 100);
}

function confirmCreateList() {
    const nameEl = document.getElementById('newListName');
    const name = (nameEl?.value || '').trim();
    if (!name) { nameEl?.classList.add('shake'); setTimeout(() => nameEl?.classList.remove('shake'), 500); return; }

    const lists = getMyLists();
    lists.unshift({
        id: generateListId(),
        name,
        animes: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    saveMyLists(lists);
    document.querySelector('.ml-dialog-overlay')?.remove();
    showToast('✅ "' + name + '" listesi oluşturuldu!');
    showMyLists();
}

window.renameListPrompt = function(id) {
    const lists = getMyLists();
    const lst = lists.find(l => l.id === id);
    if (!lst) return;

    const overlay = document.createElement('div');
    overlay.className = 'ml-dialog-overlay';
    overlay.innerHTML = `
        <div class="ml-dialog" id="renameListDialog">
            <div class="ml-dialog-icon"><i class="fa-solid fa-pen"></i></div>
            <h3>Listeyi Düzenle</h3>
            <input class="ml-dialog-input" id="renameListInput" type="text" value="${(lst.name||'').replace(/"/g,'')}"
                maxlength="40" onkeydown="if(event.key==='Enter')confirmRenameList('${id}')">
            <div class="ml-dialog-btns">
                <button class="ml-dialog-cancel" onclick="this.closest('.ml-dialog-overlay').remove()">İptal</button>
                <button class="ml-dialog-confirm" onclick="confirmRenameList('${id}')">
                    <i class="fa-solid fa-check"></i> Kaydet
                </button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    setTimeout(() => { const el = document.getElementById('renameListInput'); if(el){el.focus();el.select();} }, 100);
};

window.confirmRenameList = function(id) {
    const el = document.getElementById('renameListInput');
    const name = (el?.value || '').trim();
    if (!name) return;
    const lists = getMyLists();
    const lst = lists.find(l => l.id === id);
    if (lst) { lst.name = name; lst.updatedAt = Date.now(); saveMyLists(lists); }
    document.querySelector('.ml-dialog-overlay')?.remove();
    showToast('✅ Liste adı güncellendi!');
    showMyLists();
};

window.deleteListConfirm = function(id) {
    const lists = getMyLists();
    const lst = lists.find(l => l.id === id);
    if (!lst) return;

    const overlay = document.createElement('div');
    overlay.className = 'ml-dialog-overlay';
    overlay.innerHTML = `
        <div class="ml-dialog">
            <div class="ml-dialog-icon danger-icon"><i class="fa-solid fa-trash"></i></div>
            <h3>Listeyi Sil</h3>
            <p style="color:var(--text3);text-align:center;font-size:14px;margin-bottom:1.5rem">
                "<b>${lst.name}</b>" silinecek. Bu işlem geri alınamaz.
            </p>
            <div class="ml-dialog-btns">
                <button class="ml-dialog-cancel" onclick="this.closest('.ml-dialog-overlay').remove()">İptal</button>
                <button class="ml-dialog-confirm danger-confirm" onclick="confirmDeleteList('${id}')">
                    <i class="fa-solid fa-trash"></i> Sil
                </button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
};

window.confirmDeleteList = function(id) {
    let lists = getMyLists();
    lists = lists.filter(l => l.id !== id);
    saveMyLists(lists);
    document.querySelector('.ml-dialog-overlay')?.remove();
    showToast('🗑️ Liste silindi.');
    showMyLists();
};

// ── Liste Detayı ──────────────────────────────────────────
function showListDetail(id) {
    const lists = getMyLists();
    const lst = lists.find(l => l.id === id);
    if (!lst) return;

    const animes = lst.animes || [];
    const safeName = (lst.name || '').replace(/"/g, '&quot;');

    const cardsHtml = animes.length === 0
        ? `<div class="pg-empty">
            <i class="fa-solid fa-film"></i>
            <p>Bu listede henüz anime yok.</p>
            <small>Anime detay sayfasından "Listele" butonuyla ekleyebilirsin.</small>
        </div>`
        : animes.map((a, idx) => {
            const t = (a.title||'Bilinmiyor').replace(/'/g,"&#39;").replace(/"/g,"&quot;");
            const img = a.img || 'https://placehold.co/170x250/1a1a28/8b5cf6?text=?';
            const slug = (a.slug||'').replace(/'/g,"&#39;");
            return `<div class="pg-card ml-detail-card" onclick="closePgModal();loadDetails('${a.id}','${slug}',${a.isMovie||false},'${t}','','${img}')">
                <div class="pg-card-num">${idx+1}</div>
                <div class="pg-card-poster-wrap">
                    <img class="pg-card-poster" src="${img}" alt="${t}" onerror="this.src='https://placehold.co/170x250/1a1a28/8b5cf6?text=?'">
                    <div class="pg-card-play-icon"><i class="fa-solid fa-play"></i></div>
                </div>
                <div class="pg-card-info">
                    <div class="pg-card-title">${t}</div>
                    <div class="pg-card-meta"><i class="fa-solid fa-tv"></i> Anime</div>
                </div>
                <button class="pg-card-remove" title="Listeden Kaldır" onclick="event.stopPropagation();removeAnimeFromList('${id}','${a.id}')">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>`;
        }).join('');

    openPgModal(`
        <div class="pg-modal-header">
            <div class="pg-modal-title-group">
                <button class="ml-back-btn" onclick="showMyLists()"><i class="fa-solid fa-arrow-left"></i></button>
                <div class="pg-modal-icon"><i class="fa-solid fa-list-ul"></i></div>
                <div>
                    <h2 class="pg-modal-title">${safeName}</h2>
                    <span class="pg-modal-subtitle">${animes.length} anime</span>
                </div>
            </div>
            <div class="pg-modal-actions">
                <button class="pg-close-btn" onclick="closePgModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="pg-modal-grid">${cardsHtml}</div>
    `);

    setTimeout(() => {
        document.querySelectorAll('.ml-detail-card').forEach((card, i) => {
            card.style.animationDelay = `${i * 40}ms`;
            card.classList.add('ml-card-enter');
        });
    }, 50);
}

window.removeAnimeFromList = function(listId, animeId) {
    const lists = getMyLists();
    const lst = lists.find(l => l.id === listId);
    if (!lst) return;
    lst.animes = (lst.animes || []).filter(a => String(a.id) !== String(animeId));
    lst.updatedAt = Date.now();
    saveMyLists(lists);
    showListDetail(listId);
    showToast('🗑️ Anime listeden kaldırıldı.');
};

// ── Anime Listeye Ekle Modal ───────────────────────────────
function openAddToListModal(anime) {
    const lists = getMyLists();
    const overlay = document.createElement('div');
    overlay.className = 'ml-dialog-overlay';
    overlay.id = 'addToListOverlay';

    const listItems = lists.length === 0
        ? `<div style="text-align:center;padding:1.5rem;color:var(--text3);font-size:13px;">
            Henüz liste yok. Önce bir liste oluştur.
          </div>`
        : lists.map(lst => {
            const inList = (lst.animes || []).some(a => String(a.id) === String(anime.id));
            const covers = (lst.animes || []).slice(0, 2).map(a => a.img).filter(Boolean);
            return `<div class="ml-pick-item ${inList ? 'in-list' : ''}" onclick="toggleAnimeInList('${lst.id}', event)"
                data-id="${lst.id}">
                <div class="ml-pick-covers">
                    ${covers[0] ? `<img src="${covers[0]}">` : '<div class="ml-pick-empty-cover"><i class="fa-solid fa-layer-group"></i></div>'}
                </div>
                <div class="ml-pick-info">
                    <div class="ml-pick-name">${lst.name}</div>
                    <div class="ml-pick-count">${(lst.animes||[]).length} anime</div>
                </div>
                <div class="ml-pick-check ${inList ? 'checked' : ''}">
                    <i class="fa-solid fa-check"></i>
                </div>
            </div>`;
        }).join('');

    overlay.innerHTML = `
        <div class="ml-dialog ml-pick-dialog">
            <div class="ml-dialog-icon"><i class="fa-solid fa-layer-group"></i></div>
            <h3>Listeye Ekle</h3>
            <p class="ml-pick-anime-name">${(anime.title||'').slice(0,40)}</p>
            <div class="ml-pick-list">${listItems}</div>
            <div class="ml-dialog-btns" style="margin-top:1rem">
                <button class="ml-dialog-cancel" onclick="document.getElementById('addToListOverlay').remove()">Kapat</button>
                <button class="ml-dialog-confirm" onclick="createListModal();document.getElementById('addToListOverlay').remove()">
                    <i class="fa-solid fa-plus"></i> Yeni Liste
                </button>
            </div>
        </div>`;

    overlay._anime = anime;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

window.toggleAnimeInList = function(listId, e) {
    const overlay = document.getElementById('addToListOverlay');
    if (!overlay || !overlay._anime) return;
    const anime = overlay._anime;
    const lists = getMyLists();
    const lst = lists.find(l => l.id === listId);
    if (!lst) return;

    const idx = (lst.animes || []).findIndex(a => String(a.id) === String(anime.id));
    if (idx === -1) {
        lst.animes = lst.animes || [];
        lst.animes.push({ id: anime.id, title: anime.title, img: anime.img, slug: anime.slug, isMovie: anime.isMovie });
        lst.updatedAt = Date.now();
        showToast(`✅ "${anime.title}" listene eklendi!`);
    } else {
        lst.animes.splice(idx, 1);
        lst.updatedAt = Date.now();
        showToast(`🗑️ "${anime.title}" listeden kaldırıldı.`);
    }
    saveMyLists(lists);

    // Update UI
    const item = e?.currentTarget || document.querySelector(`[data-id="${listId}"]`);
    if (item) {
        item.classList.toggle('in-list');
        const check = item.querySelector('.ml-pick-check');
        if (check) check.classList.toggle('checked');
        const countEl = item.querySelector('.ml-pick-count');
        if (countEl) countEl.textContent = `${lst.animes.length} anime`;
    }
};

// Watch view'dan "Listele" butonu
function openAddToListFromWatch() {
    if (!currentAnime) return;
    openAddToListModal({
        id: currentAnime.id,
        title: currentAnime.title,
        img: currentAnime.img,
        slug: currentAnime.slug,
        isMovie: currentAnime.isMovie
    });
}

// Detail page "Listeye Ekle" butonu
window.openAddToListFromDetail = function(id, slug, isMovie, title, img) {
    openAddToListModal({ id, slug, isMovie: isMovie === 'true' || isMovie === true, title, img });
};

window.showMyLists = showMyLists;
window.createListModal = createListModal;
window.confirmCreateList = confirmCreateList;
window.showListDetail = showListDetail;
window.openAddToListModal = openAddToListModal;
window.openAddToListFromWatch = openAddToListFromWatch;

// ── Random Anime (Yeni Özellik 4) ────────────────────────
async function loadRandom() {
    showToast('🎲 Rastgele anime aranıyor...');
    try {
        // Rastgele sayfa numarası (Popüler olanlardan rastgele seçmek için ilk 10 sayfadan)
        const randomPage = Math.floor(Math.random() * 10) + 1;
        const query = `
        query {
          Page(page: ${randomPage}, perPage: 50) {
            media(type: ANIME, sort: POPULARITY_DESC) {
              title { romaji english }
            }
          }
        }`;
        const data = await fetchAniList(query);
        if (data && data.Page && data.Page.media && data.Page.media.length > 0) {
            const randomAnime = data.Page.media[Math.floor(Math.random() * data.Page.media.length)];
            const title = randomAnime.title.romaji || randomAnime.title.english;
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
    if (window.stxRender) window.stxRender();
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

let _catalogSearchQuery = '';
let _catalogSearchDebounce = null;

function setCatalogSource(src) {
    const sel = document.getElementById('catalogSourceFilter');
    if (sel) sel.value = src;
    document.querySelectorAll('.catalog-source-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.source === src);
    });
    var extra = document.getElementById('catalogExtraFilters');
    if (extra) extra.classList.toggle('hidden', src !== 'anilist');
    var si = document.getElementById('catalogSearchInput');
    if (si) si.value = '';
    _catalogSearchQuery = '';
    var clr = document.getElementById('catalogSearchClear');
    if (clr) clr.classList.add('hidden');
    applyFilters();
}

function onCatalogSearch(val) {
    _catalogSearchQuery = val.trim();
    var clr = document.getElementById('catalogSearchClear');
    if (clr) clr.classList.toggle('hidden', !_catalogSearchQuery);
    clearTimeout(_catalogSearchDebounce);
    _catalogSearchDebounce = setTimeout(function() {
        animeListPage = 1; hasMoreAnime = true;
        var grid = document.getElementById('animeListGrid');
        if (grid) grid.innerHTML = '';
        loadMoreAnime();
    }, 350);
}

window.setCatalogSource = setCatalogSource;
window.onCatalogSearch  = onCatalogSearch;

// ── ANILIST DESTEKLİ TÜM ANİMELER SAYFASI ──────────────────────

async function showAnimeListView() {
    showAnimeListViewContainer();
    var grid = document.getElementById('animeListGrid');
    if (grid) grid.innerHTML = '';
    animeListPage = 1; hasMoreAnime = true;
    _catalogSearchQuery = '';
    var si = document.getElementById('catalogSearchInput'); if (si) si.value = '';
    var clr = document.getElementById('catalogSearchClear'); if (clr) clr.classList.add('hidden');
    var src = (document.getElementById('catalogSourceFilter') || {}).value || 'anizium';
    document.querySelectorAll('.catalog-source-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.source === src);
    });
    var extra = document.getElementById('catalogExtraFilters');
    if (extra) extra.classList.toggle('hidden', src !== 'anilist');
    initializeFilters();
    var yf = document.getElementById('yearFilter'); if (yf) yf.value = '';
    var gf = document.getElementById('genreFilter'); if (gf) gf.value = '';
    var sf = document.getElementById('sortFilter'); if (sf) sf.value = 'POPULARITY_DESC';
    await loadMoreAnime();
}

function initializeFilters() {
    const yearSelect = document.getElementById('yearFilter');
    if (yearSelect && yearSelect.options.length <= 1) {
        yearSelect.innerHTML = '<option value="">Tüm Yıllar</option>';
        const currentYear = new Date().getFullYear() + 1;
        for (let y = currentYear; y >= 1990; y--) {
            yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
        }
    }

    const genreSelect = document.getElementById('genreFilter');
    if (genreSelect && genreSelect.options.length <= 1) {
        const genres = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Sci-Fi', 'Slice of Life', 'Sports', 'Mystery', 'Horror', 'Supernatural', 'Romance', 'Psychological', 'Thriller'];
        genreSelect.innerHTML = '<option value="">Tüm Türler</option>';
        genres.forEach(g => {
            genreSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
    }
}

function applyFilters() {
    animeListPage = 1;
    hasMoreAnime = true;
    const grid = document.getElementById('animeListGrid');
    if (grid) grid.innerHTML = '';
    loadMoreAnime();
}

function clearFilters() {
    document.getElementById('genreFilter').value = '';
    document.getElementById('yearFilter').value = '';
    document.getElementById('statusFilter').value = '';
    document.getElementById('sortFilter').value = 'POPULARITY_DESC';
    applyFilters();
}

async function loadMoreAnime() {
    if (isAnimeListLoading || !hasMoreAnime) return;

    isAnimeListLoading = true;
    const loader = document.getElementById('animeListLoader');
    const loadMoreBtn = document.getElementById('loadMoreAnimeBtn');
    const counter = document.getElementById('animeListCounter');
    const grid = document.getElementById('animeListGrid');

    if (loader) loader.classList.remove('hidden');
    if (loadMoreBtn) loadMoreBtn.classList.add('hidden');

    if (grid && animeListPage === 1) {
        grid.innerHTML = Array(15).fill(0).map(() => `
            <div style="background:rgba(255,255,255,0.04);border-radius:14px;overflow:hidden;animation:skeletonPulse 1.5s ease infinite;">
                <div style="height:200px;background:rgba(255,255,255,0.05);"></div>
                <div style="padding:10px;display:flex;flex-direction:column;gap:8px;">
                    <div class="skeleton" style="height:14px;width:80%;border-radius:6px;"></div>
                    <div class="skeleton" style="height:10px;width:50%;border-radius:6px;"></div>
                </div>
            </div>`).join('');
    }

    try {
        const catalogSource = document.getElementById('catalogSourceFilter')?.value || 'anizium';

        // ═══ ANIZIUM KATALOĞU ═══
        if (catalogSource === 'anizium') {
            const res = await fetch(`${API_BASE}/animes?platform=all&page=${animeListPage}`);
            const data = await res.json();

            if (animeListPage === 1 && grid) grid.innerHTML = '';

            if (data && data.page && data.page.data && data.page.data.length > 0) {
                hasMoreAnime = data.page.next_page !== null && data.page.next_page !== undefined;

                if (counter) {
                    const totalCount = data.total_anime || data.page.total || '1000+';
                    counter.innerHTML = `<i class="fa-solid fa-layer-group"></i> Anizium Kataloğu: <b style="color:var(--accent-light)">${totalCount}</b> Anime`;
                }

                const html = data.page.data.map(m => {
                    const title = m.name || 'Bilinmiyor';
                    const safeTitle = title.replace(/'/g, "&#39;");
                    const img = m.poster || m.banner || 'https://placehold.co/200x280/0c0c16/8b5cf6?text=?';
                    const score = m.imdb_point ? m.imdb_point : (m.quality ? m.quality.toUpperCase() : 'HD');
                    const sounds = (m.sound_group || []).map(s => s.name).join(', ') || (m.type === 'movie' ? 'Film' : 'Dizi');
                    const isMovie = m.type === 'movie';

                    return `
                    <div class="anime-card" onclick="searchAnimeByName('${safeTitle}')">
                        <div class="card-poster-wrap">
                            <img src="${img}" alt="${safeTitle}" class="card-poster" loading="lazy">
                            <div class="card-badge"><i class="fa-solid fa-star"></i> ${score}</div>
                            <div class="card-hover-overlay">
                                <button class="quick-play-btn"><i class="fa-solid fa-play"></i></button>
                            </div>
                        </div>
                        <div class="card-info" style="padding:10px;">
                            <div class="card-title" style="font-size:13px;line-height:1.3;margin-bottom:4px;" title="${safeTitle}">${title}</div>
                            <div style="font-size:11px;color:var(--text3);display:flex;justify-content:space-between;">
                                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;">${sounds}</span>
                                <span>${isMovie ? 'Film' : 'Dizi'}</span>
                            </div>
                        </div>
                    </div>`;
                }).join('');

                if (grid) grid.innerHTML += html;
                animeListPage++;
            } else {
                hasMoreAnime = false;
                if (animeListPage === 1 && grid) {
                    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--text3)">
                        <i class="fa-solid fa-database" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:1rem"></i>
                        Anizium'da anime bulunamadı.
                    </div>`;
                }
            }
            return;
        }

        // ═══ ANİMECİX KATALOĞU ═══
        if (catalogSource === 'animecix') {
            const searchQ = _catalogSearchQuery || '';
            let apiUrl;
            if (searchQ) {
                apiUrl = API_BASE + '/animecix-catalog?search=' + encodeURIComponent(searchQ) + '&limit=30';
            } else {
                apiUrl = API_BASE + '/animecix-catalog?page=' + animeListPage + '&limit=30';
            }
            try {
                const res  = await fetch(apiUrl);
                const data = await res.json();
                if (animeListPage === 1 && grid) grid.innerHTML = '';
                let items = []; let hasNext = false; let total = 0;
                if (searchQ) {
                    items   = Array.isArray(data) ? data : (data.results || data.titles || data.data || []);
                    hasNext = false; total = items.length;
                } else {
                    const pag = data.pagination || {};
                    items   = pag.data || [];
                    hasNext = (pag.current_page || 1) < (pag.last_page || 1);
                    total   = pag.total || 0;
                }
                if (items.length > 0) {
                    hasMoreAnime = hasNext;
                    if (counter) {
                        counter.innerHTML = '?? AnimeciX Kataloğu: <b style="color:var(--accent-light)">' + (total || items.length) + '</b> Anime';
                    }
                    const html = items.map(function(m) {
                        const title = m.name || m.title || 'Bilinmiyor';
                        const img   = m.poster || m.backdrop || m.cover || 'https://placehold.co/200x280/0c0c16/8b5cf6?text=?';
                        const score = m.vote_average ? m.vote_average.toFixed(1) : (m.rating ? String(m.rating) : '');
                        const year  = m.year || m.release_year || '';
                        const type  = m.is_movie ? 'Film' : 'Dizi';
                        const safeTitle = title.replace(/'/g, "&#39;");
                        return '<div class="anime-card" onclick="searchAnimeByName(\'' + safeTitle + '\')">' +
                            '<div class="card-poster-wrap">' +
                            '<img src="' + img + '" alt="' + safeTitle + '" class="card-poster" loading="lazy">' +
                            (score ? '<div class="card-badge"><i class="fa-solid fa-star"></i> ' + score + '</div>' : '') +
                            '<div class="card-hover-overlay"><button class="quick-play-btn"><i class="fa-solid fa-play"></i></button></div>' +
                            '</div>' +
                            '<div class="card-info" style="padding:10px;">' +
                            '<div class="card-title" style="font-size:13px;line-height:1.3;margin-bottom:4px;" title="' + safeTitle + '">' + title + '</div>' +
                            '<div style="font-size:11px;color:var(--text3);display:flex;justify-content:space-between;">' +
                            '<span>' + (year || 'AnimeciX') + '</span><span>' + type + '</span></div>' +
                            '</div></div>';
                    }).join('');
                    if (grid) grid.innerHTML += html;
                    if (!searchQ) animeListPage++;
                } else {
                    hasMoreAnime = false;
                    if (animeListPage === 1 && grid) {
                        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--text3)">' +
                            '<i class="fa-solid fa-database" style="font-size:2.5rem;opacity:0.3;display:block;margin-bottom:1rem"></i>' +
                            '<p>AnimeciX\'te anime bulunamadı.</p></div>';
                    }
                }
            } catch(ex) {
                console.error('[AnimeciX catalog]', ex);
                if (animeListPage === 1 && grid) {
                    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem;color:#f87171">' +
                        '<i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;display:block;margin-bottom:1rem"></i>' +
                        'AnimeciX bağlantı hatası: ' + ex.message + '</div>';
                }
            }
            return;
        }
        const genre = document.getElementById('genreFilter')?.value;
        const year = document.getElementById('yearFilter')?.value;
        const status = document.getElementById('statusFilter')?.value;
        const sort = document.getElementById('sortFilter')?.value || 'POPULARITY_DESC';

        let args = `page: ${animeListPage}, perPage: 25`;
        if (sort) args += `, sort: [${sort}]`;
        if (genre) args += `, genre: "${genre}"`;
        if (year) args += `, seasonYear: ${year}`;
        if (status) args += `, status: ${status.toUpperCase()}`;
        
        // Anime listesinde sadece animeleri göster
        args += `, type: ANIME`;

        const query = `
        query {
            Page(${args}) {
                pageInfo { total hasNextPage }
                media {
                    id
                    title { romaji english }
                    coverImage { large }
                    averageScore
                    episodes
                    status
                    genres
                    format
                }
            }
        }`;

        const data = await fetchAniList(query);
        
        if (animeListPage === 1 && grid) grid.innerHTML = '';

        if (data && data.Page && data.Page.media && data.Page.media.length > 0) {
            hasMoreAnime = data.Page.pageInfo.hasNextPage;
            
            if (counter) {
                counter.innerHTML = `<i class="fa-solid fa-layer-group"></i> Bulunan: <b style="color:var(--accent-light)">${data.Page.pageInfo.total}</b> Anime`;
            }

            const html = data.Page.media.map(m => {
                const title = m.title.romaji || m.title.english || 'Bilinmiyor';
                const safeTitle = title.replace(/'/g, "&#39;");
                const img = m.coverImage?.large || 'https://placehold.co/200x280/0c0c16/8b5cf6?text=?';
                const score = m.averageScore ? (m.averageScore / 10).toFixed(1) : '-';
                const eps = m.episodes ? `${m.episodes} Bölüm` : (m.status === 'RELEASING' || m.status === 'Currently Airing' ? 'Devam Ediyor' : 'Bilinmiyor');
                const isMovie = m.format === 'MOVIE';
                
                return `
                <div class="anime-card" onclick="searchAnimeByName('${safeTitle}')">
                    <div class="card-poster-wrap">
                        <img src="${img}" alt="${safeTitle}" class="card-poster" loading="lazy">
                        ${score !== '-' ? `<div class="card-badge"><i class="fa-solid fa-star"></i> ${score}</div>` : ''}
                        <div class="card-hover-overlay">
                            <button class="quick-play-btn"><i class="fa-solid fa-search"></i></button>
                        </div>
                    </div>
                    <div class="card-info" style="padding:10px;">
                        <div class="card-title" style="font-size:13px;line-height:1.3;margin-bottom:4px;">${title}</div>
                        <div style="font-size:11px;color:var(--text3);display:flex;justify-content:space-between;">
                            <span>${eps}</span>
                            <span>${isMovie ? 'Film' : 'TV'}</span>
                        </div>
                    </div>
                </div>`;
            }).join('');

            if (grid) grid.innerHTML += html;
            animeListPage++;
            
        } else {
            hasMoreAnime = false;
            if (animeListPage === 1 && grid) {
                grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--text3)">
                    <i class="fa-solid fa-database" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:1rem"></i>
                    Filtrelere uygun anime bulunamadı.
                </div>`;
            }
        }
    } catch (e) {
        console.error('[loadMoreAnime] ERROR:', e);
        if (animeListPage === 1 && grid) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem;color:#f87171">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;display:block;margin-bottom:1rem"></i>
                Bağlantı hatası: ${e.message}
            </div>`;
        }
        showToast('❌ Animeler yüklenirken hata oluştu.');
    } finally {
        isAnimeListLoading = false;
        if (loader) loader.classList.add('hidden');
        if (loadMoreBtn) {
            if (hasMoreAnime) loadMoreBtn.classList.remove('hidden');
            else loadMoreBtn.classList.add('hidden');
        }
    }
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
                    <button class="quick-wl-btn" onclick="event.stopPropagation();openAddToListModal({id:'${id}',title:'${attrTitle}',img:'${attrImg}',slug:'${attrSlug}'})" title="Listeye Ekle" title="Listeye Ekle"><i class="fa-solid fa-bookmark"></i></button>
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

// ══════════════════════════════════════════════════════════════
// BİLDİRİM PANELİ (Notification Panel)
// ══════════════════════════════════════════════════════════════

var _notifPanelOpen = false;
var _notifFollowedList = JSON.parse(localStorage.getItem('anitr_notif_followed') || '[]');
var _notifReadIds      = JSON.parse(localStorage.getItem('anitr_notif_read')     || '[]');
var _notifAlerts       = [];           // Yeni bölüm uyarıları (AniList schedule)
var _notifUpcoming     = [];           // Geri sayım listesi
var _notifCurrentTab   = 'alerts';

function _saveNotifFollowed() {
    localStorage.setItem('anitr_notif_followed', JSON.stringify(_notifFollowedList));
}
function _saveNotifRead() {
    localStorage.setItem('anitr_notif_read', JSON.stringify(_notifReadIds.slice(-200)));
}

/* Paneli aç / kapat */
function toggleNotifPanel(e) {
    if (e) e.stopPropagation();
    var panel = document.getElementById('notifPanel');
    if (!panel) return;
    _notifPanelOpen = !_notifPanelOpen;
    panel.classList.toggle('hidden', !_notifPanelOpen);
    if (_notifPanelOpen) {
        _notifRenderCurrentTab();
        _notifMarkVisibleRead();
        // Dışarı tıklayınca kapat
        setTimeout(function() {
            document.addEventListener('click', _notifOutsideClick, { once: true });
        }, 10);
    }
}

function closeNotifPanel() {
    _notifPanelOpen = false;
    var panel = document.getElementById('notifPanel');
    if (panel) panel.classList.add('hidden');
}

function _notifOutsideClick(e) {
    var wrap = document.getElementById('notifBellWrap');
    if (wrap && !wrap.contains(e.target)) {
        closeNotifPanel();
    }
}

/* Sekme değiştir */
function switchNotifTab(tab, btn) {
    _notifCurrentTab = tab;
    document.querySelectorAll('.notif-tab').forEach(function(b) {
        b.classList.toggle('active', b === btn);
    });
    _notifRenderCurrentTab();
}

/* Mevcut sekmeyi render et */
function _notifRenderCurrentTab() {
    if (_notifCurrentTab === 'alerts')   _notifRenderAlerts();
    else if (_notifCurrentTab === 'upcoming') _notifRenderUpcoming();
    else if (_notifCurrentTab === 'followed') _notifRenderFollowed();
}

/* Yeni Bölümler sekmesi */
function _notifRenderAlerts() {
    var body = document.getElementById('notifPanelBody');
    if (!body) return;
    if (!_notifAlerts.length) {
        body.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>Yeni bölüm bildirimi yok.<br><small>Takip ettiğin animelerin yeni bölümleri burada görünecek.</small></p></div>';
        return;
    }
    body.innerHTML = _notifAlerts.map(function(a) {
        var read = _notifReadIds.indexOf(a.id) !== -1;
        return '<div class="notif-item' + (read ? ' notif-read' : '') + '" onclick="loadDetails(\'' + a.animeId + '\',\'' + a.slug + '\',' + (a.isMovie||false) + ',\'' + (a.title||'').replace(/'/g,"&#39;") + '\',\'\',\'' + (a.img||'') + '\')">' +
            '<div class="notif-item-img"><img src="' + (a.img || 'https://placehold.co/48x68/0c0c16/8b5cf6?text=?') + '" loading="lazy"></div>' +
            '<div class="notif-item-info">' +
                '<div class="notif-item-title">' + (a.title||'Bilinmiyor') + '</div>' +
                '<div class="notif-item-ep"><i class="fa-solid fa-play"></i> ' + (a.epLabel||'Yeni Bölüm') + '</div>' +
                '<div class="notif-item-time"><i class="fa-regular fa-clock"></i> ' + (a.timeStr||'') + '</div>' +
            '</div>' +
            (read ? '' : '<span class="notif-dot"></span>') +
        '</div>';
    }).join('');
}

/* Geri Sayım sekmesi */
function _notifRenderUpcoming() {
    var body = document.getElementById('notifPanelBody');
    if (!body) return;
    if (!_notifUpcoming.length) {
        body.innerHTML = '<div class="notif-empty"><i class="fa-solid fa-hourglass-half"></i><p>Geri sayım yok.<br><small>Yaklaşan bölümler burada görünecek.</small></p></div>';
        return;
    }
    var now = Date.now();
    body.innerHTML = _notifUpcoming.map(function(u) {
        var diff = u.airsAt - now;
        var timeLeft = diff > 0 ? _notifFormatCountdown(diff) : 'Yayınlandı!';
        return '<div class="notif-item">' +
            '<div class="notif-item-img"><img src="' + (u.img || 'https://placehold.co/48x68/0c0c16/8b5cf6?text=?') + '" loading="lazy"></div>' +
            '<div class="notif-item-info">' +
                '<div class="notif-item-title">' + (u.title||'Bilinmiyor') + '</div>' +
                '<div class="notif-item-ep"><i class="fa-solid fa-film"></i> ' + (u.epLabel||'') + '</div>' +
                '<div class="notif-item-time"><i class="fa-solid fa-hourglass-half"></i> ' + timeLeft + '</div>' +
            '</div></div>';
    }).join('');
}

/* Takip edilen animeler sekmesi */
function _notifRenderFollowed() {
    var body = document.getElementById('notifPanelBody');
    if (!body) return;
    var badge = document.getElementById('notifFollowedCountBadge');
    if (badge) badge.textContent = _notifFollowedList.length;
    if (!_notifFollowedList.length) {
        body.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-star"></i><p>Takip ettiğin anime yok.<br><small>Anime detay sayfasında 🔔 butonuna bas.</small></p></div>';
        return;
    }
    body.innerHTML = _notifFollowedList.map(function(a) {
        return '<div class="notif-item">' +
            '<div class="notif-item-img" style="cursor:pointer" onclick="loadDetails(\'' + a.id + '\',\'' + (a.slug||'') + '\',' + (a.isMovie||false) + ',\'' + (a.title||'').replace(/'/g,"&#39;") + '\',\'\',\'' + (a.img||'') + '\')"><img src="' + (a.img || 'https://placehold.co/48x68/0c0c16/8b5cf6?text=?') + '" loading="lazy"></div>' +
            '<div class="notif-item-info">' +
                '<div class="notif-item-title">' + (a.title||'Bilinmiyor') + '</div>' +
                '<div class="notif-item-ep" style="color:var(--text3)">Takip ediliyor</div>' +
            '</div>' +
            '<button class="notif-unfollow-btn" title="Takibi bırak" onclick="notifUnfollow(\'' + a.id + '\',event)"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>';
    }).join('');
}

/* Bir animeyi takibe al */
function notifFollow(id, slug, isMovie, title, img) {
    if (_notifFollowedList.some(function(a){ return a.id === id; })) return;
    _notifFollowedList.unshift({ id: id, slug: slug, isMovie: isMovie, title: title, img: img });
    _saveNotifFollowed();
    _notifUpdateBadge();
    if (typeof Swal !== 'undefined') {
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: '<b>' + title + '</b> takibe alındı', timer: 2000, showConfirmButton: false });
    }
}

/* Takibi bırak */
function notifUnfollow(id, e) {
    if (e) e.stopPropagation();
    _notifFollowedList = _notifFollowedList.filter(function(a){ return a.id !== id; });
    _saveNotifFollowed();
    _notifUpdateBadge();
    if (_notifCurrentTab === 'followed') _notifRenderFollowed();
}

/* Okundu badge'ini güncelle */
function _notifUpdateBadge() {
    var badge = document.getElementById('notifUnreadBadge');
    var followed = _notifFollowedList.length;
    var unreadAlerts = _notifAlerts.filter(function(a){ return _notifReadIds.indexOf(a.id) === -1; }).length;
    var total = unreadAlerts;
    if (badge) {
        badge.textContent = total;
        badge.classList.toggle('hidden', total === 0);
    }
    var followedBadge = document.getElementById('notifFollowedCountBadge');
    if (followedBadge) followedBadge.textContent = followed;
}

/* Görünür bildirimleri okundu işaretle */
function _notifMarkVisibleRead() {
    if (_notifCurrentTab !== 'alerts') return;
    var newIds = _notifAlerts.map(function(a){ return a.id; });
    newIds.forEach(function(id){
        if (_notifReadIds.indexOf(id) === -1) _notifReadIds.push(id);
    });
    _saveNotifRead();
    _notifUpdateBadge();
}

/* Tümünü okundu işaretle */
function markAllNotifsRead() {
    _notifAlerts.forEach(function(a){
        if (_notifReadIds.indexOf(a.id) === -1) _notifReadIds.push(a.id);
    });
    _saveNotifRead();
    _notifUpdateBadge();
    _notifRenderAlerts();
}

/* Masaüstü bildirim izni iste */
function requestBrowserNotifPermission() {
    if (!('Notification' in window)) {
        if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Tarayıcın bildirim desteklemiyor', timer: 3000, showConfirmButton: false });
        return;
    }
    Notification.requestPermission().then(function(perm) {
        var btn = document.getElementById('notifPermBtn');
        var banner = document.getElementById('notifPermBanner');
        if (perm === 'granted') {
            if (btn) { btn.innerHTML = '<i class="fa-solid fa-bell"></i>'; btn.title = 'Masaüstü Bildirimleri Açık'; }
            if (banner) banner.classList.add('hidden');
            if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Masaüstü bildirimleri açıldı!', timer: 2000, showConfirmButton: false });
        } else {
            if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'Bildirim izni reddedildi', timer: 3000, showConfirmButton: false });
        }
    });
}

/* Countdown formatter */
function _notifFormatCountdown(ms) {
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400); s %= 86400;
    var h = Math.floor(s / 3600);  s %= 3600;
    var m = Math.floor(s / 60);
    if (d > 0) return d + 'g ' + h + 's ' + m + 'dk';
    if (h > 0) return h + 's ' + m + 'dk';
    return m + 'dk';
}

/* AniList'ten yaklaşan bölümleri çek (sayfa yüklenince çağrılır) */
async function _notifFetchUpcoming() {
    try {
        var query = `query {
            Page(page:1,perPage:30) {
                airingSchedules(airingAt_greater: ${Math.floor(Date.now()/1000 - 3600)}, sort: TIME) {
                    id airingAt episode timeUntilAiring
                    media { id title { romaji native } coverImage { medium } isAdult }
                }
            }
        }`;
        var res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        var json = await res.json();
        var schedules = (json.data && json.data.Page && json.data.Page.airingSchedules) || [];
        _notifUpcoming = schedules.filter(function(s){ return !s.media.isAdult; }).map(function(s) {
            return {
                id: 'up_' + s.id,
                title: (s.media.title.romaji || s.media.title.native || 'Bilinmiyor'),
                img: (s.media.coverImage && s.media.coverImage.medium) || '',
                epLabel: s.episode + '. Bölüm',
                airsAt: s.airingAt * 1000,
                timeLeft: s.timeUntilAiring
            };
        });
        // Yaklaşan = önümüzdeki 24 saat
        var soon = _notifUpcoming.filter(function(u){ return u.airsAt - Date.now() < 86400000 && u.airsAt > Date.now(); });
        _notifAlerts = soon.map(function(u, idx) {
            return {
                id: 'al_' + u.id + '_' + idx,
                title: u.title, img: u.img,
                epLabel: u.epLabel,
                timeStr: _notifFormatCountdown(Math.max(0, u.airsAt - Date.now())) + ' kaldı',
                animeId: '', slug: '', isMovie: false
            };
        });
        _notifUpdateBadge();
    } catch(e) {
        // Sessizce hata yut
    }
}

// Sayfa yüklenince bildirimleri çek
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(_notifFetchUpcoming, 3000);
    // Bildirimleri her 10 dakikada bir güncelle
    setInterval(_notifFetchUpcoming, 600000);
    // İzin durumuna göre buton güncelle
    if ('Notification' in window && Notification.permission === 'granted') {
        var btn = document.getElementById('notifPermBtn');
        if (btn) { btn.innerHTML = '<i class="fa-solid fa-bell"></i>'; btn.title = 'Masaüstü Bildirimleri Açık'; }
        var banner = document.getElementById('notifPermBanner');
        if (banner) banner.classList.add('hidden');
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
window.toggleNotifPanel           = toggleNotifPanel;
window.closeNotifPanel            = closeNotifPanel;
window.switchNotifTab             = switchNotifTab;
window.markAllNotifsRead          = markAllNotifsRead;
window.requestBrowserNotifPermission = requestBrowserNotifPermission;
window.notifFollow                = notifFollow;
window.notifUnfollow              = notifUnfollow;

// ── Watchlist / History Views ──────────────────────────────
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
async function handleSearch(queryParam) {
    let q = queryParam;
    if (!q) {
        const li = document.getElementById('largeSearchInput');
        if (li) q = li.value.trim();
    }
    
    const li = document.getElementById('largeSearchInput');
    if (li) { li.value = ''; li.blur(); }

    if (!q) { loadHome(); return; }

    // 🥚 EASTER EGG
    if (q.toUpperCase().replace('İ', 'I') === 'ANITR' || q.toUpperCase() === 'ANİTR') {
        showEasterEgg();
        return;
    }

    showHomeView();
    if (typeof continueWatch !== 'undefined' && continueWatch) continueWatch.classList.add('hidden');
    
    const cHero = document.getElementById('cinematicHero');
    if (cHero) cHero.classList.add('hidden');
    
    showLoader();
    if (typeof mainContent !== 'undefined' && mainContent) {
        mainContent.innerHTML = `<section class="sr-wrap"><div class="sr-head"><div class="sr-head-text"><span class="sr-kicker"><i class="fa-solid fa-magnifying-glass fa-beat-fade"></i> Aranıyor</span><h2 class="sr-title">“<span>${_socEsc(q)}</span>”</h2></div></div><div class="sr-grid">${Array.from({length: 8}, (_, i) => `<div class="sr-card sr-skel" style="--i:${i}"><div class="sr-poster"></div><div class="sr-info"><div class="sr-skel-line"></div><div class="sr-skel-line short"></div></div></div>`).join('')}</div></section>`;
    }

    let data = null;
    const queryLower = q.toLowerCase();
    
    // 1. GitHub Source
    if (typeof appSettings !== 'undefined' && appSettings.homeDataSource === 'anitr') {
        try {
            const ghRes = await fetch('https://raw.githubusercontent.com/FOXYorj/anitr-web-api/main/index.php');
            const text = await ghRes.text();
            let cleanText = text;
            if (cleanText.includes('echo <<<JSON')) {
                cleanText = cleanText.split('echo <<<JSON')[1];
                if (cleanText.includes('JSON;')) cleanText = cleanText.split('JSON;')[0];
            }
            const ghData = JSON.parse(cleanText);
            let allAnimes = [];
            const extract = (obj) => {
                if (Array.isArray(obj)) allAnimes.push(...obj);
                else if (obj !== null && typeof obj === 'object') Object.values(obj).forEach(extract);
            };
            extract(ghData);
            
            data = allAnimes.filter(a => {
                const t = (a.title || a.title_english || a.name || '').toLowerCase();
                return t.includes(queryLower);
            });
            // Normalize for renderAnimeGrid
            data = data.map(a => {
                const imgUrl = a.images?.jpg?.image_url || a.image_url || a.Img || a.img || '';
                return {
                    Title: a.title || a.name || '',
                    TitleEnglish: a.title_english || '',
                    ImageURL: imgUrl.startsWith('/') ? 'https://raw.githubusercontent.com/FOXYorj/anitr-web-api/main' + imgUrl : imgUrl,
                    Score: a.score || a.Score || '-',
                    Type: a.type || a.Type || 'TV',
                    Year: a.year || a.Year || ''
                };
            });
        } catch(e) { console.error("GitHub search error:", e); }
    }
    
    // 2. Go Backend
    if (!data || data.length === 0) {
        data = await fetchAPI('/search?q=' + encodeURIComponent(q) + '&source=' + encodeURIComponent(typeof currentSource !== 'undefined' ? currentSource : ''));
    }
    
    // 3. Jikan Fallback
    if (!data || data.length === 0) {
        try {
            const res = await fetch('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(q) + '&limit=25');
            const json = await res.json();
            if (json.data && json.data.length > 0) {
                data = json.data.map(a => ({
                    Title: a.title || '',
                    TitleEnglish: a.title_english || '',
                    ImageURL: a.images?.jpg?.image_url || '',
                    Score: a.score || '-',
                    Type: a.type || 'TV',
                    Year: a.year || ''
                }));
            }
        } catch(e){}
    }

    hideLoader();
    renderSearchResults(data, q);
}

// ══ MODERN ARAMA SONUÇLARI ══
window._srState = { data: [], q: '', type: 'all', sort: 'relevance', view: 'grid' };

function _srNorm(a, i) {
    const g = a.Genres || a.genres || [];
    const typ = String(a.Type || a.type || '').toLowerCase();
    const isMovie = !!(a.IsMovie || a.isMovie || a.TitleType === 'movie' || a.titleType === 'movie' || typ === 'movie' || typ === 'film');
    const sc = parseFloat(a.Score || a.score);
    return {
        idx: i,
        id: a.ID || a.id || '',
        slug: a.Slug || a.slug || '',
        title: a.Title || a.title || 'Bilinmiyor',
        synopsis: (a.Synopsis || a.synopsis || '').replace(/\s+/g, ' '),
        img: a.ImageURL || a.Img || a.img || a.image_url || 'https://placehold.co/200x280/1a1a28/e8a020?text=?',
        isMovie,
        genres: Array.isArray(g) ? g.slice(0, 3) : [],
        score: isNaN(sc) ? null : sc,
        year: a.Year || a.year || ''
    };
}

function renderSearchResults(data, q) {
    if (!mainContent) return;
    if (!data || !Array.isArray(data) || !data.length) {
        mainContent.innerHTML = `
            <div class="sr-empty">
                <div class="sr-empty-icon"><i class="fa-solid fa-ghost"></i></div>
                <h3>"${_socEsc(q)}" için sonuç bulunamadı</h3>
                <p>Yazımı kontrol et veya farklı bir isim dene. İngilizce ya da Japonca adını da arayabilirsin.</p>
                <button class="sr-btn" onclick="loadHome()"><i class="fa-solid fa-house"></i> Ana Sayfaya Dön</button>
            </div>`;
        return;
    }
    _srState.data = data.map(_srNorm);
    _srState.q = q;
    _srState.type = 'all';
    _srState.sort = 'relevance';
    mainContent.innerHTML = `
        <section class="sr-wrap">
            <div class="sr-head">
                <div class="sr-head-text">
                    <span class="sr-kicker"><i class="fa-solid fa-magnifying-glass"></i> Arama Sonuçları</span>
                    <h2 class="sr-title">“<span>${_socEsc(q)}</span>”</h2>
                    <p class="sr-count" id="srCount"></p>
                </div>
                <div class="sr-head-actions">
                    <button class="sr-btn sr-btn-icon" onclick="srRandomPick()" title="Rastgele birini seç"><i class="fa-solid fa-dice"></i></button>
                    <div class="sr-seg">
                        <button class="sr-seg-btn active" id="srViewGrid" onclick="srSetView('grid')" title="Izgara"><i class="fa-solid fa-table-cells-large"></i></button>
                        <button class="sr-seg-btn" id="srViewList" onclick="srSetView('list')" title="Liste"><i class="fa-solid fa-list"></i></button>
                    </div>
                </div>
            </div>
            <div class="sr-toolbar">
                <div class="sr-chips" id="srChips">
                    <button class="sr-chip active" data-type="all" onclick="srSetType('all')">Tümü <b id="srN-all"></b></button>
                    <button class="sr-chip" data-type="series" onclick="srSetType('series')"><i class="fa-solid fa-tv"></i> Diziler <b id="srN-series"></b></button>
                    <button class="sr-chip" data-type="movie" onclick="srSetType('movie')"><i class="fa-solid fa-film"></i> Filmler <b id="srN-movie"></b></button>
                </div>
                <div class="sr-filter-box">
                    <i class="fa-solid fa-filter"></i>
                    <input type="text" id="srFilterInput" placeholder="Sonuçlarda filtrele..." oninput="srRender()">
                </div>
                <select class="sr-select" id="srSort" onchange="srSetSort(this.value)">
                    <option value="relevance">İlgililik</option>
                    <option value="az">A → Z</option>
                    <option value="za">Z → A</option>
                    <option value="score">Puana göre</option>
                    <option value="year">Yıla göre</option>
                </select>
            </div>
            <div id="srGrid" class="sr-grid"></div>
        </section>`;
    srRender();
}

window.srSetType = function(t) {
    _srState.type = t;
    document.querySelectorAll('#srChips .sr-chip').forEach(c => c.classList.toggle('active', c.dataset.type === t));
    srRender();
};
window.srSetSort = function(s) { _srState.sort = s; srRender(); };
window.srSetView = function(v) {
    _srState.view = v;
    document.getElementById('srViewGrid')?.classList.toggle('active', v === 'grid');
    document.getElementById('srViewList')?.classList.toggle('active', v === 'list');
    srRender();
};

function _srVisible() {
    const f = (document.getElementById('srFilterInput')?.value || '').toLowerCase().trim();
    let list = _srState.data.filter(a => {
        if (_srState.type === 'movie' && !a.isMovie) return false;
        if (_srState.type === 'series' && a.isMovie) return false;
        if (f && !(a.title.toLowerCase().includes(f) || a.genres.join(' ').toLowerCase().includes(f))) return false;
        return true;
    });
    const s = _srState.sort;
    if (s === 'az') list.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    else if (s === 'za') list.sort((a, b) => b.title.localeCompare(a.title, 'tr'));
    else if (s === 'score') list.sort((a, b) => (b.score || 0) - (a.score || 0));
    else if (s === 'year') list.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
    return list;
}

window.srRender = function() {
    const grid = document.getElementById('srGrid');
    if (!grid) return;
    const list = _srVisible();
    const all = _srState.data;
    const setN = (id, n) => { const e = document.getElementById(id); if (e) e.textContent = n; };
    setN('srN-all', all.length);
    setN('srN-series', all.filter(a => !a.isMovie).length);
    setN('srN-movie', all.filter(a => a.isMovie).length);
    const cnt = document.getElementById('srCount');
    if (cnt) cnt.textContent = list.length + ' sonuç gösteriliyor';

    grid.className = 'sr-grid ' + (_srState.view === 'list' ? 'is-list' : '');
    if (!list.length) {
        grid.innerHTML = '<div class="sr-none"><i class="fa-regular fa-face-frown"></i> Bu filtreyle eşleşen sonuç yok.</div>';
        return;
    }
    grid.innerHTML = list.map((a, i) => {
        const scoreBadge = a.score ? `<span class="sr-score"><i class="fa-solid fa-star"></i> ${a.score.toFixed(1)}</span>` : '';
        const tag = a.isMovie ? '<span class="sr-tag sr-tag-film">Film</span>' : '<span class="sr-tag">Dizi</span>';
        const genres = a.genres.length ? `<div class="sr-genres">${a.genres.map(g => `<span>${_socEsc(g)}</span>`).join('')}</div>` : '';
        const syn = a.synopsis ? `<p class="sr-syn">${_socEsc(a.synopsis.slice(0, 160))}${a.synopsis.length > 160 ? '…' : ''}</p>` : '';
        return `
        <article class="sr-card" style="--i:${Math.min(i, 24)}" onclick="srOpen(${a.idx})">
            <div class="sr-poster">
                <img src="${_socEsc(a.img)}" alt="${_socEsc(a.title)}" loading="lazy">
                <div class="sr-shine"></div>
                <div class="sr-badges">${tag}${scoreBadge}</div>
                <div class="sr-actions">
                    <button class="sr-act sr-act-play" onclick="event.stopPropagation();srPlay(${a.idx})" title="Hemen izle"><i class="fa-solid fa-play"></i></button>
                    <button class="sr-act" onclick="event.stopPropagation();srAddList(${a.idx})" title="Listeye ekle"><i class="fa-solid fa-bookmark"></i></button>
                </div>
            </div>
            <div class="sr-info">
                <h3 class="sr-name">${_socEsc(a.title)}</h3>
                <div class="sr-meta">${a.year ? `<span>${_socEsc(a.year)}</span>` : ''}${a.isMovie ? '<span>Film</span>' : ''}</div>
                ${genres}
                ${syn}
            </div>
        </article>`;
    }).join('');
};

function _srItem(i) { return _srState.data.find(a => a.idx === i); }
window.srOpen = function(i) {
    const a = _srItem(i); if (!a) return;
    loadDetails(a.id, a.slug, a.isMovie, a.title, a.synopsis, a.img);
};
window.srPlay = function(i) {
    const a = _srItem(i); if (!a) return;
    quickPlay(a.id, a.slug, a.isMovie, a.title, a.synopsis, a.img);
};
window.srAddList = function(i) {
    const a = _srItem(i); if (!a) return;
    openAddToListModal({ id: a.id, title: a.title, img: a.img, slug: a.slug });
};
window.srRandomPick = function() {
    const list = _srVisible(); if (!list.length) return;
    const a = list[Math.floor(Math.random() * list.length)];
    showToast('🎲 Rastgele seçim: ' + a.title);
    srOpen(a.idx);
};

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
    const q = (document.getElementById('largeSearchInput') || searchInput).value.trim();
    if (q.length < 2) { const ls = document.getElementById('largeSearchSuggestions'); if(ls) ls.classList.add('hidden'); return; }
    searchTimeout = setTimeout(async () => {
        const data = await fetchAPI('/search?q=' + encodeURIComponent(q) + '&source=' + encodeURIComponent(currentSource));
        if (!data || !Array.isArray(data) || !data.length) { const ls = document.getElementById('largeSearchSuggestions'); if(ls) ls.classList.add('hidden'); return; }
        const ls2 = document.getElementById('largeSearchSuggestions'); if(ls2) ls2.classList.remove('hidden');
        const lss = document.getElementById('largeSearchSuggestions'); if(lss) lss.innerHTML = data.slice(0, 6).map(a => {
            const safeTitle = (a.Title || a.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const imgUrl = a.ImageURL || a.image_url || a.Img || a.img || '';
            return '<div class="suggestion-item" onclick="handleSearch(\'' + safeTitle + '\')">' +
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
    closePgModal();
    const hist = getHistory();

    const grid = hist.length ? hist.map(h => {
        const t = (h.title || 'Bilinmiyor').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const img = h.img || 'https://placehold.co/170x250/1a1a28/8b5cf6?text=?';
        const slug = (h.slug || '').replace(/'/g, '&#39;');
        const id = h.id || '';
        const epLabel = h.lastWatchedLabel || 'Bölüm ' + ((h.eIdx || 0) + 1);
        const savedSec = getPositions()[(h.slug || h.id) + '_s' + (h.sIdx || 0) + '_e' + (h.eIdx || 0)] || 0;
        const progress = Math.min(100, Math.floor((savedSec / 1440) * 100));
        const minStr = Math.floor(savedSec / 60) + ':' + String(Math.floor(savedSec % 60)).padStart(2, '0');
        const dateStr = h.lastWatchedAt ? new Date(h.lastWatchedAt).toLocaleDateString('tr-TR') : '';

        return `<div class="pg-card" onclick="closePgModal();loadDetails('${id}','${slug}',${h.isMovie||false},'${t}','','${img}')">
            <div class="pg-card-poster-wrap">
                <img class="pg-card-poster" src="${img}" alt="${t}" onerror="this.src='https://placehold.co/170x250/1a1a28/8b5cf6?text=?'">
                <div class="pg-card-play-icon"><i class="fa-solid fa-play"></i></div>
                ${progress > 0 ? `<div class="pg-card-progress"><div class="pg-card-progress-fill" style="width:${progress}%"></div></div>` : ''}
            </div>
            <div class="pg-card-info">
                <div class="pg-card-title">${t}</div>
                <div class="pg-card-meta"><i class="fa-solid fa-play" style="color:var(--accent)"></i> ${epLabel}</div>
                ${savedSec > 0 ? `<div class="pg-card-time"><i class="fa-solid fa-clock"></i> ${minStr} (%${progress})</div>` : ''}
                ${dateStr ? `<div class="pg-card-date"><i class="fa-solid fa-calendar"></i> ${dateStr}</div>` : ''}
            </div>
            <button class="pg-card-play-btn" title="Devam Et" onclick="event.stopPropagation();closePgModal();resumeWatch('${id}')">
                <i class="fa-solid fa-play"></i>
            </button>
        </div>`;
    }).join('') : '<div class="pg-empty"><i class="fa-solid fa-clock-rotate-left"></i><p>İzleme geçmişiniz boş.</p></div>';

    openPgModal(`
        <div class="pg-modal-header">
            <div class="pg-modal-title-group">
                <div class="pg-modal-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
                <div>
                    <h2 class="pg-modal-title">İzleme Geçmişi</h2>
                    <span class="pg-modal-subtitle">${hist.length} kayıt</span>
                </div>
            </div>
            <div class="pg-modal-actions">
                ${hist.length > 0 ? `<button class="pg-danger-btn" onclick="if(confirm('Tüm geçmiş silinsin mi?')){saveHistory([]);showHistory();}">
                    <i class="fa-solid fa-trash"></i> Temizle
                </button>` : ''}
                <button class="pg-close-btn" onclick="closePgModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="pg-modal-grid">${grid}</div>
    `);
}

function showFavorites() {
    closePgModal();
    const favs = getFavorites();

    const grid = favs.length ? favs.map(a => {
        const t = (a.title || 'Bilinmiyor').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        const img = a.img || 'https://placehold.co/170x250/1a1a28/8b5cf6?text=?';
        const slug = (a.slug || '').replace(/'/g, '&#39;');
        const id = a.id || '';

        return `<div class="pg-card" onclick="closePgModal();loadDetails('${id}','${slug}',${a.isMovie||false},'${t}','','${img}')">
            <div class="pg-card-poster-wrap">
                <img class="pg-card-poster" src="${img}" alt="${t}" onerror="this.src='https://placehold.co/170x250/1a1a28/8b5cf6?text=?'">
                <div class="pg-card-play-icon"><i class="fa-solid fa-play"></i></div>
                <div class="pg-card-heart"><i class="fa-solid fa-heart"></i></div>
            </div>
            <div class="pg-card-info">
                <div class="pg-card-title">${t}</div>
                <div class="pg-card-meta"><i class="fa-solid fa-heart" style="color:#f43f5e"></i> Favori</div>
            </div>
            <button class="pg-card-remove" title="Favorilerden Kaldır" onclick="event.stopPropagation();toggleFavorite({id:'${id}',title:'${t}',img:'${img}',slug:'${slug}'});showFavorites()">
                <i class="fa-solid fa-heart-crack"></i>
            </button>
        </div>`;
    }).join('') : '<div class="pg-empty"><i class="fa-solid fa-heart"></i><p>Favori listeniz boş.</p><small>Anime sayfalarındaki ❤️ butonu ile ekleyebilirsiniz.</small></div>';

    openPgModal(`
        <div class="pg-modal-header">
            <div class="pg-modal-title-group">
                <div class="pg-modal-icon pg-modal-icon-red"><i class="fa-solid fa-heart"></i></div>
                <div>
                    <h2 class="pg-modal-title">Favorilerim</h2>
                    <span class="pg-modal-subtitle">${favs.length} anime</span>
                </div>
            </div>
            <div class="pg-modal-actions">
                ${favs.length > 0 ? `
                <select class="pg-sort-select" onchange="sortFavorites(this.value)">
                    <option value="default">📋 Sıralama</option>
                    <option value="az">🔤 A → Z</option>
                    <option value="za">🔤 Z → A</option>
                </select>
                <button class="pg-danger-btn" onclick="if(confirm('Tüm favoriler silinsin mi?')){saveFavorites([]);showFavorites();}">
                    <i class="fa-solid fa-trash"></i> Temizle
                </button>` : ''}
                <button class="pg-close-btn" onclick="closePgModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>
        <div class="pg-modal-grid">${grid}</div>
    `);

    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    if (document.querySelectorAll('.mobile-nav-btn')[3]) document.querySelectorAll('.mobile-nav-btn')[3].classList.add('active');
}

window.sortFavorites = function(mode) {
    let favs = getFavorites();
    if (mode === 'az') favs = [...favs].sort((a,b) => (a.title||'').localeCompare(b.title||''));
    if (mode === 'za') favs = [...favs].sort((a,b) => (b.title||'').localeCompare(a.title||''));
    saveFavorites(favs);
    showFavorites();
};

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
// Stüdyo logosu — Wikidata (P154 logo) üzerinden Wikimedia Commons'tan
async function _loadStudioLogo(malId, studioName) {
    const key = 'anitr_studio_logo2_' + studioName.toLowerCase();
    const apply = (url) => {
        const box = document.getElementById('dxStudioLogo');
        if (!box || !url) return;
        const im = new Image();
        im.alt = studioName;
        im.onload = () => { box.innerHTML = ''; box.appendChild(im); box.classList.add('has-img'); };
        im.src = url;
    };
    try {
        const c = localStorage.getItem(key);
        if (c !== null) { apply(c); return; }
    } catch (e) {}
    let url = '';
    try {
        const api = 'https://www.wikidata.org/w/api.php?origin=*&format=json&';
        const sr = await (await fetch(api + 'action=wbsearchentities&language=en&type=item&limit=8&search=' + encodeURIComponent(studioName))).json();
        const cands = (sr.search || []).filter(x => /anim|studio|production|company|film|entertainment/i.test(x.description || ''));
        if (cands.length) {
            const ids = cands.slice(0, 5).map(x => x.id).join('|');
            const ent = await (await fetch(api + 'action=wbgetentities&props=claims&ids=' + ids)).json();
            for (const c of cands) {
                const cl = ent.entities && ent.entities[c.id] && ent.entities[c.id].claims;
                if (!cl) continue;
                const pick = (cl.P154 || cl.P8972 || [])[0];
                const file = pick && pick.mainsnak && pick.mainsnak.datavalue && pick.mainsnak.datavalue.value;
                if (file) { url = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(file) + '?width=240'; break; }
            }
        }
    } catch (e) {}
    try { localStorage.setItem(key, url); } catch (e) {}
    apply(url);
}

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

    // AniList'ten Data Çek (Score, Tags, Native Title, Banner)
    const query = `
    query($search: String) {
        Media(search: $search, type: ANIME) {
            idMal
            id
            bannerImage
            averageScore
            seasonYear
            genres
            format
            episodes
            status
            duration
            season
            studios(isMain: true) { nodes { id name siteUrl } }
            title { native romaji english }
        }
    }`;
    let aniData = null;
    try {
        const d = await fetchAniList(query, { search: title });
        if (d && d.Media) aniData = d.Media;
    } catch(e) {}
    
    // TMDB'den Fanart/Logo Çek
    let logoUrl = null;
    try {
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&query=${encodeURIComponent(title)}`);
        const tmdbData = await tmdbRes.json();
        if (tmdbData.results && tmdbData.results.length > 0) {
            const tmdbId = tmdbData.results[0].id;
            const imgRes = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/images?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb`);
            const imgs = await imgRes.json();
            if (imgs.logos && imgs.logos.length > 0) {
                const bestLogo = imgs.logos.find(l => l.iso_639_1 === 'en') || imgs.logos.find(l => l.iso_639_1 === 'ja') || imgs.logos[0];
                logoUrl = `https://image.tmdb.org/t/p/w500${bestLogo.file_path}`;
            }
        }
        
        if (!logoUrl) {
            const tmdbMovieRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&query=${encodeURIComponent(title)}`);
            const tmdbMovieData = await tmdbMovieRes.json();
            if (tmdbMovieData.results && tmdbMovieData.results.length > 0) {
                const tmdbId = tmdbMovieData.results[0].id;
                const imgRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/images?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb`);
                const imgs = await imgRes.json();
                if (imgs.logos && imgs.logos.length > 0) {
                    const bestLogo = imgs.logos.find(l => l.iso_639_1 === 'en') || imgs.logos.find(l => l.iso_639_1 === 'ja') || imgs.logos[0];
                    logoUrl = `https://image.tmdb.org/t/p/w500${bestLogo.file_path}`;
                }
            }
        }
    } catch(e) {}
    
    const bannerUrl = (aniData && aniData.bannerImage) ? aniData.bannerImage : safeImg;
    const score = (aniData && aniData.averageScore) ? (aniData.averageScore / 10).toFixed(2) : '-';
    const year = (aniData && aniData.seasonYear) ? aniData.seasonYear : '';
    const tags = [];
    if (aniData && aniData.genres) {
        aniData.genres.slice(0, 2).forEach(g => {
            tags.push(`<span class="detail-cinematic-tag">${g.toUpperCase()}</span>`);
        });
    }
    const nativeTitle = (aniData && aniData.title && aniData.title.native) ? aniData.title.native : title;
    const _fmtMap = { TV: 'TV Serisi', TV_SHORT: 'Kısa TV', MOVIE: 'Film', SPECIAL: 'Özel', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Müzik' };
    const _stMap = { FINISHED: 'Tamamlandı', RELEASING: 'Devam Ediyor', NOT_YET_RELEASED: 'Yakında', CANCELLED: 'İptal', HIATUS: 'Ara Verildi', 'Currently Airing': 'Devam Ediyor', 'Finished Airing': 'Tamamlandı', 'Not yet aired': 'Yakında' };
    const studioName = (aniData && aniData.studios && aniData.studios.nodes && aniData.studios.nodes[0]) ? aniData.studios.nodes[0].name : '';
    window._animeMeta = window._animeMeta || {};
    window._animeMeta[String(id)] = { genres: (aniData && aniData.genres) || [], studio: studioName };
    const metaItems = [];
    if (aniData) {
        if (aniData.episodes) metaItems.push(['', 'Bölüm', aniData.episodes]);
        if (aniData.duration) metaItems.push(['', 'Dakika / Bölüm', aniData.duration]);
        if (aniData.format) metaItems.push(['', 'Format', _fmtMap[aniData.format] || aniData.format, 'txt']);
        if (aniData.status) metaItems.push(['', 'Durum', _stMap[aniData.status] || aniData.status, 'txt st-' + aniData.status.toLowerCase()]);
    }
    
    // Auto-translate synopsis
    let finalSynopsis = synopsis || 'Açıklama bulunmuyor.';
    if (finalSynopsis && finalSynopsis !== 'Açıklama bulunmuyor.') {
        finalSynopsis = await translateToTurkish(finalSynopsis);
    }
    const safeFinalSynopsis = finalSynopsis.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    mainContent.innerHTML = `
        <div class="detail-cinematic-hero">
            <div class="detail-cinematic-bg" style="background-image: url('${bannerUrl}')"></div>
            <div class="detail-cinematic-gradient"></div>
            
            <div class="detail-cinematic-content">
                <div class="detail-cinematic-tags">
                    <span class="detail-cinematic-tag score"><i class="fa-solid fa-star"></i> ${score}</span>
                    ${year ? `<span class="detail-cinematic-tag">${year}</span>` : ''}
                    ${tags.join('')}
                </div>
                
                ${logoUrl 
                    ? `<img class="detail-cinematic-logo" src="${logoUrl}" alt="${safeTitle}">`
                    : `<h1 class="detail-cinematic-title-fallback">${safeTitle}</h1>`
                }
                
                <div class="detail-cinematic-native-title">${nativeTitle}</div>

                <div class="dxp" id="dxMeta">
                    ${studioName ? `<div class="dxp-studio" id="dxStudio">
                        <div class="dxp-logo" id="dxStudioLogo"><span>${studioName.replace(/[^A-Za-z0-9ぁ-ヿ一-龯]/g,' ').trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase()}</span></div>
                        <div class="dxp-studio-txt"><small>Stüdyo</small><b>${studioName}</b></div>
                    </div>` : ''}
                    ${metaItems.map(m => `<div class="dxp-stat${m[3] ? ' ' + m[3] : ''}"><b>${m[2]}</b><small>${m[1]}</small></div>`).join('')}
                </div>
                
                <p class="detail-cinematic-synopsis">${safeFinalSynopsis} <a href="#" class="synopsis-more" onclick="this.parentElement.style.webkitLineClamp='unset'; this.style.display='none'; return false;">Daha fazla göster</a></p>
                
                <div class="detail-cinematic-actions">
                    ${histEntry ? 
                        `<button class="btn-play-primary" id="playBtn" onclick="resumeWatch('${id}')">
                            <span><i class="fa-solid fa-play"></i> Kaldığın Yerden Devam Et <em>Bölüm ${histEntry.ep}</em></span>
                        </button>` :
                        `<button class="btn-play-primary" onclick="const btn=document.getElementById('ep-btn-0'); if(btn) btn.click(); else alert('Lütfen aşağıdan bir bölüm seçin.');">
                            <span><i class="fa-solid fa-play"></i> İzle <i class="fa-solid fa-arrow-right" style="margin-left: 5px; font-size: 12px; opacity: 0.7;"></i></span>
                        </button>`
                    }
                    <button class="btn-ghost" onclick="toggleWatchlist('${id}', '${safeTitle}', '${safeImg}')">
                        ${isWL ? '<i class="fa-solid fa-circle-check" style="color:var(--accent)"></i> Listede' : '<i class="fa-regular fa-circle-check"></i> Listeme ekle'}
                    </button>
                    <button class="btn-ghost" onclick="openNoteModal()"><i class="fa-solid fa-star"></i> Puan ver</button>
                    <button class="btn-ghost" onclick="toggleFavorite('${id}', '${safeTitle}', '${safeImg}')">
                        ${isFav ? '<i class="fa-solid fa-heart" style="color:var(--accent)"></i> Favorilerde' : '<i class="fa-regular fa-heart"></i> Favorilere Ekle'}
                    </button>
                    <button class="btn-ghost" onclick="navigator.clipboard.writeText(window.location.href); alert('Bağlantı kopyalandı!')"><i class="fa-solid fa-share-nodes"></i> Paylaş</button>
                </div>
                
                <div class="detail-cinematic-links">
                    ${(aniData && aniData.idMal) ? `<a href="https://myanimelist.net/anime/${aniData.idMal}" target="_blank" class="btn-link"><img src="https://upload.wikimedia.org/wikipedia/commons/0/07/MyAnimeList_Logo.png" style="height:14px; width:auto; border-radius:3px;"> MyAnimeList <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; margin-left:4px;"></i></a>` : ''}
                    ${(aniData && aniData.id) ? `<a href="https://anilist.co/anime/${aniData.id}" target="_blank" class="btn-link"><img src="https://upload.wikimedia.org/wikipedia/commons/6/61/AniList_logo.svg" style="height:14px; width:auto;"> AniList <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px; margin-left:4px;"></i></a>` : ''}
                </div>
            </div>
        </div>
        <!-- SEASONS + EPISODES -->
        <div class="detail-body" style="padding: 2rem 4%; max-width: 1400px; margin: 0 auto; min-height: 50vh;">
            <div id="seasonTabs" class="season-tabs"></div>
            <div class="bulk-download-toolbar" id="bulkDownloadPanel">
                <div class="bulk-toolbar-left">
                    <button class="bulk-toggle-btn" id="bulkDownloadToggleBtn" onclick="toggleBulkMode()">
                        <i class="fa-solid fa-cloud-arrow-down"></i> Toplu İndir
                    </button>
                    <span class="bulk-count-label"><span id="bulkSelectedCount">0</span> bölüm seçildi</span>
                </div>
                <button class="bulk-start-btn hidden" id="bulkStartBtn" onclick="startBulkDownload()">
                    <i class="fa-solid fa-download"></i> Seçilenleri İndir
                </button>
            </div>
            <div id="episodesList" class="episodes-list"></div>
        </div>`


    hideLoader();
    if (studioName && aniData && aniData.idMal) _loadStudioLogo(aniData.idMal, studioName);

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

    // AniList API'den ekstra bilgileri çek (Trailer, Karakterler ve Öneriler)
    const extraInfoDiv = document.createElement('div');
    extraInfoDiv.id = 'aniListExtraInfo';
    extraInfoDiv.style.marginTop = '2rem';
    mainContent.appendChild(extraInfoDiv);

    const aniQuery = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        trailer { id site }
        characters(sort: ROLE, page: 1, perPage: 12) {
          edges {
            role
            node { name { full } image { large } }
          }
        }
        recommendations(page: 1, perPage: 15, sort: RATING_DESC) {
          edges {
            node {
              mediaRecommendation {
                title { romaji english }
                coverImage { large }
                averageScore
              }
            }
          }
        }
      }
    }`;

    fetchAniList(aniQuery, { search: title }).then(data => {
        if (!data || !data.Media) return;
        const media = data.Media;
        
        // Fragman Butonu
        if (media.trailer && media.trailer.site === 'youtube') {
            const actionsDiv = document.querySelector('.detail-actions');
            if (actionsDiv) {
                const trailerBtn = document.createElement('button');
                trailerBtn.className = 'btn-secondary';
                trailerBtn.innerHTML = '<i class="fa-brands fa-youtube" style="color:#ef4444"></i> Fragman İzle';
                trailerBtn.onclick = () => openTrailerModal(media.trailer.id);
                actionsDiv.appendChild(trailerBtn);
            }
        }

        let fullHtml = '';

        // Karakterler
        if (media.characters && media.characters.edges && media.characters.edges.length > 0) {
            fullHtml += '<h3 style="margin-bottom:1rem;"><i class="fa-solid fa-users"></i> Karakterler</h3><div class="cw-container" style="margin-bottom: 2rem;">';
            media.characters.edges.forEach(edge => {
                if (!edge.node) return;
                const imgUrl = edge.node.image?.large || 'https://placehold.co/60x80/1a1a28/8b5cf6?text=?';
                const name = edge.node.name?.full || 'Bilinmiyor';
                const role = edge.role || '';
                fullHtml += `
                    <div style="flex-shrink:0; text-align:center; width:80px;">
                        <img src="${imgUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; border:2px solid var(--border); margin-bottom:0.5rem;" alt="${name}">
                        <div style="font-size:0.75rem; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                        <div style="font-size:0.65rem; color:var(--text3);">${role}</div>
                    </div>
                `;
            });
            fullHtml += '</div>';
        }

        // Öneriler (Altta Benzer Animeler)
        if (media.recommendations && media.recommendations.edges && media.recommendations.edges.length > 0) {
            const recs = media.recommendations.edges.filter(e => e.node && e.node.mediaRecommendation);
            if (recs.length > 0) {
                fullHtml += '<h3 style="margin-bottom:1rem;"><i class="fa-solid fa-wand-magic-sparkles"></i> Bunu Sevenler Şunları da İzledi</h3><div class="cw-container" style="gap:1rem; padding-bottom:1rem;">';
                recs.forEach(edge => {
                    const rec = edge.node.mediaRecommendation;
                    const rTitle = rec.title.romaji || rec.title.english || 'Bilinmiyor';
                    const safeTitle = rTitle.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                    const imgUrl = rec.coverImage?.large || 'https://placehold.co/120x170/1a1a28/8b5cf6?text=?';
                    const score = rec.averageScore ? (rec.averageScore / 10).toFixed(1) : '-';
                    fullHtml += `
                        <div class="nf-card" style="width:130px; flex-shrink:0; cursor:pointer;" onclick="searchAnimeByName('${safeTitle}')">
                            <div class="nf-card-score"><i class="fa-solid fa-star"></i> ${score}</div>
                            <img class="nf-card-poster" src="${imgUrl}" alt="${safeTitle}" style="width:100%; height:190px; object-fit:cover;">
                            <div class="nf-card-overlay">
                                <button class="nf-card-play"><i class="fa-solid fa-search"></i></button>
                                <div class="nf-card-title">${rTitle}</div>
                            </div>
                        </div>
                    `;
                });
                fullHtml += '</div>';
            }
        }

        extraInfoDiv.innerHTML = fullHtml;
    });
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
    const sidebarButtons = Array.from(document.querySelectorAll('#watchEpisodesList .sep2-card'));
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
    const seasonArg = (seasonId !== undefined && seasonId !== null && seasonId !== 0) ? 'season_num=' + encodeURIComponent(seasonId) : '';
    const qs = [idArg, slugArg, seasonArg, 'source=' + encodeURIComponent(currentSource)].filter(Boolean).join('&');

    const epsData = await fetchAPI('/episodes?' + qs);
    hideLoader();

    currentSelectedSound = ''; // Başka animeye geçildiğinde önceki anlık seçimi sıfırla

        if (!epsData || !Array.isArray(epsData) || !epsData.length) {
        epsContainer.innerHTML = '<p style="color:var(--text3);padding:1rem">Bölüm bulunamadı.</p>';
        return;
    }

    // Local filtering by season if the API didn't filter it (e.g. AnimeciX returns all episodes)
    if (seasonId !== 0 && epsData.some(ep => ep.Season !== undefined)) {
        const filtered = epsData.filter(ep => parseInt(ep.Season) === parseInt(seasonId));
        currentEpisodes = filtered.length > 0 ? filtered : epsData;
    } else {
        currentEpisodes = epsData;
    }
    const watched   = getWatched();
    epsContainer.innerHTML = '';
    filterEpisodeList(document.getElementById('episodeFilterInput')?.value || '');

    // Play first episode button
    const playFirstBtn = document.getElementById('playBtn');
    if (playFirstBtn) {
        playFirstBtn.onclick = () => watchEpisode(id, slug, isMovie, epsData[0], parseInt(seasonId) || 0, 0, animeTitle, synopsis, imgUrl);
    }

    // Fetch Thumbnails (TVMaze First, then Kitsu)
    let kitsuEps = {};
    try {
        const tvmazeRes = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(animeTitle)}&embed=episodes`);
        if (tvmazeRes.ok) {
            const tvm = await tvmazeRes.json();
            if (tvm && tvm._embedded && tvm._embedded.episodes) {
                const sNum = parseInt(seasonId) || 1;
                // Sadece seçili sezona ait olanları veya mutlak numaraları al
                tvm._embedded.episodes.forEach(e => {
                    // Eğer anime 1 sezon gibi davranıyorsa (örn One Piece) absolute number kullan
                    // TVMaze bazen absolute number vermez. Sezon ve bölüme göre eşleştiriyoruz.
                    if (e.season === sNum || sNum === 0 || sNum === 1) {
                        const epIndex = e.number;
                        kitsuEps[epIndex] = {
                            thumbnail: e.image ? e.image.original : null,
                            title: e.name,
                            airdate: e.airdate
                        };
                    }
                });
            }
        }
    } catch (e) { console.warn("TVMaze fetch failed", e); }
    
    // Eğer TVMaze boş dönerse veya az sonuç verirse Kitsu dene
    if (Object.keys(kitsuEps).length < Math.min(epsData.length, 5)) {
        try {
            const sNum = parseInt(seasonId) || 1;
            const q = sNum > 1 ? `${animeTitle} Season ${sNum}` : animeTitle;
            const searchRes = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}`);
            const searchData = await searchRes.json();
            
            if (searchData.data && searchData.data.length > 0) {
                const kitsuId = searchData.data[0].id;
                const limit = 20;
                const pages = Math.ceil(epsData.length / limit);
                const fetches = [];
                for(let p = 0; p < pages; p++) {
                    fetches.push(fetch(`https://kitsu.io/api/edge/anime/${kitsuId}/episodes?page[limit]=${limit}&page[offset]=${p * limit}`).then(r => r.json()));
                }
                const results = await Promise.all(fetches);
                results.forEach(res => {
                    if(res.data) {
                        res.data.forEach(e => {
                            if (!kitsuEps[e.attributes.number] || !kitsuEps[e.attributes.number].thumbnail) {
                                kitsuEps[e.attributes.number] = {
                                    thumbnail: e.attributes.thumbnail ? e.attributes.thumbnail.original : null,
                                    title: e.attributes.canonicalTitle,
                                    airdate: e.attributes.airdate
                                };
                            }
                        });
                    }
                });
            }
        } catch(e) { console.error("Kitsu fetch error", e); }
    }

    epsContainer.style.display = 'grid';
    epsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(320px, 1fr))';
    epsContainer.style.gap = '15px';

    epsData.forEach((ep, idx) => {
        const epNum = ep.Number || (idx + 1);
        const kData = kitsuEps[epNum] || {};
        
        let label = ep.Title || kData.title || ('Bölüm ' + epNum);
        if (label.toLowerCase().startsWith('episode ')) label = label;
        
        const thumb = kData.thumbnail || imgUrl || 'https://placehold.co/320x180/1a1a28/e8a020?text=?';
        
        // Attach to ep object so watchView sidebar can use them!
        ep.kitsuThumb = thumb;
        ep.kitsuTitle = label;
        let dateStr = 'Bilinmiyor';
        if (kData.airdate) {
            try { dateStr = new Date(kData.airdate).toLocaleDateString('tr-TR', {day:'numeric', month:'short', year:'numeric'}); } catch(e){}
        }
        
        const key       = (slug || id) + '_s' + seasonId + '_e' + idx;
        const isWatched = watched.includes(key);
        const sIdx      = parseInt(seasonId) || 0;

        const btn = document.createElement('div');
        btn.className = 'episode-card' + (isWatched ? ' watched' : '');
        btn.dataset.epIdx = idx;
        btn.onclick = () => { if (!bulkDownloadMode) watchEpisode(id, slug, isMovie, ep, sIdx, idx, animeTitle, synopsis, imgUrl); };
        
        btn.innerHTML = `
            <div class="ep-card-thumb">
                <img src="${thumb}" onerror="this.src='${imgUrl}'">
                <div class="ep-play-overlay"><i class="fa-solid fa-play"></i></div>
            </div>
            <div class="ep-card-info">
                <div class="ep-card-title"><span class="ep-card-num">${epNum}</span> ${label}</div>
                <div class="ep-card-date">${dateStr}</div>
            </div>
        `;
        epsContainer.appendChild(btn);
    });

    // Filler bölüm tespiti
    try { anitrFillerEnsure(animeTitle, seasonId); anitrFillerRender(); } catch (e) {}
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

    addToHistory({ id, slug, isMovie, title: animeTitle, img: imgUrl, synopsis, lastWatchedLabel: label, ep, sIdx, eIdx, kitsuThumb: (ep && ep.kitsuThumb) ? ep.kitsuThumb : null });
    markWatched(epKey);

    showWatchView();
    document.getElementById('watchTitle').textContent       = '▶ Yükleniyor...';
    document.getElementById('watchAnimeTitle').textContent  = animeTitle || '';
    document.getElementById('watchSource').textContent      = currentSource;
    document.getElementById('watchSynopsis').textContent    = synopsis   || 'Açıklama yok.';

    // Video kaynakları gelene kadar oynatıcı alanında yükleniyor göstergesi
    const _vc = document.querySelector('.video-container-page');
    if (_vc && !_vc.querySelector('.anitr-preload')) {
        const pre = document.createElement('div');
        pre.className = 'anitr-preload';
        pre.innerHTML = '<div class="anitr-spinner"></div><span>Video hazırlanıyor...</span>';
        _vc.appendChild(pre);
        setTimeout(() => { if (pre.isConnected) pre.remove(); }, 20000);
    }

    // Debug Overlay (Ekranda direkt görünür)
    let debugEl = document.getElementById('resumeDebugOverlay');
    if (!debugEl) {
        debugEl = document.createElement('div');
        debugEl.id = 'resumeDebugOverlay';
        debugEl.style = 'position:fixed; top:70px; right:10px; background:rgba(0,0,0,0.8); color:lime; font-family:monospace; padding:10px; z-index:999999; font-size:14px; pointer-events:none; border-radius:4px; border: 1px solid lime;';
        document.body.appendChild(debugEl);
    }
    if (appSettings.playerDebug) {
        debugEl.style.display = 'block';
        debugEl.innerHTML = `epKey: ${epKey}<br>getPosition(): ${getPosition(epKey)}`;
    } else {
        debugEl.style.display = 'none';
    }

    // Set ambient background!
    if (imgUrl) {
        const ambientEl = document.getElementById('watchAmbient');
        if (ambientEl) {
            ambientEl.style.backgroundImage = `url('${imgUrl}')`;
        }
        if (appSettings.dynamicTheme) {
            if (!window.originalAccent) {
                window.originalAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            }
            getDominantColor(imgUrl, (color) => {
                if (color) {
                    document.documentElement.style.setProperty('--accent', color);
                    document.documentElement.style.setProperty('--accent-light', color);
                }
            });
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
    if(typeof fetchComments === 'function') fetchComments(epKey);

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

    // Detay sayfasındaki gibi: Kitsu kapağını tercih et, yoksa ana resmi kullan
    const fallbackCover = imgUrl || '';

    currentEpisodes.forEach((ep, idx) => {
        const epNum = ep.Number || (idx + 1);
        let label = ep.kitsuTitle || ep.Title || ('Bölüm ' + epNum);
        if (label.toLowerCase() === 'bölüm ' + epNum || label.toLowerCase() === 'episode ' + epNum)
            label = 'Bölüm ' + epNum;

        const key       = (slug || id) + '_s' + currentSIdx + '_e' + idx;
        const isWatched = watched.includes(key);
        const isActive  = idx === currentEIdx;

        // Küçük resim: bölüm özel > ana kapak
        const thumb = ep.kitsuThumb || fallbackCover || 'https://placehold.co/320x180/1a1a28/5a5a78?text=?';

        const card = document.createElement('div');
        card.className = 'sep2-card' + (isActive ? ' active' : '') + (isWatched ? ' watched' : '');
        card.onclick = (e) => {
            if (e.target.closest('.sep2-mark-btn')) return;
            watchEpisode(id, slug, isMovie, ep, currentSIdx, idx, animeTitle, synopsis, imgUrl);
        };

        const statusIcon = isActive
            ? '<span class="sep2-badge playing"><i class="fa-solid fa-circle-play"></i> İzleniyor</span>'
            : isWatched
              ? '<span class="sep2-badge done"><i class="fa-solid fa-check"></i> İzlendi</span>'
              : '<span class="sep2-badge num">' + epNum + '. Bölüm</span>';

        card.innerHTML = `
            <div class="sep2-thumb-wrap">
                <img class="sep2-thumb" src="${thumb}" alt="${label}" loading="lazy" onerror="this.src='${fallbackCover}'">
                <div class="sep2-play-layer">
                    <i class="fa-solid ${isActive ? 'fa-circle-pause' : 'fa-circle-play'}"></i>
                </div>
                ${isWatched && !isActive ? '<div class="sep2-watched-veil"><i class="fa-solid fa-check"></i></div>' : ''}
            </div>
            <div class="sep2-info">
                ${statusIcon}
                <div class="sep2-title">${label}</div>
                <button class="sep2-mark-btn" onclick="toggleWatchedStatus('${key}', this.closest('.sep2-card'))">
                    <i class="fa-solid ${isWatched ? 'fa-eye-slash' : 'fa-eye'}"></i>
                    ${isWatched ? 'İzlenmedi Yap' : 'İzlendi İşaretle'}
                </button>
            </div>
        `;
        sidebar.appendChild(card);

        if (isActive) {
            setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
        }
    });
    try { anitrFillerOnWatch(); } catch (e) {}
}

// Helper to toggle watched status directly from sidebar
window.toggleWatchedStatus = function(key, cardEl) {
    let watched = getWatched();
    const isWatched = watched.includes(key);
    if (isWatched) {
        watched = watched.filter(w => w !== key);
        cardEl.classList.remove('watched');
        cardEl.querySelector('.sep2-mark-btn').innerHTML = '<i class="fa-solid fa-eye"></i> İzlendi İşaretle';
        if (!cardEl.classList.contains('active')) {
            const badge = cardEl.querySelector('.sep2-badge');
            if (badge) badge.className = 'sep2-badge num';
        }
        showToast('İzlendi işareti kaldırıldı.');
    } else {
        watched.push(key);
        cardEl.classList.add('watched');
        cardEl.querySelector('.sep2-mark-btn').innerHTML = '<i class="fa-solid fa-eye-slash"></i> İzlenmedi Yap';
        if (!cardEl.classList.contains('active')) {
            const badge = cardEl.querySelector('.sep2-badge');
            if (badge) { badge.className = 'sep2-badge done'; badge.innerHTML = '<i class="fa-solid fa-check"></i> İzlendi'; }
        }
        showToast('İzlendi olarak işaretlendi.');
    }
    ls.set('anitr_watched', watched);
};

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
        // First try vjsPlayer's current time
        if (vjsPlayer && typeof vjsPlayer.currentTime() === 'number') {
            currentTime = vjsPlayer.currentTime();
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
        if (!vjsPlayer) {
            showToast('❌ Oynatıcı henüz başlamadı');
            return;
        }
        // Block ended event temporarily
        disableEndedEvent = true;
        showToast(`⏩ ${formatTime(pos)} konumuna atlanıyor...`);
        // Video.js currentTime setter handles seeking
        vjsPlayer.currentTime(pos);
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
    // Feature removed per user request
    return;
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

let _ambientLightFrameId = null;
function startAmbilight(videoEl) {
    if (window.anitrAmbientStart) return window.anitrAmbientStart(videoEl);
    if (_ambientLightFrameId) { cancelAnimationFrame(_ambientLightFrameId); _ambientLightFrameId = null; }
    const canvas = document.getElementById('videoAmbilightCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    function draw() {
        if (!document.body.contains(videoEl)) {
            canvas.classList.add('hidden');
            _ambientLightFrameId = null;
            return;
        }
        if (!appSettings.ambientLight) {
            canvas.classList.add('hidden');
        } else {
            canvas.classList.remove('hidden');
            if (!videoEl.paused && !videoEl.ended && videoEl.readyState >= 2) {
                try {
                    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                } catch(e) {}
            }
        }
        _ambientLightFrameId = requestAnimationFrame(draw);
    }
    
    canvas.width = 128; // Optimize for blur
    canvas.height = 72;
    if (!_ambientLightFrameId) _ambientLightFrameId = requestAnimationFrame(draw);
}
function openPlayer(watch, resumeAt) {
    resumeAt = resumeAt || 0;
    const urls      = watch.Urls      || [];
    const labels    = watch.Labels    || [];
    const trCaption = watch.TRCaption || null;
    const subtitles = watch.Subtitles || [];
    const opening   = watch.Opening   || null;
    const ending    = watch.Ending    || null;

    // Temizlik
    if (vjsPlayer) { try { vjsPlayer.dispose(); } catch(e) {} vjsPlayer = null; }
    if (window._globalPosInterval) clearInterval(window._globalPosInterval);

    // Video.js dispose() elementi siliyor, yeniden oluştur
    const container = document.querySelector('.video-container-page');
    container.innerHTML = '<canvas id="videoAmbilightCanvas" class="video-ambilight hidden"></canvas><video id="animePlayer" class="video-js vjs-default-skin vjs-big-play-centered" controls playsinline crossorigin="anonymous" style="width:100%;height:100%;"></video><div id="subtitleSettingsPanel" class="subtitle-settings-panel hidden"></div>';
    animePlayer = document.getElementById('animePlayer');

    if (!urls.length) { showToast('❌ Oynatılabilir video bulunamadı.'); return; }

    const videoUrl = urls[0];
    const isM3u8   = videoUrl.includes('.m3u8');
    const mimeType = isM3u8 ? 'application/x-mpegURL' : 'video/mp4';

    // Altyazı parçaları
    const trackDefs = [];
    if (subtitles && subtitles.length > 0) {
        subtitles.forEach(sub => {
            trackDefs.push({ kind: 'subtitles', label: sub.Label || sub.Group.toUpperCase(), srclang: sub.Group, src: '/api/proxy?url=' + encodeURIComponent(sub.Link), default: sub.Group === 'tr' });
        });
    } else if (trCaption) {
        trackDefs.push({ kind: 'subtitles', label: 'Türkçe', srclang: 'tr', src: '/api/proxy?url=' + encodeURIComponent(trCaption), default: true });
    }

    // Video.js başlat
    vjsPlayer = videojs('animePlayer', {
        controls: true,
        autoplay: false,
        preload: 'auto',
        fluid: true,
        responsive: true,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        controlBar: { skipButtons: { forward: 10, backward: 10 }, remainingTimeDisplay: false, volumePanel: { inline: true } },
        userActions: { doubleClick: _anitrDoubleClick },
        html5: {
            vhs: {
                overrideNative: true,
                enableLowInitialPlaylist: false,
                smoothQualityChange: true
            },
            nativeAudioTracks: false,
            nativeVideoTracks: false,
            nativeTextTracks: false
        },
        tracks: trackDefs
    });

    // Kaynak yükle
    vjsPlayer.src({ src: videoUrl, type: mimeType });

    // Çoklu kalite varsa menü oluştur
    if (urls.length > 1 && labels.length === urls.length) {
        setTimeout(() => _buildQualityMenu(vjsPlayer, urls, labels, mimeType), 800);
    }

    // Player hazır olunca
    vjsPlayer.ready(function() {
        const p = this;
        
        const realVideoEl = p.el().querySelector('video');
        if (realVideoEl) startAmbilight(realVideoEl);

        // Türkçe altyazıyı varsayılan yap
        const tTracks = p.textTracks();
        for (let i = 0; i < tTracks.length; i++) {
            if (tTracks[i].language === 'tr') tTracks[i].mode = 'showing';
        }

        // Altyazı ayarlarını (renk, boyut, arkaplan) kalıcı olarak yükle
        if (p.textTrackSettings) {
            try {
                const savedSettings = localStorage.getItem('vjs-text-track-settings');
                if (savedSettings) {
                    p.textTrackSettings.setValues(JSON.parse(savedSettings));
                    if(typeof p.textTrackSettings.updateStyle==="function")p.textTrackSettings.updateStyle(); else { const d=p.getChild("textTrackDisplay"); if(d&&d.updateDisplay) d.updateDisplay(); } try { const parsed = JSON.parse(savedSettings); if(parsed.fontPercent) p.el().style.setProperty("--vjs-sub-scale", parsed.fontPercent);
                if(parsed.subPos) p.el().style.setProperty("--vjs-sub-pos", parsed.subPos);
            } catch(e){}
                }
            } catch (e) {
                console.error('Altyazı ayarları yüklenemedi:', e);
            }
        }

        // RESUME PLAYBACK - Video.js
        if (resumeAt > 10) {
            let resumed = false;
            const attemptResume = () => {
                if (!resumed) {
                    p.currentTime(resumeAt);
                    // currentTime anında güncellenir, eğer güncellendiyse başardık demektir
                    if (p.currentTime() >= resumeAt - 2) {
                        resumed = true;
                        const dEl = document.getElementById('resumeDebugOverlay');
                        if (dEl) dEl.innerHTML += '<br>VJS Resumed ✅';
                    }
                }
            };
            
            // Video.js HLS için metadata veya data yüklendiğinde atlamayı dene
            p.on('loadedmetadata', attemptResume);
            p.on('canplay', attemptResume);
            
            // KESİN ÇÖZÜM: Oynatma başladığında hala atlamadıysa zorla
            p.one('playing', function() {
                if (p.currentTime() < resumeAt - 5) {
                    p.currentTime(resumeAt);
                }
            });
            
            showToast('⏩ ' + Math.floor(resumeAt / 60) + ':' + String(Math.floor(resumeAt % 60)).padStart(2, '0') + "'den devam ediliyor", 3000);
        }

        // Klavye kısayolları
        const _keyHandler = (e) => {
            if (watchView.classList.contains('hidden')) return;
            const tag = document.activeElement && document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            switch(e.code) {
                case 'Space': e.preventDefault(); p.paused() ? p.play() : p.pause(); break;
                case 'ArrowLeft': case 'KeyJ': e.preventDefault(); p.currentTime(Math.max(0, p.currentTime() - 10)); _anitrFeedback(p, 'back'); break;
                case 'ArrowRight': case 'KeyL': e.preventDefault(); p.currentTime(Math.min(p.duration() || Infinity, p.currentTime() + 10)); _anitrFeedback(p, 'fwd'); break;
                case 'KeyF': e.preventDefault(); p.isFullscreen() ? p.exitFullscreen() : p.requestFullscreen(); break;
                case 'KeyM': e.preventDefault(); p.muted(!p.muted()); _anitrFeedback(p, p.muted() ? 'mute' : 'vol'); break;
                case 'KeyK': e.preventDefault(); p.paused() ? p.play() : p.pause(); break;
                case 'ArrowUp': e.preventDefault(); p.muted(false); p.volume(Math.min(1, p.volume() + 0.1)); _anitrFeedback(p, 'vol'); break;
                case 'ArrowDown': e.preventDefault(); p.volume(Math.max(0, p.volume() - 0.1)); _anitrFeedback(p, p.volume() === 0 ? 'mute' : 'voldown'); break;
            }
        };
        document.removeEventListener('keydown', window._anitrPlayerKeyboardHandler);
        window._anitrPlayerKeyboardHandler = _keyHandler;
        document.addEventListener('keydown', _keyHandler);

        // Intro/Outro atlama butonları
        _setupSkipButtons(p, opening, ending);

        // Altyazı ayar paneli
        _setupSubtitlePanel(p); _anitrEnhancePlayer(p);

        // Bölüm bitti
        p.on('ended', () => {
            if (disableEndedEvent) return;
            clearPosition(currentEpisodeKey);
            markWatched(currentEpisodeKey);
            if (appSettings.autoNext) playNextEpisode();
        });

        // Konum Takibi (timeupdate — player'ın içinden güvenilir)
        let _lastSavedSec = -1;
        p.on('timeupdate', () => {
            const t = p.currentTime();
            const dur = p.duration();
            if (!t || t <= 5) return;
            const tFloor = Math.floor(t);
            if (tFloor !== _lastSavedSec) {
                _lastSavedSec = tFloor;
                savePosition(currentEpisodeKey, t);
                const dEl = document.getElementById('resumeDebugOverlay');
                if (dEl) {
                    dEl.innerHTML = 'Saved: ' + t.toFixed(1) + 's | Key: ' + currentEpisodeKey + 
                                    '<br>Stored: ' + localStorage.getItem('anitr_ts_' + currentEpisodeKey);
                }
                
                // HLS bazen başlarda süreyi 0 veya çok küçük verebiliyor.
                // Sadece süre 60 saniyeden büyükse ve %95 izlendiyse tamamlandı say.
                if (dur && dur > 60 && t / dur >= 0.95) {
                    clearPosition(currentEpisodeKey);
                    markWatched(currentEpisodeKey);
                }
            }
        });

        updateManualResumeArea();
    });

    // Kapanışta kaydet
    window.onbeforeunload = () => {
        if (vjsPlayer && vjsPlayer.currentTime() > 5) savePosition(currentEpisodeKey, vjsPlayer.currentTime());
        syncToServer();
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && vjsPlayer && vjsPlayer.currentTime() > 5) {
            savePosition(currentEpisodeKey, vjsPlayer.currentTime());
            syncToServer();
        }
    });
}

// Çoklu Kalite Menüsü
function _buildQualityMenu(player, urls, labels, mimeType) {
    try {
        const controlBar = player.getChild('controlBar');
        if (!controlBar) return;
        const existing = controlBar.getChild('AnitrQualityMenu');
        if (existing) controlBar.removeChild(existing);

        const QualityMenuItem = videojs.getComponent('MenuItem');
        const QualityButton = videojs.getComponent('MenuButton');

        class AnitrQualityItem extends QualityMenuItem {
            constructor(player, options) {
                super(player, options);
                this._src = options.src;
                this._qualityLabel = options.qualityLabel;
            }
            handleClick() {
                const currentTime = player.currentTime();
                player.src({ src: this._src, type: mimeType });
                player.one('canplay', () => { player.currentTime(currentTime); player.play(); });
                showToast('🎬 ' + this._qualityLabel + ' kaliteye geçildi');
            }
        }
        videojs.registerComponent('AnitrQualityItem', AnitrQualityItem);

        class AnitrQualityMenu extends QualityButton {
            constructor(player, options) {
                super(player, options);
                this.addClass('vjs-quality-selector');
                this.controlText('Kalite');
            }
            createItems() {
                return urls.map((u, i) => {
                    const item = new AnitrQualityItem(player, { label: labels[i] || (i + 1) + '. Kalite', src: u, qualityLabel: labels[i] });
                    if (i === 0) item.addClass('vjs-selected');
                    return item;
                });
            }
        }
        videojs.registerComponent('AnitrQualityMenu', AnitrQualityMenu);
        const btn = new AnitrQualityMenu(player, {});
        controlBar.addChild(btn, {}, controlBar.children().length - 1);
    } catch(e) { console.warn('Quality menu error:', e); }
}

// Intro/Outro Atlama
function _setupSkipButtons(player, opening, ending) {
    function timeToSec(t) {
        if (!t || typeof t !== 'string') return 0;
        const parts = t.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    }
    const playerEl = player.el();
    let skipContainer = playerEl.querySelector('.player-skip-controls');
    if (!skipContainer) {
        skipContainer = document.createElement('div');
        skipContainer.className = 'player-skip-controls';
        playerEl.appendChild(skipContainer);
    }
    player.on('timeupdate', () => {
        const curr = player.currentTime();
        skipContainer.innerHTML = '';
        if (opening) {
            const s = timeToSec(opening.Start), e = timeToSec(opening.End);
            if (curr >= s && curr <= e) {
                const btn = document.createElement('button');
                btn.className = 'skip-btn';
                btn.innerHTML = '<i class="fa-solid fa-forward"></i> Açılışı Atla';
                btn.onclick = () => { player.currentTime(e); showToast('⏭ Açılış atlatıldı'); };
                skipContainer.appendChild(btn);
            }
        }
        if (ending) {
            const s = timeToSec(ending.Start), e = timeToSec(ending.End);
            if (curr >= s && curr <= e) {
                const btn = document.createElement('button');
                btn.className = 'skip-btn';
                btn.innerHTML = '<i class="fa-solid fa-forward"></i> Kapanışı Atla';
                btn.onclick = () => { player.currentTime(e); showToast('⏭ Kapanış atlatıldı'); };
                skipContainer.appendChild(btn);
            }
        }
    });
}

// Altyazı Ayar Paneli
function _setupSubtitlePanel(player) {
    const panel = document.getElementById('subtitleSettingsPanel');
    if (!panel) return;
    const settings = getSubtitleSettings();
    panel.innerHTML = `
        <div class="subtitle-settings-header">
            <h3><i class="fa-solid fa-closed-captioning"></i> Altyazı Ayarları</h3>
            <button onclick="document.getElementById('subtitleSettingsPanel').classList.add('hidden')" class="close-subtitle-settings">&times;</button>
        </div>
        <div class="subtitle-setting-item">
            <label>Yazı Boyutu: <span id="fontSizeValue">${settings.fontSize}px</span></label>
            <input type="range" min="10" max="40" value="${settings.fontSize}" oninput="_subtitleUpdate('fontSize', this.value)">
        </div>
        <div class="subtitle-setting-item">
            <label>Arkaplan Şeffaflığı: <span id="bgOpacityValue">${Math.round(settings.backgroundOpacity * 100)}%</span></label>
            <input type="range" min="0" max="100" value="${Math.round(settings.backgroundOpacity * 100)}" oninput="_subtitleUpdate('backgroundOpacity', this.value / 100)">
        </div>
        <div class="subtitle-setting-item">
            <label>Yazı Rengi:</label>
            <input type="color" value="${settings.textColor}" oninput="_subtitleUpdate('textColor', this.value)">
        </div>
        <div class="subtitle-setting-item">
            <label>Yazı Tipi:</label>
            <select onchange="_subtitleUpdate('fontFamily', this.value)">
                <option value="Inter, sans-serif" ${settings.fontFamily.includes('Inter') ? 'selected' : ''}>Inter</option>
                <option value="Arial, sans-serif" ${settings.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option>
                <option value="Verdana, sans-serif" ${settings.fontFamily.includes('Verdana') ? 'selected' : ''}>Verdana</option>
                <option value="Georgia, serif" ${settings.fontFamily.includes('Georgia') ? 'selected' : ''}>Georgia</option>
            </select>
        </div>
    `;
    applySubtitleSettings(settings);
}
window._subtitleUpdate = function(key, value) {
    const settings = getSubtitleSettings();
    if (key === 'fontSize') {
        settings.fontSize = parseInt(value);
        const el = document.getElementById('fontSizeValue');
        if(el) el.textContent = value + 'px';
    } else if (key === 'backgroundOpacity') {
        settings.backgroundOpacity = parseFloat(value);
        const el = document.getElementById('bgOpacityValue');
        if(el) el.textContent = Math.round(parseFloat(value) * 100) + '%';
    } else {
        settings[key] = value;
    }
    localStorage.setItem('anitr_subtitle_settings', JSON.stringify(settings));
    applySubtitleSettings(settings);
};
window.toggleSubtitleSettings = function() {
    const p = document.getElementById('subtitleSettingsPanel');
    if (p) p.classList.toggle('hidden');
};


// ══════════════════════════════════════════════════════════
// MYANIMELIST ENTEGRASYONU (Jikan Public List)
// ══════════════════════════════════════════════════════════

async function saveMALUsername() {
    const username = document.getElementById('malUsernameInput').value.trim();
    if (!username) return;
    
    // Sadece username'i kaydet (Backend liste çekerken zaten doğruluyor)
    showToast("Hesap kaydediliyor...");
    
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
        console.log('Received data:', data, 'length:', data ? data.length : 0);
        
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
            if (!w2gLocalAction && vjsPlayer) {
                w2gLocalAction = true;
                vjsPlayer.play();
                setTimeout(() => w2gLocalAction = false, 100);
            }
            break;
        case 'pause':
            if (!w2gLocalAction && vjsPlayer) {
                w2gLocalAction = true;
                vjsPlayer.pause();
                setTimeout(() => w2gLocalAction = false, 100);
            }
            break;
        case 'seek':
            if (!w2gLocalAction && vjsPlayer && typeof msg.data === 'number') {
                w2gLocalAction = true;
                vjsPlayer.currentTime(msg.data);
                setTimeout(() => w2gLocalAction = false, 100);
            }
            break;
    }
}
function setupW2GPlayerListeners() {
    if (!vjsPlayer) return;
    vjsPlayer.on('play', () => {
        if (!w2gLocalAction) sendW2GPlayerEvent('play');
    });
    vjsPlayer.on('pause', () => {
        if (!w2gLocalAction) sendW2GPlayerEvent('pause');
    });
    vjsPlayer.on('seeked', () => {
        if (!w2gLocalAction) sendW2GPlayerEvent('seek', vjsPlayer.currentTime());
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
    
    const w2gStatus = document.getElementById('w2gStatus');
    if (w2gStatus) w2gStatus.style.display = 'none';
    
    const chatContainer = document.getElementById('w2gChatContainer');
    if (chatContainer) chatContainer.classList.add('hidden');
    
    const messages = document.getElementById('w2gMessages');
    if (messages) messages.innerHTML = '';
    
    const createBtn = document.getElementById('w2gCreateBtn');
    if (createBtn) createBtn.style.display = 'inline-flex';
    
    const joinBtn = document.getElementById('w2gJoinBtn');
    if (joinBtn) joinBtn.style.display = 'inline-flex';
    
    const indicator = document.getElementById('w2gIndicator');
    if (indicator) indicator.classList.add('hidden');
}

let downloads = [];
let selectedDownloadQuality = null;
    selectedDownloadLang = 'jp';
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
    selectedDownloadLang = 'jp';
    document.getElementById('downloadModal').classList.remove('hidden');
    populateDownloadQualities();
}

function closeDownloadModal() {
    document.getElementById('downloadModal').classList.add('hidden');
}

async function populateDownloadQualities(epOverride) {
    const container = document.getElementById('downloadQualityList');
    container.innerHTML = '<div style="text-align:center;padding:2rem;"><div class="dl-spinner"></div><p style="color:var(--text3);margin-top:12px;font-size:13px;">Kaynaklar taranıyor...</p></div>';

    const ep = epOverride || currentEpisode;
    const urlArg  = ep && ep.ID   ? 'url='  + encodeURIComponent(ep.ID) : '';
    const idArg   = currentAnime.id      ? 'id='   + currentAnime.id   : '';
    const slugArg = currentAnime.slug    ? 'slug=' + encodeURIComponent(currentAnime.slug) : '';
    const soundArg = currentSelectedSound ? 'sound=' + encodeURIComponent(currentSelectedSound) : '';
    const qs = [urlArg, slugArg, idArg, soundArg, 'is_movie=' + currentAnime.isMovie, 'source=' + encodeURIComponent(currentSource), 'season_index=' + currentSIdx, 'episode_index=' + currentEIdx].filter(Boolean).join('&');

    const watchData = await fetchAPI('/watch?' + qs);
    if (!watchData || !Array.isArray(watchData)) {
        container.innerHTML = '<div class="dl-empty"><i class="fa-solid fa-circle-exclamation"></i><p>Kaynaklar yüklenemedi.</p></div>';
        return;
    }

    currentDownloadData = watchData;

    // Build smart quality options from actual data + standard set
    // Try to detect language/quality from URL patterns
    const availableOptions = [];

    const stdQualities = [
        { label: '4K Japonca', res: '2160', lang: 'jp', icon: '🇯🇵', badge: '4K', color: '#a855f7' },
        { label: '4K Türkçe Dublaj', res: '2160', lang: 'tr', icon: '🇹🇷', badge: '4K', color: '#a855f7' },
        { label: '2K Japonca', res: '1440', lang: 'jp', icon: '🇯🇵', badge: '2K', color: '#3b82f6' },
        { label: '2K Türkçe Dublaj', res: '1440', lang: 'tr', icon: '🇹🇷', badge: '2K', color: '#3b82f6' },
        { label: '1080p Japonca', res: '1080', lang: 'jp', icon: '🇯🇵', badge: 'FHD', color: '#22c55e' },
        { label: '1080p Türkçe Dublaj', res: '1080', lang: 'tr', icon: '🇹🇷', badge: 'FHD', color: '#22c55e' },
        { label: '720p Japonca', res: '720', lang: 'jp', icon: '🇯🇵', badge: 'HD', color: '#f59e0b' },
        { label: '720p Türkçe Dublaj', res: '720', lang: 'tr', icon: '🇹🇷', badge: 'HD', color: '#f59e0b' },
        { label: '480p', res: '480', lang: 'jp', icon: '🌐', badge: 'SD', color: '#6b7280' },
    ];

    // Parse watchData to find exactly what's available
    // watchData format: [{Quality: "1080", Url: "...", Sound: "tr"}, ...]
    // Or sometimes just [{url: "...", label: "1080p"}, ...]
    
    let hasTr = false;
    let has4k = false;
    let has2k = false;
    let has1080 = false;
    
    watchData.forEach(w => {
        const url = w.Url || w.url || '';
        const snd = w.Sound || w.sound || '';
        const q = w.Quality || w.quality || w.label || '';
        const qStr = q.toString().toLowerCase();
        
        if (snd === 'tr' || url.includes('tr')) hasTr = true;
        
        if (qStr.includes('2160') || qStr.includes('4k')) has4k = true;
        if (qStr.includes('1440') || qStr.includes('2k')) has2k = true;
        if (qStr.includes('1080') || qStr.includes('fhd')) has1080 = true;
    });

    // Filter options based on what's actually in the API for this source
    const filtered = stdQualities.filter(q => {
        if (q.lang === 'tr' && !hasTr) return false;
        
        if (q.res === '2160' && !has4k) return false;
        if (q.res === '1440' && !has2k) return false;
        if (q.res === '1080' && !has1080 && has4k) return true; // Keep 1080p usually
        
        return true;
    });

    // Always keep at minimum: 1080p jp, 720p jp, 480p jp, and tr dupes if hasTr
    const finalOptions = filtered.length > 0 ? filtered : [
        { label: '1080p', res: '1080', lang: 'jp', icon: '🌐', badge: 'FHD', color: '#22c55e' },
        { label: '720p', res: '720', lang: 'jp', icon: '🌐', badge: 'HD', color: '#f59e0b' },
        { label: '480p', res: '480', lang: 'jp', icon: '🌐', badge: 'SD', color: '#6b7280' },
    ];

    container.innerHTML = finalOptions.map((q, i) => `
        <label class="dl-quality-row ${i === 0 ? 'selected' : ''}" onclick="selectDownloadQuality(this, '${q.res}', '${q.lang}')">
            <div class="dl-quality-radio ${i === 0 ? 'active' : ''}"></div>
            <span class="dl-quality-icon">${q.icon}</span>
            <span class="dl-quality-label">${q.label}</span>
            <span class="dl-quality-badge" style="background:${q.color}20;color:${q.color};border-color:${q.color}40;">${q.badge}</span>
        </label>
    `).join('');

    selectedDownloadQuality = finalOptions[0].res;
    selectedDownloadLang = finalOptions[0].lang;
}

function selectDownloadQuality(el, res, lang) {
    document.querySelectorAll('.dl-quality-row').forEach(r => r.classList.remove('selected'));
    document.querySelectorAll('.dl-quality-radio').forEach(r => r.classList.remove('active'));
    el.classList.add('selected');
    el.querySelector('.dl-quality-radio').classList.add('active');
    selectedDownloadQuality = res;
    selectedDownloadLang = lang || 'jp';
}

async function startDownload() {
    if (!currentDownloadData || !selectedDownloadQuality) {
        showToast('⚠️ Lütfen bir kalite seçin!');
        return;
    }

    // Doğru kalite ve dili bul
    let watch = currentDownloadData.find(w => {
        const url = (w.Url || w.url || '').toLowerCase();
        const snd = (w.Sound || w.sound || '').toLowerCase();
        const q = (w.Quality || w.quality || w.label || '').toString().toLowerCase();
        
        const isTr = snd === 'tr' || url.includes('tr');
        const langMatch = selectedDownloadLang === 'tr' ? isTr : !isTr;
        const qMatch = q.includes(selectedDownloadQuality);
        return langMatch && qMatch;
    });

    if (!watch) {
        // Tam eşleşme yoksa sadece kaliteye bak
        watch = currentDownloadData.find(w => {
            const q = (w.Quality || w.quality || w.label || '').toString().toLowerCase();
            return q.includes(selectedDownloadQuality);
        }) || currentDownloadData[0];
    }

    const videoUrl = watch.Url || watch.url || (watch.Urls && watch.Urls.length > 0 ? watch.Urls[0] : null);

    if (!videoUrl) {
        showToast('❌ İndirme linki bulunamadı!');
        return;
    }

    const langLabel = selectedDownloadLang === 'tr' ? ' [TR Dublaj]' : ' [JP]';
    const filename = `${currentAnime.title} - ${document.getElementById('watchTitle').textContent} (${selectedDownloadQuality}p${langLabel}).mp4`;
    
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
        container.innerHTML = `
            <div class="dl-empty-state">
                <i class="fa-solid fa-box-open"></i>
                <p>İndirme listeniz boş</p>
                <span>Bir bölümü izlerken indirme butonuna tıklayın</span>
            </div>`;
        return;
    }

    container.innerHTML = downloads.map((dl, i) => `
        <div class="dl-item" style="animation-delay:${i * 60}ms">
            <img class="dl-item-thumb" src="${dl.image}" alt="${dl.animeTitle}" onerror="this.src='https://placehold.co/80x110/1a1a28/e8a020?text=?'">
            <div class="dl-item-info">
                <div class="dl-item-title">${dl.animeTitle}</div>
                <div class="dl-item-ep">${dl.episodeTitle}</div>
                <div class="dl-item-meta">
                    <span class="dl-badge dl-badge-q">${dl.quality}p</span>
                    ${dl.lang === 'tr' ? '<span class="dl-badge dl-badge-lang">🇹🇷 TR</span>' : '<span class="dl-badge dl-badge-lang">🇯🇵 JP</span>'}
                    <span class="dl-badge ${dl.status === 'completed' ? 'dl-badge-done' : 'dl-badge-active'}">
                        ${dl.status === 'completed' ? '✓ Tamamlandı' : '⏳ Bekleniyor'}
                    </span>
                </div>
            </div>
            <div class="dl-item-actions">
                ${dl.status === 'completed' ? `<button class="dl-action-btn dl-action-open" onclick="window.open('${dl.url}','_blank')" title="Aç"><i class="fa-solid fa-play"></i></button>` : ''}
                <button class="dl-action-btn dl-action-del" onclick="removeDownload(${dl.id})" title="Sil"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

window.removeDownload = function(id) {
    downloads = downloads.filter(d => d.id !== id);
    saveDownloads();
    renderDownloads();
    showToast('🗑️ İndirme silindi');
};

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
            <div class="anime-card" onclick="handleSearch('${rec.title.replace(/'/g, "\\'")}')">
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

// Global keyboard handler was here, moved into openPlayer for vjsPlayer

// ── Schedule — AniList GraphQL ──────────────────────────────
const SCHEDULE_DAYS_TR = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const SCHEDULE_DAY_ICONS = ['fa-sun','fa-moon','fa-fire','fa-star','fa-bolt','fa-heart','fa-crown'];
const SCHEDULE_DAY_COLORS = [
    '#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#ec4899','#10b981'
];

let scheduleActiveDay = new Date().getDay(); // 0=Sun,1=Mon,...

function renderScheduleDayTabs(grouped) {
    const tabsEl = document.getElementById('scheduleDayTabs');
    if (!tabsEl) return;
    const today = new Date().getDay();

    tabsEl.innerHTML = SCHEDULE_DAYS_TR.map((day, idx) => {
        const items = grouped[idx] || [];
        const count = items.length;
        const isToday = idx === today;
        const isActive = idx === scheduleActiveDay;
        const color = SCHEDULE_DAY_COLORS[idx] || '#8b5cf6';
        // Find how many air within next 6 hours
        const now = Date.now();
        const soonCount = items.filter(m => {
            const t = m.nextAiringEpisode?.timeUntilAiring;
            return t && t > 0 && t <= 21600;
        }).length;

        return `<button class="sv2-day-tab ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}"
            onclick="switchScheduleDay(${idx})"
            style="--dc:${color}">
            <span class="sv2-day-name">${day}</span>
            <span class="sv2-day-count">${count}</span>
            ${isToday ? '<span class="sv2-today-pill">Bugün</span>' : ''}
            ${soonCount > 0 && isToday ? `<span class="sv2-soon-dot" title="${soonCount} yakında yayında"></span>` : ''}
        </button>`;
    }).join('');
}

function switchScheduleDay(dayIdx) {
    scheduleActiveDay = dayIdx;
    const container = document.getElementById('scheduleContainer');
    if (!container || !container._grouped) return;

    document.querySelectorAll('.sv2-day-tab').forEach((btn, i) => {
        const color = SCHEDULE_DAY_COLORS[i] || '#8b5cf6';
        btn.classList.toggle('active', i === dayIdx);
        btn.style.setProperty('--dc', color);
    });

    // Reset search when switching day
    const si = document.getElementById('schedSearchInput');
    if (si) si.value = '';
    _schedSearchQ = '';

    renderScheduleDay(container._grouped, dayIdx);
    _schedUpdateSubbar(dayIdx, container._grouped);
}

var _schedSearchQ = '';
var _schedGenreFilter = '';

function _schedUpdateSubbar(dayIdx, grouped) {
    const bar = document.getElementById('schedSubbar');
    if (!bar) return;
    const items = grouped[dayIdx] || [];
    const today = new Date().getDay();
    const dayName = SCHEDULE_DAYS_TR[dayIdx];
    const isToday = dayIdx === today;

    const soon = items.filter(m => {
        const t = m.nextAiringEpisode?.timeUntilAiring;
        return t && t > 0 && t <= 3600;
    }).length;

    bar.innerHTML = `
        <div class="sv2-subbar-left">
            <span class="sv2-subbar-day">${isToday ? '📅 Bugün' : dayName}</span>
            <span class="sv2-subbar-count">${items.length} anime</span>
            ${soon > 0 ? `<span class="sv2-live-badge"><span class="sv2-live-dot"></span>${soon} Yakında Yayında</span>` : ''}
        </div>
        <div class="sv2-subbar-right">
            <div class="sv2-search-wrap">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input id="schedSearchInput" type="text" placeholder="Anime ara..." oninput="_schedOnSearch(this.value)" value="${_schedSearchQ}">
            </div>
            <div class="sv2-genre-wrap" id="schedGenreFilter">
                ${_schedBuildGenreFilter(items)}
            </div>
        </div>`;
}

function _schedBuildGenreFilter(items) {
    // Collect all genres
    const genreCount = {};
    items.forEach(m => {
        (m.genres || []).forEach(g => {
            genreCount[g] = (genreCount[g] || 0) + 1;
        });
    });
    const topGenres = Object.entries(genreCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([g]) => g);

    if (!topGenres.length) return '';
    return `<button class="sv2-genre-btn ${!_schedGenreFilter ? 'active' : ''}" onclick="_schedSetGenre('')">Tümü</button>` +
        topGenres.map(g =>
            `<button class="sv2-genre-btn ${_schedGenreFilter === g ? 'active' : ''}" onclick="_schedSetGenre('${g.replace(/'/g,"&#39;")}')">${g}</button>`
        ).join('');
}

function _schedSetGenre(g) {
    _schedGenreFilter = g;
    const container = document.getElementById('scheduleContainer');
    if (!container || !container._grouped) return;
    renderScheduleDay(container._grouped, scheduleActiveDay);
    _schedUpdateSubbar(scheduleActiveDay, container._grouped);
}

function _schedOnSearch(val) {
    _schedSearchQ = val.trim().toLowerCase();
    const container = document.getElementById('scheduleContainer');
    if (!container || !container._grouped) return;
    renderScheduleDay(container._grouped, scheduleActiveDay);
}

function renderScheduleDay(grouped, dayIdx) {
    const grid = document.getElementById('scheduleGrid');
    if (!grid) return;
    let items = (grouped[dayIdx] || []).slice();

    // Apply search filter
    if (_schedSearchQ) {
        items = items.filter(m => {
            const t = (m.title?.romaji || '') + ' ' + (m.title?.english || '');
            return t.toLowerCase().includes(_schedSearchQ);
        });
    }
    // Apply genre filter
    if (_schedGenreFilter) {
        items = items.filter(m => (m.genres || []).includes(_schedGenreFilter));
    }

    // Sort: airing soonest first, then by popularity
    items.sort((a, b) => {
        const ta = a.nextAiringEpisode?.timeUntilAiring ?? Infinity;
        const tb = b.nextAiringEpisode?.timeUntilAiring ?? Infinity;
        if (ta !== tb) return ta - tb;
        return (b.popularity || 0) - (a.popularity || 0);
    });

    if (!items.length) {
        grid.innerHTML = `<div class="sv2-empty">
            <i class="fa-solid fa-calendar-xmark"></i>
            <p>${_schedSearchQ || _schedGenreFilter ? 'Arama sonucu bulunamadı.' : 'Bu gün için yayın bulunamadı.'}</p>
            ${_schedSearchQ || _schedGenreFilter ? '<button onclick="_schedSetGenre(\'\');document.getElementById(\'schedSearchInput\').value=\'\';_schedOnSearch(\'\')">Filtreyi Temizle</button>' : ''}
        </div>`;
        return;
    }

    const now = Date.now();
    grid.innerHTML = items.map(m => {
        const title   = m.title?.romaji || m.title?.english || 'Bilinmiyor';
        const safe    = title.replace(/'/g, "&#39;").replace(/"/g, '&quot;');
        const img     = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || 'https://placehold.co/200x280/0c0c16/8b5cf6?text=?';
        const banner  = m.bannerImage || '';
        const score   = m.averageScore ? (m.averageScore / 10).toFixed(1) : null;
        const pop     = m.popularity  || 0;
        const nextEp  = m.nextAiringEpisode;
        const timeUntil = nextEp ? formatTimeUntil(nextEp.timeUntilAiring) : null;
        const nextEpNum = nextEp?.episode || null;
        const airingAt  = nextEp?.airingAt ? new Date(nextEp.airingAt * 1000) : null;
        const airingStr = airingAt ? airingAt.toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'}) : null;
        const genres  = (m.genres || []).slice(0, 3);
        const studio  = m.studios?.nodes?.[0]?.name || '';
        const format  = m.format === 'TV' ? 'TV' : m.format === 'MOVIE' ? 'Film' : m.format === 'OVA' ? 'OVA' : m.format || '';
        const eps     = m.episodes ? `${m.episodes} Bölüm` : '∞';
        const isFollowed = (_notifFollowedList || []).some(f => f.title === title);

        // Countdown urgency class
        const secs = nextEp?.timeUntilAiring || Infinity;
        const urgency = secs <= 3600 ? 'sv2-urgent' : secs <= 86400 ? 'sv2-soon' : '';

        // Score color
        const scoreClass = score >= 8 ? 'sv2-score-gold' : score >= 7 ? 'sv2-score-green' : 'sv2-score-gray';

        return `<div class="sv2-card ${urgency}" onclick="searchAnimeByName('${safe}')">
            <!-- Visual -->
            <div class="sv2-card-visual">
                ${banner ? `<div class="sv2-card-banner" style="background-image:url('${banner}')"></div>` : ''}
                <img class="sv2-card-img" src="${img}" alt="${safe}" loading="lazy" onerror="this.src='https://placehold.co/200x280/0c0c16/8b5cf6?text=?'">
                <div class="sv2-card-vignette"></div>

                <!-- Top badges -->
                <div class="sv2-card-top-row">
                    ${airingStr ? `<span class="sv2-time-badge ${urgency}"><i class="fa-regular fa-clock"></i>${airingStr}</span>` : ''}
                    <span class="sv2-format-badge">${format || 'TV'}</span>
                </div>

                <!-- Score -->
                ${score ? `<div class="sv2-score-badge ${scoreClass}"><i class="fa-solid fa-star"></i>${score}</div>` : ''}

                <!-- Countdown overlay -->
                ${timeUntil ? `<div class="sv2-countdown-chip ${urgency}">
                    <i class="fa-solid fa-hourglass-half"></i>
                    <span>${timeUntil}</span>
                    ${nextEpNum ? `<span class="sv2-ep-badge">Bölüm ${nextEpNum}</span>` : ''}
                </div>` : ''}

                <!-- Hover overlay -->
                <div class="sv2-card-overlay">
                    <button class="sv2-watch-btn" onclick="event.stopPropagation();searchAnimeByName('${safe}')">
                        <i class="fa-solid fa-play"></i> İzle
                    </button>
                    <button class="sv2-follow-btn ${isFollowed ? 'active' : ''}"
                        onclick="event.stopPropagation();_schedToggleFollow('${safe}','${img}')"
                        title="${isFollowed ? 'Takipten Çık' : 'Takip Et'}">
                        <i class="fa-${isFollowed ? 'solid' : 'regular'} fa-bell"></i>
                    </button>
                </div>
            </div>

            <!-- Info -->
            <div class="sv2-card-body">
                <div class="sv2-card-title" title="${safe}">${title}</div>

                ${studio ? `<div class="sv2-studio"><i class="fa-solid fa-building-columns"></i>${studio}</div>` : ''}

                <div class="sv2-genres">
                    ${genres.map(g => `<span class="sv2-genre-tag" onclick="event.stopPropagation();_schedSetGenre('${g.replace(/'/g,"&#39;")}')">${g}</span>`).join('')}
                </div>

                <div class="sv2-card-footer">
                    <span class="sv2-eps-info"><i class="fa-solid fa-film"></i>${eps}</span>
                    ${pop > 0 ? `<span class="sv2-pop-info"><i class="fa-solid fa-heart"></i>${pop >= 1000 ? (pop/1000).toFixed(1)+'K' : pop}</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

function _schedToggleFollow(title, img) {
    const existing = (_notifFollowedList || []).findIndex(f => f.title === title);
    if (existing !== -1) {
        notifUnfollow((_notifFollowedList || [])[existing].id || title);
    } else {
        notifFollow(title, '', false, title, img);
    }
    // Re-render cards to update bell icon state
    const container = document.getElementById('scheduleContainer');
    if (container && container._grouped) {
        renderScheduleDay(container._grouped, scheduleActiveDay);
    }
}

function formatTimeUntil(seconds) {
    if (!seconds || seconds <= 0) return null;
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}g ${h}s`;
    if (h > 0) return `${h}s ${m}dk`;
    return `${m}dk`;
}

async function loadSchedule() {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;

    if (container.dataset.loaded === 'true') return;

    // Modern loading state
    container.innerHTML = `<div class="sv2-shell">
        <div class="sv2-loading">
            <div class="sv2-loading-orbs">
                <span></span><span></span><span></span>
            </div>
            <p>AniList'ten takvim yükleniyor...</p>
        </div>
    </div>`;

    try {
        const query = `
        query {
          Page(page: 1, perPage: 50) {
            media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
              title { romaji english }
              coverImage { extraLarge large medium }
              bannerImage
              averageScore
              episodes
              format
              popularity
              status
              genres
              studios(isMain: true) { nodes { name } }
              airingSchedule(notYetAired: false, perPage: 1) {
                nodes { episode airingAt }
              }
              nextAiringEpisode {
                episode
                timeUntilAiring
                airingAt
              }
            }
          }
        }`;

        const data = await fetchAniList(query);
        if (!data?.Page?.media) throw new Error('Veri alınamadı');

        const media = data.Page.media;
        const grouped = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
        let totalAiring = 0;

        media.forEach(m => {
            let dayIdx = -1;
            if (m.nextAiringEpisode?.airingAt) {
                dayIdx = new Date(m.nextAiringEpisode.airingAt * 1000).getDay();
            } else if (m.airingSchedule?.nodes?.length > 0) {
                dayIdx = new Date(m.airingSchedule.nodes[0].airingAt * 1000).getDay();
            }
            if (dayIdx !== -1) { grouped[dayIdx].push(m); totalAiring++; }
        });

        const today = new Date().getDay();
        const todayCount = (grouped[today] || []).length;
        const soonCount = (grouped[today] || []).filter(m => {
            const t = m.nextAiringEpisode?.timeUntilAiring;
            return t && t > 0 && t <= 21600;
        }).length;
        const season = _schedGetSeason();

        // Build modern shell
        container.innerHTML = `
        <div class="sv2-shell">
            <!-- Hero Header -->
            <div class="sv2-hero">
                <div class="sv2-hero-bg"></div>
                <div class="sv2-hero-content">
                    <div class="sv2-hero-left">
                        <div class="sv2-hero-kicker">
                            <span class="sv2-live-dot-pulse"></span>
                            Canlı Takvim
                        </div>
                        <h1 class="sv2-hero-title">
                            <i class="fa-solid fa-calendar-week"></i>
                            Haftalık Yayın Takvimi
                        </h1>
                        <p class="sv2-hero-sub">${season} · ${totalAiring} anime yayında</p>
                    </div>
                    <div class="sv2-hero-stats">
                        <div class="sv2-stat-card">
                            <span class="sv2-stat-val">${totalAiring}</span>
                            <span class="sv2-stat-lbl">Bu Sezon</span>
                        </div>
                        <div class="sv2-stat-card highlight">
                            <span class="sv2-stat-val">${todayCount}</span>
                            <span class="sv2-stat-lbl">Bugün</span>
                        </div>
                        <div class="sv2-stat-card">
                            <span class="sv2-stat-val">${soonCount}</span>
                            <span class="sv2-stat-lbl">Yakında</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Day tabs -->
            <div class="sv2-tabs-row">
                <div id="scheduleDayTabs" class="sv2-day-tabs"></div>
            </div>

            <!-- Subbar (search + genre + day summary) -->
            <div id="schedSubbar" class="sv2-subbar"></div>

            <!-- Grid -->
            <div id="scheduleGrid" class="sv2-grid"></div>
        </div>`;

        container._grouped = grouped;
        container.dataset.loaded = 'true';
        _schedSearchQ = '';
        _schedGenreFilter = '';

        scheduleActiveDay = today;
        renderScheduleDayTabs(grouped);
        _schedUpdateSubbar(today, grouped);
        renderScheduleDay(grouped, today);

        // Live countdown tick every minute
        if (!container._tickInterval) {
            container._tickInterval = setInterval(() => {
                if (document.getElementById('scheduleContainer')?.dataset.loaded === 'true') {
                    renderScheduleDay(container._grouped, scheduleActiveDay);
                }
            }, 60000);
        }

    } catch (err) {
        container.innerHTML = `<div class="sv2-error">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>Takvim yüklenirken hata oluştu</p>
            <small>${err.message}</small>
            <button onclick="document.getElementById('scheduleContainer').dataset.loaded='';loadSchedule()">Tekrar Dene</button>
        </div>`;
    }
}

function _schedGetSeason() {
    const m = new Date().getMonth();
    if (m <= 2) return '❄️ Kış Sezonu';
    if (m <= 5) return '🌸 İlkbahar Sezonu';
    if (m <= 8) return '☀️ Yaz Sezonu';
    return '🍂 Sonbahar Sezonu';
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



// ==========================================
// ── ANITR SOSYAL HUB v2 (MODERN SİSTEM) ───
// ==========================================
let currentSocialTab = 'feed';
let currentChatFriendId = null;
let chatRefreshInterval = null;
let socialRefreshInterval = null;
let socialPostType = 'status';
let socialFeedFilter = 'all';
let cachedSocialFriends = [];
let cachedSocialLikes = new Set();
let socialSearchDebounceTimer = null;

function _socEsc(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function _socTimeAgo(d) {
    if (!d) return 'Az önce';
    try {
        const now = new Date();
        const past = new Date(d);
        const diffSec = Math.max(0, Math.floor((now - past) / 1000));
        if (diffSec < 60) return 'Az önce';
        if (diffSec < 3600) return Math.floor(diffSec / 60) + ' dk önce';
        if (diffSec < 86400) return Math.floor(diffSec / 3600) + ' saat önce';
        if (diffSec < 2592000) return Math.floor(diffSec / 86400) + ' gün önce';
        return past.toLocaleDateString('tr-TR');
    } catch(e) {
        return 'Az önce';
    }
}

// ── 1. MODAL KONTROLLERİ ──
window.showFriendsModal = function() {
    if (typeof closeDrawer === 'function') closeDrawer();
    if (typeof closeOnlineRooms === 'function') closeOnlineRooms();
    
    const modal = document.getElementById('friendsModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (currentUser && supabaseClient) {
        document.getElementById('socialAuthView')?.classList.add('hidden');
        const dash = document.getElementById('socialDashboardView');
        if (dash) {
            dash.classList.remove('hidden');
            dash.style.display = 'flex';
        }
        
        // Header User Pill
        const pill = document.getElementById('socialHubUserPill');
        if (pill) {
            pill.classList.remove('hidden');
            const hName = document.getElementById('socialHubHeaderName');
            const hAvatar = document.getElementById('socialHubHeaderAvatar');
            if (hName) hName.innerText = '@' + currentUser;
            if (hAvatar) hAvatar.src = 'https://placehold.co/80x80/1a1a28/8b5cf6?text=' + encodeURIComponent(currentUser[0].toUpperCase());
        }

        // Composer Avatar
        const cAvatar = document.getElementById('composerUserAvatar');
        if (cAvatar) cAvatar.src = 'https://placehold.co/80x80/1a1a28/8b5cf6?text=' + encodeURIComponent(currentUser[0].toUpperCase());

        switchSocialTab(currentSocialTab || 'feed');
        loadSocialFriends();
        _socHeartbeat();
    } else {
        document.getElementById('socialAuthView')?.classList.remove('hidden');
        const dash = document.getElementById('socialDashboardView');
        if (dash) {
            dash.classList.add('hidden');
            dash.style.display = 'none';
        }
        document.getElementById('socialHubUserPill')?.classList.add('hidden');
    }
};

window.closeFriendsModal = function() {
    document.getElementById('friendsModal')?.classList.add('hidden');
    if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
    }
};

window.switchSocialTab = function(tabName) {
    currentSocialTab = tabName;
    
    // Sidebar Nav Buttons
    document.querySelectorAll('.social-nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('stab-' + tabName)?.classList.add('active');

    // Panes
    document.querySelectorAll('.social-tab-pane').forEach(p => p.classList.add('hidden'));
    document.getElementById('stab-content-' + tabName)?.classList.remove('hidden');

    if (tabName === 'feed') {
        loadSocialFeed();
    } else if (tabName === 'friends') {
        loadSocialFriends();
    } else if (tabName === 'messages') {
        loadSocialConversations();
    } else if (tabName === 'requests') {
        loadSocialFriends();
    } else if (tabName === 'profile') {
        loadSocialProfile();
    } else if (tabName === 'search') {
        setTimeout(() => document.getElementById('socialSearchInput')?.focus(), 150);
    }
};

window.socialLogout = function() {
    Swal.fire({
        title: 'Çıkış Yapılsın mı?',
        text: 'Anitr Sosyal ve hesabınızdan çıkış yapmak istediğinize emin misiniz?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#374151',
        confirmButtonText: 'Evet, Çıkış Yap',
        cancelButtonText: 'İptal'
    }).then((res) => {
        if (res.isConfirmed) {
            closeFriendsModal();
            if (typeof handleLogout === 'function') handleLogout();
        }
    });
};

// ── 2. TOPLULUK AKIŞI (FEED) ──
window.setSocialPostType = function(kind) {
    socialPostType = kind;
    document.querySelectorAll('.post-type-chip').forEach(c => {
        if (c.getAttribute('data-type') === kind) c.classList.add('active');
        else c.classList.remove('active');
    });

    const extra = document.getElementById('socialComposerExtra');
    const ratingWrap = document.getElementById('socialComposerRatingWrap');
    
    if (kind === 'status') {
        if (extra) extra.classList.add('hidden');
    } else if (kind === 'review') {
        if (extra) extra.classList.remove('hidden');
        if (ratingWrap) ratingWrap.classList.remove('hidden');
    } else if (kind === 'recommend') {
        if (extra) extra.classList.remove('hidden');
        if (ratingWrap) ratingWrap.classList.add('hidden');
    }
};

window.fillCurrentWatchingAnime = function() {
    let title = '';
    const watchTitleEl = document.getElementById('watchAnimeTitle');
    if (watchTitleEl && watchTitleEl.textContent) {
        title = watchTitleEl.textContent.trim();
    } else if (typeof currentAnime !== 'undefined' && currentAnime && currentAnime.title) {
        title = currentAnime.title.trim();
    }

    const input = document.getElementById('socialFeedAnimeTitle');
    if (input) {
        if (title) {
            input.value = title;
            showToast('🎬 Şu an izlediğin anime eklendi: ' + title);
        } else {
            showToast('Şu an oynatılan bir anime bulunamadı.');
        }
    }
};

window.focusSocialComposer = function() {
    setTimeout(() => {
        const ta = document.getElementById('socialFeedContent');
        if (ta) {
            ta.focus();
            ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
};

window.publishSocialPost = async function() {
    if (!currentUser) {
        showToast('Paylaşım yapmak için giriş yapmalısınız.');
        return;
    }
    const contentInput = document.getElementById('socialFeedContent');
    const content = contentInput ? contentInput.value.trim() : '';
    const animeTitleInput = document.getElementById('socialFeedAnimeTitle');
    const animeTitle = animeTitleInput ? animeTitleInput.value.trim() : '';
    const ratingInput = document.getElementById('socialFeedRating');
    const rating = ratingInput ? parseInt(ratingInput.value, 10) : 8;
    const spoilerInput = document.getElementById('socialFeedSpoiler');
    const spoiler = spoilerInput ? spoilerInput.checked : false;

    if (!content && !animeTitle) {
        showToast('Lütfen bir metin veya anime adı girin.');
        return;
    }

    const postObj = {
        username: currentUser,
        kind: socialPostType,
        content: content,
        anime_title: animeTitle || null,
        rating: socialPostType === 'review' ? rating : null,
        spoiler: spoiler,
        created_at: new Date().toISOString()
    };

    let savedRemote = false;
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('social_posts').insert([postObj]);
            if (!error) {
                savedRemote = true;
            } else {
                console.warn('Supabase social_posts tablosuna yazılamadı:', error.message);
            }
        } catch(e) {
            console.warn('Supabase social_posts hatası:', e);
        }
    }

    // Yerel yedek / fallback
    try {
        let localPosts = JSON.parse(localStorage.getItem('anitr_local_social_posts') || '[]');
        postObj.id = 'loc_' + Date.now();
        localPosts.unshift(postObj);
        if (localPosts.length > 50) localPosts = localPosts.slice(0, 50);
        localStorage.setItem('anitr_local_social_posts', JSON.stringify(localPosts));
    } catch(e) {}

    // Inputları temizle
    if (contentInput) contentInput.value = '';
    if (animeTitleInput) animeTitleInput.value = '';
    if (spoilerInput) spoilerInput.checked = false;

    showToast('✨ Paylaşımınız yayınlandı!');
    loadSocialFeed();
};

window.filterSocialFeed = function(filter) {
    socialFeedFilter = filter;
    document.querySelectorAll('.feed-filter-btn').forEach(b => {
        if (b.id === 'filter-' + filter) b.classList.add('active');
        else b.classList.remove('active');
    });
    loadSocialFeed();
};

window.loadSocialFeed = async function() {
    const listEl = document.getElementById('socialFeedList');
    if (!listEl) return;

    listEl.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text3);"><i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem;"></i><p style="margin-top:0.5rem;">Akış yükleniyor...</p></div>';

    let posts = [];
    let isRemote = false;

    if (supabaseClient) {
        try {
            let query = supabaseClient.from('social_posts').select('*').order('created_at', { ascending: false }).limit(30);
            if (socialFeedFilter && socialFeedFilter !== 'all') {
                query = query.eq('kind', socialFeedFilter);
            }
            const { data, error } = await query;
            if (!error && data) {
                posts = data;
                isRemote = true;
            }
        } catch(e) {
            console.warn('Feed yükleme hatası:', e);
        }
    }

    // Remote post yoksa yerel ve örnek verileri birleştir
    if (posts.length === 0) {
        try {
            let localPosts = JSON.parse(localStorage.getItem('anitr_local_social_posts') || '[]');
            if (socialFeedFilter && socialFeedFilter !== 'all') {
                localPosts = localPosts.filter(p => p.kind === socialFeedFilter);
            }
            posts.push(...localPosts);
        } catch(e) {}

        // Eğer hala boşsa hoş geldin demo postları göster
        if (posts.length === 0) {
            posts = [
                {
                    id: 'demo_1',
                    username: 'AnitrBot',
                    kind: 'status',
                    content: 'Anitr Sosyal v2\'ye hoş geldiniz! 🎉 Buradan anime önerileri paylaşabilir, arkadaşlarınızın hangi bölümde olduğunu görebilir ve canlı sohbet edebilirsiniz.',
                    created_at: new Date(Date.now() - 3600000).toISOString(),
                    likes_count: 5
                },
                {
                    id: 'demo_2',
                    username: 'AnimeLover',
                    kind: 'recommend',
                    content: 'Hala izlemeyen varsa Bleach: Thousand-Year Blood War arcını kesinlikle izlemeli. Animasyon kalitesi ve müzikler inanılmaz seviyede! 🔥',
                    anime_title: 'Bleach: Sennen Kessen-hen',
                    created_at: new Date(Date.now() - 7200000).toISOString(),
                    likes_count: 12
                },
                {
                    id: 'demo_3',
                    username: 'Otaku99',
                    kind: 'review',
                    content: 'Jujutsu Kaisen Shibuya arcı tek kelimeyle bir şaheserdi. Aksiyon dozu ve temposu hiç düşmedi.',
                    anime_title: 'Jujutsu Kaisen 2. Sezon',
                    rating: 10,
                    spoiler: false,
                    created_at: new Date(Date.now() - 14400000).toISOString(),
                    likes_count: 18
                }
            ];
            if (socialFeedFilter && socialFeedFilter !== 'all') {
                posts = posts.filter(p => p.kind === socialFeedFilter);
            }
        }
    }

    // Kullanıcının beğendiği gönderileri çek
    if (supabaseClient && currentUser && isRemote) {
        try {
            const { data: likes } = await supabaseClient.from('social_likes').select('post_id').eq('username', currentUser);
            if (likes) {
                cachedSocialLikes = new Set(likes.map(l => l.post_id));
            }
        } catch(e) {}
    }

    if (posts.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text3);"><i class="fa-solid fa-comment-slash" style="font-size:2rem; margin-bottom:0.75rem; opacity:0.4;"></i><p>Bu filtrede henüz paylaşım bulunmuyor. İlk paylaşımı sen yap!</p></div>';
        return;
    }

    listEl.innerHTML = posts.map(p => {
        const isLiked = cachedSocialLikes.has(p.id);
        const timeStr = _socTimeAgo(p.created_at);
        const userInitial = p.username ? p.username[0].toUpperCase() : 'U';

        let kindBadge = '';
        if (p.kind === 'review') {
            kindBadge = `<span class="social-post-kind-badge kind-review"><i class="fa-solid fa-star"></i> İnceleme ${p.rating ? '(' + p.rating + '/10)' : ''}</span>`;
        } else if (p.kind === 'recommend') {
            kindBadge = `<span class="social-post-kind-badge kind-recommend"><i class="fa-solid fa-thumbs-up"></i> Tavsiye</span>`;
        } else {
            kindBadge = `<span class="social-post-kind-badge kind-status"><i class="fa-solid fa-comment"></i> Durum</span>`;
        }

        let animePill = '';
        if (p.anime_title) {
            animePill = `
                <div class="social-post-anime-pill" onclick="jumpToAnimeFromSocial('${_socEsc(p.anime_title)}')" style="cursor:pointer;" title="Bu animeyi aç">
                    <i class="fa-solid fa-film"></i>
                    <strong>${_socEsc(p.anime_title)}</strong>
                    <i class="fa-solid fa-chevron-right" style="font-size:0.7rem; opacity:0.7;"></i>
                </div>
            `;
        }

        let bodyHtml = '';
        if (p.spoiler) {
            bodyHtml = `
                <div class="social-spoiler-box" id="spoiler-${p.id}" onclick="toggleSocialSpoiler('${p.id}')">
                    <div class="social-spoiler-warning" id="spwarn-${p.id}">
                        <i class="fa-solid fa-triangle-exclamation"></i> Bu gönderi SPOILER içerir. Görmek için tıkla.
                    </div>
                    <div class="social-spoiler-blur" id="spcontent-${p.id}">
                        ${_socEsc(p.content)}
                    </div>
                </div>
            `;
        } else if (p.content) {
            bodyHtml = `<div class="social-post-body">${_socEsc(p.content)}</div>`;
        }

        return `
            <article class="social-post-card" id="post-${p.id}">
                <div class="social-post-header">
                    <div class="social-post-author" onclick="openUserProfile('${_socEsc(p.username)}')">
                        <img src="https://placehold.co/80x80/1a1a28/8b5cf6?text=${encodeURIComponent(userInitial)}" class="social-post-avatar" alt="">
                        <div class="social-post-meta">
                            <span class="social-post-username">@${_socEsc(p.username)}</span>
                            <span class="social-post-time">${timeStr}</span>
                        </div>
                    </div>
                    <div>${kindBadge}</div>
                </div>

                ${animePill}
                ${bodyHtml}

                <div class="social-post-footer">
                    <button class="social-action-btn ${isLiked ? 'liked' : ''}" onclick="toggleSocialLike('${p.id}')" id="likebtn-${p.id}">
                        <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i>
                        <span id="likecnt-${p.id}">${p.likes_count || (isLiked ? 1 : 0)}</span>
                    </button>
                    <button class="social-action-btn" onclick="openSocialChat('${_socEsc(p.username)}')">
                        <i class="fa-regular fa-comment"></i> Yanıtla
                    </button>
                    <button class="social-action-btn" onclick="openUserProfile('${_socEsc(p.username)}')">
                        <i class="fa-regular fa-user"></i> Profil
                    </button>
                </div>
            </article>
        `;
    }).join('');
};

window.toggleSocialSpoiler = function(postId) {
    const warn = document.getElementById('spwarn-' + postId);
    const content = document.getElementById('spcontent-' + postId);
    if (warn && content) {
        warn.style.display = 'none';
        content.classList.remove('social-spoiler-blur');
    }
};

window.toggleSocialLike = async function(postId) {
    if (!currentUser) {
        showToast('Beğenmek için giriş yapmalısınız.');
        return;
    }
    const btn = document.getElementById('likebtn-' + postId);
    const cntEl = document.getElementById('likecnt-' + postId);
    const isCurrentlyLiked = cachedSocialLikes.has(postId);
    let count = parseInt(cntEl?.innerText || '0', 10);

    if (isCurrentlyLiked) {
        cachedSocialLikes.delete(postId);
        if (btn) {
            btn.classList.remove('liked');
            btn.innerHTML = `<i class="fa-regular fa-heart"></i> <span id="likecnt-${postId}">${Math.max(0, count - 1)}</span>`;
        }
        if (supabaseClient) {
            try {
                await supabaseClient.from('social_likes').delete().eq('post_id', postId).eq('username', currentUser);
            } catch(e) {}
        }
    } else {
        cachedSocialLikes.add(postId);
        if (btn) {
            btn.classList.add('liked');
            btn.innerHTML = `<i class="fa-solid fa-heart"></i> <span id="likecnt-${postId}">${count + 1}</span>`;
        }
        if (supabaseClient) {
            try {
                await supabaseClient.from('social_likes').insert([{ post_id: postId, username: currentUser }]);
            } catch(e) {}
        }
    }
};

window.jumpToAnimeFromSocial = function(title) {
    if (!title) return;
    closeFriendsModal();
    if (typeof handleSearch === 'function') {
        handleSearch(title);
        showToast('🔍 Aranıyor: ' + title);
    }
};

// ── 3. ARKADAŞLAR & İSTEKLER ──
window.loadSocialFriends = async function() {
    if (!currentUser || !supabaseClient) return;
    try {
        // Gelen İstekler
        const { data: reqs } = await supabaseClient.from('friends').select('id, sender').eq('receiver', currentUser).eq('status', 'pending');
        
        // Kabul Edilmiş Arkadaşlar
        const { data: f1 } = await supabaseClient.from('friends').select('id, receiver').eq('sender', currentUser).eq('status', 'accepted');
        const { data: f2 } = await supabaseClient.from('friends').select('id, sender').eq('receiver', currentUser).eq('status', 'accepted');
        
        let friends = [];
        if (f1) friends.push(...f1.map(f => ({ id: f.id, username: f.receiver })));
        if (f2) friends.push(...f2.map(f => ({ id: f.id, username: f.sender })));

        if (friends.length > 0) {
            const fNames = friends.map(f => f.username);
            const { data: profiles } = await supabaseClient.from('profiles').select('username, current_anime, last_active').in('username', fNames);
            if (profiles) {
                friends = friends.map(f => {
                    const p = profiles.find(pr => pr.username === f.username);
                    if (p) {
                        f.current_anime = p.current_anime;
                        f.last_active = p.last_active;
                    }
                    return f;
                });
            }
        }

        cachedSocialFriends = friends;

        // Badge & Sayaçlar
        const reqCount = reqs ? reqs.length : 0;
        const reqBadge = document.getElementById('reqBadge');
        const reqBadgeInner = document.getElementById('reqBadgeInner');
        if (reqBadge) {
            reqBadge.innerText = reqCount;
            if (reqCount > 0) reqBadge.classList.remove('hidden');
            else reqBadge.classList.add('hidden');
        }
        if (reqBadgeInner) reqBadgeInner.innerText = reqCount;

        const friendsCountBadge = document.getElementById('friendsCountBadge');
        if (friendsCountBadge) {
            friendsCountBadge.innerText = friends.length;
            if (friends.length > 0) friendsCountBadge.classList.remove('hidden');
            else friendsCountBadge.classList.add('hidden');
        }

        // Friends Presence Count
        let watchingCount = 0;
        let onlineCount = 0;
        const nowMs = Date.now();
        friends.forEach(f => {
            if (f.current_anime) watchingCount++;
            if (f.last_active && (nowMs - new Date(f.last_active).getTime()) < 5 * 60 * 1000) onlineCount++;
        });

        const cntAll = document.getElementById('cntAllFriends');
        const cntWatch = document.getElementById('cntWatchingFriends');
        const cntOnl = document.getElementById('cntOnlineFriends');
        if (cntAll) cntAll.innerText = friends.length;
        if (cntWatch) cntWatch.innerText = watchingCount;
        if (cntOnl) cntOnl.innerText = onlineCount;

        renderFriendsList(friends);

        // Requests Tab List
        const rList = document.getElementById('socialRequestsList');
        if (rList) {
            if (!reqs || reqs.length === 0) {
                rList.innerHTML = '<p style="color:var(--text3); padding:2rem; text-align:center;">Şu an bekleyen arkadaşlık isteği yok.</p>';
            } else {
                rList.innerHTML = reqs.map(r => `
                    <div class="social-user-card">
                        <img src="https://placehold.co/80x80/1a1a28/8b5cf6?text=${encodeURIComponent(r.sender[0].toUpperCase())}" class="social-user-avatar" onclick="openUserProfile('${_socEsc(r.sender)}')">
                        <div style="flex:1;">
                            <strong style="display:block; color:#fff;">@${_socEsc(r.sender)}</strong>
                            <small style="color:var(--text3);">Sana arkadaşlık isteği gönderdi</small>
                        </div>
                        <button class="btn-primary" style="padding: 0.45rem 0.9rem; background:#10b981;" onclick="handleSocialReq('${r.id}', 'accept')"><i class="fa-solid fa-check"></i> Kabul Et</button>
                        <button class="btn-secondary" style="padding: 0.45rem 0.9rem; color:#ef4444;" onclick="handleSocialReq('${r.id}', 'reject')"><i class="fa-solid fa-xmark"></i> Reddet</button>
                    </div>
                `).join('');
            }
        }

    } catch(e) {
        console.error('Arkadaş listesi yüklenemedi:', e);
    }
};

function renderFriendsList(friends) {
    const fList = document.getElementById('socialFriendsList');
    if (!fList) return;

    if (!friends || friends.length === 0) {
        fList.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text3);">
                <i class="fa-solid fa-user-group" style="font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.3;"></i>
                <h4 style="color:#fff; margin:0 0 0.5rem;">Henüz arkadaşın yok</h4>
                <p style="margin:0 0 1.2rem;">"Üye Keşfet" sekmesinden anime izleyen diğer kullanıcıları ekleyebilirsin.</p>
                <button class="btn-primary btn-sm" onclick="switchSocialTab('search')"><i class="fa-solid fa-compass"></i> Üyeleri Keşfet</button>
            </div>
        `;
        return;
    }

    const nowMs = Date.now();
    fList.innerHTML = friends.map(f => {
        const isWatching = !!f.current_anime;
        const isOnline = f.last_active && (nowMs - new Date(f.last_active).getTime()) < 5 * 60 * 1000;
        
        let presenceDot = '<span class="friend-presence-dot" style="background:#6b7280;"></span>';
        let statusText = 'Çevrimdışı';

        if (isWatching) {
            presenceDot = '<span class="friend-presence-dot" style="background:#a855f7; box-shadow:0 0 8px #a855f7;"></span>';
            statusText = '🔴 Şu an anime izliyor';
        } else if (isOnline) {
            presenceDot = '<span class="friend-presence-dot" style="background:#10b981; box-shadow:0 0 8px #10b981;"></span>';
            statusText = '🟢 Çevrimiçi';
        }

        let watchingBanner = '';
        if (isWatching) {
            watchingBanner = `
                <div class="friend-watching-banner">
                    <div>
                        <i class="fa-solid fa-circle-play" style="color:#c084fc;"></i>
                        <strong>${_socEsc(f.current_anime)}</strong>
                    </div>
                    <a onclick="jumpToAnimeFromSocial('${_socEsc(f.current_anime)}')">İzle & Git &gt;</a>
                </div>
            `;
        }

        return `
            <div class="social-friend-card">
                <div class="friend-card-top">
                    <div class="friend-avatar-wrap" onclick="openUserProfile('${_socEsc(f.username)}')">
                        <img src="https://placehold.co/80x80/1a1a28/8b5cf6?text=${encodeURIComponent(f.username[0].toUpperCase())}" class="friend-card-avatar" alt="">
                        ${presenceDot}
                    </div>
                    <div class="friend-card-info">
                        <h4 class="friend-card-name" onclick="openUserProfile('${_socEsc(f.username)}')" style="cursor:pointer;">@${_socEsc(f.username)}</h4>
                        <p class="friend-card-status">${statusText}</p>
                    </div>
                </div>

                ${watchingBanner}

                <div class="friend-card-actions">
                    <button class="friend-action-dm-btn" onclick="openIntegratedChat('${_socEsc(f.username)}')">
                        <i class="fa-solid fa-comments"></i> Mesajlaş
                    </button>
                    <button class="friend-action-icon-btn" onclick="openUserProfile('${_socEsc(f.username)}')" title="Profili Gör">
                        <i class="fa-solid fa-id-card"></i>
                    </button>
                    <button class="friend-action-icon-btn danger" onclick="removeSocialFriend('${f.id}', '${_socEsc(f.username)}')" title="Arkadaşı Çıkar">
                        <i class="fa-solid fa-user-xmark"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.filterLocalFriends = function(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderFriendsList(cachedSocialFriends);
        return;
    }
    const filtered = cachedSocialFriends.filter(f => f.username.toLowerCase().includes(q) || (f.current_anime && f.current_anime.toLowerCase().includes(q)));
    renderFriendsList(filtered);
};

window.filterFriendsByPresence = function(mode) {
    document.querySelectorAll('.friends-status-pills .status-pill').forEach(p => p.classList.remove('active'));
    event?.target?.closest('.status-pill')?.classList.add('active');

    const nowMs = Date.now();
    if (mode === 'watching') {
        renderFriendsList(cachedSocialFriends.filter(f => !!f.current_anime));
    } else if (mode === 'online') {
        renderFriendsList(cachedSocialFriends.filter(f => f.last_active && (nowMs - new Date(f.last_active).getTime()) < 5 * 60 * 1000));
    } else {
        renderFriendsList(cachedSocialFriends);
    }
};

window.handleSocialReq = async function(reqId, action) {
    if (!supabaseClient) return;
    try {
        if (action === 'accept') {
            await supabaseClient.from('friends').update({ status: 'accepted' }).eq('id', reqId);
            showToast('✅ Arkadaşlık isteği kabul edildi!');
        } else {
            await supabaseClient.from('friends').delete().eq('id', reqId);
            showToast('İstek reddedildi.');
        }
        loadSocialFriends();
    } catch(e) {
        alert(e.message);
    }
};

window.removeSocialFriend = function(relId, username) {
    Swal.fire({
        title: 'Arkadaşlıktan Çıkar',
        text: `@${username} arkadaş listenizden çıkarılsın mı?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#374151',
        confirmButtonText: 'Evet, Çıkar',
        cancelButtonText: 'İptal'
    }).then(async (res) => {
        if (res.isConfirmed && supabaseClient) {
            try {
                await supabaseClient.from('friends').delete().eq('id', relId);
                showToast(`@${username} arkadaşlıktan çıkarıldı.`);
                loadSocialFriends();
            } catch(e) {
                showToast('İşlem başarısız oldu.');
            }
        }
    });
};

// ── 4. ENTEGRE SOHBET (DM) ──
window.loadSocialConversations = function() {
    const listEl = document.getElementById('socialConversationsList');
    if (!listEl) return;

    if (!cachedSocialFriends || cachedSocialFriends.length === 0) {
        listEl.innerHTML = '<p style="color:var(--text3); font-size:0.8rem; padding:1rem; text-align:center;">Henüz bir arkadaşınız yok.</p>';
        return;
    }

    listEl.innerHTML = cachedSocialFriends.map(f => {
        const isActive = currentChatFriendId === f.username;
        const userInitial = f.username ? f.username[0].toUpperCase() : 'U';
        return `
            <div class="social-contact-item ${isActive ? 'active' : ''}" onclick="openIntegratedChat('${_socEsc(f.username)}')">
                <img src="https://placehold.co/80x80/1a1a28/8b5cf6?text=${encodeURIComponent(userInitial)}" class="contact-avatar">
                <div class="contact-info">
                    <span class="contact-name">@${_socEsc(f.username)}</span>
                    <span class="contact-preview">${f.current_anime ? 'İzliyor: ' + _socEsc(f.current_anime) : 'Sohbet başlat'}</span>
                </div>
            </div>
        `;
    }).join('');
};

window.openIntegratedChat = function(friendName) {
    currentChatFriendId = friendName;
    switchSocialTab('messages');
    loadSocialConversations();

    const empty = document.getElementById('socialChatEmptyState');
    const area = document.getElementById('socialChatActiveArea');
    if (empty) empty.classList.add('hidden');
    if (area) area.classList.remove('hidden');

    const nameEl = document.getElementById('socialActiveChatName');
    const avatarEl = document.getElementById('socialActiveChatAvatar');
    const statusEl = document.getElementById('socialActiveChatStatus');
    const dotEl = document.getElementById('socialActiveChatPresenceDot');

    if (nameEl) nameEl.innerText = '@' + friendName;
    if (avatarEl) avatarEl.src = 'https://placehold.co/80x80/1a1a28/8b5cf6?text=' + encodeURIComponent(friendName[0].toUpperCase());

    const friendObj = cachedSocialFriends.find(f => f.username === friendName);
    if (statusEl && dotEl) {
        if (friendObj && friendObj.current_anime) {
            statusEl.innerText = 'Şu an izliyor: ' + friendObj.current_anime;
            statusEl.style.color = '#c084fc';
            dotEl.className = 'status-dot watching';
        } else {
            statusEl.innerText = 'Çevrimiçi';
            statusEl.style.color = '#10b981';
            dotEl.className = 'status-dot online';
        }
    }

    loadIntegratedChatMessages();
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(loadIntegratedChatMessages, 2500);

    setTimeout(() => {
        document.getElementById('socialHubChatInput')?.focus();
    }, 150);
};

// Fallback modal uyumluluğu
window.openSocialChat = function(friendName) {
    const hubModal = document.getElementById('friendsModal');
    if (hubModal && !hubModal.classList.contains('hidden')) {
        openIntegratedChat(friendName);
        return;
    }
    // Standalone modal
    currentChatFriendId = friendName;
    const nameEl = document.getElementById('chatUsername');
    const avatarEl = document.getElementById('chatAvatar');
    if (nameEl) nameEl.innerText = '@' + friendName;
    if (avatarEl) avatarEl.src = 'https://placehold.co/80x80/1a1a28/8b5cf6?text=' + encodeURIComponent(friendName[0].toUpperCase());
    document.getElementById('chatModal')?.classList.remove('hidden');
    loadChatMessages();
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(loadChatMessages, 2500);
};

window.closeChatModal = function() {
    document.getElementById('chatModal')?.classList.add('hidden');
    currentChatFriendId = null;
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
};

async function loadIntegratedChatMessages() {
    if (!currentChatFriendId || !supabaseClient || !currentUser) return;
    try {
        const { data: messages } = await supabaseClient.from('friend_messages')
            .select('*')
            .or(`and(sender.eq.${currentUser},receiver.eq.${currentChatFriendId}),and(sender.eq.${currentChatFriendId},receiver.eq.${currentUser})`)
            .order('created_at', { ascending: true });

        const stream = document.getElementById('socialHubMessages');
        if (!stream) return;
        const wasAtBottom = stream.scrollHeight - stream.scrollTop <= stream.clientHeight + 40;

        if (!messages || messages.length === 0) {
            stream.innerHTML = `
                <div style="text-align:center; padding:3rem 1rem; color:var(--text3);">
                    <i class="fa-solid fa-comments" style="font-size:2.5rem; margin-bottom:0.75rem; opacity:0.3;"></i>
                    <p style="margin:0;">@${_socEsc(currentChatFriendId)} ile henüz mesajlaşmadınız.<br>İlk mesajı göndererek sohbete başlayın!</p>
                </div>
            `;
            return;
        }

        stream.innerHTML = messages.map(m => {
            const isMe = m.sender === currentUser;
            const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <div class="chat-bubble ${isMe ? 'sent' : 'received'}">
                    <div>${_socEsc(m.message)}</div>
                    <small style="display:block; text-align:right; font-size:0.65rem; opacity:0.7; margin-top:2px;">${timeStr}</small>
                </div>
            `;
        }).join('');

        if (wasAtBottom) stream.scrollTop = stream.scrollHeight;
    } catch(e) {
        console.warn('Mesaj yükleme hatası:', e);
    }
}

window.sendIntegratedChatMessage = async function() {
    if (!currentChatFriendId || !supabaseClient || !currentUser) return;
    const inp = document.getElementById('socialHubChatInput');
    const msg = inp ? inp.value.trim() : '';
    if (!msg) return;
    inp.value = '';

    const stream = document.getElementById('socialHubMessages');
    if (stream) {
        const timeNow = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        stream.innerHTML += `
            <div class="chat-bubble sent">
                <div>${_socEsc(msg)}</div>
                <small style="display:block; text-align:right; font-size:0.65rem; opacity:0.7; margin-top:2px;">${timeNow}</small>
            </div>
        `;
        stream.scrollTop = stream.scrollHeight;
    }

    try {
        await supabaseClient.from('friend_messages').insert([{ sender: currentUser, receiver: currentChatFriendId, message: msg }]);
        loadIntegratedChatMessages();
    } catch(e) {
        showToast('Mesaj gönderilemedi');
    }
};

// Standalone Modal Message send
async function loadChatMessages() {
    if (!currentChatFriendId || !supabaseClient || !currentUser) return;
    try {
        const { data: messages } = await supabaseClient.from('friend_messages')
            .select('*')
            .or(`and(sender.eq.${currentUser},receiver.eq.${currentChatFriendId}),and(sender.eq.${currentChatFriendId},receiver.eq.${currentUser})`)
            .order('created_at', { ascending: true });

        const box = document.getElementById('chatMessages');
        if (!box) return;
        const wasAtBottom = box.scrollHeight - box.scrollTop <= box.clientHeight + 10;
        
        if (!messages || messages.length === 0) {
            box.innerHTML = '<p style="color:var(--text3); text-align:center; margin-top:2rem;">İlk mesajı gönderin!</p>';
            return;
        }
        
        box.innerHTML = messages.map(m => {
            const isMe = m.sender === currentUser;
            return `<div class="chat-bubble ${isMe ? 'sent' : 'received'}">${_socEsc(m.message)}</div>`;
        }).join('');
        
        if (wasAtBottom) box.scrollTop = box.scrollHeight;
    } catch(e) {}
}

window.sendChatMessage = async function() {
    if (!currentChatFriendId || !supabaseClient || !currentUser) return;
    const inp = document.getElementById('chatInput');
    const msg = inp ? inp.value.trim() : '';
    if (!msg) return;
    inp.value = '';
    
    const box = document.getElementById('chatMessages');
    if (box) {
        box.innerHTML += `<div class="chat-bubble sent">${_socEsc(msg)}</div>`;
        box.scrollTop = box.scrollHeight;
    }
    
    try {
        await supabaseClient.from('friend_messages').insert([{ sender: currentUser, receiver: currentChatFriendId, message: msg }]);
        loadChatMessages();
    } catch(e) {
        showToast('Mesaj gönderilemedi');
    }
};

// ── 5. KEŞFET & ARAMA ──
window._debounceSocialSearch = function() {
    if (socialSearchDebounceTimer) clearTimeout(socialSearchDebounceTimer);
    socialSearchDebounceTimer = setTimeout(searchSocialUsers, 350);
};

window.searchSocialUsers = async function() {
    if (!supabaseClient || !currentUser) return;
    const inp = document.getElementById('socialSearchInput');
    const q = inp ? inp.value.trim() : '';
    const resBox = document.getElementById('socialSearchResults');
    if (!resBox) return;

    if (!q) {
        resBox.innerHTML = '<p class="social-empty-hint">Kullanıcı aramak için yukarıdaki kutuya kullanıcı adı yazın.</p>';
        return;
    }

    resBox.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text3);"><i class="fa-solid fa-spinner fa-spin"></i> Aranıyor...</div>';

    try {
        const { data: users } = await supabaseClient.from('profiles')
            .select('username, current_anime, last_active')
            .ilike('username', `%${q}%`)
            .neq('username', currentUser)
            .limit(16);

        if (!users || users.length === 0) {
            resBox.innerHTML = '<p class="social-empty-hint">Hiçbir kullanıcı bulunamadı.</p>';
            return;
        }

        const friendUsernames = new Set(cachedSocialFriends.map(f => f.username));

        resBox.innerHTML = users.map(u => {
            const isFriend = friendUsernames.has(u.username);
            return `
                <div class="social-user-card">
                    <img src="https://placehold.co/80x80/1a1a28/8b5cf6?text=${encodeURIComponent(u.username[0].toUpperCase())}" class="social-user-avatar" onclick="openUserProfile('${_socEsc(u.username)}')">
                    <div style="flex:1; min-width:0;">
                        <strong style="display:block; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" onclick="openUserProfile('${_socEsc(u.username)}')" style="cursor:pointer;">@${_socEsc(u.username)}</strong>
                        <small style="color:var(--text3);">${u.current_anime ? 'İzliyor: ' + _socEsc(u.current_anime) : 'Anitr Üyesi'}</small>
                    </div>
                    ${isFriend ? `
                        <button class="btn-secondary btn-sm" onclick="openIntegratedChat('${_socEsc(u.username)}')"><i class="fa-solid fa-comments"></i> Mesaj</button>
                    ` : `
                        <button class="btn-primary btn-sm" onclick="addSocialFriend('${_socEsc(u.username)}')"><i class="fa-solid fa-user-plus"></i> Ekle</button>
                    `}
                </div>
            `;
        }).join('');
    } catch(e) {
        console.error('Kullanıcı arama hatası:', e);
    }
};

window.addSocialFriend = async function(targetUsername) {
    if (!supabaseClient || !currentUser) return;
    try {
        const { error } = await supabaseClient.from('friends').insert([{ sender: currentUser, receiver: targetUsername, status: 'pending' }]);
        if (error) throw error;
        showToast('✉️ Arkadaşlık isteği gönderildi: @' + targetUsername);
        searchSocialUsers();
    } catch(e) {
        showToast('Zaten arkadaşsınız veya bekleyen bir istek var.');
    }
};

// ── 6. PROFİLİM & BİYO GÜNCELLEME ──
async function loadSocialProfile() {
    if (!currentUser || !supabaseClient) return;
    try {
        const { data } = await supabaseClient.from('profiles').select('*').eq('username', currentUser).single();
        const nameEl = document.getElementById('myProfileName');
        const avatarEl = document.getElementById('myProfileAvatar');
        const bioEl = document.getElementById('myProfileBio');
        const currentEl = document.getElementById('myProfileCurrent');
        const statusInput = document.getElementById('socialStatusInput');

        if (nameEl) nameEl.innerText = '@' + currentUser;
        if (avatarEl) avatarEl.src = 'https://placehold.co/120x120/1a1a28/8b5cf6?text=' + encodeURIComponent(currentUser[0].toUpperCase());
        
        const bioText = (data && data.bio) ? data.bio : 'Anime izlemeyi ve keşfetmeyi seviyorum.';
        if (bioEl) bioEl.innerText = bioText;
        if (statusInput) statusInput.value = (data && data.bio) ? data.bio : '';

        if (currentEl) {
            if (data && data.current_anime) {
                currentEl.innerHTML = `🔴 <strong>${_socEsc(data.current_anime)}</strong> izleniyor`;
            } else {
                currentEl.innerText = 'Şu an anime izlemiyor';
            }
        }
    } catch(e) {
        console.error('Sosyal profil yüklenemedi:', e);
    }
}

window.updateSocialBio = async function() {
    if (!currentUser || !supabaseClient) return;
    const inp = document.getElementById('socialStatusInput');
    const newBio = inp ? inp.value.trim() : '';
    if (!newBio) return;

    try {
        const { error } = await supabaseClient.from('profiles').update({ bio: newBio }).eq('username', currentUser);
        if (error) throw error;
        const bioEl = document.getElementById('myProfileBio');
        if (bioEl) bioEl.innerText = newBio;
        showToast('💾 Profil durumunuz güncellendi!');
    } catch(e) {
        showToast('Profil güncellenemedi.');
    }
};

// ── 7. CANLI DURUM HEARTBEAT ──
function _socHeartbeat() {
    if (!currentUser || !supabaseClient) return;
    let current = '';
    const wv = document.getElementById('watchView');
    if (wv && !wv.classList.contains('hidden')) {
        const watchTitleEl = document.getElementById('watchAnimeTitle');
        if (watchTitleEl && watchTitleEl.textContent) {
            current = watchTitleEl.textContent.trim();
        } else if (typeof currentAnime !== 'undefined' && currentAnime && currentAnime.title) {
            current = currentAnime.title.trim();
        }
    }

    supabaseClient.from('profiles').upsert({
        username: currentUser,
        current_anime: current,
        last_active: new Date().toISOString()
    }).then(() => {});
}
setInterval(_socHeartbeat, 30000);
if (typeof currentUser !== 'undefined' && currentUser) setTimeout(_socHeartbeat, 3000);

window.uploadHeroBackground = async function(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    const bgInput = document.getElementById('settingHeroCustomBg');
    const originalPlaceholder = bgInput.placeholder;
    bgInput.placeholder = 'Yükleniyor... Lütfen bekleyin.';
    bgInput.value = '';
    
    try {
        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error('Yükleme başarısız oldu');
        const data = await res.json();
        
        bgInput.value = data.url;
        saveSettings();
        showToast('✅ Dosya başarıyla yüklendi!');
    } catch(err) {
        console.error(err);
        showToast('⚠️ Dosya yüklenirken bir hata oluştu.');
    } finally {
        bgInput.placeholder = originalPlaceholder;
        input.value = '';
    }
}

// --- AI Navbar Modal ---
window.showAIModal = function() {
    const aim = document.getElementById('aiModal') || document.getElementById('aiModalOverlay'); if(aim) aim.classList.remove('hidden');
    document.getElementById('aiModalResult').style.display = 'none';
    document.getElementById('aiModalResult').innerHTML = '';
}
window.closeAIModal = function() {
    const aim2 = document.getElementById('aiModal') || document.getElementById('aiModalOverlay'); if(aim2) aim2.classList.add('hidden');
}

window.askAIForMAL = async function() {
    const resEl = document.getElementById('aiModalResult');
    resEl.style.display = 'block';
    
    if (!malUser) {
        resEl.innerHTML = '<p style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Lütfen ayarlardan MyAnimeList hesabınızı bağlayın!</p>';
        return;
    }
    if (!appSettings.aiEnabled || !appSettings.aiApiKey) {
        resEl.innerHTML = '<p style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Lütfen ayarlardan Yapay Zeka (AI) özelliğini açın ve API anahtarınızı girin!</p>';
        return;
    }

    resEl.innerHTML = '<div style="text-align:center; padding:1rem;"><div class="spinner" style="display:inline-block"></div><p style="margin-top:10px; color:var(--text3);">MAL listeniz analiz ediliyor...</p></div>';

    let watchHistoryText = '';
    try {
        const wlRes = await fetch(`${API_BASE}/mal/watchlist?username=${encodeURIComponent(malUser)}&status=completed`);
        let wlData = await wlRes.json();
        if (wlData && Array.isArray(wlData)) {
            wlData.sort((a,b) => (b.score || 0) - (a.score || 0));
            wlData = wlData.slice(0, 30);
            watchHistoryText = wlData.map(a => `${a.title} (Puan: ${a.score})`).join(', ');
        }
    } catch(err) { console.log('MAL veri çekme hatası (AI için)', err); }

    if (!watchHistoryText) {
        resEl.innerHTML = '<p style="color:#ef4444;">MAL listeniz boş veya okunamadı.</p>';
        return;
    }

    resEl.innerHTML = '<div style="text-align:center; padding:1rem;"><div class="spinner" style="display:inline-block"></div><p style="margin-top:10px; color:var(--text3);">Yapay Zeka izleme zevkinizi değerlendiriyor...</p></div>';

    const prompt = `Kullanıcının daha önce izlediği ve yüksek puan verdiği animeler şunlar: ${watchHistoryText}. 

Bu kullanıcının zevkini analiz ederek, ona İZLEMEDİĞİ ve ÇOK SEVECEĞİ 5 farklı anime öner. 
Cevabını Markdown kullanarak güzel bir şekilde biçimlendir. Başlıkları, kısa nedenleri kalın yaz.`;
    
    const result = await callAIAPI(prompt);
    if (result) {
        resEl.innerHTML = marked.parse(result);
    } else {
        resEl.innerHTML = '<p style="color:#ef4444;">Yanıt alınamadı. Lütfen API ayarlarınızı kontrol edin.</p>';
    }
}

window.askAICustom = async function() {
    const input = document.getElementById('aiCustomPrompt').value.trim();
    if (!input) return;
    
    const resEl = document.getElementById('aiModalResult');
    resEl.style.display = 'block';
    
    if (!appSettings.aiEnabled || !appSettings.aiApiKey) {
        resEl.innerHTML = '<p style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Lütfen ayarlardan Yapay Zeka (AI) özelliğini açın ve API anahtarınızı girin!</p>';
        return;
    }

    resEl.innerHTML = '<div style="text-align:center; padding:1rem;"><div class="spinner" style="display:inline-block"></div><p style="margin-top:10px; color:var(--text3);">Yapay zeka düşünüyor...</p></div>';

    const prompt = `Kullanıcı sana şöyle bir istekte bulundu: "${input}". Lütfen Markdown formatında, şık ve detaylı bir şekilde önerilerini sırala.`;
    
    const result = await callAIAPI(prompt);
    if (result) {
        resEl.innerHTML = marked.parse(result);
    } else {
        resEl.innerHTML = '<p style="color:#ef4444;">Yanıt alınamadı. Lütfen API ayarlarınızı kontrol edin.</p>';
    }
}


// ── SMART STICKY NAVBAR ──
let lastScrollY = window.scrollY;
let navTimeout;
window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (!nav) return;
    
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > 60) {
        nav.classList.add('scrolled');
        if (currentScrollY > lastScrollY && currentScrollY > 200) {
            // Scrolling down (Hide navbar)
            nav.style.transform = 'translate(-50%, -150%)';
        } else {
            // Scrolling up (Show navbar)
            nav.style.transform = 'translate(-50%, 0)';
        }
    } else {
        // At the top (Transparent, fully visible)
        nav.classList.remove('scrolled');
        nav.style.transform = 'translate(-50%, 0)';
    }
    
    lastScrollY = currentScrollY;

    // Bring navbar back after stopped scrolling
    clearTimeout(navTimeout);
    if (currentScrollY > 200) {
        navTimeout = setTimeout(() => {
            nav.style.transform = 'translate(-50%, 0)';
        }, 800);
    }
});

window.toggleFavoriteFromId = function(id, btn) {
    if (typeof toggleWatchlistItem === 'function') {
        toggleWatchlistItem({id: id, title: id, img: '', slug: id, isMovie: false});
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i>';
            btn.style.color = '#10b981';
        }
    }
};


// ── Bulk Episode Download ─────────────────────────────────
let bulkDownloadMode = false;
let bulkSelectedEps = new Set();

window.toggleBulkMode = function() {
    bulkDownloadMode = !bulkDownloadMode;
    bulkSelectedEps.clear();
    const btn = document.getElementById('bulkDownloadToggleBtn');
    const panel = document.getElementById('bulkDownloadPanel');
    const cards = document.querySelectorAll('.episode-card');
    if (bulkDownloadMode) {
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i> İptal';
        btn.classList.add('active');
        panel && panel.classList.remove('hidden');
        cards.forEach(c => {
            const cb = document.createElement('div');
            cb.className = 'ep-bulk-checkbox';
            cb.innerHTML = '<i class="fa-solid fa-check"></i>';
            cb.onclick = (e) => { e.stopPropagation(); toggleBulkEp(c, cb); };
            c.prepend(cb);
            c.classList.add('bulk-mode');
        });
    } else {
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Toplu İndir';
        btn.classList.remove('active');
        const bulkStartBtn2 = document.getElementById('bulkStartBtn');
        if (bulkStartBtn2) bulkStartBtn2.classList.add('hidden');
        document.querySelectorAll('.ep-bulk-checkbox').forEach(cb => cb.remove());
        cards.forEach(c => c.classList.remove('bulk-mode', 'bulk-selected'));
    }
};

function toggleBulkEp(card, cb) {
    const idx = card.dataset.epIdx;
    if (bulkSelectedEps.has(idx)) {
        bulkSelectedEps.delete(idx);
        card.classList.remove('bulk-selected');
        cb.classList.remove('checked');
    } else {
        bulkSelectedEps.add(idx);
        card.classList.add('bulk-selected');
        cb.classList.add('checked');
    }
    const countEl = document.getElementById('bulkSelectedCount');
    if (countEl) countEl.textContent = bulkSelectedEps.size;
    
    const startBtn = document.getElementById('bulkStartBtn');
    if (startBtn) {
        if (bulkSelectedEps.size > 0) startBtn.classList.remove('hidden');
        else startBtn.classList.add('hidden');
    }
}

window.startBulkDownload = async function() {
    if (bulkSelectedEps.size === 0) { showToast('⚠️ Önce bölüm seçin!'); return; }
    
    // Açık değilse modalı açıp kalite seçtirebiliriz, ama şimdilik varsayılan veya en son seçileni kullanalım.
    const targetQ = selectedDownloadQuality || '1080';
    const targetLang = selectedDownloadLang || 'jp';
    
    showToast(`⏳ ${bulkSelectedEps.size} bölüm için kaynaklar bulunuyor...`);
    
    let successCount = 0;
    
    for (const idx of bulkSelectedEps) {
        const ep = currentEpisodes[parseInt(idx)];
        if (!ep) continue;
        
        const urlArg  = ep.ID ? 'url='  + encodeURIComponent(ep.ID) : '';
        const idArg   = currentAnime.id ? 'id=' + currentAnime.id : '';
        const slugArg = currentAnime.slug ? 'slug=' + encodeURIComponent(currentAnime.slug) : '';
        const qs = [urlArg, slugArg, idArg, 'is_movie=' + currentAnime.isMovie, 'source=' + encodeURIComponent(currentSource), 'season_index=' + currentSIdx, 'episode_index=' + idx].filter(Boolean).join('&');

        try {
            const watchData = await fetchAPI('/watch?' + qs);
            if (!watchData || !Array.isArray(watchData) || watchData.length === 0) continue;
            
            // Aynı eşleştirme mantığı
            let watch = watchData.find(w => {
                const url = (w.Url || w.url || '').toLowerCase();
                const snd = (w.Sound || w.sound || '').toLowerCase();
                const q = (w.Quality || w.quality || w.label || '').toString().toLowerCase();
                const isTr = snd === 'tr' || url.includes('tr');
                const langMatch = targetLang === 'tr' ? isTr : !isTr;
                return langMatch && q.includes(targetQ);
            });
            if (!watch) watch = watchData.find(w => (w.Quality || w.quality || w.label || '').toString().toLowerCase().includes(targetQ)) || watchData[0];
            
            const videoUrl = watch.Url || watch.url || (watch.Urls && watch.Urls.length > 0 ? watch.Urls[0] : null);
            if (!videoUrl) continue;
            
            const langLabel = targetLang === 'tr' ? ' [TR Dublaj]' : ' [JP]';
            const epTitle = ep.Title || ('Bölüm ' + (ep.Number || (parseInt(idx)+1)));
            const filename = `${currentAnime.title} - ${epTitle} (${targetQ}p${langLabel}).mp4`;
            
            const downloadId = Date.now() + Math.random();
            const newDl = {
                id: downloadId,
                animeId: currentAnime.id,
                animeTitle: currentAnime.title,
                episodeTitle: epTitle,
                image: currentAnime.img,
                quality: targetQ,
                lang: targetLang,
                status: 'completed',
                progress: 100,
                url: videoUrl,
                filename: filename
            };
            downloads.unshift(newDl);
            
            const a = document.createElement('a');
            a.href = videoUrl;
            a.download = filename;
            a.click();
            
            successCount++;
            await new Promise(r => setTimeout(r, 1200)); // Tarayıcıyı boğmamak için bekle
            
        } catch (e) {
            console.error('Bulk DL Error for ep ' + idx, e);
        }
    }
    
    saveDownloads();
    showToast(`✅ ${successCount} bölüm indirilmeye başlandı!`);
    window.toggleBulkMode();
};
window.clearAllDownloads = function() {
    if (!confirm('Tüm indirme geçmişi silinsin mi?')) return;
    downloads = [];
    saveDownloads();
    renderDownloads();
    showToast('🗑️ Tüm indirmeler temizlendi');
};
// --- 6.0 FEATURES: PIP & SCROLL REVEAL ---
let scrollObserver;
function initScrollReveal() {
    if (scrollObserver) scrollObserver.disconnect();
    if (!appSettings.scrollAnim) return;
    
    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Optional: scrollObserver.unobserve(entry.target);
            } else {
                // Optional: remove visible if you want it to hide again when scrolling up
                entry.target.classList.remove('visible');
            }
        });
    }, { threshold: 0.1 });
    
    // Add reveal class to cards
    document.querySelectorAll('.anime-card, .sidebar-ep-btn, .nf-section-title').forEach(el => {
        if(!el.classList.contains('reveal')) {
            el.classList.add('reveal');
            scrollObserver.observe(el);
        }
    });
}

// Trigger initScrollReveal after generating UI
const originalRenderCards = window.renderCards; // If needed, or just hook into standard functions
document.addEventListener('scroll', () => {
    // Picture in Picture logic
    const videoContainer = document.querySelector('.video-container-page');
    // Güvenli kontrol (currentView tanım hatasını önlemek için)
    const isWatchView = typeof currentView !== 'undefined' && currentView === 'watchView';
    
    if (isWatchView && videoContainer) {
        if (window.scrollY > 400) {
            videoContainer.classList.add('floating-player');
        } else {
            videoContainer.classList.remove('floating-player');
        }
    } else if (videoContainer) {
        videoContainer.classList.remove('floating-player');
    }
});

// ══════════════════════════════════════════════════════════
// SUPABASE YORUM SİSTEMİ (COMMENTS V2 - LIKES & REPLIES)
// ══════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://lydtgsywyjxfttwzrqfx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jcX_sqm0qJYzHY6N8rXKrg_2GO_ERCb';

let supabaseClient = null;
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

let currentReplyParentId = null;

// Spoiler / yanıt bilgisi veritabanı şemasından bağımsız çalışsın diye içerik başında işaretçi olarak da saklanır
function _cmParse(c) {
    let t = c.content || '', spoiler = !!c.is_spoiler, pid = c.parent_id || null, m;
    while ((m = t.match(/^\[\[(SPOILER|RE:(\d+))\]\]/))) {
        if (m[1] === 'SPOILER') spoiler = true; else pid = parseInt(m[2], 10);
        t = t.slice(m[0].length);
    }
    return { text: t, spoiler: spoiler, pid: pid };
}
function _cmEsc(t) {
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function fetchComments(epKey) {
    const list = document.getElementById('commentsList');
    if (!list) return;
    if (!supabaseClient) { list.innerHTML = '<div class="empty-search-state" style="color:#ef4444;">Yorum sistemi yüklenemedi (Supabase).</div>'; return; }

    list.innerHTML = '<div class="empty-search-state"><div class="spinner" style="display:inline-block"></div> Yorumlar yükleniyor...</div>';

    try {
        const { data, error } = await supabaseClient
            .from('comments')
            .select('*')
            .eq('ep_key', epKey)
            .order('created_at', { ascending: true });
        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<div class="empty-search-state">Bu bölüme henüz yorum yapılmamış. İlk yorumu sen yap!</div>';
            return;
        }
        data.forEach(c => { c._p = _cmParse(c); });
        const parents = data.filter(c => !c._p.pid);
        const replies = data.filter(c => c._p.pid);

        let html = '';
        parents.forEach(p => {
            html += renderSingleComment(p, false);
            const child = replies.filter(r => r._p.pid === p.id);
            if (child.length > 0) {
                html += '<div class="comment-replies">';
                child.forEach(r => { html += renderSingleComment(r, true); });
                html += '</div>';
            }
        });
        list.innerHTML = html;
    } catch (err) {
        console.error("Yorum çekme hatası:", err);
        list.innerHTML = '<div class="empty-search-state" style="color:#ef4444;">Yorumlar yüklenirken bir hata oluştu.</div>';
    }
}

function renderSingleComment(c, isReply) {
    const p = c._p || _cmParse(c);
    const date = new Date(c.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const safeName = _cmEsc(c.username || 'Anonim');
    const initial = safeName[0] ? safeName[0].toUpperCase() : 'A';
    const safeContent = _cmEsc(p.text).replace(/\n/g, '<br>');
    const av = c.avatar_url ? _cmEsc(c.avatar_url) : '';
    const avatarHtml = av
        ? `<div class="comment-avatar" style="background-image:url('${av}')"></div>`
        : `<div class="comment-avatar">${initial}</div>`;
    const likedComments = JSON.parse(localStorage.getItem('liked_comments') || '[]');
    const isLiked = likedComments.includes(c.id);

    const textHtml = p.spoiler
        ? `<div class="comment-text spoiler-wrap" onclick="revealSpoiler(this)">
               <div class="spoiler-body">${safeContent}</div>
               <div class="spoiler-cover"><i class="fa-solid fa-eye-slash"></i><span>Spoiler içeriyor</span><small>Görmek için tıkla</small></div>
           </div>`
        : `<div class="comment-text">${safeContent}</div>`;

    return `
        <div class="comment-box reveal visible" style="${isReply ? 'background: rgba(0,0,0,0.2); border:none;' : ''}">
            ${avatarHtml}
            <div class="comment-content-area">
                <div class="comment-header">
                    <div class="comment-author" onclick="viewProfile('${safeName}', '${av}')">${safeName}</div>
                    ${p.spoiler ? '<span class="spoiler-badge"><i class="fa-solid fa-triangle-exclamation"></i> Spoiler</span>' : ''}
                    <div class="comment-date">${date}</div>
                </div>
                ${textHtml}
                <div class="comment-actions">
                    <button class="comment-action-btn ${isLiked ? 'liked' : ''}" onclick="likeComment(${c.id}, this)">
                        <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i> <span class="like-count">${c.likes_count || 0}</span>
                    </button>
                    ${!isReply ? `<button class="comment-action-btn" onclick="setReplyMode(${c.id}, '${safeName}')"><i class="fa-solid fa-reply"></i> Yanıtla</button>` : ''}
                </div>
            </div>
        </div>
    `;
}

window.revealSpoiler = function(el) { el.classList.add('revealed'); };
window.toggleSpoilerFlag = function(btn) {
    btn.classList.toggle('on');
    const on = btn.classList.contains('on');
    btn.querySelector('span').textContent = on ? 'Spoiler olarak işaretlendi' : 'Spoiler içeriyor';
};

window.setReplyMode = function(parentId, username) {
    currentReplyParentId = parentId;
    const inputArea = document.querySelector('.comment-input-area');
    
    // Var olan indicator varsa sil
    const existing = document.getElementById('replyIndicator');
    if (existing) existing.remove();
    
    const indicator = document.createElement('div');
    indicator.id = 'replyIndicator';
    indicator.className = 'replying-indicator';
    indicator.innerHTML = `<span><i class="fa-solid fa-reply"></i> <b>${username}</b> adlı kullanıcıya yanıt veriliyor...</span> <button onclick="cancelReply()">&times;</button>`;
    
    inputArea.insertBefore(indicator, inputArea.firstChild);
    document.getElementById('commentContent').focus();
};

window.cancelReply = function() {
    currentReplyParentId = null;
    const existing = document.getElementById('replyIndicator');
    if (existing) existing.remove();
};

window.likeComment = async function(id, btnEl) {
    let likedComments = JSON.parse(localStorage.getItem('liked_comments') || '[]');
    const isLiked = likedComments.includes(id);
    const countEl = btnEl.querySelector('.like-count');
    const iconEl = btnEl.querySelector('i');
    let currentCount = parseInt(countEl.innerText);

    // İyimser UI Güncellemesi (Optimistic UI)
    if (isLiked) {
        // Unlike
        likedComments = likedComments.filter(cid => cid !== id);
        currentCount--;
        btnEl.classList.remove('liked');
        iconEl.className = 'fa-regular fa-heart';
    } else {
        // Like
        likedComments.push(id);
        currentCount++;
        btnEl.classList.add('liked');
        iconEl.className = 'fa-solid fa-heart';
    }
    countEl.innerText = currentCount;
    localStorage.setItem('liked_comments', JSON.stringify(likedComments));

    // Veritabanı güncellemesi
    try {
        await supabaseClient
            .from('comments')
            .update({ likes_count: currentCount })
            .eq('id', id);
    } catch(e) {
        console.error('Beğeni güncellenemedi', e);
    }
};

window.viewProfile = function(username, avatarUrl) {
    // Geçici basit profil gösterimi (SweetAlert veya Alert ile yapılabilir)
    const avatar = avatarUrl ? `<img src="${avatarUrl}" style="width:100px; height:100px; border-radius:50%; margin:15px auto; display:block; border: 3px solid var(--accent)">` : '';
    Swal.fire({
        title: username,
        html: `${avatar} <p style="color:#fff">Anime aşığı, Anitr kullanıcısı.</p>`,
        background: '#14141c',
        color: '#fff',
        confirmButtonColor: '#7c3aed'
    });
};

window.postComment = async function() {
    const nameInput = document.getElementById('commentUsername');
    const contentInput = document.getElementById('commentContent');
    const btn = document.querySelector('.comment-submit-btn');
    const spBtn = document.getElementById('commentSpoilerBtn');

    const username = nameInput.value.trim() || 'Anonim';
    const content = contentInput.value.trim();
    const isSpoiler = !!(spBtn && spBtn.classList.contains('on'));
    const avatarUrl = localStorage.getItem('user_avatar') || null;

    if (!content) { showToast('⚠️ Lütfen bir yorum yazın!'); return; }
    if (!supabaseClient) { showToast('❌ Yorum sistemi yüklenemedi. Sayfayı yenileyin.'); return; }
    if (!currentEpisodeKey) { showToast('⚠️ Önce bir bölüm açmalısın.'); return; }

    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;"></div> Gönderiliyor...';
    btn.disabled = true;

    const body = (isSpoiler ? '[[SPOILER]]' : '') + content;
    const isMissingCol = (e) => e && (e.code === 'PGRST204' || /column|schema cache/i.test(e.message || ''));

    try {
        let error = null;
        if (sessionStorage.getItem('anitr_cm_basic') !== '1') {
            ({ error } = await supabaseClient.from('comments').insert([{
                ep_key: currentEpisodeKey, username: username, content: body,
                parent_id: currentReplyParentId, avatar_url: avatarUrl
            }]));
            if (isMissingCol(error)) { sessionStorage.setItem('anitr_cm_basic', '1'); error = { code: 'RETRY' }; }
        } else { error = { code: 'RETRY' }; }

        if (error && error.code === 'RETRY') {
            // Tabloda avatar_url / parent_id sütunları yok: yalnızca temel sütunlarla gönder
            const basic = (currentReplyParentId ? '[[RE:' + currentReplyParentId + ']]' : '') + body;
            ({ error } = await supabaseClient.from('comments').insert([{ ep_key: currentEpisodeKey, username: username, content: basic }]));
        }
        if (error) throw error;

        showToast('✅ Yorumunuz gönderildi!');
        contentInput.value = '';
        if (spBtn && spBtn.classList.contains('on')) toggleSpoilerFlag(spBtn);
        cancelReply();
        fetchComments(currentEpisodeKey);
    } catch (err) {
        console.error("Yorum gönderme hatası:", err);
        const m = (err && err.message) ? err.message : '';
        showToast('❌ Yorum gönderilemedi' + (m ? ': ' + m.slice(0, 70) : '!'));
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gönder';
        btn.disabled = false;
    }
};

// Sürpriz Profil Resmi Ayarlayıcı (Geçici)
window.setMyAvatar = function(url) {
    localStorage.setItem('user_avatar', url);
    showToast('Profil resminiz güncellendi!');
};

// ═══ ANITR PLAYER v2 ═══
function _anitrFeedback(p, type) {
    try {
        const el = p.el();
        let fb = el.querySelector('.anitr-feedback');
        if (!fb) { fb = document.createElement('div'); fb.className = 'anitr-feedback'; el.appendChild(fb); }
        const vol = Math.round((p.muted() ? 0 : p.volume()) * 100);
        const map = {
            play:    ['<i class="fa-solid fa-play"></i>', 'center'],
            pause:   ['<i class="fa-solid fa-pause"></i>', 'center'],
            back:    ['<i class="fa-solid fa-backward"></i><span>10 sn</span>', 'left'],
            fwd:     ['<i class="fa-solid fa-forward"></i><span>10 sn</span>', 'right'],
            vol:     ['<i class="fa-solid fa-volume-high"></i><span>%' + vol + '</span>', 'center'],
            voldown: ['<i class="fa-solid fa-volume-low"></i><span>%' + vol + '</span>', 'center'],
            mute:    ['<i class="fa-solid fa-volume-xmark"></i>', 'center']
        };
        const m = map[type]; if (!m) return;
        fb.innerHTML = m[0];
        fb.className = 'anitr-feedback ' + m[1];
        void fb.offsetWidth;
        fb.classList.add('show');
    } catch (e) {}
}

function _anitrDoubleClick(event) {
    const p = this;
    const r = p.el().getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width;
    if (x < 0.33) { p.currentTime(Math.max(0, p.currentTime() - 10)); _anitrFeedback(p, 'back'); }
    else if (x > 0.67) { p.currentTime(Math.min(p.duration() || Infinity, p.currentTime() + 10)); _anitrFeedback(p, 'fwd'); }
    else { p.isFullscreen() ? p.exitFullscreen() : p.requestFullscreen(); }
}

// Kalite verisini sakla (ayrı buton yerine Ayarlar menüsünde gösterilir)
function _buildQualityMenu(player, urls, labels, mimeType) {
    player._anitrQuality = { urls: urls, labels: labels, mimeType: mimeType, current: 0 };
}

// ── AYARLAR MENÜSÜ (Kalite / Hız / Altyazı / Altyazı Görünümü) ──
function _anitrQualityState(p) {
    const q = p._anitrQuality;
    if (q && q.urls && q.urls.length > 1) {
        return {
            current: q.labels[q.current] || (q.current + 1) + '. Kalite',
            items: q.urls.map((u, i) => ({
                label: q.labels[i] || (i + 1) + '. Kalite',
                active: i === q.current,
                apply: () => {
                    if (i === q.current) return;
                    const t = p.currentTime(), wasPaused = p.paused();
                    q.current = i;
                    p.src({ src: u, type: q.mimeType });
                    p.one('canplay', () => { p.currentTime(t); if (!wasPaused) p.play(); });
                    showToast('🎬 ' + (q.labels[i] || 'Kalite') + ' kaliteye geçildi');
                }
            }))
        };
    }
    if (typeof p.qualityLevels === 'function') {
        const ql = p.qualityLevels();
        const heights = [];
        for (let i = 0; i < ql.length; i++) if (ql[i].height && !heights.includes(ql[i].height)) heights.push(ql[i].height);
        heights.sort((a, b) => b - a);
        if (heights.length > 1) {
            const sel = p._anitrQL || 'auto';
            const setLevel = (h) => {
                p._anitrQL = h;
                for (let i = 0; i < ql.length; i++) ql[i].enabled = (h === 'auto') || ql[i].height === h;
            };
            const items = [{ label: 'Otomatik', active: sel === 'auto', apply: () => setLevel('auto') }]
                .concat(heights.map(h => ({ label: h + 'p', active: sel === h, apply: () => setLevel(h) })));
            return { current: sel === 'auto' ? 'Otomatik' : sel + 'p', items: items };
        }
    }
    return { current: 'Otomatik', items: [{ label: 'Otomatik', active: true, apply: () => {} }] };
}

function _anitrSubTracks(p) {
    const out = [];
    const tt = p.textTracks();
    for (let i = 0; i < tt.length; i++) if (tt[i].kind === 'subtitles' || tt[i].kind === 'captions') out.push(tt[i]);
    return out;
}

function _anitrRenderSettings(p, view) {
    const el = p.el();
    let panel = el.querySelector('.anitr-settings');
    if (!panel) { panel = document.createElement('div'); panel.className = 'anitr-settings'; el.appendChild(panel); }
    panel.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'as-view';
    panel.appendChild(wrap);

    const row = (opts) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'as-row' + (opts.active ? ' active' : '');
        b.innerHTML =
            (opts.icon ? '<i class="as-ic fa-solid ' + opts.icon + '"></i>' : '<i class="as-check fa-solid fa-check"></i>') +
            '<span class="as-label">' + opts.label + '</span>' +
            (opts.value !== undefined ? '<span class="as-val">' + opts.value + '</span>' : '') +
            (opts.chev ? '<i class="as-chev fa-solid fa-chevron-right"></i>' : '');
        b.addEventListener('click', (e) => { e.stopPropagation(); opts.onClick(); });
        wrap.appendChild(b);
    };
    const head = (title) => {
        const h = document.createElement('button');
        h.type = 'button';
        h.className = 'as-head';
        h.innerHTML = '<i class="fa-solid fa-chevron-left"></i><span>' + title + '</span>';
        h.addEventListener('click', (e) => { e.stopPropagation(); _anitrRenderSettings(p, 'main'); });
        wrap.appendChild(h);
    };

    const rate = p.playbackRate();
    const rateLabel = (r) => r === 1 ? 'Normal' : r + 'x';
    const tracks = _anitrSubTracks(p);
    const showing = tracks.find(t => t.mode === 'showing');

    if (view === 'main') {
        const q = _anitrQualityState(p);
        row({ icon: 'fa-sliders', label: 'Kalite', value: q.current, chev: true, onClick: () => _anitrRenderSettings(p, 'quality') });
        row({ icon: 'fa-gauge-high', label: 'Oynatma Hızı', value: rateLabel(rate), chev: true, onClick: () => _anitrRenderSettings(p, 'speed') });
        row({ icon: 'fa-closed-captioning', label: 'Altyazı', value: showing ? (showing.label || showing.language) : 'Kapalı', chev: true, onClick: () => _anitrRenderSettings(p, 'subs') });
        row({ icon: 'fa-font', label: 'Altyazı Görünümü', chev: true, onClick: () => _anitrRenderSettings(p, 'subStyle') });
        row({ icon: 'fa-lightbulb', label: 'Ambient Light', value: (appSettings.ambientLight !== false ? 'Açık' : 'Kapalı'), chev: true, onClick: () => _anitrRenderSettings(p, 'ambient') });
        row({ icon: 'fa-volume-high', label: 'Ses Yükselticisi', value: (appSettings.volumeBoost || 100) + '%', chev: true, onClick: () => _anitrRenderSettings(p, 'volume') });
    } else if (view === 'volume') {
        head('Ses Yükselticisi (Ücretsiz Boost)');
        _anitrVolumeUI(p, wrap);
    } else if (view === 'quality') {
        head('Kalite');
        _anitrQualityState(p).items.forEach(it => row({ label: it.label, active: it.active, onClick: () => { it.apply(); _anitrRenderSettings(p, 'main'); } }));
    } else if (view === 'speed') {
        head('Oynatma Hızı');
        [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].forEach(r => row({ label: rateLabel(r), active: r === rate, onClick: () => { p.playbackRate(r); _anitrRenderSettings(p, 'main'); } }));
    } else if (view === 'subs') {
        head('Altyazı');
        row({ label: 'Kapalı', active: !showing, onClick: () => { tracks.forEach(t => t.mode = 'disabled'); _anitrRenderSettings(p, 'main'); } });
        tracks.forEach(t => row({ label: t.label || t.language, active: t === showing, onClick: () => {
            tracks.forEach(x => x.mode = (x === t ? 'showing' : 'disabled'));
            _anitrRenderSettings(p, 'main');
        } }));
    } else if (view === 'subStyle') {
        head('Altyazı Görünümü');
        _anitrSubStyleUI(p, wrap);
    } else if (view === 'ambient') {
        head('Ambient Light');
        _anitrAmbientUI(p, wrap);
    }
}

// Altyazı görünümü — Video.js TextTrackSettings üzerinden (oynatıcının gerçekten kullandığı ayarlar)
const ANITR_SUB_KEY = 'vjs-text-track-settings';
function _anitrSubGet(p) {
    let v = {};
    try { if (p.textTrackSettings) v = p.textTrackSettings.getValues() || {}; } catch (e) {}
    let lsVal = {}; try { lsVal = JSON.parse(localStorage.getItem(ANITR_SUB_KEY) || '{}'); } catch(e){}
    return Object.assign({ fontPercent: '1.00', subPos: '4vh', color: '#FFF', backgroundColor: '#000', backgroundOpacity: '0.5', edgeStyle: 'none', fontFamily: 'proportionalSansSerif' }, lsVal, v, { subPos: lsVal.subPos || '4vh' });
}
function _anitrSubSet(p, patch) {
    if (!p.textTrackSettings) return;
    const v = Object.assign(_anitrSubGet(p), patch);
    try {
        p.textTrackSettings.setValues(v);
        p.textTrackSettings.updateDisplay ? p.textTrackSettings.updateDisplay() : null;
        p.textTrackSettings.updateStyle ? p.textTrackSettings.updateStyle() : null;
        const disp = p.getChild('textTrackDisplay'); if (disp && disp.updateDisplay) disp.updateDisplay(); p.trigger("texttrackchange");
        if(v.fontPercent) p.el().style.setProperty('--vjs-sub-scale', v.fontPercent);
        if(v.subPos) p.el().style.setProperty('--vjs-sub-pos', v.subPos);
        localStorage.setItem(ANITR_SUB_KEY, JSON.stringify(v));
    } catch (e) { console.warn('Altyazı ayarı uygulanamadı', e); }
}
function _anitrSubStyleUI(p, wrap) {
    const v = _anitrSubGet(p);
    const box = document.createElement('div');
    box.className = 'as-substyle';
    box.addEventListener('click', e => e.stopPropagation());

    // Canlı önizleme
    const prev = document.createElement('div');
    prev.className = 'as-sub-preview';
    prev.innerHTML = '<span>Altyazı önizlemesi</span>';
    box.appendChild(prev);
    const paintPreview = () => {
        const c = _anitrSubGet(p);
        const sp = prev.querySelector('span');
        const hex = (h) => h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h;
        const bg = hex(c.backgroundColor), op = parseFloat(c.backgroundOpacity);
        const r = parseInt(bg.substr(1, 2), 16), g = parseInt(bg.substr(3, 2), 16), b = parseInt(bg.substr(5, 2), 16);
        sp.style.color = hex(c.color);
        sp.style.background = 'rgba(' + r + ',' + g + ',' + b + ',' + op + ')';
        sp.style.fontSize = (15 * parseFloat(c.fontPercent)) + 'px';
        const fams = { proportionalSansSerif: 'Arial, sans-serif', monospaceSansSerif: 'monospace', proportionalSerif: 'Georgia, serif', casual: '"Comic Sans MS", cursive', smallcaps: 'Arial, sans-serif' };
        sp.style.fontFamily = fams[c.fontFamily] || 'Arial, sans-serif';
        sp.style.fontVariant = c.fontFamily === 'smallcaps' ? 'small-caps' : 'normal';
        const edges = { none: 'none', raised: '1px 1px 0 #222, 2px 2px 0 #222', depressed: '-1px -1px 0 #222', uniform: '0 0 3px #000, 0 0 3px #000, 0 0 3px #000', dropshadow: '2px 2px 4px rgba(0,0,0,0.9)' };
        sp.style.textShadow = edges[c.edgeStyle] || 'none';
    };

    const group = (title, items, key, render) => {
        const g = document.createElement('div');
        g.className = 'as-group';
        g.innerHTML = '<div class="as-group-title">' + title + '</div>';
        const row = document.createElement('div');
        row.className = 'as-chips' + (render === 'swatch' ? ' swatches' : '');
        items.forEach(it => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'as-chip' + (String(v[key]) === String(it.v) ? ' active' : '');
            if (render === 'swatch') { b.style.background = it.v; b.title = it.l; }
            else b.textContent = it.l;
            b.addEventListener('click', (ev) => {
                ev.stopPropagation();
                row.querySelectorAll('.as-chip').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                v[key] = it.v;
                _anitrSubSet(p, { [key]: it.v });
                paintPreview();
            });
            row.appendChild(b);
        });
        g.appendChild(row);
        box.appendChild(g);
    };

    group('Yükseklik (Konum)', [
        { l: 'En Alt', v: '4vh' }, { l: 'Alt', v: '0vh' }, { l: 'Orta-Alt', v: '-4vh' }, { l: 'Orta', v: '-12vh' }, { l: 'Üst', v: '-20vh' }
    ], 'subPos');
    group('Yazı Boyutu', [
        { l: '%75', v: '0.75' }, { l: '%100', v: '1.00' }, { l: '%125', v: '1.25' }, { l: '%150', v: '1.50' }, { l: '%200', v: '2.00' }
    ], 'fontPercent', null, (val) => {
        _anitrSubSet(p, { fontPercent: val, fontSize: val });
    });
    group('Yazı Rengi', [
        { l: 'Beyaz', v: '#FFF' }, { l: 'Sarı', v: '#FF0' }, { l: 'Camgöbeği', v: '#0FF' }, { l: 'Yeşil', v: '#0F0' }, { l: 'Kırmızı', v: '#F00' }, { l: 'Siyah', v: '#000' }
    ], 'color', 'swatch');
    group('Arka Plan', [
        { l: 'Yok', v: '0' }, { l: 'Yarı Saydam', v: '0.5' }, { l: 'Tam', v: '1' }
    ], 'backgroundOpacity');
    group('Kenar Stili', [
        { l: 'Yok', v: 'none' }, { l: 'Gölge', v: 'dropshadow' }, { l: 'Çerçeve', v: 'uniform' }, { l: 'Kabartma', v: 'raised' }
    ], 'edgeStyle');
    group('Yazı Tipi', [
        { l: 'Sans', v: 'proportionalSansSerif' }, { l: 'Serif', v: 'proportionalSerif' }, { l: 'Mono', v: 'monospaceSansSerif' }, { l: 'Küçük Harf', v: 'smallcaps' }
    ], 'fontFamily');

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'as-reset';
    reset.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Varsayılana Dön';
    reset.addEventListener('click', (ev) => {
        ev.stopPropagation();
        _anitrSubSet(p, { fontPercent: '1.00', color: '#FFF', backgroundColor: '#000', backgroundOpacity: '0.5', edgeStyle: 'none', fontFamily: 'proportionalSansSerif', textOpacity: '1', windowOpacity: '0', subPos: '4vh' });
        _anitrRenderSettings(p, 'subStyle');
    });
    box.appendChild(reset);

    wrap.appendChild(box);
    paintPreview();
}

// Ambient Light paneli — aç/kapat + ışık yoğunluğu kaydırıcısı
function _anitrAmbientUI(p, wrap) {
    const on = appSettings.ambientLight !== false;
    const lvl = (window.getAmbientLevel ? window.getAmbientLevel() : 62);

    const tg = document.createElement('button');
    tg.type = 'button';
    tg.className = 'as-row' + (on ? ' active' : '');
    tg.innerHTML = '<i class="as-ic fa-solid fa-lightbulb"></i><span class="as-label">Ambient Light</span><span class="as-val">' + (on ? 'Açık' : 'Kapalı') + '</span>';
    tg.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.toggleAmbientQuick) window.toggleAmbientQuick();
        _anitrRenderSettings(p, 'ambient');
    });
    wrap.appendChild(tg);

    const box = document.createElement('div');
    box.className = 'as-substyle as-amb-box' + (on ? '' : ' disabled');
    box.addEventListener('click', e => e.stopPropagation());
    box.innerHTML =
        '<div class="as-group">' +
            '<div class="as-group-title">Işık Yoğunluğu <span class="as-amb-val">%' + lvl + '</span></div>' +
            '<input type="range" class="as-amb-range" min="5" max="100" step="1" value="' + lvl + '">' +
            '<div class="as-amb-scale"><span>Hafif</span><span>Orta</span><span>Yoğun</span></div>' +
        '</div>' +
        '<div class="as-group">' +
            '<div class="as-group-title">Hazır Ayarlar</div>' +
            '<div class="as-chips">' +
                '<button type="button" class="as-chip" data-v="30">Hafif</button>' +
                '<button type="button" class="as-chip" data-v="62">Orta</button>' +
                '<button type="button" class="as-chip" data-v="90">Yoğun</button>' +
            '</div>' +
        '</div>';
    wrap.appendChild(box);

    const range = box.querySelector('.as-amb-range');
    const valEl = box.querySelector('.as-amb-val');
    const chips = box.querySelectorAll('.as-chip');
    const paint = (v) => {
        valEl.textContent = '%' + v;
        range.style.setProperty('--fill', ((v - 5) / 95 * 100) + '%');
        chips.forEach(c => c.classList.toggle('active', Number(c.dataset.v) === Number(v)));
    };
    paint(lvl);
    range.addEventListener('input', () => {
        const v = Number(range.value);
        if (appSettings.ambientLight === false) { if (window.toggleAmbientQuick) window.toggleAmbientQuick(); box.classList.remove('disabled'); }
        if (window.setAmbientLevel) window.setAmbientLevel(v);
        paint(v);
    });
    chips.forEach(c => c.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = Number(c.dataset.v);
        range.value = v;
        if (appSettings.ambientLight === false && window.toggleAmbientQuick) { window.toggleAmbientQuick(); box.classList.remove('disabled'); }
        if (window.setAmbientLevel) window.setAmbientLevel(v);
        paint(v);
    }));
}

function _anitrToggleSettings(p, view) {
    const el = p.el();
    let panel = el.querySelector('.anitr-settings');
    const isOpen = panel && panel.classList.contains('open');
    if (isOpen && !view) { _anitrCloseSettings(p); return; }
    _anitrRenderSettings(p, view || 'main');
    panel = el.querySelector('.anitr-settings');
    requestAnimationFrame(() => panel.classList.add('open'));
    p.addClass('anitr-settings-open');
}
function _anitrCloseSettings(p) {
    const panel = p.el().querySelector('.anitr-settings');
    if (panel) panel.classList.remove('open');
    p.removeClass('anitr-settings-open');
}

function _anitrEnhancePlayer(p) {
    try {
        p.addClass('vjs-anitr');
        const el = p.el();

        // Üst bilgi şeridi
        let top = el.querySelector('.anitr-player-top');
        if (!top) {
            top = document.createElement('div');
            top.className = 'anitr-player-top';
            top.innerHTML = '<div class="apt-anime"></div><div class="apt-ep"></div>';
            el.appendChild(top);
        }
        const fillTop = () => {
            const a = document.getElementById('watchAnimeTitle');
            const t = document.getElementById('watchTitle');
            top.querySelector('.apt-anime').textContent = a ? a.textContent.trim() : '';
            top.querySelector('.apt-ep').textContent = t ? t.textContent.trim() : '';
        };
        fillTop();
        p.on('loadedmetadata', fillTop);

        // Yükleniyor göstergesi
        if (!el.querySelector('.anitr-spinner-wrap')) {
            const sw = document.createElement('div');
            sw.className = 'anitr-spinner-wrap';
            sw.innerHTML = '<div class="anitr-spinner"></div>';
            el.appendChild(sw);
        }
        p.addClass('anitr-loading');
        const doneLoading = () => p.removeClass('anitr-loading');
        p.one('loadeddata', doneLoading);
        p.one('canplay', doneLoading);
        p.one('playing', doneLoading);
        p.one('error', doneLoading);
        setTimeout(doneLoading, 25000);
        p.on('waiting', () => { if (!p.paused()) p.addClass('anitr-buffering'); });
        ['playing', 'canplay', 'pause', 'seeked'].forEach(ev => p.on(ev, () => p.removeClass('anitr-buffering')));

        // Oynat / duraklat geri bildirimi
        let started = false;
        p.one('playing', () => { started = true; });
        p.on('play',  () => { if (started) _anitrFeedback(p, 'play'); });
        p.on('pause', () => { if (started && !p.seeking() && !p.ended()) _anitrFeedback(p, 'pause'); });

        try { if (p.textTrackSettings) { p.textTrackSettings.open = function() { _anitrToggleSettings(p, 'subStyle'); }; } } catch (e) {}
        // Eski altyazı panelini gizli tut (içeriği Ayarlar menüsünde kullanılıyor)
        const oldPanel = document.getElementById('subtitleSettingsPanel');
        if (oldPanel) oldPanel.classList.add('hidden');
        window.toggleSubtitleSettings = function() { if (vjsPlayer) _anitrToggleSettings(vjsPlayer, 'subStyle'); };

        // Ayarlar butonu
        const cb = p.getChild('controlBar');
        if (cb && !cb.getChild('AnitrSubSettings')) {
            if (!videojs.getComponent('AnitrSettingsBtn')) {
                const Button = videojs.getComponent('Button');
                class AnitrSettingsBtn extends Button {
                    constructor(player, options) { super(player, options); this.addClass('vjs-anitr-subset'); this.controlText('Ayarlar'); }
                    handleClick(e) { if (e) e.stopPropagation(); _anitrToggleSettings(this.player()); }
                }
                videojs.registerComponent('AnitrSettingsBtn', AnitrSettingsBtn);
            }
            const fsIdx = cb.children().indexOf(cb.getChild('FullscreenToggle'));
            cb.addChild('AnitrSettingsBtn', { name: 'AnitrSubSettings' }, fsIdx >= 0 ? fsIdx : cb.children().length);
        }

        // Sinema Modu butonu — Picture-in-Picture'ın soluna
        if (cb && !cb.getChild('AnitrCinemaBtn')) {
            if (!videojs.getComponent('AnitrCinemaBtn')) {
                const Button2 = videojs.getComponent('Button');
                class AnitrCinemaBtn extends Button2 {
                    constructor(player, options) {
                        super(player, options);
                        this.addClass('vjs-anitr-cinema');
                        this.controlText('Sinema Modu (T)');
                        this.el().id = 'cinemaBtn';
                        this.el().classList.toggle('on', document.body.classList.contains('cinema-mode'));
                    }
                    handleClick(e) { if (e) e.stopPropagation(); if (window.toggleCinemaMode) window.toggleCinemaMode(); }
                }
                videojs.registerComponent('AnitrCinemaBtn', AnitrCinemaBtn);
            }
            const kids = cb.children();
            let anchor = cb.getChild('PictureInPictureToggle');
            let idx = anchor ? kids.indexOf(anchor) : -1;
            if (idx < 0) { const sb = cb.getChild('AnitrSubSettings'); idx = sb ? kids.indexOf(sb) : kids.length; }
            cb.addChild('AnitrCinemaBtn', { name: 'AnitrCinema' }, idx);
        }

        // Ekran Görüntüsü butonu — Sinema Modunun soluna
        if (cb && !cb.getChild('AnitrShotBtn')) {
            if (!videojs.getComponent('AnitrShotBtn')) {
                const BtnS = videojs.getComponent('Button');
                class AnitrShotBtn extends BtnS {
                    constructor(player, options) {
                        super(player, options);
                        this.addClass('vjs-anitr-shot');
                        this.controlText('Ekran Görüntüsü (S)');
                        this.el().id = 'shotBtn';
                        this.el().innerHTML = '<i class="fa-solid fa-camera" style="font-size:15px;"></i>';
                    }
                    handleClick(e) { if (e) e.stopPropagation(); anitrTakeScreenshot(); }
                }
                videojs.registerComponent('AnitrShotBtn', AnitrShotBtn);
            }
            const cinemaChild = cb.getChild('AnitrCinemaBtn') || cb.getChild('AnitrCinema');
            const cinemaEl = cb.el().querySelector('.vjs-anitr-cinema');
            const cinemaComp = cinemaEl ? cb.children().find(c => c.el && c.el() === cinemaEl) : null;
            const refComp = cinemaChild || cinemaComp;
            const refIdx = refComp ? cb.children().indexOf(refComp) : -1;
            const shotIdx = refIdx >= 0 ? refIdx : cb.children().length;
            cb.addChild('AnitrShotBtn', { name: 'AnitrShot' }, shotIdx);
        }

        // Dışarı tıklayınca / ESC ile kapat
        const outside = (e) => {
            const panel = el.querySelector('.anitr-settings');
            if (!panel || !panel.classList.contains('open')) return;
            if (panel.contains(e.target) || e.target.closest('.vjs-anitr-subset')) return;
            _anitrCloseSettings(p);
        };
        const esc = (e) => { if (e.key === 'Escape') _anitrCloseSettings(p); };
        document.addEventListener('click', outside, true);
        document.addEventListener('keydown', esc);
        p.on('dispose', () => {
            document.removeEventListener('click', outside, true);
            document.removeEventListener('keydown', esc);
        });
    } catch (e) { console.warn('Player enhance error:', e); }
}

// Intro/Outro atlama — sadece durum değişince yeniden çizer
function _setupSkipButtons(player, opening, ending) {
    function timeToSec(t) {
        if (!t || typeof t !== 'string') return 0;
        const parts = t.split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] || 0;
    }
    const playerEl = player.el();
    let box = playerEl.querySelector('.player-skip-controls');
    if (!box) { box = document.createElement('div'); box.className = 'player-skip-controls'; playerEl.appendChild(box); }
    const ranges = [];
    if (opening) ranges.push({ key: 'op', s: timeToSec(opening.Start), e: timeToSec(opening.End), label: 'Açılışı Atla', toast: '⏭ Açılış atlatıldı' });
    if (ending)  ranges.push({ key: 'ed', s: timeToSec(ending.Start),  e: timeToSec(ending.End),  label: 'Kapanışı Atla', toast: '⏭ Kapanış atlatıldı' });
    let state = '';
    player.on('timeupdate', () => {
        const c = player.currentTime();
        const active = ranges.find(r => r.e > r.s && c >= r.s && c <= r.e);
        const next = active ? active.key : '';
        if (next === state) return;
        state = next;
        box.innerHTML = '';
        if (active) {
            const btn = document.createElement('button');
            btn.className = 'skip-btn';
            btn.innerHTML = '<span>' + active.label + '</span><i class="fa-solid fa-forward-step"></i>';
            btn.onclick = (ev) => { ev.stopPropagation(); player.currentTime(active.e); showToast(active.toast); };
            box.appendChild(btn);
        }
    });
}


// ═══ NAVBAR 2026 ═══
(function(){
    function initNavTips(){
        document.querySelectorAll('.navbar .nav-btn[title]').forEach(b => {
            b.setAttribute('data-tip', b.getAttribute('title'));
            b.setAttribute('aria-label', b.getAttribute('title'));
            b.removeAttribute('title');
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNavTips);
    else initNavTips();
})();


// ═══ NAVBAR MOTION+ ═══
(function(){
    function init(){
        const nav = document.querySelector('.navbar');
        if (!nav) return;
        nav.querySelectorAll('.nav-group').forEach(g => {
            if (g.querySelector('.nv-glider')) return;
            const gl = document.createElement('div'); gl.className = 'nv-glider'; g.prepend(gl);
            g.querySelectorAll('.nav-btn').forEach(b => {
                b.addEventListener('mouseenter', () => {
                    gl.style.left = b.offsetLeft + 'px';
                    gl.style.width = b.offsetWidth + 'px';
                    g.classList.add('nv-live');
                });
            });
            g.addEventListener('mouseleave', () => g.classList.remove('nv-live'));
        });
        let last = window.scrollY;
        window.addEventListener('scroll', () => {
            const y = window.scrollY;
            if (y > 160 && y > last + 6) nav.classList.add('nv-hidden');
            else if (y < last - 6 || y <= 160) nav.classList.remove('nv-hidden');
            last = y;
        }, { passive: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// ═══ SETTINGS 2026 + AMBIENT + CINEMA + THUMBS ═══
(function(){
    /* ── Ayarlar sekmeleri + arama ── */
    window.stgTab = function(name){
        const m = document.getElementById('settingsModal'); if (!m) return;
        const s = document.getElementById('stgSearch'); if (s && s.value) { s.value = ''; stgFilter(''); }
        m.querySelectorAll('.stg-nav [data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === name));
        m.querySelectorAll('.stg-body > [data-tab]').forEach(sec => sec.classList.toggle('stg-on', sec.dataset.tab === name));
        const body = m.querySelector('.stg-body'); if (body) body.scrollTo({ top: 0 });
    };
    window.stgFilter = function(q){
        const m = document.getElementById('settingsModal'); if (!m) return;
        q = (q || '').trim().toLowerCase();
        m.classList.toggle('stg-searching', !!q);
        m.querySelectorAll('.stg-body .prf-toggle-row, .stg-body .prf-currently-watching').forEach(r => {
            r.classList.toggle('stg-hide', !!q && !r.textContent.toLowerCase().includes(q));
        });
        m.querySelectorAll('.stg-body > [data-tab]').forEach(sec => {
            const vis = sec.querySelectorAll('.prf-toggle-row:not(.stg-hide), .prf-currently-watching:not(.stg-hide)').length;
            sec.classList.toggle('stg-hide', !!q && !vis);
        });
    };
    function initStg(){ stgTab('appearance'); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStg); else initStg();

    /* ── Ayar fonksiyonlarını genişlet ── */
    const _save = saveSettings;
    saveSettings = function(){
        _save.apply(this, arguments);
        const g = id => document.getElementById(id);
        if (g('settingAmbilight'))         appSettings.ambientLight = g('settingAmbilight').checked;
        if (g('settingAmbientIntensity')) {
            const nv = g('settingAmbientIntensity').value;
            if (nv !== appSettings.ambientIntensity) delete appSettings.ambientLevel;
            appSettings.ambientIntensity = nv;
        }
        if (g('settingThumbPreview'))      appSettings.thumbPreview = g('settingThumbPreview').checked;
        if (g('settingSubtitleSize'))      appSettings.subtitleSize = g('settingSubtitleSize').value;
        ls.set('anitr_settings', appSettings);
        applyAmbient();
    };
    const _load = loadSettingsUI;
    loadSettingsUI = function(){
        _load.apply(this, arguments);
        const g = id => document.getElementById(id);
        if (g('settingAmbilight'))        g('settingAmbilight').checked = appSettings.ambientLight !== false;
        if (g('settingAmbientIntensity')) g('settingAmbientIntensity').value = appSettings.ambientIntensity || 'medium';
        if (g('settingThumbPreview'))     g('settingThumbPreview').checked = appSettings.thumbPreview !== false;
        applyAmbient();
    };

    /* ── Ambient Light ── */
    const AMB = { low: ['.38', '80px'], medium: ['.62', '70px'], high: ['.9', '60px'] };
    function applyAmbient(){
        const on = appSettings.ambientLight !== false;
        let [op, blur] = AMB[appSettings.ambientIntensity || 'medium'] || AMB.medium;
        if (typeof appSettings.ambientLevel === 'number') {
            const lv = Math.max(5, Math.min(100, appSettings.ambientLevel));
            op = String((lv / 100).toFixed(2)); blur = Math.round(88 - lv * 0.3) + 'px';
        }
        const r = document.documentElement.style;
        r.setProperty('--amb-op', op); r.setProperty('--amb-blur', blur);
        document.body.classList.toggle('ambient-on', on);
        const st = document.getElementById('ambientQuickState'); if (st) st.textContent = on ? 'Açık' : 'Kapalı';
        const b = document.getElementById('ambientQuickBtn'); if (b) b.classList.toggle('on', on);
    }
    window.applyAmbient = applyAmbient;
    window.getAmbientLevel = function(){
        if (typeof appSettings.ambientLevel === 'number') return Math.round(appSettings.ambientLevel);
        return Math.round(parseFloat((AMB[appSettings.ambientIntensity || 'medium'] || AMB.medium)[0]) * 100);
    };
    window.setAmbientLevel = function(v){
        v = Math.max(5, Math.min(100, Number(v) || 62));
        appSettings.ambientLevel = v;
        appSettings.ambientIntensity = v < 50 ? 'low' : (v < 76 ? 'medium' : 'high');
        const sel = document.getElementById('settingAmbientIntensity'); if (sel) sel.value = appSettings.ambientIntensity;
        ls.set('anitr_settings', appSettings);
        applyAmbient();
    };
    let raf = 0, last = 0;
    window.anitrAmbientStart = function(video){
        const c = document.getElementById('videoAmbilightCanvas'); if (!c || !video) return;
        c.classList.remove('hidden');
        c.width = 64; c.height = 36;
        const ctx = c.getContext('2d');
        cancelAnimationFrame(raf);
        const loop = t => {
            raf = requestAnimationFrame(loop);
            if (!document.body.contains(video)) { c.classList.remove('on'); return; }
            const on = appSettings.ambientLight !== false;
            c.classList.toggle('on', on);
            if (!on || t - last < 40) return;
            last = t;
            if (video.readyState >= 2 && !video.ended) { try { ctx.drawImage(video, 0, 0, 64, 36); } catch (e) {} }
        };
        raf = requestAnimationFrame(loop);
        applyAmbient();
    };
    window.toggleAmbientQuick = function(){
        appSettings.ambientLight = !(appSettings.ambientLight !== false);
        ls.set('anitr_settings', appSettings);
        const cb = document.getElementById('settingAmbilight'); if (cb) cb.checked = appSettings.ambientLight;
        applyAmbient();
        showToast(appSettings.ambientLight ? '💡 Ambient Light açık' : 'Ambient Light kapatıldı');
    };

    /* ── Sinema Modu ── */
    function ensureDim(){
        let d = document.getElementById('cinemaDim');
        if (!d) { d = document.createElement('div'); d.id = 'cinemaDim'; d.onclick = () => toggleCinemaMode(false); document.getElementById('app').appendChild(d); }
    }
    window.toggleCinemaMode = function(force){
        ensureDim();
        const on = typeof force === 'boolean' ? force : !document.body.classList.contains('cinema-mode');
        document.body.classList.toggle('cinema-mode', on);
        const b = document.getElementById('cinemaBtn');
        if (b) {
            b.classList.toggle('on', on);
            const ct = b.querySelector('.vjs-control-text'); if (ct) ct.textContent = on ? 'Sinema Modundan Çık (T)' : 'Sinema Modu (T)';
            b.title = on ? 'Sinema Modundan Çık (T)' : 'Sinema Modu (T)';
        }
        if (on) setTimeout(() => document.querySelector('.video-container-page')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    };
    document.addEventListener('keydown', e => {
        const t = e.target && e.target.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
        const wv = document.getElementById('watchView');
        if (!wv || wv.classList.contains('hidden')) return;
        if (e.key === 'Escape' && document.body.classList.contains('cinema-mode')) toggleCinemaMode(false);
        else if (e.key === 't' || e.key === 'T') toggleCinemaMode();
    });
    new MutationObserver(() => {
        const wv = document.getElementById('watchView');
        if (wv && wv.classList.contains('hidden')) document.body.classList.remove('cinema-mode');
    }).observe(document.getElementById('watchView') || document.body, { attributes: true, attributeFilter: ['class'] });

    /* ── Zaman çubuğu küçük resim önizlemesi ── */
    function fmt(s){ s = Math.max(0, Math.floor(s)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60;
        return (h ? h + ':' + String(m).padStart(2,'0') : m) + ':' + String(x).padStart(2,'0'); }
    window.anitrThumbs = function(p){
        const ctl = p.el().querySelector('.vjs-progress-control'); if (!ctl || ctl._anitrThumb) return;
        ctl._anitrThumb = true;
        const tip = document.createElement('div');
        tip.className = 'anitr-thumb';
        tip.innerHTML = '<div class="at-frame"><div class="at-spin"></div></div><div class="at-time">0:00</div>';
        ctl.appendChild(tip);
        const frame = tip.querySelector('.at-frame'), timeEl = tip.querySelector('.at-time');
        let tp = null, tv = null, tpSrc = '', busy = false, pending = null, ready = false;

        function destroy(){ try { tp && tp.dispose(); } catch (e) {} tp = tv = null; ready = false; frame.querySelectorAll('.video-js, video').forEach(n => n.remove()); }
        function ensure(){
            if (appSettings.thumbPreview === false) return false;
            const src = p.currentSrc && p.currentSrc(); if (!src) return false;
            if (tp && tpSrc === src) return true;
            destroy(); tpSrc = src;
            const v = document.createElement('video');
            v.muted = true; v.playsInline = true; v.preload = 'auto'; v.className = 'video-js';
            frame.prepend(v);
            try {
                tp = videojs(v, { controls: false, muted: true, preload: 'auto', autoplay: false, loadingSpinner: false, bigPlayButton: false, controlBar: false, errorDisplay: false, textTrackDisplay: false, posterImage: false });
                tp.addClass('anitr-thumb-player');
                try {
                    const ql = tp.qualityLevels();
                    ql.on('addqualitylevel', () => {
                        let min = null;
                        for (let i = 0; i < ql.length; i++) if (!min || ql[i].height < min.height) min = ql[i];
                        for (let i = 0; i < ql.length; i++) ql[i].enabled = (ql[i] === min);
                    });
                } catch (e) {}
                tp.one('loadedmetadata', () => { ready = true; if (pending != null) run(); });
                tp.on('seeked', () => frame.classList.remove('loading'));
                tp.src({ src, type: p.currentType && p.currentType() });
                tv = tp.tech(true) && tp.tech(true).el();
            } catch (e) { destroy(); return false; }
            return true;
        }
        function run(){
            if (!tp || !ready || pending == null || busy) return;
            const t = pending; pending = null; busy = true;
            frame.classList.add('loading');
            try { tp.currentTime(t); } catch (e) {}
            setTimeout(() => { busy = false; run(); }, 140);
        }
        function move(e){
            const d = p.duration(); if (!d || !isFinite(d)) return;
            const holder = ctl.querySelector('.vjs-progress-holder') || ctl;
            const hr = holder.getBoundingClientRect(), cr = ctl.getBoundingClientRect();
            const pct = Math.min(1, Math.max(0, (e.clientX - hr.left) / hr.width));
            const t = pct * d;
            const half = tip.offsetWidth / 2 || 90;
            let x = (e.clientX - cr.left);
            x = Math.min(cr.width - half - 6, Math.max(half + 6, x));
            tip.style.left = x + 'px';
            timeEl.textContent = fmt(t);
            tip.classList.add('show');
            if (ensure()) { pending = t; run(); }
        }
        ctl.addEventListener('mousemove', move);
        ctl.addEventListener('mouseleave', () => tip.classList.remove('show'));
        p.on('loadstart', () => { destroy(); tpSrc = ''; });
        p.on('dispose', destroy);
    };

    const _enh = _anitrEnhancePlayer;
    _anitrEnhancePlayer = function(p){
        _enh.apply(this, arguments);
        try { p.ready(() => anitrThumbs(p)); } catch (e) { try { anitrThumbs(p); } catch (_) {} }
    };

    applyAmbient();
})();


/* ═══ İZLEME İSTATİSTİKLERİ v2 — gerçek izleme süresi takibi ═══ */
(function(){
    const KEY = 'anitr_stats_v2';
    const dayKey = (d) => (d || new Date()).toLocaleDateString('sv');
    const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY)) || {}; return Object.assign({ total: 0, days: {}, anime: {}, eps: {}, since: Date.now() }, o); } catch (e) { return { total: 0, days: {}, anime: {}, eps: {}, since: Date.now() }; } };
    const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let pending = 0, ctx = null;

    function flush(){
        if (pending <= 0 || !ctx) { pending = 0; return; }
        const s = load(), sec = pending; pending = 0;
        s.total += sec;
        const dk = dayKey(); s.days[dk] = (s.days[dk] || 0) + sec;
        const id = String(ctx.id || ctx.title || 'x');
        const an = s.anime[id] || (s.anime[id] = { title: ctx.title || '', img: ctx.img || '', sec: 0, genres: [], studio: '' });
        an.sec += sec; an.title = ctx.title || an.title; an.img = ctx.img || an.img;
        const meta = (window._animeMeta || {})[id];
        if (meta) { an.genres = meta.genres || an.genres; an.studio = meta.studio || an.studio; }
        if (ctx.epKey) s.eps[ctx.epKey] = (s.eps[ctx.epKey] || 0) + sec;
        // 120 günden eski günleri buda
        const keys = Object.keys(s.days).sort();
        while (keys.length > 120) delete s.days[keys.shift()];
        save(s);
    }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

    function track(p){
        let last = null;
        const reset = () => { last = null; };
        p.on('timeupdate', () => {
            if (p.paused() || p.seeking()) { last = null; return; }
            const t = p.currentTime();
            if (last != null) {
                const d = t - last;
                if (d > 0 && d < 2.5) {
                    ctx = { id: currentAnime && currentAnime.id, title: currentAnime && currentAnime.title, img: currentAnime && currentAnime.img, epKey: currentEpisodeKey };
                    pending += d;
                    if (pending >= 10) flush();
                }
            }
            last = t;
        });
        ['pause', 'seeked', 'waiting', 'ended', 'loadstart'].forEach(ev => p.on(ev, () => { reset(); if (ev !== 'seeked') flush(); }));
    }
    const _prev = _anitrEnhancePlayer;
    _anitrEnhancePlayer = function(p){
        _prev.apply(this, arguments);
        try { track(p); } catch (e) {}
    };

    const fmtDur = (sec) => {
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}<em>sa</em> ${m}<em>dk</em>` : `${m}<em>dk</em>`;
    };
    const RANKS = [
        [0, 'Çaylak', '🌱'], [5, 'Düzenli İzleyici', '📺'], [20, 'Anime Sever', '💜'],
        [50, 'Otaku', '🔥'], [100, 'Kıdemli Otaku', '⚡'], [250, 'Efsane', '👑']
    ];

    window.stxRender = function(){
        flush();
        const s = load();
        const watched = getWatched().length, favs = getFavorites().length, wl = getWatchlist().length, hist = getHistory().length;
        const epsTracked = Object.values(s.eps).filter(v => v >= 120).length;
        const epCount = Math.max(epsTracked, watched);
        let total = s.total, estimated = false;
        if (total < 60 && watched > 0) { total = watched * 24 * 60; estimated = true; }
        const hours = total / 3600;

        // Seviye
        let ri = 0; RANKS.forEach((r, i) => { if (hours >= r[0]) ri = i; });
        const cur = RANKS[ri], nxt = RANKS[ri + 1];
        const prog = nxt ? Math.min(100, ((hours - cur[0]) / (nxt[0] - cur[0])) * 100) : 100;

        // Son 7 gün
        const names = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
        const week = [];
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); week.push({ n: names[d.getDay()], v: s.days[dayKey(d)] || 0, today: i === 0 }); }
        const wMax = Math.max(1, ...week.map(w => w.v));
        const wTotal = week.reduce((a, w) => a + w.v, 0);

        // Seri
        let streak = 0; const dd = new Date();
        if (!(s.days[dayKey(dd)] > 0)) dd.setDate(dd.getDate() - 1);
        while (s.days[dayKey(dd)] > 0) { streak++; dd.setDate(dd.getDate() - 1); }
        const activeDays = Object.values(s.days).filter(v => v > 0).length;
        const bestDay = Math.max(0, ...Object.values(s.days));

        // En çok izlenenler & türler
        const animeArr = Object.values(s.anime).sort((a, b) => b.sec - a.sec).slice(0, 5);
        const aMax = animeArr.length ? animeArr[0].sec : 1;
        const gmap = {};
        Object.values(s.anime).forEach(a => (a.genres || []).forEach(g => gmap[g] = (gmap[g] || 0) + a.sec));
        const genres = Object.entries(gmap).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const gMax = genres.length ? genres[0][1] : 1;
        const unlocked = (typeof getUnlockedAchievements === 'function') ? getUnlockedAchievements().length : 0;
        const achTotal = (typeof ACHIEVEMENTS !== 'undefined') ? ACHIEVEMENTS.length : 0;

        document.getElementById('statsBody').innerHTML = `
        <div class="stx">
            <div class="stx-hero">
                <div class="stx-rank-ico">${cur[2]}</div>
                <div class="stx-hero-txt">
                    <small>Seviyen</small><h4>${cur[1]}</h4>
                    <div class="stx-prog"><i style="width:${prog.toFixed(1)}%"></i></div>
                    <span>${nxt ? `Sonraki: <b>${nxt[1]}</b> · ${Math.max(0, Math.ceil(nxt[0] - hours))} saat kaldı` : 'En yüksek seviyeye ulaştın!'}</span>
                </div>
                <div class="stx-hero-time"><b>${fmtDur(total)}</b><small>${estimated ? 'tahmini toplam' : 'toplam izleme'}</small></div>
            </div>

            <div class="stx-grid">
                <div class="stx-card c1"><i class="fa-solid fa-clapperboard"></i><b>${epCount}</b><small>İzlenen Bölüm</small></div>
                <div class="stx-card c2"><i class="fa-solid fa-fire"></i><b>${streak}<em>gün</em></b><small>Güncel Seri</small></div>
                <div class="stx-card c3"><i class="fa-solid fa-calendar-check"></i><b>${activeDays}<em>gün</em></b><small>Aktif Gün</small></div>
                <div class="stx-card c4"><i class="fa-solid fa-trophy"></i><b>${fmtDur(bestDay)}</b><small>En Uzun Gün</small></div>
            </div>

            <div class="stx-block">
                <div class="stx-bh"><span>Son 7 Gün</span><em>${fmtDur(wTotal)}</em></div>
                <div class="stx-chart">
                    ${week.map(w => `<div class="stx-bar${w.today ? ' today' : ''}" title="${Math.round(w.v / 60)} dk"><div class="stx-fill" style="height:${Math.max(4, (w.v / wMax) * 100)}%"></div><small>${w.n}</small></div>`).join('')}
                </div>
            </div>

            <div class="stx-two">
                <div class="stx-block">
                    <div class="stx-bh"><span>En Çok İzlenenler</span></div>
                    ${animeArr.length ? animeArr.map((a, i) => `<div class="stx-top">
                        <span class="stx-n">${i + 1}</span>
                        ${a.img ? `<img src="${esc(a.img)}" alt="" loading="lazy">` : '<div class="stx-noimg"></div>'}
                        <div class="stx-top-txt"><b>${esc(a.title)}</b><div class="stx-mini"><i style="width:${(a.sec / aMax) * 100}%"></i></div></div>
                        <em>${fmtDur(a.sec)}</em></div>`).join('') : '<p class="stx-empty">Bir anime izlemeye başla, burada görünsün.</p>'}
                </div>
                <div class="stx-block">
                    <div class="stx-bh"><span>Favori Türler</span></div>
                    ${genres.length ? genres.map(g => `<div class="stx-genre"><span>${esc(g[0])}</span><div class="stx-mini"><i style="width:${(g[1] / gMax) * 100}%"></i></div><em>${fmtDur(g[1])}</em></div>`).join('') : '<p class="stx-empty">Tür verisi izledikçe oluşur.</p>'}
                </div>
            </div>

            <div class="stx-pills">
                <div><i class="fa-solid fa-heart"></i><b>${favs}</b> Favori</div>
                <div><i class="fa-solid fa-bookmark"></i><b>${wl}</b> Liste</div>
                <div><i class="fa-solid fa-clock-rotate-left"></i><b>${hist}</b> Geçmiş</div>
                <div><i class="fa-solid fa-medal"></i><b>${unlocked}/${achTotal}</b> Başarım</div>
            </div>

            <div class="stx-actions">
                <button onclick="stxExport()"><i class="fa-solid fa-file-export"></i> Dışa Aktar</button>
                <button class="danger" onclick="if(confirm('Tüm veriler sıfırlansın mı?')){resetAllUserData();}"><i class="fa-solid fa-trash"></i> Sıfırla</button>
            </div>
        </div>`;
    };
    window.stxExport = function(){
        const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'anitr-istatistikler.json'; a.click();
    };
})();

window.openUserProfile = async function(username) {
    if(!username) return;
    
    // Eğer kendi profilimse, standart modu aç
    if (typeof currentUser !== 'undefined' && username === currentUser) {
        showProfileModal();
        return;
    }
    
    showLoader();
    try {
        // Fetch profile from Supabase
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('username', username).single();
        hideLoader();
        
        if (error || !data) {
            showToast('Kullanıcı bulunamadı!');
            return;
        }

        // DOM elements
        const modal = document.getElementById('profileModal');
        const bInput = document.getElementById('profileBannerInput');
        const aInput = document.getElementById('profileAvatarInput');
        const saveBtn = document.querySelector('.prf-save-btn');
        const nameColorSel = document.getElementById('profileNameColor');
        const bioText = document.getElementById('profileBio');
        const discordInp = document.getElementById('profileDiscord');
        const genreSel = document.getElementById('profileFavGenre');
        const showWatchedChk = document.getElementById('profileShowWatchedAnime');
        const showCurrentChk = document.getElementById('profileShowCurrentWatching');
        const unameInp = document.getElementById('profileUsername');

        // Set Values
        document.getElementById('profileBanner').src = data.banner_url || '';
        document.getElementById('profileBanner').style.display = data.banner_url ? 'block' : 'none';
        document.getElementById('profileAvatar').src = data.avatar_url || ('https://api.dicebear.com/8.x/avataaars/svg?seed=' + username);
        
        unameInp.value = data.username || username;
        nameColorSel.value = data.name_color || '#ffffff';
        bioText.value = data.bio || '';
        discordInp.value = data.discord || '';
        genreSel.value = data.fav_genre || '';
        showWatchedChk.checked = data.show_watched !== false; // default true
        showCurrentChk.checked = data.show_current !== false;

        // Current watching
        const currentContainer = document.getElementById('profileCurrentWatching');
        if (data.show_current !== false && data.current_anime) {
            currentContainer.innerHTML = `<div style="display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
                <i class="fa-solid fa-play" style="color:var(--accent);"></i>
                <span style="color:white; font-weight:600;">${data.current_anime}</span>
            </div>`;
        } else {
            currentContainer.innerHTML = '<p style="color: var(--text3); text-align: center;">Şu an bir anime izlemiyor veya gizli.</p>';
        }

        // MAKE IT READ ONLY
        const makeReadOnly = (el) => { if(el) { el.disabled = true; el.style.opacity = '0.8'; } };
        makeReadOnly(unameInp);
        makeReadOnly(nameColorSel);
        makeReadOnly(bioText);
        makeReadOnly(discordInp);
        makeReadOnly(genreSel);
        makeReadOnly(showWatchedChk);
        makeReadOnly(showCurrentChk);
        
        // Hide upload buttons & save button
        document.querySelectorAll('.profile-avatar-upload-btn, .prf-banner-edit').forEach(el => el.style.display = 'none');
        if(saveBtn) saveBtn.style.display = 'none';

        // INJECT FRIEND ACTIONS (Add Friend / Message)
        let actionsHtml = `<div id="prfActionBtns" style="display:flex; gap:10px; margin-top:20px;">`;
        if (typeof currentUser !== 'undefined' && currentUser) {
            // Check if friend
            const { data: fData } = await supabaseClient.from('friends').select('status').or(`and(sender.eq.${currentUser},receiver.eq.${username}),and(sender.eq.${username},receiver.eq.${currentUser})`).single();
            if (fData && fData.status === 'accepted') {
                actionsHtml += `<button class="btn-primary" style="flex:1;" onclick="closeProfileModal(); openSocialChat('${username}')"><i class="fa-solid fa-message"></i> Mesaj Gönder</button>`;
            } else if (fData && fData.status === 'pending') {
                actionsHtml += `<button class="btn-secondary" style="flex:1;" disabled><i class="fa-solid fa-clock"></i> İstek Bekliyor</button>`;
            } else {
                actionsHtml += `<button class="btn-primary" style="flex:1;" onclick="addSocialFriend('${username}')"><i class="fa-solid fa-user-plus"></i> Arkadaş Ekle</button>`;
            }
        }
        actionsHtml += `</div>`;
        
        // Remove old actions if they exist
        const oldActions = document.getElementById('prfActionBtns');
        if(oldActions) oldActions.remove();
        
        document.querySelector('.prf-body').insertAdjacentHTML('beforeend', actionsHtml);

        modal.classList.remove('hidden');

        // Override close to reset things
        const origClose = window.closeProfileModal;
        window.closeProfileModal = function() {
            if(origClose) origClose();
            // Reset readonly state next time
            const unReadOnly = (el) => { if(el) { el.disabled = false; el.style.opacity = '1'; } };
            unReadOnly(unameInp); unReadOnly(nameColorSel); unReadOnly(bioText); unReadOnly(discordInp); unReadOnly(genreSel); unReadOnly(showWatchedChk); unReadOnly(showCurrentChk);
            document.querySelectorAll('.profile-avatar-upload-btn, .prf-banner-edit').forEach(el => el.style.display = 'flex');
            if(saveBtn) saveBtn.style.display = 'flex';
            const acts = document.getElementById('prfActionBtns');
            if(acts) acts.remove();
            
            // Re-bind to original
            window.closeProfileModal = origClose;
        };

    } catch(e) {
        hideLoader();
        console.error(e);
        showToast('Profil açılamadı!');
    }
};

document.addEventListener('loadedmetadata', (e) => {
    if (e.target.tagName === 'VIDEO' && e.target.closest('.video-container-page')) {
        if (typeof applyAudioOutput === 'function') applyAudioOutput();
    }
}, true);

// AUDIO OUTPUT DEVICES
window.loadAudioDevices = async function() {
    const select = document.getElementById('settingAudioOutput');
    if (!select || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        
        if (audioOutputs.length > 0) {
            select.innerHTML = '<option value="default">Sistem Varsayılanı</option>';
            audioOutputs.forEach(device => {
                if (device.deviceId && device.deviceId !== 'default' && device.deviceId !== 'communications') {
                    const opt = document.createElement('option');
                    opt.value = device.deviceId;
                    opt.text = device.label || `Cihaz ${select.length}`;
                    select.appendChild(opt);
                }
            });
            select.value = appSettings.audioOutput || 'default';
        }
    } catch(e) {
        console.error('Ses cihazları yüklenemedi:', e);
    }
};

window.applyAudioOutput = async function() {
    const deviceId = appSettings.audioOutput || 'default';
    const videoEl = document.querySelector('#animePlayer video') || document.getElementById('animePlayer_html5_api');
    
    if (videoEl && typeof videoEl.setSinkId === 'function') {
        try {
            await videoEl.setSinkId(deviceId === 'default' ? '' : deviceId);
        } catch (error) {
            console.error('Ses çıkışı değiştirilemedi:', error);
        }
    }
};

// SCREEN SHAKE LOGIC
let shakeAudioCtx = null;
let shakeAnalyser = null;
let shakeSource = null;
let shakeDataArray = null;
let isShakeEnabled = false;
let shakeRafId = null;

window.initScreenShake = function() {
    if (!appSettings.screenShake) {
        stopScreenShake();
        return;
    }
    
    const video = document.querySelector('#animePlayer video') || document.getElementById('animePlayer_html5_api') || document.querySelector('video');
    if (!video) return;

    if (!shakeAudioCtx) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            shakeAudioCtx = new AudioContext();
            shakeAnalyser = shakeAudioCtx.createAnalyser();
            shakeAnalyser.fftSize = 256;
            
            // Note: createMediaElementSource can only be called once per media element!
            if (!video._hasMediaSource) {
                shakeSource = shakeAudioCtx.createMediaElementSource(video);
                video._hasMediaSource = true;
                shakeSource.connect(shakeAnalyser);
                shakeAnalyser.connect(shakeAudioCtx.destination);
            }
            
            shakeDataArray = new Uint8Array(shakeAnalyser.frequencyBinCount);
        } catch (e) {
            console.error('AudioContext hatası (Screen Shake):', e);
            return;
        }
    }
    
    if (shakeAudioCtx.state === 'suspended') {
        shakeAudioCtx.resume().catch(()=>{});
    }
    
    if (!isShakeEnabled) {
        isShakeEnabled = true;
        startShakeLoop();
    }
};

window.stopScreenShake = function() {
    isShakeEnabled = false;
    if (shakeRafId) {
        cancelAnimationFrame(shakeRafId);
        shakeRafId = null;
    }
    const container = document.querySelector('.video-container-page');
    if (container) {
        container.style.transform = 'none';
        container.style.transition = 'transform 0.1s ease-out';
    }
};

window.startShakeLoop = function() {
    if (!isShakeEnabled) return;
    shakeRafId = requestAnimationFrame(window.startShakeLoop);
    
    if (shakeAnalyser && shakeDataArray) {
        shakeAnalyser.getByteFrequencyData(shakeDataArray);
        
        let bassSum = 0;
        const bassBins = 8; // Alt frekanslar (baslar)
        for (let i = 0; i < bassBins; i++) {
            bassSum += shakeDataArray[i];
        }
        const bassAvg = bassSum / bassBins;
        
        const container = document.querySelector('.video-container-page');
        if (container) {
            // Eşik değeri (235 üstü ağır bas)
            if (!window._shakeTested && bassAvg > 10) {
                console.log("Shake Audio Data Received! Avg:", bassAvg);
                window._shakeTested = true;
            }
            if (bassAvg > 160) {
                const intensity = Math.min((bassAvg - 160) / 40, 1.5);
                const maxShift = 25;
                const x = (Math.random() - 0.5) * maxShift * intensity;
                const y = (Math.random() - 0.5) * maxShift * intensity;
                container.style.transition = 'none';
                container.style.transform = `translate(${x}px, ${y}px)`;
            } else {
                container.style.transform = 'none';
                container.style.transition = 'transform 0.05s ease-out';
            }
        }
    }
};

// Event listener for play
document.addEventListener('play', (e) => {
    if (e.target.tagName === 'VIDEO' && e.target.closest('.video-container-page')) {
        if (appSettings.screenShake) window.initScreenShake();
    }
}, true);

// Foolproof Screen Shake Init
setInterval(() => {
    if (typeof appSettings !== 'undefined' && appSettings.screenShake && !isShakeEnabled) {
        const v = document.querySelector('video');
        if (v && !v.paused && v.readyState >= 2) {
            if (typeof initScreenShake === 'function') initScreenShake();
        }
    }
}, 1000);

// ══════════════════════════════════════════════════════
// TRACE.MOE — Görselden Anime Bulucu
// ══════════════════════════════════════════════════════
window.openTraceMoeModal = function() {
    var existing = document.getElementById('traceMoeModal');
    if (existing) { existing.classList.remove('hidden'); return; }
    var modal = document.createElement('div');
    modal.id = 'traceMoeModal';
    modal.className = 'trace-modal-overlay';
    modal.innerHTML = `
        <div class="trace-modal">
            <div class="trace-modal-header">
                <div class="trace-modal-title"><i class="fa-solid fa-camera-retro"></i> Görselden Anime Bul</div>
                <button class="trace-close-btn" onclick="document.getElementById('traceMoeModal').classList.add('hidden')"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="trace-modal-body">
                <div id="traceMoeDropzone" class="trace-dropzone">
                    <i class="fa-solid fa-cloud-arrow-up trace-upload-icon"></i>
                    <p>Ekran görüntüsünü buraya sürükle veya tıkla</p>
                    <small>JPG, PNG, GIF desteklenir</small>
                    <input type="file" id="traceMoeFileInput" accept="image/*" style="display:none">
                </div>
                <div id="traceMoeLoading" class="trace-loading hidden">
                    <div class="spinner"></div>
                    <span>Aranıyor...</span>
                </div>
                <div id="traceMoeResult" class="trace-results"></div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    var dz = document.getElementById('traceMoeDropzone');
    var fi = document.getElementById('traceMoeFileInput');

    dz.addEventListener('click', function() { fi.click(); });
    dz.addEventListener('dragover', function(e) { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', function() { dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', function(e) {
        e.preventDefault(); dz.classList.remove('drag-over');
        var file = e.dataTransfer.files[0];
        if (file) doTraceMoeSearch(file);
    });
    fi.addEventListener('change', function() {
        if (fi.files[0]) doTraceMoeSearch(fi.files[0]);
    });

    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.classList.add('hidden');
    });
};

async function doTraceMoeSearch(file) {
    var loading = document.getElementById('traceMoeLoading');
    var result  = document.getElementById('traceMoeResult');
    var dz      = document.getElementById('traceMoeDropzone');
    if (loading) loading.classList.remove('hidden');
    if (result)  result.innerHTML = '';
    if (dz)      dz.style.opacity = '0.4';
    try {
        var res = await fetch('https://api.trace.moe/search?anilistInfo', {
            method: 'POST',
            headers: { 'Content-Type': file.type },
            body: file
        });
        var data = await res.json();
        if (dz) dz.style.opacity = '1';
        if (loading) loading.classList.add('hidden');
        if (!data.result || data.result.length === 0) {
            if (result) result.innerHTML = '<p style="text-align:center;color:var(--text3);padding:2rem;">Eşleşme bulunamadı.</p>';
            return;
        }
        var html = data.result.slice(0, 5).map(function(r) {
            var title = (r.anilist && (r.anilist.title.romaji || r.anilist.title.english)) || 'Bilinmiyor';
            var ep    = r.episode ? (' • Bölüm ' + r.episode) : '';
            var sim   = Math.round((r.similarity || 0) * 100);
            var at    = r.from ? (' • ' + new Date(r.from * 1000).toISOString().substr(14, 5)) : '';
            var safeT = title.replace(/'/g, "&#39;");
            return '<div class="trace-result-card" onclick="searchAnimeByName(\'' + safeT + '\');document.getElementById(\'traceMoeModal\').classList.add(\'hidden\')">' +
                '<div class="trace-result-video-wrap">' +
                (r.video ? '<video src="' + r.video + '&size=l" autoplay muted loop playsinline class="trace-result-video"></video>' : '') +
                '</div>' +
                '<div class="trace-result-info">' +
                '<div class="trace-result-title">' + title + '</div>' +
                '<div class="trace-result-meta">' + ep + at + '</div>' +
                '<div class="trace-result-sim"><span class="trace-sim-badge" style="background:' + (sim >= 90 ? '#22c55e' : sim >= 75 ? '#f59e0b' : '#ef4444') + '">' + sim + '% Eşleşme</span></div>' +
                '<button class="trace-play-btn"><i class="fa-solid fa-play"></i> İzle</button>' +
                '</div></div>';
        }).join('');
        if (result) result.innerHTML = html;
    } catch(e) {
        if (dz) dz.style.opacity = '1';
        if (loading) loading.classList.add('hidden');
        if (result) result.innerHTML = '<p style="color:#f87171;text-align:center;padding:2rem;">Hata: ' + e.message + '</p>';
    }
}


// ══════════════════════════════════════════════════════
// SHARED AUDIO GRAPH — Volume Booster & Screen Shake için
// ══════════════════════════════════════════════════════
function anitrAudioGraph(video) {
    if (video._anitrGraph) return video._anitrGraph;
    var ctx  = new (window.AudioContext || window.webkitAudioContext)();
    var src  = ctx.createMediaElementSource(video);
    var gain = ctx.createGain();
    var comp = ctx.createDynamicsCompressor();
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(gain);
    gain.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);
    var pct = (typeof appSettings !== 'undefined' && appSettings.volumeBoost) ? appSettings.volumeBoost : 100;
    gain.gain.value = pct / 100;
    video._anitrGraph = { ctx: ctx, src: src, gain: gain, comp: comp, analyser: analyser };
    return video._anitrGraph;
}

window.anitrAudioGraph = anitrAudioGraph;

// ══════════════════════════════════════════════════════
// VOLUME BOOSTER — Apply function
// ══════════════════════════════════════════════════════
function anitrApplyVolumeBoost(pct) {
    appSettings.volumeBoost = pct;
    if (window.ls) ls.set('anitr_settings', appSettings);
    var video = document.querySelector('video');
    if (!video) return;
    try {
        var graph = anitrAudioGraph(video);
        graph.gain.gain.value = pct / 100;
    } catch(e) { console.warn('VolumeBoost error:', e); }
}

function _anitrVolumeUI(p, wrap) {
    var pct = appSettings.volumeBoost || 100;
    var sliderWrap = document.createElement('div');
    sliderWrap.style.cssText = 'padding:12px 16px;';
    sliderWrap.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
        '<span style="font-size:13px;color:var(--text2);">Ses Seviyesi</span>' +
        '<span id="volumeBoostLabel" style="font-size:14px;font-weight:700;color:var(--accent-light);">' + pct + '%</span>' +
        '</div>' +
        '<input type="range" id="volumeBoostSlider" min="50" max="300" step="10" value="' + pct + '"' +
        ' style="width:100%;accent-color:var(--accent);cursor:pointer;">' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text3);margin-top:4px;">' +
        '<span>50%</span><span style="color:var(--text2);">Normal=100%</span><span>300%</span></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
        [50,75,100,150,200,300].map(function(v) {
            return '<button onclick="document.getElementById(\'volumeBoostSlider\').value=' + v +
                ';document.getElementById(\'volumeBoostLabel\').textContent=\'' + v + '%\';anitrApplyVolumeBoost(' + v + ');" ' +
                'style="flex:1;min-width:40px;padding:5px 4px;background:' + (v === pct ? 'var(--accent)' : 'rgba(255,255,255,0.07)') +
                ';border:1px solid var(--border);border-radius:6px;color:var(--text1);font-size:12px;cursor:pointer;">' + v + '%</button>';
        }).join('') +
        '</div>';
    wrap.appendChild(sliderWrap);
    setTimeout(function() {
        var sl = document.getElementById('volumeBoostSlider');
        var lb = document.getElementById('volumeBoostLabel');
        if (sl && lb) {
            sl.addEventListener('input', function() {
                lb.textContent = sl.value + '%';
                anitrApplyVolumeBoost(parseInt(sl.value));
            });
        }
    }, 50);
}

// ══════════════════════════════════════════════════════
// SCREENSHOT — Canvas capture
// ══════════════════════════════════════════════════════
function anitrTakeScreenshot() {
    var video = document.querySelector('video');
    if (!video) { showToast('Hata: Video bulunamadi'); return; }
    try {
        var canvas = document.createElement('canvas');
        canvas.width  = video.videoWidth  || 1920;
        canvas.height = video.videoHeight || 1080;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function(blob) {
            var url = URL.createObjectURL(blob);
            var a   = document.createElement('a');
            a.href  = url;
            a.download = 'anitr-screenshot-' + Date.now() + '.png';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Ekran goruntusu kaydedildi!');
            var flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0.4;pointer-events:none;z-index:99999;transition:opacity 0.3s;';
            document.body.appendChild(flash);
            setTimeout(function() { flash.style.opacity = '0'; setTimeout(function() { flash.remove(); }, 300); }, 50);
        }, 'image/png');
    } catch(e) {
        showToast('Ekran goruntusu alinamadi: ' + e.message);
    }
}

window.anitrApplyVolumeBoost = anitrApplyVolumeBoost;
window.anitrTakeScreenshot   = anitrTakeScreenshot;


/* ═══════════════════════════════════════════════════════════════════
   FILLER BÖLÜM TESPİTİ — Jikan (MyAnimeList) verisiyle
   Ayarlar > Oynatıcı > "Filler Bölüm Göstergesi" ile açılıp kapatılır
   ═══════════════════════════════════════════════════════════════════ */
var _anitrFiller = { key: '', ready: false, loading: false, failed: false, fillers: new Set(), recaps: new Set(), total: 0, malId: 0 };
var _anitrFillerMode = 'all';          // all | canon | filler
var _anitrFillerPrevIdx = -1;
var _anitrFillerHandled = '';

function anitrFillerEnabled() {
    return !(typeof appSettings !== 'undefined' && appSettings && appSettings.showFillers === false);
}
function _fillerSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function _fillerCacheGet(key) {
    try {
        var all = JSON.parse(localStorage.getItem('anitr_filler_v1') || '{}');
        var e = all[key];
        if (e && Date.now() - e.t < 3 * 86400000) return e;
    } catch (e) {}
    return null;
}
function _fillerCacheSet(key, val) {
    try {
        var all = JSON.parse(localStorage.getItem('anitr_filler_v1') || '{}');
        all[key] = val;
        var keys = Object.keys(all);
        if (keys.length > 60) {
            keys.sort(function (a, b) { return all[a].t - all[b].t; });
            delete all[keys[0]];
        }
        localStorage.setItem('anitr_filler_v1', JSON.stringify(all));
    } catch (e) {}
}

async function _jikanGetJson(url) {
    for (var a = 0; a < 3; a++) {
        var r = await fetch(url);
        if (r.status === 429) { await _fillerSleep(1200 * (a + 1)); continue; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }
    throw new Error('Jikan istek limiti');
}

async function anitrFillerEnsure(title, seasonId) {
    if (!anitrFillerEnabled() || !title) return;
    var sNum = parseInt(seasonId) || 1;
    if (sNum > 30) sNum = 1;
    var key = String(title).toLowerCase().trim() + '|' + sNum;
    if (_anitrFiller.key === key && (_anitrFiller.ready || _anitrFiller.loading)) return;

    _anitrFiller = { key: key, ready: false, loading: true, failed: false, fillers: new Set(), recaps: new Set(), total: 0, malId: 0 };
    anitrFillerRender();

    try {
        var cached = _fillerCacheGet(key);
        var fillers, recaps, total, malId;
        if (cached) {
            fillers = cached.f; recaps = cached.r; total = cached.n; malId = cached.m;
        } else {
            var q = sNum > 1 ? title + ' season ' + sNum : title;
            var sr = await _jikanGetJson('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(q) + '&limit=6&sfw=true');
            var list = (sr && sr.data) || [];
            var pick = list.find(function (x) { return x.type === 'TV'; }) || list[0];
            if (!pick) throw new Error('MAL kaydı bulunamadı');
            malId = pick.mal_id;
            fillers = []; recaps = []; total = 0;
            var page = 1, guard = 0;
            while (guard++ < 25) {
                await _fillerSleep(380);
                var d = await _jikanGetJson('https://api.jikan.moe/v4/anime/' + malId + '/episodes?page=' + page);
                (d.data || []).forEach(function (e) {
                    var n = e.mal_id;
                    if (n > total) total = n;
                    if (e.filler) fillers.push(n);
                    if (e.recap) recaps.push(n);
                });
                if (!(d.pagination && d.pagination.has_next_page)) break;
                page++;
            }
            if (!total) throw new Error('Bölüm verisi yok');
            _fillerCacheSet(key, { t: Date.now(), f: fillers, r: recaps, n: total, m: malId });
        }
        if (_anitrFiller.key !== key) return;       // arada başka animeye geçildi
        _anitrFiller.fillers = new Set(fillers);
        _anitrFiller.recaps = new Set(recaps);
        _anitrFiller.total = total;
        _anitrFiller.malId = malId;
        _anitrFiller.ready = true;
        _anitrFiller.loading = false;
    } catch (err) {
        if (_anitrFiller.key !== key) return;
        console.warn('[Filler]', err && err.message);
        _anitrFiller.loading = false;
        _anitrFiller.failed = true;
    }
    anitrFillerRender();
    _fillerMaybeAutoSkip();
}

function _fillerEpNum(ep, idx) { return parseInt(ep && ep.Number) || (idx + 1); }

function anitrFillerType(epNum) {
    var f = _anitrFiller;
    if (!anitrFillerEnabled() || !f.ready) return null;
    if (f.fillers.has(epNum)) return 'filler';
    if (f.recaps.has(epNum)) return 'recap';
    if (f.total && epNum > f.total) return null;
    return 'canon';
}

function _fillerHidden(t) {
    if (_anitrFillerMode === 'canon') return t === 'filler' || t === 'recap';
    if (_anitrFillerMode === 'filler') return t !== 'filler' && t !== 'recap';
    return false;
}

function _fillerBadgeHTML(t, cls) {
    return '<span class="' + cls + ' ' + t + '">' +
        (t === 'filler' ? '<i class="fa-solid fa-hourglass-half"></i> Filler' : '<i class="fa-solid fa-rotate-left"></i> Özet') + '</span>';
}

function anitrFillerSetMode(m) {
    _anitrFillerMode = m;
    anitrFillerRender();
}
function anitrFillerSetAutoSkip(on) {
    try { localStorage.setItem('anitr_filler_autoskip', on ? '1' : '0'); } catch (e) {}
    anitrFillerRender();
}
function _fillerAutoSkipOn() { return localStorage.getItem('anitr_filler_autoskip') === '1'; }

function anitrFillerSkipToCanon() {
    var eps = currentEpisodes || [];
    for (var j = (typeof currentEIdx === 'number' ? currentEIdx : 0) + 1; j < eps.length; j++) {
        var t = anitrFillerType(_fillerEpNum(eps[j], j));
        if (t !== 'filler' && t !== 'recap') {
            watchEpisode(currentAnime.id, currentAnime.slug, currentAnime.isMovie, eps[j], currentSIdx, j, currentAnime.title, currentAnime.synopsis, currentAnime.img);
            return true;
        }
    }
    if (typeof showToast === 'function') showToast('Sonraki canon bölüm bulunamadı.');
    return false;
}

function _fillerMaybeAutoSkip() {
    try {
        if (!anitrFillerEnabled() || !_anitrFiller.ready || !_fillerAutoSkipOn()) return;
        var wv = document.getElementById('watchView');
        if (!wv || wv.classList.contains('hidden')) return;
        var eps = currentEpisodes || [];
        var idx = currentEIdx;
        var ep = eps[idx];
        if (!ep) return;
        var t = anitrFillerType(_fillerEpNum(ep, idx));
        var guardKey = _anitrFiller.key + '#' + idx;
        if (t !== 'filler' && t !== 'recap') return;
        if (_anitrFillerHandled === guardKey) return;
        _anitrFillerHandled = guardKey;
        // Sadece "bir sonraki bölüme" ilerlerken otomatik atla (kullanıcı bilerek filler seçtiyse atlama)
        if (_anitrFillerPrevIdx >= 0 && idx === _anitrFillerPrevIdx + 1) {
            if (typeof showToast === 'function') showToast('⏭️ Filler bölüm atlanıyor...');
            anitrFillerSkipToCanon();
        }
    } catch (e) {}
}

function anitrFillerOnWatch() {
    if (!anitrFillerEnabled()) { anitrFillerRender(); return; }
    var prev = _anitrFillerPrevIdx;
    var cur = (typeof currentEIdx === 'number') ? currentEIdx : -1;
    anitrFillerEnsure(currentAnime && currentAnime.title, currentSIdx);
    anitrFillerRender();
    // _anitrFillerPrevIdx, _fillerMaybeAutoSkip içinde kullanılır; sonrasında güncellenir
    _anitrFillerPrevIdx = prev;
    _fillerMaybeAutoSkip();
    _anitrFillerPrevIdx = cur;
}

function _fillerCounts(eps) {
    var cnt = { canon: 0, filler: 0, recap: 0 };
    eps.forEach(function (ep, i) {
        var t = anitrFillerType(_fillerEpNum(ep, i));
        if (t) cnt[t]++;
    });
    return cnt;
}

function anitrFillerRender() {
    var on = anitrFillerEnabled();
    var detailBar = document.getElementById('fillerCtrlBar');
    var wbar = document.getElementById('watchFillerControlBar');
    var banner = document.getElementById('watchFillerAlertBanner');
    var cbadge = document.getElementById('watchEpisodeCanonBadge');
    var f = _anitrFiller;

    // Kapalı ya da veri yoksa her şeyi temizle
    var clearAll = !on;
    if (clearAll) {
        if (detailBar) detailBar.remove();
        if (wbar) { wbar.innerHTML = ''; wbar.classList.add('hidden'); }
        if (banner) { banner.innerHTML = ''; banner.classList.add('hidden'); }
        if (cbadge) cbadge.classList.add('hidden');
        document.querySelectorAll('.ep-thumb-badge-wrap.fl, .sep2-type-badge').forEach(function (n) { n.remove(); });
        document.querySelectorAll('.is-filler-ep').forEach(function (n) { n.classList.remove('is-filler-ep'); });
        document.querySelectorAll('.fl-hidden').forEach(function (n) { n.classList.remove('fl-hidden'); });
        return;
    }

    var eps = currentEpisodes || [];
    var cnt = _fillerCounts(eps);
    var autoOn = _fillerAutoSkipOn();

    // ── Detay sayfası kontrol çubuğu ──
    var list = document.getElementById('episodesList');
    if (list && list.parentNode) {
        if (f.failed || (!f.loading && !f.ready)) {
            if (detailBar) detailBar.remove();
        } else {
            if (!detailBar) {
                detailBar = document.createElement('div');
                detailBar.id = 'fillerCtrlBar';
                detailBar.className = 'filler-ctrl-bar';
                list.parentNode.insertBefore(detailBar, list);
            }
            if (f.loading) {
                detailBar.innerHTML = '<div class="filler-ctrl-inner"><div class="filler-ctrl-stats"><span class="filler-stat-chip recap"><i class="fa-solid fa-spinner fa-spin"></i> Filler bilgisi yükleniyor...</span></div></div>';
            } else {
                var pill = function (m, label) {
                    return '<button type="button" class="filler-filter-btn' + (_anitrFillerMode === m ? ' active' : '') + '" onclick="anitrFillerSetMode(\'' + m + '\')">' + label + '</button>';
                };
                detailBar.innerHTML =
                    '<div class="filler-ctrl-inner">' +
                    '<div class="filler-ctrl-stats">' +
                    '<span class="filler-stat-chip canon"><i class="fa-solid fa-circle-check"></i> ' + cnt.canon + ' Canon</span>' +
                    '<span class="filler-stat-chip filler"><i class="fa-solid fa-hourglass-half"></i> ' + cnt.filler + ' Filler</span>' +
                    (cnt.recap ? '<span class="filler-stat-chip recap"><i class="fa-solid fa-rotate-left"></i> ' + cnt.recap + ' Özet</span>' : '') +
                    '</div>' +
                    '<div class="filler-ctrl-actions">' +
                    '<div class="filler-filter-pills">' + pill('all', 'Tümü') + pill('canon', 'Sadece Canon') + pill('filler', 'Filler') + '</div>' +
                    '<label class="filler-autoskip-toggle" title="Bir sonraki bölüme geçerken filler bölümleri otomatik atla">' +
                    '<input type="checkbox" ' + (autoOn ? 'checked' : '') + ' onchange="anitrFillerSetAutoSkip(this.checked)">' +
                    '<span class="filler-toggle-slider"></span>' +
                    '<span class="filler-toggle-text"><i class="fa-solid fa-forward"></i> Filler\'ı Otomatik Atla</span>' +
                    '</label></div></div>';
            }
        }
    }

    // ── Detay sayfası bölüm kartları ──
    document.querySelectorAll('#episodesList .episode-card').forEach(function (card) {
        var idx = parseInt(card.dataset.epIdx);
        var ep = eps[idx];
        if (!ep) return;
        var t = anitrFillerType(_fillerEpNum(ep, idx));
        card.classList.toggle('is-filler-ep', t === 'filler');
        card.classList.toggle('fl-hidden', f.ready && _fillerHidden(t));
        var th = card.querySelector('.ep-card-thumb');
        if (!th) return;
        var old = th.querySelector('.ep-thumb-badge-wrap.fl');
        if (old) old.remove();
        if (t === 'filler' || t === 'recap') {
            th.insertAdjacentHTML('beforeend', '<div class="ep-thumb-badge-wrap fl">' + _fillerBadgeHTML(t, 'ep-type-badge') + '</div>');
        }
    });

    // ── İzleme sayfası yan liste ──
    document.querySelectorAll('#watchEpisodesList .sep2-card').forEach(function (card, idx) {
        var ep = eps[idx];
        if (!ep) return;
        var t = anitrFillerType(_fillerEpNum(ep, idx));
        card.classList.toggle('is-filler-ep', t === 'filler');
        card.classList.toggle('fl-hidden', f.ready && _fillerHidden(t) && idx !== currentEIdx);
        var row = card.querySelector('.sep2-badges-row');
        if (!row) {
            var b = card.querySelector('.sep2-info > .sep2-badge');
            if (b) {
                row = document.createElement('div');
                row.className = 'sep2-badges-row';
                b.parentNode.insertBefore(row, b);
                row.appendChild(b);
            }
        }
        if (row) {
            var o = row.querySelector('.sep2-type-badge');
            if (o) o.remove();
            if (t === 'filler' || t === 'recap') row.insertAdjacentHTML('beforeend', _fillerBadgeHTML(t, 'sep2-type-badge'));
        }
    });

    // ── İzleme sayfası yan kontrol çubuğu ──
    if (wbar) {
        if (f.ready && eps.length) {
            wbar.classList.remove('hidden');
            var wp = function (m, label) {
                return '<button type="button" class="wf-pill' + (_anitrFillerMode === m ? ' active' : '') + '" onclick="anitrFillerSetMode(\'' + m + '\')">' + label + '</button>';
            };
            wbar.innerHTML =
                '<div class="watch-filler-row">' +
                '<div class="watch-filler-pills">' + wp('all', 'Tümü') + wp('canon', 'Canon') + wp('filler', 'Filler') + '</div>' +
                '<label class="wf-skip-label" title="Filler bölümleri otomatik atla"><input type="checkbox" ' + (autoOn ? 'checked' : '') + ' onchange="anitrFillerSetAutoSkip(this.checked)"> Atla</label>' +
                '</div>' +
                '<div class="watch-filler-summary"><span class="wf-sum canon">' + cnt.canon + ' canon</span><span class="wf-sum filler">' + cnt.filler + ' filler' + (cnt.recap ? ' · ' + cnt.recap + ' özet' : '') + '</span></div>';
        } else {
            wbar.innerHTML = '';
            wbar.classList.add('hidden');
        }
    }

    // ── İzleme sayfası uyarı + rozet ──
    var curIdx = (typeof currentEIdx === 'number') ? currentEIdx : -1;
    var curEp = eps[curIdx];
    var ct = (curEp && f.ready) ? anitrFillerType(_fillerEpNum(curEp, curIdx)) : null;
    if (cbadge) {
        if (ct) {
            cbadge.className = 'wd2-badge-canon ' + ct;
            cbadge.innerHTML = ct === 'canon' ? '<i class="fa-solid fa-circle-check"></i> Canon'
                : ct === 'filler' ? '<i class="fa-solid fa-hourglass-half"></i> Filler'
                : '<i class="fa-solid fa-rotate-left"></i> Özet';
        } else {
            cbadge.classList.add('hidden');
        }
    }
    if (banner) {
        if (ct === 'filler' || ct === 'recap') {
            banner.classList.remove('hidden');
            banner.innerHTML =
                '<div class="wfa-left"><i class="fa-solid fa-triangle-exclamation"></i>' +
                '<span><b>' + (ct === 'filler' ? 'Filler bölüm' : 'Özet bölümü') + '</b> — ' +
                (ct === 'filler' ? 'ana hikayeyle doğrudan bağlantısı yok.' : 'önceki bölümlerin özeti.') + '</span></div>' +
                '<div class="wfa-actions"><button type="button" class="wfa-skip-btn" onclick="anitrFillerSkipToCanon()"><i class="fa-solid fa-forward"></i> Sonraki Canon Bölüme Geç</button></div>';
        } else {
            banner.innerHTML = '';
            banner.classList.add('hidden');
        }
    }
}

window.anitrFillerRender = anitrFillerRender;
window.anitrFillerSetMode = anitrFillerSetMode;
window.anitrFillerSetAutoSkip = anitrFillerSetAutoSkip;
window.anitrFillerSkipToCanon = anitrFillerSkipToCanon;
