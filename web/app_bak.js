/* ============================================================
   ANITR WEB - app.js  (Temiz, Hatasız Yeniden Yazım)
   ============================================================ */

// API Base logic
const API_BASE = window.location.protocol === 'file:' 


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
function() {
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
        cinematicMeta.innerHTML = metaHtml;

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
                const recRes = await fetch(`${API_BASE}/mal/recommendations?username=${encodeURIComponent(malUser)}`);
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

        return `<div class="nf-cw-card" onclick="resumeWatch('${h.id}')">
            <div class="nf-cw-img-wrap" style="width:100%; height:150px; background:var(--surface2); border-radius:12px; overflow:hidden; position:relative; display:flex; align-items:center; justify-content:center; padding: ${objectFit === 'contain' ? '20px' : '0'};">
                <img src="${coverImg}" alt="${safeTitle}" loading="lazy" style="width:100%; height:100%; object-fit:${objectFit}; filter: ${objectFit === 'contain' ? 'drop-shadow(0 4px 10px rgba(0,0,0,0.8))' : 'none'};">
                <div class="nf-cw-play"><i class="fa-solid fa-play"></i></div>
                <div class="nf-cw-progress"><div class="nf-cw-bar" style="width:${progress}%"></div></div>
            </div>
            <div class="nf-cw-info" style="padding-top:10px;">
                <div class="nf-cw-title">${h.title||'Bilinmiyor'}</div>
                <div class="nf-cw-ep"><span style="color:var(--accent)">•</span> ${resumeLabel}</div>
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
// ── ANILIST DESTEKLİ TÜM ANİMELER SAYFASI ──────────────────────

async function showAnimeListView() {
    showAnimeListViewContainer();
    const grid = document.getElementById('animeListGrid');
    if (grid) grid.innerHTML = '';
    
    animeListPage = 1;
    hasMoreAnime = true;

    initializeFilters();
    
    // Yılı otomatik seçmek yerine boş bırakıyoruz
    document.getElementById('yearFilter').value = '';
    document.getElementById('genreFilter').value = '';
    document.getElementById('sortFilter').value = 'POPULARITY_DESC';
    
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
                const eps = m.episodes ? `${m.episodes} Bölüm` : (m.status === 'RELEASING' ? 'Devam Ediyor' : 'Bilinmiyor');
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
            <div id="episodesList" class="episodes-list"></div>
        </div>`


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

    // Fetch Kitsu Thumbnails
    let kitsuEps = {};
    try {
        const sNum = parseInt(seasonId) || 1;
        const q = sNum > 1 ? `${animeTitle} Season ${sNum}` : animeTitle;
        const searchRes = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}`);
        const searchData = await searchRes.json();
        
        if (searchData.data && searchData.data.length > 0) {
            const kitsuId = searchData.data[0].id;
            
            // Fetch enough pages to cover epsData.length
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
                        kitsuEps[e.attributes.number] = {
                            thumbnail: e.attributes.thumbnail ? e.attributes.thumbnail.original : null,
                            title: e.attributes.canonicalTitle,
                            airdate: e.attributes.airdate
                        };
                    });
                }
            });
        }
    } catch(e) { console.error("Kitsu fetch error", e); }

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
        btn.onclick = () => watchEpisode(id, slug, isMovie, ep, sIdx, idx, animeTitle, synopsis, imgUrl);
        
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
        const epNum     = ep.Number || (idx + 1);
        const label     = ep.kitsuTitle || ep.Title || ('Bölüm ' + epNum);
        const key       = (slug || id) + '_s' + currentSIdx + '_e' + idx;
        const isWatched = watched.includes(key);

        // Use Kitsu thumbnail if available
        const thumbnailUrl = ep.kitsuThumb || imgUrl;

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

let _ambientLightFrameId = null;
function startAmbilight(videoEl) {
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
    container.innerHTML = '<video id="animePlayer" class="video-js vjs-default-skin vjs-big-play-centered" controls playsinline crossorigin="anonymous" style="width:100%;height:100%;"></video><div id="subtitleSettingsPanel" class="subtitle-settings-panel hidden"></div>';
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
        
        const realVideoEl = document.querySelector('.video-container-page video');
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
                    p.textTrackSettings.updateStyle();
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
                case 'ArrowLeft': e.preventDefault(); p.currentTime(Math.max(0, p.currentTime() - 10)); break;
                case 'ArrowRight': e.preventDefault(); p.currentTime(Math.min(p.duration() || Infinity, p.currentTime() + 10)); break;
                case 'KeyF': e.preventDefault(); p.isFullscreen() ? p.exitFullscreen() : p.requestFullscreen(); break;
                case 'KeyM': e.preventDefault(); p.muted(!p.muted()); break;
            }
        };
        document.removeEventListener('keydown', window._anitrPlayerKeyboardHandler);
        window._anitrPlayerKeyboardHandler = _keyHandler;
        document.addEventListener('keydown', _keyHandler);

        // Intro/Outro atlama butonları
        _setupSkipButtons(p, opening, ending);

        // Altyazı ayar paneli
        _setupSubtitlePanel(p);

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

    tabsEl.innerHTML = SCHEDULE_DAYS_TR.map((day, idx) => {
        const count = (grouped[idx] || []).length;
        const isToday = idx === new Date().getDay();
        const isActive = idx === scheduleActiveDay;
        return `<button class="sched-day-tab ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}"
            onclick="switchScheduleDay(${idx})"
            style="${isActive ? `--day-color:${SCHEDULE_DAY_COLORS[idx]}` : ''}">
            <i class="fa-solid ${SCHEDULE_DAY_ICONS[idx]}"></i>
            <span>${day}</span>
            ${isToday ? '<span class="sched-today-badge">Bugün</span>' : ''}
            <span class="sched-count">${count}</span>
        </button>`;
    }).join('');
}

function switchScheduleDay(dayIdx) {
    scheduleActiveDay = dayIdx;
    const container = document.getElementById('scheduleContainer');
    if (!container || !container._grouped) return;
    renderScheduleDay(container._grouped, dayIdx);

    // update tab active states
    document.querySelectorAll('.sched-day-tab').forEach((btn, i) => {
        btn.classList.toggle('active', i === dayIdx);
        btn.style = i === dayIdx ? `--day-color:${SCHEDULE_DAY_COLORS[i]}` : '';
    });
}

function renderScheduleDay(grouped, dayIdx) {
    const grid = document.getElementById('scheduleGrid');
    if (!grid) return;
    const items = grouped[dayIdx] || [];

    if (!items.length) {
        grid.innerHTML = `<div class="sched-empty">
            <i class="fa-solid fa-calendar-xmark"></i>
            <p>Bu gün için yayın bulunamadı.</p>
        </div>`;
        return;
    }

    grid.innerHTML = items.map(m => {
        const title = m.title.romaji || m.title.english || 'Bilinmiyor';
        const safeTitle = title.replace(/'/g, "&#39;");
        const img = m.coverImage?.large || m.coverImage?.medium || 'https://placehold.co/200x280/0c0c16/8b5cf6?text=?';
        const score = m.averageScore ? (m.averageScore / 10).toFixed(1) : null;
        const eps = m.episodes ? `${m.episodes} Bölüm` : 'Devam Ediyor';
        const status = m.status === 'RELEASING' ? 'Yayında' : m.status === 'FINISHED' ? 'Tamamlandı' : m.status || '';
        const nextEp = m.nextAiringEpisode;
        const timeUntil = nextEp ? formatTimeUntil(nextEp.timeUntilAiring) : null;
        const nextEpNum = nextEp ? nextEp.episode : null;
        const genres = (m.genres || []).slice(0, 2).join(' · ');

        return `<div class="sched-card" onclick="searchAnimeByName('${safeTitle}')">
            <div class="sched-card-poster-wrap">
                <img src="${img}" alt="${safeTitle}" loading="lazy" onerror="this.src='https://placehold.co/200x280/0c0c16/8b5cf6?text=?'">
                <div class="sched-card-gradient"></div>
                ${score ? `<div class="sched-card-score"><i class="fa-solid fa-star"></i> ${score}</div>` : ''}
                ${timeUntil ? `<div class="sched-card-timer"><i class="fa-regular fa-clock"></i> ${timeUntil}</div>` : ''}
                <div class="sched-card-hover">
                    <button class="sched-play-btn"><i class="fa-solid fa-search"></i> Ara</button>
                </div>
            </div>
            <div class="sched-card-info">
                <div class="sched-card-title">${title}</div>
                ${nextEpNum ? `<div class="sched-card-ep"><i class="fa-solid fa-circle" style="font-size:6px;color:#8b5cf6"></i> Bölüm ${nextEpNum} geliyor</div>` : ''}
                <div class="sched-card-meta">${genres || eps}</div>
            </div>
        </div>`;
    }).join('');
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

    container.innerHTML = '<div style="text-align:center;padding:4rem"><div class="spinner"></div><p style="margin-top:1rem;color:var(--text3)">AniList'ten takvim yükleniyor...</p></div>';

    try {
        // AniList GraphQL — Bu sezon tüm animeleri çek, yayın günlerine göre grupla
        const query = `
        query {
          Page(page: 1, perPage: 50) {
            media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
              title { romaji english }
              coverImage { large medium }
              averageScore
              episodes
              status
              genres
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
        if (!data || !data.Page || !data.Page.media) throw new Error('Veri alınamadı');

        const media = data.Page.media;

        // Group by airing day (0=Sun,1=Mon,... JS day order)
        // nextAiringEpisode.airingAt is a Unix timestamp
        const grouped = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };

        media.forEach(m => {
            let dayIdx = -1;
            if (m.nextAiringEpisode && m.nextAiringEpisode.airingAt) {
                const d = new Date(m.nextAiringEpisode.airingAt * 1000);
                dayIdx = d.getDay(); // 0=Sun
            } else if (m.airingSchedule && m.airingSchedule.nodes && m.airingSchedule.nodes.length > 0) {
                const d = new Date(m.airingSchedule.nodes[0].airingAt * 1000);
                dayIdx = d.getDay();
            }
            if (dayIdx !== -1) {
                grouped[dayIdx].push(m);
            }
        });

        // Build main shell
        container.innerHTML = `
        <div class="sched-header">
            <div class="sched-header-text">
                <h2><i class="fa-solid fa-calendar-week"></i> Haftalık Yayın Takvimi</h2>
                <p>Bu sezon yayınlanan animelerin günlük yayın programı</p>
            </div>
            <div class="sched-season-badge"><i class="fa-solid fa-leaf"></i> Güncel Sezon</div>
        </div>
        <div id="scheduleDayTabs" class="sched-day-tabs"></div>
        <div id="scheduleGrid" class="sched-grid"></div>`;

        container._grouped = grouped;
        container.dataset.loaded = 'true';

        scheduleActiveDay = new Date().getDay();
        renderScheduleDayTabs(grouped);
        renderScheduleDay(grouped, scheduleActiveDay);

    } catch (err) {
        container.innerHTML = `<div style="text-align:center;padding:4rem;color:#ef4444"><i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;margin-bottom:1rem;display:block"></i>Takvim yüklenirken hata: ${err.message}</div>`;
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



// ==========================================
// ── ANITR SOSYAL SİSTEMİ (INFINITYFREE) ───
// ==========================================
let socialUserId = localStorage.getItem('anitr_social_id') || null;
let socialUsername = localStorage.getItem('anitr_social_user') || null;
let currentChatFriendId = null;
let chatRefreshInterval = null;

function getSocialApi() {
    return document.getElementById('socialApiUrl') ? document.getElementById('socialApiUrl').value.trim() : localStorage.getItem('anitr_social_api');
}

window.showFriendsModal = function() {
    document.getElementById('friendsModal').classList.remove('hidden');
    
    // Yüklü API url varsa kutuya yaz
    const savedApi = localStorage.getItem('anitr_social_api');
    if (savedApi && document.getElementById('socialApiUrl')) {
        document.getElementById('socialApiUrl').value = savedApi;
    }

    if (socialUserId) {
        document.getElementById('socialAuthView').classList.add('hidden');
        document.getElementById('socialDashboardView').classList.remove('hidden');
        document.getElementById('socialDashboardView').style.display = 'flex';
        loadSocialProfile();
        loadSocialFriends();
    } else {
        document.getElementById('socialAuthView').classList.remove('hidden');
        document.getElementById('socialDashboardView').classList.add('hidden');
        document.getElementById('socialDashboardView').style.display = 'none';
    }
}

window.closeFriendsModal = function() {
    document.getElementById('friendsModal').classList.add('hidden');
    if(chatRefreshInterval) clearInterval(chatRefreshInterval);
}

window.switchSocialTab = function(tabName) {
    document.querySelectorAll('.social-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('stab-' + tabName).classList.add('active');
    
    document.querySelectorAll('.social-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('stab-content-' + tabName).classList.remove('hidden');
}

// 1. AUTH
async function socialRequest(action, data = {}) {
    const api = getSocialApi();
    if (!api) throw new Error("Lütfen InfinityFree API bağlantınızı (URL) girin.");
    
    localStorage.setItem('anitr_social_api', api);
    
    let url = `${api}?action=${action}`;
    if (socialUserId) url += `&user_id=${socialUserId}`;
    
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await res.json();
}

window.socialLogin = async function() {
    const u = document.getElementById('socialUsername').value.trim();
    const p = document.getElementById('socialPassword').value.trim();
    const msg = document.getElementById('socialAuthMsg');
    
    if(!u || !p) { msg.innerText = "Kullanıcı adı ve şifre girin."; return; }
    
    try {
        msg.innerText = "Giriş yapılıyor...";
        const res = await socialRequest('login', {username: u, password: p});
        if(res.status === 'success') {
            socialUserId = res.user_id;
            socialUsername = res.username;
            localStorage.setItem('anitr_social_id', socialUserId);
            localStorage.setItem('anitr_social_user', socialUsername);
            showFriendsModal();
        } else {
            msg.innerText = res.message;
        }
    } catch (e) { msg.innerText = e.message; }
}

window.socialRegister = async function() {
    const u = document.getElementById('socialUsername').value.trim();
    const p = document.getElementById('socialPassword').value.trim();
    const msg = document.getElementById('socialAuthMsg');
    
    if(!u || !p) { msg.innerText = "Kullanıcı adı ve şifre girin."; return; }
    
    try {
        msg.innerText = "Kayıt olunuyor...";
        const res = await socialRequest('register', {username: u, password: p});
        msg.innerText = res.message;
        if(res.status === 'success') msg.style.color = '#10b981';
    } catch (e) { msg.innerText = e.message; }
}

window.socialLogout = function() {
    socialUserId = null;
    socialUsername = null;
    localStorage.removeItem('anitr_social_id');
    localStorage.removeItem('anitr_social_user');
    showFriendsModal();
}

// 2. PROFILE
async function loadSocialProfile() {
    try {
        const res = await socialRequest('profile');
        if (res.status === 'success') {
            document.getElementById('myProfileName').innerText = "@" + res.profile.username;
            document.getElementById('myProfileAvatar').src = res.profile.avatar;
            document.getElementById('myProfileBio').innerText = res.profile.bio;
            document.getElementById('myProfileCurrent').innerText = "Şu an: " + (res.profile.current_anime || "Yok");
        }
    } catch(e) { console.error(e); }
}

// 3. FRIENDS & REQUESTS
async function loadSocialFriends() {
    try {
        const res = await socialRequest('get_friends');
        if (res.status === 'success') {
            // Update Badges
            const reqBadge = document.getElementById('reqBadge');
            if (res.requests.length > 0) {
                reqBadge.innerText = res.requests.length;
                reqBadge.classList.remove('hidden');
            } else {
                reqBadge.classList.add('hidden');
            }

            // Render Friends
            const fList = document.getElementById('socialFriendsList');
            if (res.friends.length === 0) {
                fList.innerHTML = '<p style="color:var(--text3); padding:1rem; text-align:center;">Henüz arkadaşın yok.</p>';
            } else {
                fList.innerHTML = res.friends.map(f => `
                    <div class="social-user-card">
                        <img src="${f.avatar}" class="social-user-avatar">
                        <div style="flex:1;">
                            <strong style="display:block;">${f.username}</strong>
                            <small style="color:var(--text3);">${f.current_anime ? 'İzliyor: '+f.current_anime : 'Çevrimiçi'}</small>
                        </div>
                        <button class="btn-primary" style="padding: 0.5rem 1rem;" onclick="openSocialChat(${f.id}, '${f.username}', '${f.avatar}')"><i class="fa-solid fa-message"></i></button>
                    </div>
                `).join('');
            }

            // Render Requests
            const rList = document.getElementById('socialRequestsList');
            if (res.requests.length === 0) {
                rList.innerHTML = '<p style="color:var(--text3); padding:1rem; text-align:center;">Gelen istek yok.</p>';
            } else {
                rList.innerHTML = res.requests.map(r => `
                    <div class="social-user-card">
                        <img src="${r.avatar}" class="social-user-avatar">
                        <div style="flex:1;">
                            <strong style="display:block;">${r.username}</strong>
                            <small style="color:var(--text3);">Seni eklemek istiyor</small>
                        </div>
                        <button class="btn-primary" style="padding: 0.4rem; background:#10b981;" onclick="handleSocialReq(${r.request_id}, 'accept')"><i class="fa-solid fa-check"></i></button>
                        <button class="btn-secondary" style="padding: 0.4rem; color:#ef4444;" onclick="handleSocialReq(${r.request_id}, 'reject')"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                `).join('');
            }
        }
    } catch(e) { console.error(e); }
}

window.handleSocialReq = async function(reqId, action) {
    try {
        await socialRequest('handle_request', {request_id: reqId, status: action});
        loadSocialFriends();
    } catch(e) { alert(e.message); }
}

// 4. SEARCH
window.searchSocialUsers = async function() {
    const q = document.getElementById('socialSearchInput').value.trim();
    if (!q) return;
    try {
        const res = await socialRequest('search&q=' + encodeURIComponent(q));
        const sList = document.getElementById('socialSearchResults');
        if(res.status === 'success') {
            if(res.users.length === 0) {
                sList.innerHTML = '<p style="color:var(--text3);">Kullanıcı bulunamadı.</p>';
                return;
            }
            sList.innerHTML = res.users.map(u => `
                <div class="social-user-card">
                    <img src="${u.avatar}" class="social-user-avatar">
                    <div style="flex:1;"><strong style="display:block;">${u.username}</strong></div>
                    <button class="btn-secondary" onclick="addSocialFriend(${u.id})"><i class="fa-solid fa-user-plus"></i> Ekle</button>
                </div>
            `).join('');
        }
    } catch(e) { console.error(e); }
}

window.addSocialFriend = async function(id) {
    try {
        const res = await socialRequest('add_friend', {target_id: id});
        alert(res.message);
    } catch(e) { alert(e.message); }
}

// 5. CHAT (MESSAGING)
window.openSocialChat = function(friendId, friendName, friendAvatar) {
    currentChatFriendId = friendId;
    document.getElementById('chatUsername').innerText = friendName;
    document.getElementById('chatAvatar').src = friendAvatar;
    document.getElementById('chatModal').classList.remove('hidden');
    loadChatMessages();
    if(chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(loadChatMessages, 3000); // Poll every 3 seconds
}

window.closeChatModal = function() {
    document.getElementById('chatModal').classList.add('hidden');
    currentChatFriendId = null;
    if(chatRefreshInterval) clearInterval(chatRefreshInterval);
}

async function loadChatMessages() {
    if(!currentChatFriendId) return;
    try {
        const res = await socialRequest('get_messages&friend_id=' + currentChatFriendId);
        if (res.status === 'success') {
            const box = document.getElementById('chatMessages');
            const wasAtBottom = box.scrollHeight - box.scrollTop <= box.clientHeight + 10;
            
            if(res.messages.length === 0) {
                box.innerHTML = '<p style="color:var(--text3); text-align:center; margin-top:2rem;">İlk mesajı gönderin!</p>';
                return;
            }
            
            box.innerHTML = res.messages.map(m => {
                const isMe = m.sender_id == socialUserId;
                return `<div class="chat-bubble ${isMe ? 'sent' : 'received'}">${m.message}</div>`;
            }).join('');
            
            if (wasAtBottom) box.scrollTop = box.scrollHeight;
        }
    } catch(e) { console.error(e); }
}

window.sendChatMessage = async function() {
    const inp = document.getElementById('chatInput');
    const msg = inp.value.trim();
    if(!msg || !currentChatFriendId) return;
    inp.value = '';
    
    // Optimistic UI append
    const box = document.getElementById('chatMessages');
    box.innerHTML += `<div class="chat-bubble sent">${msg}</div>`;
    box.scrollTop = box.scrollHeight;
    
    try {
        await socialRequest('send_message', {receiver_id: currentChatFriendId, message: msg});
        loadChatMessages(); // sync
    } catch(e) { alert("Mesaj gönderilemedi"); }
}

// HEARTBEAT (Update currently watching)
setInterval(() => {
    if(socialUserId) {
        // Find if user is watching something locally (from DOM)
        const vTitle = document.getElementById('videoTitle');
        let current = '';
        if (vTitle && !document.getElementById('videoPlayerView').classList.contains('hidden')) {
            current = vTitle.innerText;
        }
        socialRequest('heartbeat', {current_anime: current}).catch(e=>e);
    }
}, 30000); // Every 30 seconds

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
    document.getElementById('aiModalOverlay').classList.remove('hidden');
    document.getElementById('aiModalResult').style.display = 'none';
    document.getElementById('aiModalResult').innerHTML = '';
}
window.closeAIModal = function() {
    document.getElementById('aiModalOverlay').classList.add('hidden');
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
