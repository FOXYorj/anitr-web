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

const VALID_SOURCES = ['AnimeciX', 'Anizium', 'Anizium Free', 'AniHub'];

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



    const gradCls = (profile && profile.nameGradient && profile.nameGradient !== 'none') ? (' prf2-grad-' + profile.nameGradient) : '';

    const colorStyle = (!gradCls && profile && profile.nameColor) ? `color: ${profile.nameColor};` : 'color: white;';



    const uname = (profile && profile.username) || currentUser || 'Misafir';

    const fallbackLetter = (uname[0] || 'P').toUpperCase();

    const fb = 'https://placehold.co/100x100/1a1a28/8b5cf6?text=' + encodeURIComponent(fallbackLetter);

    const borderCol = (profile && profile.nameColor && profile.nameColor !== '#ffffff') ? profile.nameColor : '#8b5cf6';

    profileBtn.innerHTML = `<img class="anav-avatar" src="${(profile && profile.avatar) || fb}" onerror="this.onerror=null;this.src='${fb}'" alt="Profil" style="border-color:${borderCol};"><span class="anav-uname${gradCls}" style="${colorStyle}">${String(uname).replace(/</g, '&lt;')}</span>`;

    profileBtn.title = 'Profil: ' + uname;

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

    defaultSource: 'AnimeciX',

    cwThumbnail: 'cover'

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



function getPosition(key, legacyPositionsCache) {

    if (!key) return 0;

    const directVal = localStorage.getItem('anitr_ts_' + key);

    if (directVal !== null) {

        const direct = parseFloat(directVal);

        if (!isNaN(direct) && direct > 0) return direct;

    }

    const pos = legacyPositionsCache || ls.getRaw(currentSourcePositionsKey, {});

    return (pos && pos[key]) ? pos[key] : 0;

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


    appSettings.cwThumbnail       = document.getElementById('settingCwThumbnail') ? document.getElementById('settingCwThumbnail').value : 'cover';

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


    if (document.getElementById('settingCwThumbnail')) { document.getElementById('settingCwThumbnail').value = appSettings.cwThumbnail || 'cover'; }

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



// ═══════════════════════════════════════════════════════════════════════════

// v9.9.3 — ANITR PROFILE STUDIO & SHOWCASE ENGINE

// ═══════════════════════════════════════════════════════════════════════════



const _PRF2_ACCENTS = [

    { id: 'violet',  label: 'Gece Moru',     color: '#8b5cf6' },

    { id: 'cyan',    label: 'Siber Mavi',    color: '#06b6d4' },

    { id: 'crimson', label: 'Kızıl Tutulma', color: '#f43f5e' },

    { id: 'emerald', label: 'Zümrüt Ruhu',   color: '#10b981' },

    { id: 'amber',   label: 'Altın Hükümdar',color: '#f59e0b' },

    { id: 'sakura',  label: 'Sakura Çiçeği', color: '#ec4899' }

];



const _PRF2_NAME_COLORS = [

    '#ffffff', '#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#f87171',

    '#f472b6', '#fb7185', '#2dd4bf', '#93c5fd', '#e879f9', '#fde047'

];



const _PRF2_NAME_GRADS = [

    { id: 'none',   label: 'Düz Renk' },

    { id: 'aurora', label: '🌌 Aurora' },

    { id: 'fire',   label: '🔥 Ateş' },

    { id: 'ice',    label: '❄️ Buzul' },

    { id: 'gold',   label: '👑 Altın' }

];



const _PRF2_FRAMES = [

    { id: 'none',    label: 'Sade',            grad: 'linear-gradient(135deg,#3f3f46,#71717a)' },

    { id: 'aurora',  label: 'Aurora Işığı',    grad: 'conic-gradient(#8b5cf6,#06b6d4,#10b981,#ec4899,#8b5cf6)' },

    { id: 'crimson', label: 'Kızıl Alev',      grad: 'conic-gradient(#ef4444,#f97316,#fbbf24,#ef4444)' },

    { id: 'cyber',   label: 'Siber Neon',      grad: 'conic-gradient(#06b6d4,#3b82f6,#a855f7,#06b6d4)' },

    { id: 'gold',    label: 'Hükümdar Altını', grad: 'conic-gradient(#f59e0b,#fef08a,#d97706,#f59e0b)' },

    { id: 'emerald', label: 'Zümrüt Aura',     grad: 'conic-gradient(#10b981,#6ee7b7,#059669,#10b981)' },

    { id: 'sakura',  label: 'Sakura Esintisi', grad: 'conic-gradient(#ec4899,#f9a8d4,#c084fc,#ec4899)' },

    { id: 'void',    label: 'Karanlık Hiçlik', grad: 'conic-gradient(#4c1d95,#a855f7,#090b12,#4c1d95)' }

];



const _PRF2_BANNERS = [

    { id: 'nebula',  label: 'Bulutsu',  bg: 'linear-gradient(135deg,#311068,#0e7490)' },

    { id: 'cyber',   label: 'Siber',    bg: 'linear-gradient(135deg,#0891b2,#be185d)' },

    { id: 'crimson', label: 'Kızıl',    bg: 'linear-gradient(135deg,#9f1239,#451a03)' },

    { id: 'aurora',  label: 'Kuzey',    bg: 'linear-gradient(135deg,#059669,#4338ca)' },

    { id: 'golden',  label: 'Altın',    bg: 'linear-gradient(135deg,#b45309,#5b21b6)' },

    { id: 'sakura',  label: 'Sakura',   bg: 'linear-gradient(135deg,#be185d,#6b21a8)' },

    { id: 'ocean',   label: 'Okyanus',  bg: 'linear-gradient(135deg,#1d4ed8,#0f766e)' },

    { id: 'minimal', label: 'Minimal',  bg: 'linear-gradient(135deg,#27272a,#090b12)' }

];



const _PRF2_MOODS = [
    { e: '01', t: 'Anime maratonunda' },
    { e: '02', t: 'Yeni bölüm bekliyor' },
    { e: '03', t: 'Sezon serilerini takip ediyor' },
    { e: '04', t: 'Gece kuşağı izleyicisi' },
    { e: '05', t: 'Slice of Life molasında' },
    { e: '06', t: 'Final bölüm etkisinde' },
    { e: '07', t: 'Anime OST dinliyor' },
    { e: '08', t: 'Şimdilik dışarıda (AFK)' }
];



const _PRF2_TITLES = [

    'Gece İzleyicisi', 'Gölge Hükümdarı', 'Lanetler Kralı', 'Korsanlar Kralı',

    'Bölüm Avcısı', 'Hashira', 'Seinen Filozofu', 'Elit Otaku'

];



const _PRF2_GENRES = [

    'Aksiyon', 'Fantastik', 'Bilim Kurgu', 'Romantik', 'Komedi', 'Dram',

    'Psikolojik', 'Gizem', 'Spor', 'Slice of Life', 'Korku', 'Mecha', 'Seinen', 'Isekai'

];



var _prf2Bound = false;

var _prf2ActiveShowcaseSlot = 0;

var _prf2ShowcaseTimer = null;

var _prf2CharTimer = null;

var _prf2ViewingTargetUser = null; // null = own profile



function _prfEsc(s) {

    return String(s == null ? '' : s)

        .replace(/&/g, '&amp;').replace(/</g, '&lt;')

        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

}



function _prfEnsureDefaults(p) {

    if (!p.accentTheme) p.accentTheme = 'violet';

    if (!p.avatarFrame) p.avatarFrame = 'aurora';

    if (!p.bannerPreset) p.bannerPreset = 'nebula';

    if (!p.nameGradient) p.nameGradient = 'none';

    if (!p.customTitle) p.customTitle = 'Gece İzleyicisi';

    if (!p.statusEmoji) p.statusEmoji = '🍿';

    if (typeof p.statusText !== 'string') p.statusText = 'Anime maratonunda';

    if (!Array.isArray(p.favGenres)) p.favGenres = p.favGenre ? [p.favGenre] : ['Aksiyon', 'Fantastik'];

    if (!p.watchPref) p.watchPref = 'sub';

    if (!p.watchTimePref) p.watchTimePref = 'night';

    if (!Array.isArray(p.showcaseAnimes)) p.showcaseAnimes = [null, null, null, null];

    while (p.showcaseAnimes.length < 4) p.showcaseAnimes.push(null);

    if (!p.weeklyGoal) p.weeklyGoal = 10;

    if (typeof p.showShowcase !== 'boolean') p.showShowcase = true;

    return p;

}



/* Günlük giriş serisi (streak) takibi */

function _prfTouchDailyStreak() {

    try {

        var raw = JSON.parse(localStorage.getItem('anitr_daily_streak_v1') || '{}');

        var today = new Date().toISOString().slice(0, 10);

        if (raw.lastDate !== today) {

            var yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

            raw.count = (raw.lastDate === yest) ? ((raw.count || 1) + 1) : 1;

            raw.best = Math.max(raw.best || 1, raw.count);

            raw.lastDate = today;

            localStorage.setItem('anitr_daily_streak_v1', JSON.stringify(raw));

        }

        return { count: raw.count || 1, best: raw.best || 1 };

    } catch (_) {

        return { count: 1, best: 1 };

    }

}



/* Gerçek izleme ve koleksiyon istatistiklerini hesapla */

function _prfComputeLocalStats(p) {

    var watchedSet = new Set();

    try {

        var curW = getWatched() || [];

        if (Array.isArray(curW)) curW.forEach(function(x){ watchedSet.add(String(x)); });

    } catch (_) {}

    var trackedSeconds = 0;

    try {

        var stV2 = JSON.parse(localStorage.getItem('anitr_stats_v2') || '{}') || {};

        if (typeof stV2.total === 'number' && stV2.total > 0) trackedSeconds = stV2.total;

        if (stV2.eps && typeof stV2.eps === 'object') {

            Object.keys(stV2.eps).forEach(function(ek) {

                if (stV2.eps[ek] >= 120) watchedSet.add(ek);

            });

        }

    } catch (_) {}

    try {

        for (var i = 0; i < localStorage.length; i++) {

            var k = localStorage.key(i) || '';

            if (k.indexOf('anitr_watched_') !== -1) {

                var arr = JSON.parse(localStorage.getItem(k) || '[]');

                if (Array.isArray(arr)) arr.forEach(function(x){ watchedSet.add(String(x)); });

            } else if (k.indexOf('anitr_ts_') === 0) {

                var sec = parseFloat(localStorage.getItem(k) || '0');

                if (sec > 120) watchedSet.add(k.replace('anitr_ts_', ''));

            }

        }

    } catch (_) {}



    var hist = [];

    try { hist = getHistory() || []; } catch (_) {}

    var favs = [];

    try { favs = getFavorites() || []; } catch (_) {}

    var wlist = [];

    try { wlist = getWatchlist() || []; } catch (_) {}

    var notesObj = {};

    try { notesObj = getNotes() || {}; } catch (_) {}

    var followed = (typeof _notifFollowedList !== 'undefined' && Array.isArray(_notifFollowedList)) ? _notifFollowedList : [];



    var epCount = Math.max(watchedSet.size, hist.length);

    var totalMinutes = trackedSeconds >= 60 ? (trackedSeconds / 60) : (epCount * 24);

    var totalHours = +(totalMinutes / 60).toFixed(1);

    var streak = _prfTouchDailyStreak();

    var notesCount = Object.keys(notesObj).filter(function(k){ return notesObj[k] && (notesObj[k].note || notesObj[k].rating); }).length;

    var showcaseCount = (p.showcaseAnimes || []).filter(Boolean).length;



    // Son 7 gün izlenen

    var weekAgo = Date.now() - 7 * 86400000;

    var weekCount = hist.filter(function(h) {

        var t = new Date(h.lastWatchedAt || h.lastWatched || 0).getTime();

        return t >= weekAgo;

    }).length;

    if (weekCount === 0 && epCount > 0) weekCount = Math.min(epCount, 2);



    var xp = (epCount * 50) + (favs.length * 30) + (wlist.length * 15) + (followed.length * 20) + (notesCount * 40) + (streak.count * 25) + (showcaseCount * 35);

    var level = Math.max(1, Math.floor(Math.sqrt(xp / 60)) + 1);

    var curFloor = Math.pow(level - 1, 2) * 60;

    var nextCeil = Math.pow(level, 2) * 60;

    var xpPct = Math.min(100, Math.max(6, Math.round(((xp - curFloor) / Math.max(1, nextCeil - curFloor)) * 100)));



    var tiers = ['Çırak Otaku', 'Gece İzleyicisi', 'Bölüm Avcısı', 'Kıdemli Senpai', 'Anime Gurmesi', 'Hashira', 'Gölge Hükümdarı', 'Efsanevi Otaku'];

    var tierName = tiers[Math.min(tiers.length - 1, Math.floor((level - 1) / 3))];



    return {

        epCount: epCount,

        totalHours: totalHours,

        favCount: favs.length,

        watchlistCount: wlist.length,

        followedCount: followed.length,

        notesCount: notesCount,

        showcaseCount: showcaseCount,

        streak: streak.count,

        bestStreak: streak.best,

        weekCount: weekCount,

        xp: xp,

        level: level,

        nextXp: nextCeil,

        xpPct: xpPct,

        tierName: tierName,

        recentHist: hist.slice(0, 4)

    };

}



function _prfBuildAchievements(stats, p) {

    var customized = !!(p.bio && p.bio.trim().length > 5 && p.avatar);

    return [

        { icon: '🌱', title: 'İlk Adım',        desc: 'İlk anime bölümünü izle',              cur: stats.epCount,       max: 1 },

        { icon: '🍿', title: 'Isınma Turu',     desc: 'Toplam 10 bölüm izle',                 cur: stats.epCount,       max: 10 },

        { icon: '⚔️', title: 'Bölüm Avcısı',    desc: 'Toplam 50 bölüm tamamla',              cur: stats.epCount,       max: 50 },

        { icon: '👑', title: 'Yüzler Kulübü',   desc: 'Toplam 100 bölüm barajını aş',         cur: stats.epCount,       max: 100 },

        { icon: '🌌', title: 'Maraton Efsanesi',desc: '250 bölüm izleme rekoruna ulaş',       cur: stats.epCount,       max: 250 },

        { icon: '💖', title: 'Koleksiyoncu',    desc: 'Favorilerine 5 anime ekle',            cur: stats.favCount,      max: 5 },

        { icon: '📚', title: 'Arşiv Ustası',    desc: 'İzleme listene 10 anime ekle',         cur: stats.watchlistCount,max: 10 },

        { icon: '🔔', title: 'Güncel Takipçi',  desc: '3 animeyi bildirim takibine al',       cur: stats.followedCount, max: 3 },

        { icon: '📝', title: 'Anime Eleştirmeni',desc: 'En az 1 animeye kişisel not bırak',   cur: stats.notesCount,    max: 1 },

        { icon: '🎨', title: 'Stil Sahibi',     desc: 'Avatarını ve biyografini özelleştir',  cur: customized ? 1 : 0,  max: 1 },

        { icon: '💎', title: 'Vitrin Küratörü', desc: '4\'lü vitrinini tamamen doldur',       cur: stats.showcaseCount, max: 4 },

        { icon: '🔥', title: 'Sadık İzleyici',  desc: '3 günlük kesintisiz giriş serisi yap', cur: stats.bestStreak,    max: 3 }

    ];

}



/* Görselleri yüklerken sıkıştır (Supabase base64 limitini korur, hızlandırır) */

function _prfCompressImageFile(file, maxW, maxH, quality, cb) {

    var reader = new FileReader();

    reader.onload = function(ev) {

        var img = new Image();

        img.onload = function() {

            var w = img.width, h = img.height;

            var ratio = Math.min(maxW / w, maxH / h, 1);

            var cw = Math.max(1, Math.round(w * ratio));

            var ch = Math.max(1, Math.round(h * ratio));

            var canvas = document.createElement('canvas');

            canvas.width = cw;

            canvas.height = ch;

            var ctx = canvas.getContext('2d');

            ctx.drawImage(img, 0, 0, cw, ch);

            cb(canvas.toDataURL('image/jpeg', quality || 0.84));

        };

        img.onerror = function() { cb(ev.target.result); };

        img.src = ev.target.result;

    };

    reader.readAsDataURL(file);

}



function _prfBindInputsOnce() {

    if (_prf2Bound) return;

    _prf2Bound = true;

    var aInp = document.getElementById('profileAvatarInput');

    var bInp = document.getElementById('profileBannerInput');

    var jInp = document.getElementById('prf2ImportJsonInput');

    if (aInp) aInp.addEventListener('change', handleAvatarUpload);

    if (bInp) bInp.addEventListener('change', handleBannerUpload);

    if (jInp) jInp.addEventListener('change', _prfHandleImportJson);

}



function _movePrfTabInk() {
    var bar = document.getElementById('prf2TabsBar');
    var ink = document.getElementById('prfTabsInk');
    if (!bar || !ink) return;
    var activeBtn = bar.querySelector('.prf2-tab.active');
    if (!activeBtn || activeBtn.offsetParent === null) {
        ink.style.width = '0px';
        return;
    }
    ink.style.width = activeBtn.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + activeBtn.offsetLeft + 'px)';
}

function _openProfilePageView() {
    if (typeof closeDrawer === 'function') { try { closeDrawer(); } catch (_) {} }
    if (typeof closeNavDrawer === 'function') { try { closeNavDrawer(); } catch (_) {} }
    if (typeof _closeSocialPages === 'function') _closeSocialPages();
    ['homeView', 'animeListView', 'watchView', 'malView', 'scheduleView', 'newsView', 'aboutView', 'historyView', 'statsView', 'downloadsView', 'aiView'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    var modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
    if (typeof leaveW2GRoom === 'function') leaveW2GRoom();
    if (typeof vjsPlayer !== 'undefined' && vjsPlayer) {
        try { vjsPlayer.dispose(); } catch (_) {}
        vjsPlayer = null;
    }
    var pv = document.getElementById('profileView');
    if (pv) pv.classList.remove('hidden');
    if (window.setAnavActive) window.setAnavActive('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(_movePrfTabInk);
    setTimeout(_movePrfTabInk, 80);
}

function showProfileModal() {
    _prf2ViewingTargetUser = null;
    var shell = document.getElementById('prf2Shell');
    if (shell) {
        shell.classList.remove('is-visitor-mode', 'is-self-preview');
    }
    var pv = document.getElementById('profileView');
    if (pv) pv.classList.remove('is-visitor-view');
    var eb = document.getElementById('prfPageEyebrow');
    var mt = document.getElementById('prfPageMainTitle');
    var st = document.getElementById('prfPageSubTitle');
    if (eb) eb.textContent = 'KULLANICI PROFİLİ / OTAKU KİMLİĞİ';
    if (mt) mt.textContent = 'Profil & Koleksiyon Vitrini';
    if (st) st.textContent = 'Kişisel izleme kimliğin, vitrin serilerin, başarımların ve hesap tercihlerin.';
    var visAct = document.getElementById('prf2VisitorActions');
    if (visAct) { visAct.innerHTML = ''; visAct.classList.add('hidden'); }
    loadProfileUI();
    _openProfilePageView();
    switchPrf2Tab('overview');
    if (typeof currentUser !== 'undefined' && currentUser) {
        _prfFetchKudosCount(currentUser);
    }
}

function closeProfileModal() {
    var modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
    var shell = document.getElementById('prf2Shell');
    if (shell) shell.classList.remove('is-visitor-mode', 'is-self-preview');
    var pv = document.getElementById('profileView');
    if (pv) pv.classList.remove('is-visitor-view');
    _prf2ViewingTargetUser = null;
    if (pv && !pv.classList.contains('hidden')) {
        showHomeView();
    }
}

window.switchPrf2Tab = function(tabId, btnEl) {
    document.querySelectorAll('#prf2TabsBar .prf2-tab').forEach(function(b) {
        b.classList.toggle('active', btnEl ? (b === btnEl) : (b.getAttribute('data-ptab') === tabId));
    });
    document.querySelectorAll('#prf2Content .prf2-pane').forEach(function(p) {
        p.classList.toggle('active', p.getAttribute('data-ppane') === tabId);
    });
    requestAnimationFrame(_movePrfTabInk);
};



window.prfToggleVisitorPreview = function() {

    var shell = document.getElementById('prf2Shell');

    if (!shell) return;

    var on = !shell.classList.contains('is-visitor-mode');

    shell.classList.toggle('is-visitor-mode', on);

    shell.classList.toggle('is-self-preview', on);

    var btn = document.getElementById('prf2PreviewModeBtn');

    if (btn) {

        btn.innerHTML = on

            ? '<i class="fa-solid fa-pen-to-square"></i><span>Düzenlemeye Dön</span>'

            : '<i class="fa-regular fa-eye"></i><span>Önizle</span>';

    }

    if (on) {

        var curVal = (document.getElementById('profileUsername') || {}).value || profile.username || currentUser || 'Misafir';

        var vName = document.getElementById('prf2VisitorName');

        if (vName) vName.textContent = curVal;

        switchPrf2Tab('overview');

    }

    _prfRenderShowcaseGrid(profile, on);

};



function _prfApplyVisualIdentity(p, displayName, cloudHandle) {

    var shell = document.getElementById('prf2Shell');

    if (shell) shell.setAttribute('data-accent', p.accentTheme || 'violet');



    var banBg = document.getElementById('prf2BannerBg');

    if (banBg) banBg.setAttribute('data-preset', p.bannerPreset || 'nebula');



    var banImg = document.getElementById('profileBanner');

    if (banImg) {

        if (p.banner) {

            banImg.src = p.banner;

            banImg.style.display = 'block';

        } else {

            banImg.removeAttribute('src');

            banImg.style.display = 'none';

        }

    }



    var ring = document.getElementById('profileAvatarWrapper');

    if (ring) ring.setAttribute('data-frame', p.avatarFrame || 'aurora');



    var ava = document.getElementById('profileAvatar');

    var fallbackSeed = encodeURIComponent(displayName || cloudHandle || 'anitr');

    if (ava) ava.src = p.avatar || ('https://api.dicebear.com/8.x/adventurer/svg?seed=' + fallbackSeed);



    var uInp = document.getElementById('profileUsername');

    var vName = document.getElementById('prf2VisitorName');

    var allGrads = ['prf2-grad-aurora', 'prf2-grad-fire', 'prf2-grad-ice', 'prf2-grad-gold'];

    var gradSolidMap = { aurora: '#c4b5fd', fire: '#fb923c', ice: '#7dd3fc', gold: '#fde047' };

    if (uInp) {

        allGrads.forEach(function(c) { uInp.classList.remove(c); });

        if (p.nameGradient && p.nameGradient !== 'none') {

            var gc = gradSolidMap[p.nameGradient] || '#c4b5fd';

            uInp.style.color = gc;

            uInp.style.textShadow = '0 0 14px ' + gc + '55';

        } else {

            uInp.style.color = p.nameColor || '#ffffff';

            uInp.style.textShadow = 'none';

        }

        uInp.value = displayName || '';

    }

    if (vName) {

        allGrads.forEach(function(c) { vName.classList.remove(c); });

        if (p.nameGradient && p.nameGradient !== 'none') {

            vName.classList.add('prf2-grad-' + p.nameGradient);

            vName.style.color = '';

        } else {

            vName.style.color = p.nameColor || '#ffffff';

        }

        vName.textContent = displayName || 'Misafir';

    }



    var rankLbl = document.getElementById('prf2RankLabel');

    if (rankLbl) rankLbl.textContent = p.customTitle || 'Gece İzleyicisi';



    var cTag = document.getElementById('prf2CloudTag');

    if (cTag) cTag.textContent = cloudHandle ? ('@' + cloudHandle) : '@yerel-profil';



    var mEmoji = document.getElementById('prf2MoodEmoji');

    var mText  = document.getElementById('prf2MoodText');

    if (mEmoji) mEmoji.textContent = p.statusEmoji || '🍿';

    if (mText)  mText.textContent  = p.statusText  || 'Çevrimiçi';



    var bioPrev = document.getElementById('prf2BioPreview');

    if (bioPrev) bioPrev.textContent = (p.bio && p.bio.trim()) ? p.bio.trim() : 'Henüz bir biyografi yazılmadı.';



    _prfRenderHeaderChips(p);

}



function _prfRenderHeaderChips(p) {

    var box = document.getElementById('prf2HeaderChips');

    if (!box) return;

    var chips = [];

    var prefMap = { sub: 'Altyazı Tercihli', dub: 'Dublaj Tercihli', both: 'Altyazı & Dublaj' };
    var timeMap = { night: 'Gece Kuşağı', day: 'Gündüz Kuşağı', weekend: 'Hafta Sonu Maratonu' };

    if (p.watchPref && prefMap[p.watchPref]) chips.push('<span class="prf2-qchip">' + prefMap[p.watchPref] + '</span>');

    if (p.watchTimePref && timeMap[p.watchTimePref]) chips.push('<span class="prf2-qchip">' + timeMap[p.watchTimePref] + '</span>');



    (p.favGenres || []).slice(0, 4).forEach(function(g) {

        chips.push('<span class="prf2-qchip"><i class="fa-solid fa-hashtag" style="color:var(--prf-accent-2)"></i>' + _prfEsc(g) + '</span>');

    });



    if (p.discord) {

        var dc = _prfEsc(p.discord);

        chips.push('<button type="button" class="prf2-qchip" onclick="navigator.clipboard?.writeText(\'' + dc.replace(/'/g, '') + '\');showToast(\'📋 Discord kopyalandı: ' + dc.replace(/'/g, '') + '\')"><i class="fa-brands fa-discord" style="color:#5865F2"></i>' + dc + '</button>');

    }

    if (p.malUser) {

        var mu = encodeURIComponent(p.malUser.trim());

        chips.push('<a class="prf2-qchip" href="https://myanimelist.net/profile/' + mu + '" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" style="color:#60a5fa"></i>MAL</a>');

    }

    if (p.anilistUser) {

        var au = encodeURIComponent(p.anilistUser.trim());

        chips.push('<a class="prf2-qchip" href="https://anilist.co/user/' + au + '" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" style="color:#38bdf8"></i>AniList</a>');

    }

    if (p.socialLink) {

        var sl = p.socialLink.trim();

        var href = /^https?:\/\//i.test(sl) ? sl : ('https://' + sl);

        chips.push('<a class="prf2-qchip" href="' + _prfEsc(href) + '" target="_blank" rel="noopener"><i class="fa-solid fa-link" style="color:#34d399"></i>Sosyal</a>');

    }

    box.innerHTML = chips.join('');

}



function _prfRenderStatsAndAchievements(stats, p) {

    var elEp = document.getElementById('prf2StatEpisodes');

    var elHr = document.getElementById('prf2StatHours');

    var elDy = document.getElementById('prf2StatDaysSub');

    var elSt = document.getElementById('prf2StatStreak');

    var elBs = document.getElementById('prf2StatBestStreak');

    var elFv = document.getElementById('prf2StatFavs');

    var elLs = document.getElementById('prf2StatListSub');



    if (elEp) elEp.textContent = stats.epCount;

    if (elHr) elHr.textContent = stats.totalHours + ' sa';

    if (elDy) elDy.textContent = stats.totalHours >= 24 ? ((stats.totalHours / 24).toFixed(1) + ' gün maraton') : 'Toplam Süre';

    if (elSt) elSt.textContent = stats.streak + ' Gün';

    if (elBs) elBs.textContent = 'En iyi: ' + stats.bestStreak + ' gün';

    if (elFv) elFv.textContent = stats.favCount + ' / ' + stats.watchlistCount;

    if (elLs) elLs.textContent = 'Favori & İzleme Listesi';



    var lvlEl  = document.getElementById('prf2LevelNum');

    var tierEl = document.getElementById('prf2TierName');

    var xpTxt  = document.getElementById('prf2XpText');

    var xpFill = document.getElementById('prf2XpFill');

    if (lvlEl)  lvlEl.textContent  = stats.level;
    if (tierEl) tierEl.textContent = stats.tierName;
    if (xpTxt)  xpTxt.textContent  = stats.xp + ' / ' + stats.nextXp + ' XP';
    if (xpFill) xpFill.style.width = stats.xpPct + '%';
    var topLvl = document.getElementById('prfTopLevelDisp');
    var topTier = document.getElementById('prfTopTierDisp');
    if (topLvl) topLvl.textContent = 'Seviye ' + stats.level;
    if (topTier) topTier.textContent = stats.tierName;



    // Weekly Goal

    var goal = Math.max(1, parseInt(p.weeklyGoal, 10) || 10);

    var pct = Math.min(100, Math.round((stats.weekCount / goal) * 100));

    var ring = document.getElementById('prf2GoalRing');

    var gDone = document.getElementById('prf2GoalDone');

    var gTarg = document.getElementById('prf2GoalTargetLbl');

    var gMsg  = document.getElementById('prf2GoalStatusMsg');

    if (ring)  ring.style.setProperty('--pct', pct);

    if (gDone) gDone.textContent = stats.weekCount;

    if (gTarg) gTarg.textContent = '/ ' + goal + ' Bölüm';

    if (gMsg) {

        gMsg.textContent = stats.weekCount >= goal

            ? '🎉 Muhteşem! Bu haftaki izleme hedefini başarıyla tamamladın!'

            : ('Bu hafta ' + stats.weekCount + ' bölüm izledin. Hedefe ' + Math.max(0, goal - stats.weekCount) + ' bölüm kaldı.');

    }

    document.querySelectorAll('#prf2GoalPills button').forEach(function(b) {

        b.classList.toggle('active', parseInt(b.getAttribute('data-goal'), 10) === goal);

    });



    // Distribution Bars

    var distEl = document.getElementById('prf2DistBars');

    if (distEl) {

        var maxV = Math.max(10, stats.epCount, stats.favCount, stats.watchlistCount, stats.followedCount);

        var rows = [

            { l: 'İzlenen Bölümler', v: stats.epCount,        c: '#8b5cf6' },

            { l: 'İzleme Listem',    v: stats.watchlistCount, c: '#06b6d4' },

            { l: 'Favori Animeler',  v: stats.favCount,       c: '#f43f5e' },

            { l: 'Takip Edilenler',  v: stats.followedCount,  c: '#10b981' },

            { l: 'Kişisel Notlar',   v: stats.notesCount,     c: '#f59e0b' }

        ];

        distEl.innerHTML = rows.map(function(r) {

            var w = Math.min(100, Math.max(4, Math.round((r.v / maxV) * 100)));

            return '<div class="prf2-dist-row">' +

                '<div class="prf2-dist-lbl"><span>' + r.l + '</span><strong>' + r.v + '</strong></div>' +

                '<div class="prf2-dist-track"><div class="prf2-dist-fill" style="width:' + (r.v ? w : 0) + '%;background:' + r.c + '"></div></div>' +

            '</div>';

        }).join('');

    }



    // Achievements

    var achs = _prfBuildAchievements(stats, p);

    var unlockedCnt = achs.filter(function(a) { return a.cur >= a.max; }).length;

    var tabPill = document.getElementById('prf2AchTabCount');

    if (tabPill) tabPill.textContent = unlockedCnt + '/' + achs.length;



    var achGrid = document.getElementById('prf2AchievementsGrid');

    if (achGrid) {

        achGrid.innerHTML = achs.map(function(a, idx) {
            var ok = a.cur >= a.max;
            var bp = Math.min(100, Math.round((a.cur / a.max) * 100));
            var numStr = String(idx + 1).padStart(2, '0');
            return '<div class="prf2-ach-card' + (ok ? ' unlocked' : '') + '">' +
                '<div class="prf2-ach-ico">' + numStr + '</div>' +
                '<div class="prf2-ach-body">' +
                    '<div class="prf2-ach-top"><strong>' + _prfEsc(a.title) + '</strong><span class="prf2-ach-stat">' + Math.min(a.cur, a.max) + ' / ' + a.max + (ok ? ' · TAMAMLANDI' : '') + '</span></div>' +
                    '<small>' + _prfEsc(a.desc) + '</small>' +
                    '<div class="prf2-ach-bar"><div style="width:' + bp + '%"></div></div>' +
                '</div>' +
            '</div>';
        }).join('');

    }



    // Recent Timeline

    var recEl = document.getElementById('prf2RecentTimeline');

    if (recEl) {

        if (!stats.recentHist || !stats.recentHist.length) {

            recEl.innerHTML = '<div style="font-size:11.5px;color:#71717a;padding:6px 2px;">Henüz yakın izleme geçmişi bulunmuyor.</div>';

        } else {

            recEl.innerHTML = stats.recentHist.map(function(h) {

                var epLbl = h.isMovie ? 'Film' : ((h.sIdx || 0) + 1) + '. Sezon · ' + ((h.eIdx || 0) + 1) + '. Bölüm';

                var safeT = (h.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

                return '<div class="prf2-rec-row" onclick="closeProfileModal(); searchAnimeByName(\'' + safeT + '\')">' +

                    '<img src="' + _prfEsc(h.img || 'https://placehold.co/70x96/121520/8b5cf6?text=?') + '" alt="" loading="lazy">' +

                    '<div class="prf2-rec-info"><strong>' + _prfEsc(h.title || 'Bilinmiyor') + '</strong><small>' + _prfEsc(epLbl) + '</small></div>' +

                    '<i class="fa-solid fa-chevron-right" style="font-size:11px;color:#71717a"></i>' +

                '</div>';

            }).join('');

        }

    }

}



/* 4-Slot Anime Vitrin (Showcase) */

function _prfRenderShowcaseGrid(p, isVisitor) {

    var grid = document.getElementById('prf2ShowcaseGrid');

    if (!grid) return;

    var slots = (p.showcaseAnimes || [null, null, null, null]).slice(0, 4);

    while (slots.length < 4) slots.push(null);



    grid.innerHTML = slots.map(function(item, idx) {

        if (!item) {

            if (isVisitor) {

                return '<div class="prf2-sc-slot" style="cursor:default;opacity:0.45;"><div class="prf2-sc-empty"><i class="fa-regular fa-rectangle-list"></i><span>Boş Vitrin Slotu</span></div></div>';

            }

            return '<div class="prf2-sc-slot" onclick="prfOpenShowcasePicker(' + idx + ')">' +

                '<div class="prf2-sc-empty"><i class="fa-solid fa-plus"></i><span>#' + (idx + 1) + ' Favori Anime Seç</span></div>' +

            '</div>';

        }

        var safeSearch = (item.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        var clickAction = isVisitor

            ? ('closeProfileModal(); searchAnimeByName(\'' + safeSearch + '\')')

            : ('prfOpenShowcasePicker(' + idx + ')');

        return '<div class="prf2-sc-slot filled" onclick="' + clickAction + '" title="' + _prfEsc(item.title) + '">' +

            '<img src="' + _prfEsc(item.img) + '" alt="' + _prfEsc(item.title) + '" loading="lazy">' +

            '<span class="prf2-sc-rank">#' + (idx + 1) + '</span>' +

            (!isVisitor ? '<button type="button" class="prf2-sc-rm" onclick="event.stopPropagation();prfRemoveShowcaseSlot(' + idx + ')" title="Slottan Kaldır"><i class="fa-solid fa-trash"></i></button>' : '') +

            '<div class="prf2-sc-overlay"><div class="prf2-sc-title">' + _prfEsc(item.title) + '</div></div>' +

        '</div>';

    }).join('');

}



window.prfOpenShowcasePicker = function(slotIdx) {

    _prf2ActiveShowcaseSlot = slotIdx;

    var drawer = document.getElementById('prf2ShowcasePicker');

    var title  = document.getElementById('prf2PickerTitle');

    var inp    = document.getElementById('prf2ShowcaseSearchInp');

    if (title) title.innerHTML = '<i class="fa-solid fa-gem"></i> #' + (slotIdx + 1) + '. Vitrin Slotu İçin Anime Seç';

    if (drawer) drawer.classList.remove('hidden');

    if (inp) { inp.value = ''; inp.focus(); }

    prfSearchShowcaseAnime('');

};



window.prfCloseShowcasePicker = function() {

    var drawer = document.getElementById('prf2ShowcasePicker');

    if (drawer) drawer.classList.add('hidden');

};



window.prfRemoveShowcaseSlot = function(idx) {

    _prfEnsureDefaults(profile);

    profile.showcaseAnimes[idx] = null;

    _prfRenderShowcaseGrid(profile, false);

};



window.prfSelectShowcaseAnime = function(idx, title, img) {

    _prfEnsureDefaults(profile);

    profile.showcaseAnimes[idx] = { title: title, img: img };

    prfCloseShowcasePicker();

    _prfRenderShowcaseGrid(profile, false);

    _prfRenderStatsAndAchievements(_prfComputeLocalStats(profile), profile);

};



window.prfSearchShowcaseAnime = function(q) {

    var resEl = document.getElementById('prf2ShowcaseResults');

    if (!resEl) return;

    var query = (q || '').trim().toLowerCase();



    // Önce yerel favori ve geçmişten hızlı öneriler

    var pool = [];

    var seen = new Set();

    var pushUnique = function(t, im, srcLbl) {

        if (!t || seen.has(t.toLowerCase())) return;

        seen.add(t.toLowerCase());

        pool.push({ title: t, img: im || 'https://placehold.co/120x170/141726/8b5cf6?text=Anime', sub: srcLbl });

    };

    try { (getFavorites() || []).forEach(function(f){ pushUnique(f.title, f.img || f.poster, 'Favorilerim'); }); } catch (_) {}

    try { (getHistory()   || []).forEach(function(h){ pushUnique(h.title, h.img, 'İzleme Geçmişim'); }); } catch (_) {}



    var localMatches = query

        ? pool.filter(function(x){ return x.title.toLowerCase().indexOf(query) !== -1; })

        : pool.slice(0, 12);



    var renderList = function(items) {

        if (!items.length) {

            resEl.innerHTML = '<div style="font-size:11.5px;color:#71717a;padding:8px;">Sonuç bulunamadı, farklı bir isim dene.</div>';

            return;

        }

        window._prf2TmpPickList = items;

        resEl.innerHTML = items.map(function(it, i) {

            return '<div class="prf2-pick-item" onclick="var x=window._prf2TmpPickList[' + i + '];prfSelectShowcaseAnime(' + _prf2ActiveShowcaseSlot + ',x.title,x.img)">' +

                '<img src="' + _prfEsc(it.img) + '" alt="" loading="lazy">' +

                '<div><strong>' + _prfEsc(it.title) + '</strong><small>' + _prfEsc(it.sub || 'Anime') + '</small></div>' +

            '</div>';

        }).join('');

    };



    if (!query || query.length < 2) {

        if (!localMatches.length) {

            resEl.innerHTML = '<div style="font-size:11.5px;color:#9ca3af;padding:8px;">Yukarıdaki kutuya istediğin animenin adını yazarak arayabilirsin.</div>';

        } else {

            renderList(localMatches);

        }

        return;

    }



    renderList(localMatches);

    if (_prf2ShowcaseTimer) clearTimeout(_prf2ShowcaseTimer);

    _prf2ShowcaseTimer = setTimeout(async function() {

        try {

            var gql = 'query($s:String){Page(perPage:8){media(search:$s,type:ANIME,sort:POPULARITY_DESC){title{romaji english} seasonYear coverImage{large}}}}';

            var r = await fetch('https://graphql.anilist.co', {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({ query: gql, variables: { s: q.trim() } })

            });

            if (!r.ok) return;

            var j = await r.json();

            var media = (j && j.data && j.data.Page && j.data.Page.media) || [];

            media.forEach(function(m) {

                var t = (m.title && (m.title.english || m.title.romaji)) || '';

                var im = (m.coverImage && m.coverImage.large) || '';

                pushUnique(t, im, m.seasonYear ? String(m.seasonYear) : 'AniList');

            });

            var combined = pool.filter(function(x){ return x.title.toLowerCase().indexOf(query) !== -1; }).slice(0, 12);

            renderList(combined.length ? combined : media.map(function(m){

                return { title: m.title.romaji || m.title.english, img: m.coverImage.large, sub: String(m.seasonYear || 'Anime') };

            }));

        } catch (_) {}

    }, 320);

};



/* Favori Karakter Seçici (AniList Character Search) */

function _prfRenderFavCharCard(p) {

    var box = document.getElementById('prf2FavCharCard');

    if (!box) return;

    var fc = p.favCharacter;

    var quote = (p.favQuote || '').trim();

    if (!fc || !fc.name) {

        box.innerHTML =

            '<img src="https://api.dicebear.com/8.x/Notionists/svg?seed=hero" alt="Karakter">' +

            '<div class="prf2-char-meta">' +

                '<strong>Henüz Karakter Seçilmedi</strong>' +

                '<span>Sağ üstten favori anime karakterini seçebilirsin</span>' +

                (quote ? '<p class="prf2-char-quote">“' + _prfEsc(quote) + '”</p>' : '') +

            '</div>';

        return;

    }

    box.innerHTML =

        '<img src="' + _prfEsc(fc.img) + '" alt="' + _prfEsc(fc.name) + '">' +

        '<div class="prf2-char-meta">' +

            '<strong>' + _prfEsc(fc.name) + '</strong>' +

            '<span><i class="fa-solid fa-tv"></i> ' + _prfEsc(fc.anime || 'Anime Karakteri') + '</span>' +

            (quote ? '<p class="prf2-char-quote">“' + _prfEsc(quote) + '”</p>' : '') +

        '</div>';

}



window.prfToggleCharPicker = function(force) {

    var el = document.getElementById('prf2CharPicker');

    if (!el) return;

    var show = typeof force === 'boolean' ? force : el.classList.contains('hidden');

    el.classList.toggle('hidden', !show);

    if (show) {

        var inp = document.getElementById('prf2CharSearchInp');

        if (inp) inp.focus();

    }

};



window.prfSearchCharacter = function(q) {

    var resEl = document.getElementById('prf2CharResults');

    if (!resEl) return;

    if (!q || q.trim().length < 2) {

        resEl.innerHTML = '<div style="font-size:11.5px;color:#71717a;padding:6px;">Aramak için en az 2 harf yazın...</div>';

        return;

    }

    resEl.innerHTML = '<div style="font-size:11.5px;color:#a1a1aa;padding:6px;"><i class="fa-solid fa-spinner fa-spin"></i> Karakterler aranıyor...</div>';

    if (_prf2CharTimer) clearTimeout(_prf2CharTimer);

    _prf2CharTimer = setTimeout(async function() {

        try {

            var gql = 'query($s:String){Page(perPage:8){characters(search:$s,sort:FAVOURITES_DESC){name{full} image{large} media(perPage:1,type:ANIME){nodes{title{romaji english}}}}}}';

            var r = await fetch('https://graphql.anilist.co', {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({ query: gql, variables: { s: q.trim() } })

            });

            var j = await r.json();

            var chars = (j && j.data && j.data.Page && j.data.Page.characters) || [];

            if (!chars.length) {

                resEl.innerHTML = '<div style="font-size:11.5px;color:#71717a;padding:6px;">Karakter bulunamadı.</div>';

                return;

            }

            window._prf2TmpChars = chars.map(function(c) {

                var node = c.media && c.media.nodes && c.media.nodes[0];

                return {

                    name: c.name.full,

                    img: c.image.large,

                    anime: (node && node.title && (node.title.english || node.title.romaji)) || 'Anime'

                };

            });

            resEl.innerHTML = window._prf2TmpChars.map(function(c, idx) {

                return '<div class="prf2-pick-item" onclick="prfSelectCharacter(' + idx + ')">' +

                    '<img src="' + _prfEsc(c.img) + '" alt="">' +

                    '<div><strong>' + _prfEsc(c.name) + '</strong><small>' + _prfEsc(c.anime) + '</small></div>' +

                '</div>';

            }).join('');

        } catch (_) {

            resEl.innerHTML = '<div style="font-size:11.5px;color:#f87171;padding:6px;">Bağlantı hatası oluştu.</div>';

        }

    }, 340);

};



window.prfSelectCharacter = function(idx) {

    var c = window._prf2TmpChars && window._prf2TmpChars[idx];

    if (!c) return;

    profile.favCharacter = c;

    prfToggleCharPicker(false);

    _prfRenderFavCharCard(profile);

};



/* Görünüm Stüdyosu Seçicileri */

function _prfRenderStudioControls(p) {

    var accEl = document.getElementById('prf2AccentGrid');

    if (accEl) {

        accEl.innerHTML = _PRF2_ACCENTS.map(function(a) {

            return '<button type="button" class="prf2-accent-btn' + (p.accentTheme === a.id ? ' active' : '') + '" onclick="prfSetAccent(\'' + a.id + '\')">' +

                '<span class="prf2-accent-dot" style="background:' + a.color + ';box-shadow:0 0 8px ' + a.color + '"></span>' +

                '<span>' + a.label + '</span>' +

            '</button>';

        }).join('');

    }



    var swEl = document.getElementById('prf2NameSwatches');

    if (swEl) {

        swEl.innerHTML = _PRF2_NAME_COLORS.map(function(c) {

            var act = (!p.nameGradient || p.nameGradient === 'none') && (p.nameColor || '#ffffff').toLowerCase() === c.toLowerCase();

            return '<button type="button" class="prf2-swatch' + (act ? ' active' : '') + '" style="background:' + c + '" onclick="prfSetNameColor(\'' + c + '\')" title="' + c + '"></button>';

        }).join('');

    }



    var grEl = document.getElementById('prf2NameGradChips');

    if (grEl) {

        grEl.innerHTML = _PRF2_NAME_GRADS.map(function(g) {

            var act = (p.nameGradient || 'none') === g.id;

            return '<button type="button" class="prf2-grad-chip' + (act ? ' active' : '') + '" onclick="prfSetNameGrad(\'' + g.id + '\')">' + g.label + '</button>';

        }).join('');

    }



    var frEl = document.getElementById('prf2FrameGrid');

    if (frEl) {

        frEl.innerHTML = _PRF2_FRAMES.map(function(f) {

            return '<button type="button" class="prf2-frame-opt' + (p.avatarFrame === f.id ? ' active' : '') + '" onclick="prfSetFrame(\'' + f.id + '\')">' +

                '<span class="prf2-frame-ring-mini" style="background:' + f.grad + '"></span>' +

                '<span>' + f.label + '</span>' +

            '</button>';

        }).join('');

    }



    var avSeeds = [

        'https://api.dicebear.com/8.x/adventurer/svg?seed=Gojo',

        'https://api.dicebear.com/8.x/adventurer/svg?seed=Frieren',

        'https://api.dicebear.com/8.x/lorelei/svg?seed=Sakura',

        'https://api.dicebear.com/8.x/bottts-neutral/svg?seed=MechaX',

        'https://api.dicebear.com/8.x/pixel-art/svg?seed=Samurai',

        'https://api.dicebear.com/8.x/fun-emoji/svg?seed=Star'

    ];

    var avGrid = document.getElementById('prf2PresetAvatars');

    if (avGrid) {

        avGrid.innerHTML = avSeeds.map(function(u) {

            return '<button type="button" class="prf2-ava-opt" onclick="prfApplyAvatarUrl(\'' + u + '\')"><img src="' + u + '" alt="Avatar"></button>';

        }).join('');

    }



    var bpGrid = document.getElementById('prf2BannerPresets');

    if (bpGrid) {

        bpGrid.innerHTML = _PRF2_BANNERS.map(function(b) {

            var act = !p.banner && p.bannerPreset === b.id;

            return '<button type="button" class="prf2-ban-opt' + (act ? ' active' : '') + '" style="background:' + b.bg + '" onclick="prfSetBannerPreset(\'' + b.id + '\')">' + b.label + '</button>';

        }).join('');

    }



    // Mood & Titles & Genres

    var mpEl = document.getElementById('prf2MoodPresets');

    if (mpEl) {

        mpEl.innerHTML = _PRF2_MOODS.map(function(m, i) {

            return '<button type="button" class="prf2-chip-btn" onclick="prfPickMoodPreset(' + i + ')">' + m.e + ' ' + m.t + '</button>';

        }).join('');

    }



    var tpEl = document.getElementById('prf2TitlePresets');

    if (tpEl) {

        tpEl.innerHTML = _PRF2_TITLES.map(function(t) {

            return '<button type="button" class="prf2-chip-btn' + (p.customTitle === t ? ' active' : '') + '" onclick="prfSyncTitlePreview(\'' + t + '\', true)">' + t + '</button>';

        }).join('');

    }



    var gcEl = document.getElementById('prf2GenreChips');

    if (gcEl) {

        gcEl.innerHTML = _PRF2_GENRES.map(function(g) {

            var on = (p.favGenres || []).indexOf(g) !== -1;

            return '<button type="button" class="prf2-chip-btn' + (on ? ' active' : '') + '" onclick="prfToggleGenreChip(\'' + g + '\')">' + g + '</button>';

        }).join('');

    }



    document.querySelectorAll('#prf2AudioPrefSeg button').forEach(function(b) {

        b.classList.toggle('active', b.getAttribute('data-val') === (p.watchPref || 'sub'));

    });

    document.querySelectorAll('#prf2TimePrefSeg button').forEach(function(b) {

        b.classList.toggle('active', b.getAttribute('data-val') === (p.watchTimePref || 'night'));

    });



    var accBox = document.getElementById('prf2AccountStatusBox');

    if (accBox) {

        if (typeof currentUser !== 'undefined' && currentUser) {

            accBox.innerHTML =

                '<div><strong style="color:#fff;font-size:13px;"><i class="fa-solid fa-cloud" style="color:#34d399"></i> @' + _prfEsc(currentUser) + '</strong>' +

                '<small style="display:block;color:#a1a1aa;font-size:11px;margin-top:2px;">Bulut senkronizasyonu aktif</small></div>' +

                '<button type="button" class="prf2-mini-btn" onclick="closeProfileModal(); handleLogout()"><i class="fa-solid fa-right-from-bracket"></i> Çıkış</button>';

        } else {

            accBox.innerHTML =

                '<div><strong style="color:#fff;font-size:13px;">Misafir Modu (Yerel Kayıt)</strong>' +

                '<small style="display:block;color:#a1a1aa;font-size:11px;margin-top:2px;">Profilini diğer cihazlarla eşitlemek için giriş yap</small></div>' +

                '<button type="button" class="prf2-mini-btn" onclick="closeProfileModal(); openAuthModal()"><i class="fa-solid fa-user-check"></i> Giriş Yap</button>';

        }

    }

}



window.prfSetAccent = function(id) {

    profile.accentTheme = id;

    _prfApplyVisualIdentity(profile, document.getElementById('profileUsername').value, currentUser);

    _prfRenderStudioControls(profile);

};

window.prfSetNameColor = function(col) {

    profile.nameColor = col;

    profile.nameGradient = 'none';

    document.getElementById('profileNameColor').value = col;

    _prfApplyVisualIdentity(profile, document.getElementById('profileUsername').value, currentUser);

    _prfRenderStudioControls(profile);

};

window.prfSetNameGrad = function(gradId) {

    profile.nameGradient = gradId;

    _prfApplyVisualIdentity(profile, document.getElementById('profileUsername').value, currentUser);

    _prfRenderStudioControls(profile);

};

window.prfSetFrame = function(frameId) {

    profile.avatarFrame = frameId;

    _prfApplyVisualIdentity(profile, document.getElementById('profileUsername').value, currentUser);

    _prfRenderStudioControls(profile);

};

window.prfSetBannerPreset = function(presetId) {

    profile.banner = '';

    profile.bannerPreset = presetId;

    var bUrl = document.getElementById('prf2BannerUrlInp');

    if (bUrl) bUrl.value = '';

    _prfApplyVisualIdentity(profile, document.getElementById('profileUsername').value, currentUser);

    _prfRenderStudioControls(profile);

};

window.prfClearCustomBanner = function() {

    prfSetBannerPreset('nebula');

};

window.prfRandomizeAvatar = function() {

    var styles = ['adventurer', 'lorelei', 'bottts-neutral', 'pixel-art', 'notionists'];

    var st = styles[Math.floor(Math.random() * styles.length)];

    var seed = 'anitr_' + Math.random().toString(36).slice(2, 8);

    prfApplyAvatarUrl('https://api.dicebear.com/8.x/' + st + '/svg?seed=' + seed);

};

window.prfApplyAvatarUrl = function(url) {

    var u = (url || '').trim();

    if (!u) return;

    profile.avatar = u;

    var ava = document.getElementById('profileAvatar');

    if (ava) ava.src = u;

};

window.prfApplyBannerUrl = function(url) {

    var u = (url || '').trim();

    if (!u) return;

    profile.banner = u;

    var ban = document.getElementById('profileBanner');

    if (ban) { ban.src = u; ban.style.display = 'block'; }

};

window.prfFocusMoodInput = function() {

    var shell = document.getElementById('prf2Shell');

    if (shell && shell.classList.contains('is-visitor-mode')) return;

    switchPrf2Tab('identity');

    setTimeout(function() {

        var inp = document.getElementById('prf2StatusTextInp');

        if (inp) inp.focus();

    }, 60);

};

window.prfPickMoodPreset = function(i) {

    var m = _PRF2_MOODS[i];

    if (!m) return;

    document.getElementById('prf2StatusEmojiInp').value = m.e;

    document.getElementById('prf2StatusTextInp').value = m.t;

    prfSyncMoodPreview();

};

window.prfSyncMoodPreview = function() {

    profile.statusEmoji = (document.getElementById('prf2StatusEmojiInp').value || '🍿').trim();

    profile.statusText  = (document.getElementById('prf2StatusTextInp').value || '').trim();

    document.getElementById('prf2MoodEmoji').textContent = profile.statusEmoji || '🍿';

    document.getElementById('prf2MoodText').textContent  = profile.statusText  || 'Çevrimiçi';

};

window.prfSyncTitlePreview = function(val, updateInp) {

    profile.customTitle = (val || '').trim() || 'Gece İzleyicisi';

    if (updateInp) {

        var inp = document.getElementById('prf2CustomTitleInp');

        if (inp) inp.value = profile.customTitle;

    }

    var rl = document.getElementById('prf2RankLabel');

    if (rl) rl.textContent = profile.customTitle;

    _prfRenderStudioControls(profile);

};

window.prfSyncBioPreview = function() {

    var bio = (document.getElementById('profileBio').value || '');

    var cnt = document.getElementById('prf2BioCount');

    if (cnt) cnt.textContent = bio.length + ' / 280';

    var prev = document.getElementById('prf2BioPreview');

    if (prev) prev.textContent = bio.trim() || 'Henüz bir biyografi yazılmadı.';

};

window.prfToggleGenreChip = function(g) {

    _prfEnsureDefaults(profile);

    var idx = profile.favGenres.indexOf(g);

    if (idx !== -1) {

        profile.favGenres.splice(idx, 1);

    } else {

        if (profile.favGenres.length >= 5) {

            showToast('⚠️ En fazla 5 favori tür seçebilirsin');

            return;

        }

        profile.favGenres.push(g);

    }

    profile.favGenre = profile.favGenres[0] || '';

    document.getElementById('profileFavGenre').value = profile.favGenre;

    _prfRenderHeaderChips(profile);

    _prfRenderStudioControls(profile);

};

window.prfSelectWatchPref = function(v) {

    profile.watchPref = v;

    _prfRenderHeaderChips(profile);

    _prfRenderStudioControls(profile);

};

window.prfSelectTimePref = function(v) {

    profile.watchTimePref = v;

    _prfRenderHeaderChips(profile);

    _prfRenderStudioControls(profile);

};

window.prfSetWeeklyGoal = function(n) {

    profile.weeklyGoal = n;

    ls.set('anitr_profile', profile);

    _prfRenderStatsAndAchievements(_prfComputeLocalStats(profile), profile);

};



function loadProfileUI() {

    _prfBindInputsOnce();

    _prfEnsureDefaults(profile);



    var dispName = profile.username || currentUser || 'Anime Sever';

    _prfApplyVisualIdentity(profile, dispName, currentUser);



    document.getElementById('profileNameColor').value = profile.nameColor || '#ffffff';

    document.getElementById('profileFavGenre').value  = profile.favGenre || (profile.favGenres[0] || '');

    document.getElementById('profileBio').value       = profile.bio || '';

    document.getElementById('profileDiscord').value   = profile.discord || '';

    document.getElementById('prf2MalUser').value      = profile.malUser || '';

    document.getElementById('prf2AnilistUser').value  = profile.anilistUser || '';

    document.getElementById('prf2SocialLink').value   = profile.socialLink || '';

    document.getElementById('prf2StatusEmojiInp').value = profile.statusEmoji || '🍿';

    document.getElementById('prf2StatusTextInp').value  = profile.statusText || '';

    document.getElementById('prf2CustomTitleInp').value = profile.customTitle || 'Gece İzleyicisi';

    document.getElementById('prf2FavQuoteInp').value    = profile.favQuote || '';

    document.getElementById('profileShowWatchedAnime').checked    = profile.showWatchedAnime !== false;

    document.getElementById('profileShowCurrentWatching').checked = profile.showCurrentWatching !== false;

    document.getElementById('prf2ShowShowcase').checked           = profile.showShowcase !== false;



    var fqInp = document.getElementById('prf2FavQuoteInp');

    if (fqInp) {

        fqInp.oninput = function() {

            profile.favQuote = fqInp.value;

            _prfRenderFavCharCard(profile);

        };

    }



    prfSyncBioPreview();

    var stats = _prfComputeLocalStats(profile);

    _prfRenderStatsAndAchievements(stats, profile);

    _prfRenderShowcaseGrid(profile, false);

    _prfRenderFavCharCard(profile);

    _prfRenderStudioControls(profile);

    updateProfileCurrentWatching();

}



function handleAvatarUpload(e) {

    var file = e.target.files && e.target.files[0];

    if (!file) return;

    _prfCompressImageFile(file, 320, 320, 0.86, function(dataUrl) {

        profile.avatar = dataUrl;

        var ava = document.getElementById('profileAvatar');

        if (ava) ava.src = dataUrl;

        showToast('✨ Avatar hazırlandı');

    });

}



function handleBannerUpload(e) {

    var file = e.target.files && e.target.files[0];

    if (!file) return;

    _prfCompressImageFile(file, 1280, 440, 0.84, function(dataUrl) {

        profile.banner = dataUrl;

        var ban = document.getElementById('profileBanner');

        if (ban) { ban.src = dataUrl; ban.style.display = 'block'; }

        showToast('🖼️ Banner görseli hazırlandı');

    });

}



async function saveProfile() {

    _prfEnsureDefaults(profile);

    profile.username            = (document.getElementById('profileUsername').value || '').trim() || (currentUser || 'Anime Sever');

    profile.nameColor           = document.getElementById('profileNameColor').value || '#ffffff';

    profile.bio                 = (document.getElementById('profileBio').value || '').trim();

    profile.discord             = (document.getElementById('profileDiscord').value || '').trim();

    profile.malUser             = (document.getElementById('prf2MalUser').value || '').trim();

    profile.anilistUser         = (document.getElementById('prf2AnilistUser').value || '').trim();

    profile.socialLink          = (document.getElementById('prf2SocialLink').value || '').trim();

    profile.statusEmoji         = (document.getElementById('prf2StatusEmojiInp').value || '🍿').trim();

    profile.statusText          = (document.getElementById('prf2StatusTextInp').value || '').trim();

    profile.customTitle         = (document.getElementById('prf2CustomTitleInp').value || 'Gece İzleyicisi').trim();

    profile.favQuote            = (document.getElementById('prf2FavQuoteInp').value || '').trim();

    profile.favGenre            = profile.favGenres[0] || '';

    profile.showWatchedAnime    = document.getElementById('profileShowWatchedAnime').checked;

    profile.showCurrentWatching = document.getElementById('profileShowCurrentWatching').checked;

    profile.showShowcase        = document.getElementById('prf2ShowShowcase').checked;



    ls.set('anitr_profile', profile);

    if (typeof updateNavbarProfile === 'function') updateNavbarProfile();



    if (typeof currentUser !== 'undefined' && currentUser && typeof supabaseClient !== 'undefined' && supabaseClient) {

        try {

            var stats = _prfComputeLocalStats(profile);

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



            // Genişletilmiş profil verilerini de buluta kaydet (diğer kullanıcılar ziyaret ettiğinde görsün)

            var extPayload = {

                displayName: profile.username,

                accentTheme: profile.accentTheme,

                avatarFrame: profile.avatarFrame,

                bannerPreset: profile.bannerPreset,

                nameGradient: profile.nameGradient,

                customTitle: profile.customTitle,

                statusEmoji: profile.statusEmoji,

                statusText: profile.statusText,

                favGenres: profile.favGenres,

                watchPref: profile.watchPref,

                watchTimePref: profile.watchTimePref,

                malUser: profile.malUser,

                anilistUser: profile.anilistUser,

                socialLink: profile.socialLink,

                showcaseAnimes: profile.showShowcase ? profile.showcaseAnimes : [],

                favCharacter: profile.showShowcase ? profile.favCharacter : null,

                favQuote: profile.favQuote,

                showShowcase: profile.showShowcase,

                publicStats: profile.showWatchedAnime ? {

                    epCount: stats.epCount,

                    totalHours: stats.totalHours,

                    streak: stats.streak,

                    bestStreak: stats.bestStreak,

                    favCount: stats.favCount,

                    watchlistCount: stats.watchlistCount,

                    level: stats.level,

                    xp: stats.xp,

                    nextXp: stats.nextXp,

                    xpPct: stats.xpPct,

                    tierName: stats.tierName,

                    weekCount: stats.weekCount,

                    weeklyGoal: profile.weeklyGoal

                } : null,

                updatedAt: Date.now()

            };

            await supabaseClient.from('comments').insert([{

                ep_key: '__anitr_prf_ext_v1__:' + currentUser,

                username: currentUser,

                content: JSON.stringify(extPayload)

            }]);

            showToast('✅ Profilin ve vitrinin buluta kaydedildi!');

        } catch (e) {

            console.error(e);

            showToast('💾 Profil cihaza kaydedildi');

        }

    } else {

        showToast('✅ Profil başarıyla kaydedildi!');

    }



    if (typeof loadSocialProfile === 'function') loadSocialProfile();
    loadProfileUI();
    switchPrf2Tab('overview');
}



function updateProfileCurrentWatching() {

    var container = document.getElementById('profileCurrentWatching');

    var pill = document.getElementById('prf2PresencePill');

    var pTxt = document.getElementById('prf2PresenceText');



    var activeAnime = profile && profile.currentAnime;

    if (!activeAnime && typeof currentAnime !== 'undefined' && currentAnime && currentAnime.title) {

        var wv = document.getElementById('watchView');

        if (wv && !wv.classList.contains('hidden')) {

            activeAnime = {

                title: currentAnime.title,

                img: currentAnime.img,

                episode: (typeof currentEIdx === 'number') ? ((currentEIdx + 1) + '. Bölüm') : ''

            };

        }

    }



    if (pill && pTxt) {

        if (activeAnime && profile.showCurrentWatching !== false) {

            pill.classList.add('is-watching');

            pTxt.textContent = 'İzliyor: ' + activeAnime.title;

        } else {

            pill.classList.remove('is-watching');

            pTxt.textContent = 'Çevrimiçi';

        }

    }



    if (!container) return;

    if (!profile.showCurrentWatching || !activeAnime) {

        container.innerHTML =

            '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);font-size:12px;color:#9ca3af;">' +

                '<i class="fa-solid fa-mug-hot" style="color:var(--prf-accent-2)"></i>' +

                '<span>Şu anda aktif bir bölüm oynatılmıyor.</span>' +

            '</div>';

        return;

    }



    container.innerHTML =

        '<div style="display:flex;gap:11px;align-items:center;padding:10px;background:linear-gradient(135deg,rgba(139,92,246,0.14),rgba(15,18,30,0.9));border:1px solid rgba(139,92,246,0.35);border-radius:12px;">' +

            '<img src="' + _prfEsc(activeAnime.img || activeAnime.poster || 'https://placehold.co/60x84/121520/8b5cf6?text=?') + '" alt="" style="width:46px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;">' +

            '<div style="min-width:0;flex:1;">' +

                '<div style="font-size:10px;font-weight:800;color:#c4b5fd;letter-spacing:0.05em;">▶️ ŞU AN İZLENİYOR</div>' +

                '<div style="font-weight:800;font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _prfEsc(activeAnime.title) + '</div>' +

                '<div style="font-size:11.5px;color:#cbd5e1;">' + _prfEsc(activeAnime.episode || 'Aktif Yayın') + '</div>' +

            '</div>' +

        '</div>';

}



/* ── Alkış / Kudos Bulut Sistemi ── */

async function _prfFetchKudosCount(uname) {

    var cntEl = document.getElementById('prf2KudosCount');

    if (cntEl) cntEl.textContent = '0';

    if (!uname || !supabaseClient) return;

    try {

        var res = await supabaseClient

            .from('comments')

            .select('id', { count: 'exact', head: true })

            .eq('ep_key', '__anitr_prf_kudos_v1__:' + uname);

        if (cntEl && typeof res.count === 'number') cntEl.textContent = String(res.count);

    } catch (_) {}

}



window.prfGiveKudos = async function() {

    var target = _prf2ViewingTargetUser || currentUser;

    if (!target || !supabaseClient) {

        showToast('💡 Alkış özelliği için bulut hesabı gerekir');

        return;

    }

    if (target === currentUser && !_prf2ViewingTargetUser) {

        showToast('👏 Toplam ' + (document.getElementById('prf2KudosCount').textContent || '0') + ' profil alkışı aldın!');

        return;

    }

    var lsKey = 'anitr_kudos_sent_' + target;

    if (localStorage.getItem(lsKey)) {

        showToast('💖 Bu profile zaten alkış gönderdin!');

        return;

    }

    try {

        await supabaseClient.from('comments').insert([{

            ep_key: '__anitr_prf_kudos_v1__:' + target,

            username: currentUser || 'Ziyaretçi',

            content: '👏'

        }]);

        localStorage.setItem(lsKey, '1');

        await _prfFetchKudosCount(target);

        showToast('👏 @' + target + ' profiline alkış gönderildi!');

    } catch (_) {}

};



/* ── Profil Paylaş & PNG Otaku Kimlik Kartı İndir ── */

window.prfShareProfile = function() {

    var stats = _prfComputeLocalStats(profile);

    var name = profile.username || currentUser || 'Anime Sever';

    var summary = '✨ ' + name + ' [' + (profile.customTitle || 'Otaku') + '] — Seviye ' + stats.level +

        ' | 🎬 ' + stats.epCount + ' Bölüm (' + stats.totalHours + ' sa) | 🔥 ' + stats.streak + ' Gün Seri' +

        ((profile.favGenres && profile.favGenres.length) ? (' | Favori: ' + profile.favGenres.join(', ')) : '');

    if (navigator.clipboard && navigator.clipboard.writeText) {

        navigator.clipboard.writeText(summary);

        showToast('📋 Profil özeti panoya kopyalandı!');

    } else {

        showToast(summary);

    }

};



window.prfDownloadIdCard = function() {

    var p = _prfEnsureDefaults(profile);

    var stats = _prfComputeLocalStats(p);

    var canvas = document.createElement('canvas');

    canvas.width = 920;

    canvas.height = 500;

    var ctx = canvas.getContext('2d');



    // Arka plan

    var bg = ctx.createLinearGradient(0, 0, 920, 500);

    bg.addColorStop(0, '#090b14');

    bg.addColorStop(0.55, '#151129');

    bg.addColorStop(1, '#0b1829');

    ctx.fillStyle = bg;

    ctx.fillRect(0, 0, 920, 500);



    // Dekoratif ışıma

    var glow = ctx.createRadialGradient(180, 110, 10, 180, 110, 320);

    glow.addColorStop(0, 'rgba(139, 92, 246, 0.42)');

    glow.addColorStop(1, 'rgba(139, 92, 246, 0)');

    ctx.fillStyle = glow;

    ctx.fillRect(0, 0, 920, 500);



    // Çerçeve

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';

    ctx.lineWidth = 2;

    ctx.strokeRect(20, 20, 880, 460);



    // Üst Rozet

    ctx.fillStyle = '#a78bfa';

    ctx.font = '800 15px Inter, Segoe UI, sans-serif';

    ctx.fillText('ANITR OTAKU ID CARD  •  2026 EDITION', 52, 64);



    // İsim & Unvan

    var disp = p.username || currentUser || 'Anime Sever';

    ctx.fillStyle = '#ffffff';

    ctx.font = '900 42px Inter, Segoe UI, sans-serif';

    ctx.fillText(disp.slice(0, 22), 52, 128);



    ctx.fillStyle = '#38bdf8';

    ctx.font = '700 19px Inter, Segoe UI, sans-serif';

    ctx.fillText('✦ ' + (p.customTitle || 'Gece İzleyicisi') + '   •   Seviye ' + stats.level + ' (' + stats.tierName + ')', 52, 164);



    // Bio

    ctx.fillStyle = '#cbd5e1';

    ctx.font = '500 16px Inter, Segoe UI, sans-serif';

    var bioLine = (p.bio || 'Anime dünyasında yeni maceralar peşinde.').replace(/\s+/g, ' ').slice(0, 82);

    ctx.fillText(bioLine, 52, 206);



    // XP Çubuğu

    ctx.fillStyle = 'rgba(255,255,255,0.1)';

    ctx.fillRect(52, 232, 816, 12);

    var xpG = ctx.createLinearGradient(52, 0, 868, 0);

    xpG.addColorStop(0, '#8b5cf6');

    xpG.addColorStop(1, '#06b6d4');

    ctx.fillStyle = xpG;

    ctx.fillRect(52, 232, Math.round(816 * (stats.xpPct / 100)), 12);



    // 4 İstatistik Kutusu

    var boxes = [

        { l: 'İZLENEN BÖLÜM', v: String(stats.epCount) },

        { l: 'TOPLAM SÜRE',   v: stats.totalHours + ' Saat' },

        { l: 'AKTİF SERİ',    v: stats.streak + ' Gün' },

        { l: 'TOPLAM XP',     v: stats.xp + ' XP' }

    ];

    boxes.forEach(function(b, i) {

        var bx = 52 + i * 208;

        ctx.fillStyle = 'rgba(255,255,255,0.045)';

        ctx.fillRect(bx, 276, 192, 102);

        ctx.strokeStyle = 'rgba(255,255,255,0.1)';

        ctx.strokeRect(bx, 276, 192, 102);

        ctx.fillStyle = '#94a3b8';

        ctx.font = '700 12px Inter, Segoe UI, sans-serif';

        ctx.fillText(b.l, bx + 18, 308);

        ctx.fillStyle = '#ffffff';

        ctx.font = '900 28px Inter, Segoe UI, sans-serif';

        ctx.fillText(b.v, bx + 18, 350);

    });



    // Alt Türler

    ctx.fillStyle = '#a1a1aa';

    ctx.font = '600 14px Inter, Segoe UI, sans-serif';

    var genresTxt = (p.favGenres && p.favGenres.length) ? ('Favori Türler: ' + p.favGenres.join('  •  ')) : 'anitr-web';

    ctx.fillText(genresTxt, 52, 434);



    var a = document.createElement('a');

    a.download = 'anitr-kimlik-' + (currentUser || 'profil') + '.png';

    a.href = canvas.toDataURL('image/png');

    a.click();

    showToast('🪪 PNG Otaku Kimlik Kartın indirildi!');

};



/* ── Tam Veri Yedekleme & Geri Yükleme (.json) ── */

window.prfExportAllData = function() {

    var dump = {};

    for (var i = 0; i < localStorage.length; i++) {

        var k = localStorage.key(i);

        if (k && k.indexOf('anitr_') === 0) dump[k] = localStorage.getItem(k);

    }

    var blob = new Blob([JSON.stringify({ app: 'anitr-web', version: '9.9.3', exportedAt: new Date().toISOString(), data: dump }, null, 2)], { type: 'application/json' });

    var a = document.createElement('a');

    a.href = URL.createObjectURL(blob);

    a.download = 'anitr-yedek-' + new Date().toISOString().slice(0, 10) + '.json';

    a.click();

    showToast('💾 Tüm verilerin başarıyla yedeklendi!');

};



function _prfHandleImportJson(e) {

    var file = e.target.files && e.target.files[0];

    if (!file) return;

    var reader = new FileReader();

    reader.onload = function(ev) {

        try {

            var parsed = JSON.parse(ev.target.result || '{}');

            var map = parsed.data || parsed;

            var count = 0;

            Object.keys(map).forEach(function(k) {

                if (k.indexOf('anitr_') === 0 && typeof map[k] === 'string') {

                    localStorage.setItem(k, map[k]);

                    count++;

                }

            });

            var savedPrf = ls.get('anitr_profile');

            if (savedPrf) profile = Object.assign(profile, savedPrf);

            loadProfileUI();

            if (typeof updateNavbarProfile === 'function') updateNavbarProfile();

            if (typeof renderContinueWatching === 'function') renderContinueWatching();

            showToast('✅ ' + count + ' veri kaydı başarıyla geri yüklendi!');

        } catch (_) {

            showToast('❌ Geçersiz yedek dosyası!');

        }

    };

    reader.readAsText(file);

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

    const _initHash = (window.location.hash || '').toLowerCase();
    if (_initHash === '#about' || _initHash === '#hakkinda') {
        showAboutView();
    } else if (_initHash === '#anime' || _initHash === '#animeler') {
        showAnimeListView();
    } else if (_initHash === '#schedule' || _initHash === '#takvim') {
        showScheduleView();
    } else if (_initHash === '#news' || _initHash === '#haberler') {
        showNewsView();
    } else {
        loadHome();
    }



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

function _closeSocialPages() {
    if (typeof closeFriendsModal === 'function') closeFriendsModal();
    if (typeof closeW2GModal === 'function') closeW2GModal();
    ['statsView', 'historyView', 'downloadsView', 'aiView', 'aboutView', 'profileView'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
}

function showHomeView() {
    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');

    if (window.setAnavActive) setAnavActive('home');

    leaveW2GRoom();

    clearProfileCurrentAnime();

    setAmbientBackground(null);

    homeView.classList.remove('hidden');

    animeListView.classList.add('hidden');

    watchView.classList.add('hidden');

    malView.classList.add('hidden');

    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    const nv2 = document.getElementById('newsView'); if (nv2) nv2.classList.add('hidden');

    if (vjsPlayer) { try { vjsPlayer.dispose(); } catch (e) {} vjsPlayer = null; }

    // Mobil alt barda aktif sekmeyi güncelle

    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));

    document.querySelectorAll('.mobile-nav-btn')[0].classList.add('active');

}

function showAnimeListViewContainer() {
    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');

    leaveW2GRoom();

    clearProfileCurrentAnime();

    animeListView.classList.remove('hidden');

    homeView.classList.add('hidden');

    watchView.classList.add('hidden');

    malView.classList.add('hidden');

    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    const nv2 = document.getElementById('newsView'); if (nv2) nv2.classList.add('hidden');

    if (vjsPlayer) { try { vjsPlayer.dispose(); } catch (e) {} vjsPlayer = null; }

}

function showWatchView() {
    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');

    if (window.setAnavActive) setAnavActive('animes');

    ['detailView', 'historyView', 'socialView', 'myListsView', 'statsView', 'scheduleView'].forEach(id => {

        const el = document.getElementById(id);

        if (el) el.classList.add('hidden');

    });

    watchView.classList.remove('hidden');

    homeView.classList.add('hidden');

    animeListView.classList.add('hidden');

    malView.classList.add('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });

}

function showMALView() {
    if (typeof closeNavDrawer === 'function') { try { closeNavDrawer(); } catch (_) {} }
    if (typeof closePgModal === 'function') { try { closePgModal(); } catch (_) {} }
    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');
    leaveW2GRoom();
    clearProfileCurrentAnime();
    if (typeof setAmbientBackground === 'function') setAmbientBackground(null);

    malView.classList.remove('hidden');
    homeView.classList.add('hidden');
    animeListView.classList.add('hidden');
    watchView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    const nv2 = document.getElementById('newsView'); if (nv2) nv2.classList.add('hidden');

    if (window.setAnavActive) setAnavActive('mal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (typeof vjsPlayer !== 'undefined' && vjsPlayer) { try { vjsPlayer.dispose(); } catch (e) {} vjsPlayer = null; }

    checkMALStatus();
    renderMALPage(false);
    if (malUser && (!_malState.items[_malState.tab] || !_malState.items[_malState.tab].length)) {
        loadMALList(_malState.tab);
    }
}



function showScheduleView() {
    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');

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



// ── Toast (2026 Geniş & Animasyonlu Bildirim Sistemi) ─────────────────────────

function _parseToastMeta(rawMsg, opts) {
    opts = opts || {};
    let text = String(rawMsg == null ? '' : rawMsg).trim();

    // Baştaki emojileri ayıkla
    const leadMatch = text.match(/^([⏩▶⏸🎬⚡✅✨💾📋🪪❌⚠️💡🔒🔓👋👏💖📨✉️📡🔄🔔🗑️🎯🔍🖼️⚙️]+)\s*/u);
    const leadEmoji = leadMatch ? leadMatch[1] : '';
    if (leadMatch) {
        text = text.slice(leadMatch[0].length).trim();
    }

    const low = text.toLowerCase();
    let kind = opts.kind || 'info';
    let kicker = opts.kicker || 'ANITR BİLDİRİM';
    let iconHtml = '<i class="fa-solid fa-bell"></i>';
    let action = opts.action || null;

    const isResume = leadEmoji.includes('⏩') || low.includes('devam ediliyor') || low.includes('kaldığı yerden');
    const isPlayer = leadEmoji.includes('🎬') || leadEmoji.includes('▶') || leadEmoji.includes('⏸') || leadEmoji.includes('⚡') ||
                     low.includes('oynat') || low.includes('atlandı') || low.includes('bölüm açılıyor');
    const isError  = leadEmoji.includes('❌') || low.includes('başarısız') || low.includes('hata') || low.includes('ulaşılamadı') ||
                     low.includes('bulunamadı') || low.includes('alınamadı') || low.includes('geçersiz') || low.includes('yanlış');
    const isWarn   = leadEmoji.includes('⚠️') || leadEmoji.includes('💡') || leadEmoji.includes('🔒') ||
                     low.includes('gereklidir') || low.includes('en fazla') || low.includes('giriş yap');
    const isSocial = leadEmoji.includes('👋') || leadEmoji.includes('👏') || leadEmoji.includes('💖') ||
                     leadEmoji.includes('📨') || leadEmoji.includes('✉️') || leadEmoji.includes('📡') ||
                     low.includes('arkadaş') || low.includes('davet') || low.includes('odasına') || low.includes('alkış') || low.includes('eşitlen');
    const isSuccess = leadEmoji.includes('✅') || leadEmoji.includes('✨') || leadEmoji.includes('💾') ||
                      leadEmoji.includes('📋') || leadEmoji.includes('🪪') ||
                      low.includes('kaydedildi') || low.includes('eklendi') || low.includes('oluşturuldu') ||
                      low.includes('kopyalandı') || low.includes('indirildi') || low.includes('yayınlandı') || low.includes('güncellendi');

    if (isResume) {
        kind = 'resume';
        kicker = 'OYNATICI · KALDIĞIN YER';
        iconHtml = '<i class="fa-solid fa-forward-fast"></i>';
        if (!action) {
            action = {
                label: 'Başa Sar',
                icon: 'fa-rotate-left',
                onClick: function () {
                    try {
                        if (typeof vjsPlayer !== 'undefined' && vjsPlayer && typeof vjsPlayer.currentTime === 'function') {
                            vjsPlayer.currentTime(0);
                            vjsPlayer.play();
                        } else {
                            const v = document.querySelector('.video-container-page video, video');
                            if (v) { v.currentTime = 0; v.play(); }
                        }
                        showToast('🎬 00:00 · Bölüm baştan başlatıldı', 2600);
                    } catch (_) {}
                }
            };
        }
    } else if (isError) {
        kind = 'error';
        kicker = 'BİLDİRİM · UYARI';
        iconHtml = '<i class="fa-solid fa-circle-exclamation"></i>';
    } else if (isWarn) {
        kind = 'warn';
        kicker = 'BİLGİLENDİRME';
        iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
    } else if (isSocial) {
        kind = 'social';
        kicker = 'ANITR SOSYAL';
        iconHtml = '<i class="fa-solid fa-user-group"></i>';
    } else if (isPlayer) {
        kind = 'player';
        kicker = 'OYNATICI';
        iconHtml = '<i class="fa-solid fa-play"></i>';
    } else if (isSuccess) {
        kind = 'success';
        kicker = 'İŞLEM TAMAMLANDI';
        iconHtml = '<svg class="an-toast-svg-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    }

    // Güvenli HTML + Zaman damgası (Örn: 25:11) vurgulama
    const escText = text.replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
    const formattedHtml = escText.replace(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g, '<span class="an-toast-time">$1</span>');

    return { kind: kind, kicker: kicker, iconHtml: iconHtml, html: formattedHtml || escText, action: action };
}

function hideToast() {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(t._timer);
    clearTimeout(t._hideTimer);
    t.classList.remove('is-open', 'is-bump');
    t.classList.add('is-leaving');
    t._hideTimer = setTimeout(() => {
        t.classList.remove('is-leaving');
        t.classList.add('hidden');
    }, 280);
}

function showToast(msg, duration = 3600, opts = {}) {
    const t = document.getElementById('toast');
    if (!t) return;

    const dur = Math.max(2400, Number(duration) || 3600);
    const meta = _parseToastMeta(msg, opts);
    const wasOpen = !t.classList.contains('hidden') && !t.classList.contains('is-leaving');

    clearTimeout(t._timer);
    clearTimeout(t._hideTimer);

    t.className = 'toast an-toast kind-' + meta.kind;
    t.style.setProperty('--toast-dur', dur + 'ms');

    t.innerHTML =
        '<div class="an-toast-glow"></div>' +
        '<div class="an-toast-ico">' + meta.iconHtml + '</div>' +
        '<div class="an-toast-body">' +
            '<div class="an-toast-kicker"><span class="an-toast-dot"></span>' + meta.kicker + '</div>' +
            '<div class="an-toast-msg">' + meta.html + '</div>' +
        '</div>' +
        '<div class="an-toast-right">' +
            (meta.action ? '<button type="button" class="an-toast-act" id="anToastActBtn">' + (meta.action.icon ? '<i class="fa-solid ' + meta.action.icon + '"></i>' : '') + '<span>' + meta.action.label + '</span></button>' : '') +
            '<button type="button" class="an-toast-close" id="anToastCloseBtn" aria-label="Kapat"><i class="fa-solid fa-xmark"></i></button>' +
        '</div>' +
        '<div class="an-toast-bar"><span class="an-toast-bar-fill"></span></div>';

    const closeBtn = t.querySelector('#anToastCloseBtn');
    if (closeBtn) {
        closeBtn.onclick = function (e) {
            e.stopPropagation();
            hideToast();
        };
    }
    const actBtn = t.querySelector('#anToastActBtn');
    if (actBtn && meta.action && typeof meta.action.onClick === 'function') {
        actBtn.onclick = function (e) {
            e.stopPropagation();
            meta.action.onClick();
        };
    }

    // Fare üzerindeyken sayacı duraklat
    let remaining = dur;
    let startedAt = Date.now();
    t.onmouseenter = function () {
        clearTimeout(t._timer);
        remaining = Math.max(800, remaining - (Date.now() - startedAt));
        t.classList.add('is-paused');
    };
    t.onmouseleave = function () {
        startedAt = Date.now();
        t.classList.remove('is-paused');
        clearTimeout(t._timer);
        t._timer = setTimeout(hideToast, remaining);
    };

    void t.offsetWidth;
    t.classList.add('is-open');
    if (wasOpen) {
        t.classList.remove('is-bump');
        void t.offsetWidth;
        t.classList.add('is-bump');
    }

    t._timer = setTimeout(hideToast, dur);
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

let _cinematicTimer = null;

let _heroTimerStartTime = 0;

let _heroTimerDuration = 7000;

let _heroTimerPaused = false;

let _heroTimerRemaining = 7000;



/* ═══════════════════════════════════════════════════════════

   ✨ ULTRA-MODERN CINEMATIC HERO SHOWCASE (V2)

   ═══════════════════════════════════════════════════════════ */



async function initHeroBanner(animerankData) {

    cinematicHeroes = [];

    currentCinematicIndex = 0;



    // ── AniList: 3 paralel sorgu ──────────────────────────────────────────
    // Trending, Popularity ve Bu Sezon - unique karıştırılmış liste
    const _heroFields = `
        id idMal
        title { romaji english native }
        bannerImage
        coverImage { extraLarge large medium color }
        description(asHtml: false)
        averageScore popularity format episodes seasonYear genres
        trailer { id site }
    `;

    function _mapHeroMedia(m) {
        const cleanDesc = (m.description || '')
            .replace(/<[^>]*>/g, '').replace(/\n/g, ' ').trim();
        const score  = m.averageScore ? (m.averageScore / 10).toFixed(1) : null;
        const banner = m.bannerImage || m.coverImage?.extraLarge || m.coverImage?.large || '';
        const poster = m.coverImage?.extraLarge || m.coverImage?.large || banner;
        const titleVal = m.title.romaji || m.title.english || 'Bilinmiyor';
        return {
            id: m.id, idMal: m.idMal,
            title: titleVal,
            title_english: m.title.english || titleVal,
            title_native: m.title.native || '',
            synopsis: cleanDesc || 'Açıklama bulunmuyor.',
            score, banner, poster,
            color: m.coverImage?.color || '#8b5cf6',
            genres: m.genres || [],
            format: m.format === 'TV' ? 'Dizi' : m.format === 'MOVIE' ? 'Film' : (m.format || 'Anime'),
            episodes: m.episodes || null,
            year: m.seasonYear || new Date().getFullYear(),
            trailer: (m.trailer && m.trailer.site === 'youtube') ? m.trailer.id : null,
            images: { jpg: { large_image_url: banner } }
        };
    }

    // Mevcut sezonu hesapla
    const _now = new Date();
    const _seasonMap = { 0:'WINTER',1:'WINTER',2:'SPRING',3:'SPRING',4:'SPRING',
                         5:'SUMMER',6:'SUMMER',7:'SUMMER',8:'FALL',9:'FALL',10:'FALL',11:'WINTER' };
    const _curSeason = _seasonMap[_now.getMonth()];
    const _curYear   = _now.getFullYear();

    const _queryTrending = `query { Page(page:1,perPage:10) {
        media(type:ANIME, sort:[TRENDING_DESC], isAdult:false) { ${_heroFields} } } }`;

    const _queryPopular = `query { Page(page:1,perPage:10) {
        media(type:ANIME, sort:[POPULARITY_DESC], isAdult:false) { ${_heroFields} } } }`;

    const _querySeason = `query { Page(page:1,perPage:10) {
        media(type:ANIME, sort:[SCORE_DESC], season:${_curSeason}, seasonYear:${_curYear}, isAdult:false) { ${_heroFields} } } }`;

    const _queryTopScore = `query { Page(page:1,perPage:10) {
        media(type:ANIME, sort:[SCORE_DESC], isAdult:false, status_not:NOT_YET_RELEASED) { ${_heroFields} } } }`;

    try {
        // 4 sorguyu paralel çek
        const [_resTrend, _resPop, _resSeason, _resTop] = await Promise.allSettled([
            fetchAniList(_queryTrending),
            fetchAniList(_queryPopular),
            fetchAniList(_querySeason),
            fetchAniList(_queryTopScore)
        ]);

        const _seenIds = new Set();
        const _merged  = [];

        // Round-robin karıştır: her listeden sırayla 1 eleman al
        const _lists = [
            (_resTrend.status  === 'fulfilled' && _resTrend.value?.Page?.media)  || [],
            (_resPop.status    === 'fulfilled' && _resPop.value?.Page?.media)    || [],
            (_resSeason.status === 'fulfilled' && _resSeason.value?.Page?.media) || [],
            (_resTop.status    === 'fulfilled' && _resTop.value?.Page?.media)    || []
        ];

        const _maxLen = Math.max(..._lists.map(l => l.length));
        for (let _ri = 0; _ri < _maxLen && _merged.length < 16; _ri++) {
            for (const _list of _lists) {
                if (_ri < _list.length) {
                    const _m = _list[_ri];
                    if (!_seenIds.has(_m.id)) {
                        _seenIds.add(_m.id);
                        const _h = _mapHeroMedia(_m);
                        if (_h.banner) _merged.push(_h);
                    }
                }
            }
        }

        if (_merged.length > 0) {
            // Fischer-Yates shuffle - her yenilemede farklı sıra
            for (let _i = _merged.length - 1; _i > 0; _i--) {
                const _j = Math.floor(Math.random() * (_i + 1));
                [_merged[_i], _merged[_j]] = [_merged[_j], _merged[_i]];
            }
            cinematicHeroes = _merged.slice(0, 12);
        }

        console.log('[Hero] AniList multi-query:', cinematicHeroes.length,
            'slide (trend+popular+sezon+topscore)');

    } catch (e) {
        console.warn('[Hero] AniList multi-query hatasi:', e);
    }




    // 2. Yedek: Kitsu Trending

    if (!cinematicHeroes || cinematicHeroes.length < 4) {

        try {

            const res = await fetch('https://kitsu.io/api/edge/trending/anime?limit=10');

            const json = await res.json();

            if (json && json.data && json.data.length > 0) {

                const kitsuList = json.data.map(m => {

                    const attr = m.attributes;

                    const banner = attr.coverImage?.original || attr.coverImage?.large || attr.posterImage?.original || '';

                    const poster = attr.posterImage?.large || attr.posterImage?.original || banner;

                    const titleVal = attr.canonicalTitle || attr.titles?.en_jp || 'Bilinmiyor';

                    return {

                        id: m.id,

                        title: titleVal,

                        title_english: attr.titles?.en || titleVal,

                        synopsis: (attr.synopsis || '').replace(/\n/g, ' ').trim(),

                        score: attr.averageRating ? (parseFloat(attr.averageRating) / 10).toFixed(1) : null,

                        banner: banner,

                        poster: poster,

                        color: '#8b5cf6',

                        genres: [],

                        format: 'Anime',

                        episodes: attr.episodeCount || null,

                        year: attr.startDate ? new Date(attr.startDate).getFullYear() : null,

                        trailer: attr.youtubeVideoId || null,

                        images: { jpg: { large_image_url: banner } }

                    };

                }).filter(h => h.banner);



                if (kitsuList.length > 0) {

                    cinematicHeroes = [...cinematicHeroes, ...kitsuList].slice(0, 8);

                }

            }

        } catch (e) {

            console.warn("[Hero] Kitsu trending çekilemedi:", e);

        }

    }



    // 3. Fallback: Animerank / animerankData

    if ((!cinematicHeroes || cinematicHeroes.length === 0) && animerankData) {

        try {

            for (let k in animerankData) {

                const items = animerankData[k]?.items || [];

                if (items.length > 0) {

                    cinematicHeroes = items.slice(0, 8).map(m => ({

                        title: m.title,

                        title_english: m.titleOriginal || m.title,

                        synopsis: m.description || '',

                        score: m.score ? m.score.toFixed(1) : '8.5',

                        banner: m.poster || '',

                        poster: m.poster || '',

                        color: '#8b5cf6',

                        genres: m.genres || [],

                        format: 'Anime',

                        year: m.year || 2024,

                        images: { jpg: { large_image_url: m.poster } }

                    }));

                    break;

                }

            }

        } catch (e) {}

    }



    // ── Aciklamalari Turkce'ye cevir (Google Translate free endpoint, cacheli) ──
    async function _translateDescTr(text) {
        if (!text || text.length < 5) return text;
        const _ck = 'anitr_trcache_' + text.slice(0, 60).split('').reduce((a,c) => (a*31+c.charCodeAt(0))|0, 0);
        const _cached = localStorage.getItem(_ck);
        if (_cached) return _cached;
        try {
            const _url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=' + encodeURIComponent(text.slice(0, 400));
            const _r = await fetch(_url);
            const _d = await _r.json();
            const _tr = Array.isArray(_d[0]) ? _d[0].map(x => x && x[0] ? x[0] : '').join('') : text;
            if (_tr && _tr.length > 5) {
                localStorage.setItem(_ck, _tr);
                return _tr;
            }
        } catch(_e) {}
        return text;
    }

    if (cinematicHeroes && cinematicHeroes.length > 0) {
        // Once render et (Ingilizce) - kullanici hemen gorur
        renderCinematicHero();
        startHeroTimer();
        // Arka planda Turkce cevir, her slide guncellendikce yeniden render et
        (async () => {
            let _anyUpdated = false;
            for (let _ti = 0; _ti < cinematicHeroes.length; _ti++) {
                const _h = cinematicHeroes[_ti];
                if (_h.synopsis && !/[\u00c0-\u024f\u011f\u015f\u00fc\u00f6\u00e7\u0131]/.test(_h.synopsis)) {
                    // Hala Ingilizce gorunuyor (Turkce karakter yok)
                    const _trSyn = await _translateDescTr(_h.synopsis);
                    if (_trSyn && _trSyn !== _h.synopsis) {
                        cinematicHeroes[_ti].synopsis = _trSyn;
                        _anyUpdated = true;
                        // Aktif slide bu ise aninda guncelle
                        if (_ti === currentCinematicIndex) {
                            const _synEl = document.getElementById('cinematicDesc');
                            if (_synEl) _synEl.textContent = _trSyn.length > 220 ? _trSyn.slice(0, 220) + '...' : _trSyn;
                        }
                    }
                }
                // Rate limit icin kisa bekleme
                await new Promise(r => setTimeout(r, 120));
            }
        })();
        return; // Erken return - asagidaki renderCinematicHero tekrar cagrilmasin
    }

    renderCinematicHero();

    startHeroTimer();



    // ── Mouse Interactivity & Parallax ──

    const heroEl = document.getElementById('cinematicHero');

    if (heroEl && !heroEl._listenersAttached) {

        heroEl._listenersAttached = true;



        heroEl.addEventListener('mouseenter', () => {

            _heroTimerPaused = true;

            const timerFill = document.getElementById('heroTimerFill');

            if (timerFill) timerFill.style.animationPlayState = 'paused';

        });



        heroEl.addEventListener('mouseleave', () => {

            _heroTimerPaused = false;

            const timerFill = document.getElementById('heroTimerFill');

            if (timerFill) timerFill.style.animationPlayState = 'running';

        });



        heroEl.addEventListener('mousemove', (e) => {

            const { clientX, clientY } = e;

            const { innerWidth, innerHeight } = window;

            const xOffset = (clientX / innerWidth - 0.5) * 16;

            const yOffset = (clientY / innerHeight - 0.5) * 16;

            const activeBg = heroEl.querySelector('.hero-v2-bg.active');

            if (activeBg) {

                activeBg.style.transform = `scale(1.06) translate(${xOffset * -0.6}px, ${yOffset * -0.6}px)`;

            }

            const glow = document.getElementById('heroAmbientGlow');

            if (glow) {

                glow.style.transform = `translate(${xOffset * 1.5}px, ${yOffset * 1.5}px)`;

            }

        });

    }

}



let _activeHeroLayer = 'A';



function renderCinematicHero() {

    if (!cinematicHeroes || cinematicHeroes.length === 0) return;

    if (currentCinematicIndex >= cinematicHeroes.length) currentCinematicIndex = 0;



    const hero = cinematicHeroes[currentCinematicIndex];

    const safeTitle = (hero.title || hero.title_english || 'Bilinmiyor').replace(/\\/g, '\\\\').replace(/'/g, "\\'");



    // ── V3: Dual Layer Cross-Fade Backdrop ──

    const bgA = document.getElementById('heroBgA');

    const bgB = document.getElementById('heroBgB');

    const nextImgUrl = hero.banner || hero.poster || '';



    if (bgA && bgB) {

        if (_activeHeroLayer === 'A') {

            bgB.style.backgroundImage = `url("${nextImgUrl}")`;

            bgB.classList.add('active');

            bgA.classList.remove('active');

            _activeHeroLayer = 'B';

        } else {

            bgA.style.backgroundImage = `url("${nextImgUrl}")`;

            bgA.classList.add('active');

            bgB.classList.remove('active');

            _activeHeroLayer = 'A';

        }

    }



    // ── V3: Ambient Glow ──

    const ambientGlow = document.getElementById('heroAmbientGlow');

    if (ambientGlow) {

        const glowColor = hero.color || '#8b5cf6';

        ambientGlow.style.background = `radial-gradient(ellipse at 30% 60%, ${glowColor}40 0%, rgba(236,72,153,0.12) 50%, transparent 75%)`;

    }



    // ── Title ──

    const titleEl = document.getElementById('cinematicTitle');

    if (titleEl) {

        titleEl.textContent = hero.title || hero.title_english || 'Bilinmiyor';

        titleEl.style.animation = 'none';

        void titleEl.offsetWidth;

        titleEl.style.animation = 'heroContentFadeUp 0.45s ease both';

    }



    // ── Badge ──

    const badgeEl = document.getElementById('cinematicBadge');

    if (badgeEl) {

        badgeEl.textContent = `#${currentCinematicIndex + 1} Günün Trendi`;

    }



    // ── Synopsis ──

    const descEl = document.getElementById('cinematicDesc');

    if (descEl) {

        const synop = hero.synopsis || 'Bu anime için henüz açıklama eklenmedi.';

        descEl.textContent = synop.length > 220 ? synop.slice(0, 220) + '...' : synop;

        descEl.style.animation = 'none';

        void descEl.offsetWidth;

        descEl.style.animation = 'heroContentFadeUp 0.55s ease both';

    }



    // ── Meta Chips — V3 style ──

    const metaEl = document.getElementById('cinematicMeta');

    if (metaEl) {

        const parts = [];

        if (hero.score) parts.push(`<span class="h-meta-chip h-meta-score"><i class="fa-solid fa-star"></i> ${hero.score}</span>`);

        if (hero.year)  parts.push(`<span class="h-meta-chip">${hero.year}</span>`);

        if (hero.format) parts.push(`<span class="h-meta-chip">${hero.format}</span>`);

        if (hero.episodes) parts.push(`<span class="h-meta-chip">${hero.episodes} Bölüm</span>`);

        metaEl.innerHTML = parts.join('');

    }



    // ── Genre Tags — V3 style ──

    const genresEl = document.getElementById('cinematicGenres');

    if (genresEl) {

        const genres = (hero.genres || []).slice(0, 4);

        if (genres.length > 0) {

            genresEl.innerHTML = genres.map(g => {

                const gName = typeof g === 'string' ? g : (g.name || '');

                return `<span class="hero-genre-tag">${gName}</span>`;

            }).join('');

        } else {

            genresEl.innerHTML = '';

        }

    }



    // ── Action Buttons — V3 (play + info only, clean) ──

    const actionsEl = document.getElementById('cinematicActions');

    if (actionsEl) {

        actionsEl.innerHTML = `

            <button class="hero-btn-play" onclick="searchAnimeByName('${safeTitle}')">

                <i class="fa-solid fa-play"></i><span>Hemen İzle</span>

            </button>

            <button class="hero-btn-info" onclick="searchAnimeByName('${safeTitle}')">

                <i class="fa-solid fa-circle-info"></i><span>Detaylar</span>

            </button>

            ${hero.trailer ? `<button class="hero-btn-info" onclick="openTrailerModal('${hero.trailer}')">

                <i class="fa-solid fa-film"></i><span>Fragman</span>

            </button>` : ''}

        `;

        actionsEl.style.animation = 'none';

        void actionsEl.offsetWidth;

        actionsEl.style.animation = 'heroContentFadeUp 0.65s ease both';

    }



    // ── Pagination Dots & Counter ──

    const dotsEl = document.getElementById('cinematicDots');

    const counterEl = document.getElementById('heroCounter');

    if (dotsEl) {

        dotsEl.innerHTML = cinematicHeroes.map((_, i) =>

            `<div class="hero-v2-dot ${i === currentCinematicIndex ? 'active' : ''}" onclick="jumpCinematicHero(${i})"></div>`

        ).join('');

    }

    if (counterEl) {

        const idx = currentCinematicIndex + 1;

        const tot = cinematicHeroes.length;

        counterEl.textContent = `${idx < 10 ? '0' + idx : idx} / ${tot < 10 ? '0' + tot : tot}`;

    }



    // ── Timer Bar ──

    resetHeroTimerAnimation();

}



function resetHeroTimerAnimation() {

    const timerFill = document.getElementById('heroTimerFill');

    if (!timerFill) return;

    timerFill.style.transition = 'none';

    timerFill.style.width = '0%';

    void timerFill.offsetWidth; // Reflow

    timerFill.style.transition = `width ${_heroTimerDuration}ms linear`;

    timerFill.style.width = '100%';

}



window.jumpCinematicHero = function(idx) {

    if (!cinematicHeroes || cinematicHeroes.length === 0) return;

    currentCinematicIndex = (idx + cinematicHeroes.length) % cinematicHeroes.length;

    renderCinematicHero();

    startHeroTimer();

};



window.nextCinematicHero = function() {

    if (!cinematicHeroes || cinematicHeroes.length === 0) return;

    currentCinematicIndex = (currentCinematicIndex + 1) % cinematicHeroes.length;

    renderCinematicHero();

    startHeroTimer();

};



window.prevCinematicHero = function() {

    if (!cinematicHeroes || cinematicHeroes.length === 0) return;

    currentCinematicIndex = (currentCinematicIndex - 1 + cinematicHeroes.length) % cinematicHeroes.length;

    renderCinematicHero();

    startHeroTimer();

};



window.startHeroTimer = function() {

    stopHeroTimer();

    _heroTimerPaused = false;

    resetHeroTimerAnimation();

    _cinematicTimer = setInterval(() => {

        const homeEl = document.getElementById('homeView');

        if (homeEl && !homeEl.classList.contains('hidden') && !_heroTimerPaused) {

            nextCinematicHero();

        }

    }, _heroTimerDuration);

};



window.stopHeroTimer = function() {

    if (_cinematicTimer) {

        clearInterval(_cinematicTimer);

        _cinematicTimer = null;

    }

};



window.homeScrollTo = function(elementId) {

    const el = document.getElementById(elementId);

    if (el) {

        el.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Update quick bar active chip

        document.querySelectorAll('.hq-chip').forEach(chip => {

            if (chip.getAttribute('onclick')?.includes(elementId)) {

                chip.classList.add('active');

            } else {

                chip.classList.remove('active');

            }

        });

    }

};



function searchAnimeByName(name) {

    if (!name) return;

    openAnimeCard(name);

}



/* ── openAnimeCard: Home card click — search backend & open first result directly ── */

window.openAnimeCard = async function(title) {

    if (!title) return;

    showLoader();

    try {

        const src = typeof currentSource !== 'undefined' ? currentSource : 'AnimeciX';
        const tryOrder = [src, ...['AnimeciX', 'AniHub'].filter(s => s !== src)];
        for (const trySrc of tryOrder) {
            const results = await fetchAPI('/search?q=' + encodeURIComponent(title) + '&source=' + encodeURIComponent(trySrc));
            if (Array.isArray(results) && results.length > 0) {
                const a = results[0];
                currentSource = trySrc;
                currentSourceKey = trySrc.replace(/\s+/g, '_');
                currentSourceHistoryKey = 'anitr_history_' + currentSourceKey;
                currentSourcePositionsKey = 'anitr_positions_' + currentSourceKey;
                hideLoader();
                loadDetails(a.ID || a.id || '', a.Slug || a.slug || '', !!(a.IsMovie || a.isMovie || a.TitleType === 'movie'), a.Title || a.title || title, a.Synopsis || a.synopsis || '', a.ImageURL || a.Img || a.img || '');
                return;
            }
        }

    } catch(e) {}

    // Fallback: show search results

    hideLoader();

    handleSearch(title);

};



/* ═══════════════════════════════════════════════════════════

   🏠 LOAD HOME — MULTI-RAIL CURATION & PERSONALIZATION

   ═══════════════════════════════════════════════════════════ */



async function loadHome() {

    showHomeView();

    if (mainContent) mainContent.innerHTML = '';



    const cHero = document.getElementById('cinematicHero');

    if (cHero) cHero.classList.remove('hidden');



    renderContinueWatching();



    // Initialize Hero Banner

    await initHeroBanner(null);



    hideLoader();

}



/* ── Universal Home Rail HTML Generator ── */

function buildHomeRailHtml(items, sectionTitle, iconClasses, sectionId, isTop10 = false) {

    if (!items || items.length === 0) return '';



    const cardsHtml = items.map((m, idx) => {

        const titleVal = m.title?.romaji || m.title?.english || (typeof m.title === 'string' ? m.title : 'Bilinmiyor');

        const safeTitle = titleVal.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        const img = m.coverImage?.extraLarge || m.coverImage?.large || m.image_url || 'https://placehold.co/200x280/1a1a28/8b5cf6?text=?';

        const score = m.averageScore ? (m.averageScore / 10).toFixed(1) : (m.score || null);

        const format = m.format || 'TV';

        const year = m.seasonYear || m.year || '';



        const cardContent = `

            <div class="h-card" onclick="openAnimeCard('${safeTitle}')">

                <div class="h-card-poster-wrap">

                    <img src="${img}" alt="${safeTitle}" class="h-card-poster" loading="lazy" onerror="this.src='https://placehold.co/200x280/1a1a28/8b5cf6?text=?'">

                    <div class="h-card-badges">

                        ${score ? `<span class="h-badge-score"><i class="fa-solid fa-star"></i> ${score}</span>` : '<span></span>'}

                        <span class="h-badge-format">${format}</span>

                    </div>

                    <div class="h-card-overlay">

                        <button class="h-overlay-play-btn" onclick="event.stopPropagation();openAnimeCard('${safeTitle}')" title="İzle">

                            <i class="fa-solid fa-play"></i>

                        </button>

                    </div>

                </div>

                <div class="h-card-info">

                    <h4 class="h-card-title" title="${safeTitle}">${titleVal}</h4>

                    <div class="h-card-meta">

                        <span>${year || 'Anime'}</span>

                        <span style="color:#a78bfa"><i class="fa-solid fa-headphones"></i> Türkçe</span>

                    </div>

                </div>

            </div>

        `;



        if (isTop10) {

            const rank = idx + 1;

            const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

            return `

            <div class="h-card-top10-wrap">

                <div class="h-top10-number ${rankClass}">${rank}</div>

                ${cardContent}

            </div>`;

        }



        return cardContent;

    }).join('');



    return `

    <section class="home-section" id="${sectionId}">

        <div class="home-section-header">

            <div class="hsh-left">

                <div class="hsh-icon-wrap ${iconClasses.split(' ')[1] || 'star'}">

                    <i class="fa-solid ${iconClasses.split(' ')[0]}"></i>

                </div>

                <div>

                    <h2 class="home-section-title">${sectionTitle}</h2>

                    <span class="home-section-sub">${isTop10 ? 'Türkiye ve dünyada en çok konuşulanlar' : 'Özenle seçilmiş popüler animeler'}</span>

                </div>

            </div>

            <button class="hsh-see-all" onclick="showAnimeListView()">

                <span>Tümünü Gör</span><i class="fa-solid fa-chevron-right"></i>

            </button>

        </div>

        <div class="home-carousel-wrap">

            <button class="h-car-btn prev" onclick="scrollCarousel(this, -1)"><i class="fa-solid fa-chevron-left"></i></button>

            <div class="home-row">${cardsHtml}</div>

            <button class="h-car-btn next" onclick="scrollCarousel(this, 1)"><i class="fa-solid fa-chevron-right"></i></button>

        </div>

    </section>`;

}



/* ── Backward Compatibility Bridge ── */

function buildJikanCarouselHtml(data, sectionTitle) {

    if (!data || !data.length) return '';

    const mapped = data.map(a => ({

        title: { romaji: a.title || a.title_english || 'Bilinmiyor', english: a.title_english },

        coverImage: { extraLarge: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || a.image_url },

        averageScore: a.score ? Math.round(parseFloat(a.score) * 10) : null,

        format: 'TV',

        seasonYear: a.year || (a.aired?.prop?.from?.year) || '',

        genres: a.genres || []

    }));

    return buildHomeRailHtml(mapped, sectionTitle, 'fa-star star', 'sec-compat', false);

}



/* ═══════════════════════════════════════════════════════════

   ⏱️ CONTINUE WATCHING (KALDIĞIN YERDEN DEVAM ET)

   ═══════════════════════════════════════════════════════════ */



window.resumeWatch = function(id) {

    const hist = getHistory().find(h => String(h.id) === String(id));

    if (hist) {

        window._resumeWatchHistory = hist;

        quickPlay(hist.id, hist.slug, hist.isMovie, hist.title, hist.synopsis, hist.img);

    }

};



const _CW_WIDE_CACHE_KEY = 'anitr_cw_wide_v2';

function _getCwWideCache() {

    try { return JSON.parse(localStorage.getItem(_CW_WIDE_CACHE_KEY) || '{}'); } catch (_) { return {}; }

}

function _setCwWideCache(cache) {

    try { localStorage.setItem(_CW_WIDE_CACHE_KEY, JSON.stringify(cache)); } catch (_) {}

}



async function _enrichCwWideCards(items) {

    const cache = _getCwWideCache();

    const pending = items.filter(h => {

        const k = String(h.title || '').toLowerCase().trim();

        return k && !cache[k];

    }).slice(0, 10);

    if (!pending.length) return;



    for (const h of pending) {

        const titleKey = String(h.title || '').toLowerCase().trim();

        if (!titleKey) continue;

        try {

            const gql = `query ($s: String) {

                Media(search: $s, type: ANIME) {

                    bannerImage

                    seasonYear

                    episodes

                    averageScore

                    format

                    isAdult

                    description(asHtml: false)

                    streamingEpisodes { thumbnail }

                    coverImage { extraLarge large }

                }

            }`;

            const res = await fetch('https://graphql.anilist.co', {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify({ query: gql, variables: { s: h.title } })

            });

            if (!res.ok) continue;

            const json = await res.json();

            const m = json && json.data && json.data.Media;

            if (!m) continue;

            const epThumbs = Array.isArray(m.streamingEpisodes) ? m.streamingEpisodes : [];

            const epIdx = Math.max(0, parseInt(h.eIdx, 10) || 0);

            const pickedEpThumb = (epThumbs[epIdx] && epThumbs[epIdx].thumbnail) || (epThumbs[0] && epThumbs[0].thumbnail) || '';

            const wideImg = m.bannerImage || pickedEpThumb || '';

            const cleanDesc = String(m.description || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

            cache[titleKey] = {

                wide: wideImg,

                cover: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || '',

                year: m.seasonYear || '',

                episodes: m.episodes || '',

                score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '',

                age: m.isAdult ? '18+' : '13+',

                desc: cleanDesc.slice(0, 220),

                t: Date.now()

            };

            _setCwWideCache(cache);



            const slotEl = document.querySelector(`.cw-slot[data-cw-id="${CSS.escape(String(h.id))}"]`);

            if (slotEl) {

                const info = cache[titleKey];

                if (info.wide) {

                    const imgEl = slotEl.querySelector('.cw-media-img');

                    if (imgEl && !h.kitsuThumb) {

                        imgEl.src = info.wide;

                        imgEl.classList.remove('is-portrait-fallback');

                    }

                }

                if (info.year) {

                    const yEl = slotEl.querySelector('.cw-meta-year');

                    if (yEl) yEl.textContent = info.year;

                }

                if (info.episodes && !h.isMovie) {

                    const epEl = slotEl.querySelector('.cw-meta-dur');

                    const curEp = (h.eIdx || 0) + 1;

                    if (epEl) epEl.textContent = `${curEp} / ${info.episodes} Bölüm`;

                }

                if (info.desc) {

                    const dEl = slotEl.querySelector('.cw-desc');

                    if (dEl && (!h.synopsis || h.synopsis.length < 20 || h.synopsis.includes('bulunmuyor'))) {

                        dEl.textContent = info.desc;

                    }

                }

            }

        } catch (_) {}

    }

}



async function renderContinueWatching() {

    const hist = getHistory();

    const cwContainerEl = document.getElementById('cwContainer');

    const continueWatchEl = document.getElementById('continueWatching');



    if (!hist || !hist.length) {

        if (continueWatchEl) continueWatchEl.classList.add('hidden');

        return;

    }

    if (continueWatchEl) continueWatchEl.classList.remove('hidden');



    const positions = getPositions();

    const wideCache = _getCwWideCache();

    const latestByAnime = {};

    hist.forEach(h => {

        const key = String(h.id);

        if (!latestByAnime[key]) {

            latestByAnime[key] = h;

        }

    });



    const items = Object.values(latestByAnime).slice(0, 20);



    if (cwContainerEl) {

        cwContainerEl.innerHTML = items.map((h, idx) => {

            const epKey = (h.slug || h.id) + '_s' + (h.sIdx || 0) + '_e' + (h.eIdx || 0);

            const savedSec = getPosition(epKey, positions) || h.lastWatchedSec || 0;

            const estimatedDuration = 1440;

            const progress = savedSec > 10 ? Math.min(98, Math.max(4, Math.floor((savedSec / estimatedDuration) * 100))) : 4;

            const epNum = (h.eIdx || 0) + 1;

            const sNum  = (h.sIdx || 0) + 1;

            const timeStr = savedSec > 15

                ? `${Math.floor(savedSec / 60)}:${Math.floor(savedSec % 60).toString().padStart(2, '0')}`

                : '';



            const titleRaw  = h.title || 'Bilinmiyor';

            const titleKey  = String(titleRaw).toLowerCase().trim();

            const enriched  = wideCache[titleKey] || {};



            const wideCandidate = h.kitsuThumb || h.banner || enriched.wide || '';

            const fallbackPoster = h.img || enriched.cover || 'https://placehold.co/640x360/0c0e16/8b5cf6?text=Anitr';

            const storedThumb = (appSettings.cwThumbnail === 'frame') ? (localStorage.getItem('anitr_cw_thumb_' + epKey) || '') : '';

            const displayImg = storedThumb || wideCandidate || fallbackPoster;

            const isPortraitFallback = !storedThumb && !wideCandidate;



            const safeTitleJs   = titleRaw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            const safeTitleHtml = titleRaw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            const safeImgJs     = fallbackPoster.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            const safeSlugJs    = String(h.slug || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            const safeIdJs      = String(h.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            const isMovBool     = !!h.isMovie;



            const rawSyn = (h.synopsis && !h.synopsis.includes('bulunmuyor')) ? h.synopsis : (enriched.desc || 'Kaldığın bölümden kesintisiz izlemeye hemen devam et.');

            const cleanSynHtml = String(rawSyn).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const safeSynJs = String(rawSyn).slice(0, 180).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/[\r\n]+/g, ' ');



            const year     = h.year || enriched.year || new Date().getFullYear();

            const totalEp  = h.totalEpisodes || h.episodes || enriched.episodes || '';

            const ageBadge = enriched.age || '13+';

            const epChip   = isMovBool ? 'FİLM' : `S${sNum} · B${epNum}`;

            const durText  = isMovBool

                ? (timeStr ? `${timeStr} izlendi` : 'Film')

                : (totalEp ? `${epNum} / ${totalEp} Bölüm` : `${epNum}. Bölüm`);

            const statusText = isMovBool

                ? (timeStr ? `Film · ${timeStr} kaldığın yer` : 'Filmi izlemeye devam et')

                : (timeStr ? `${sNum}. Sezon ${epNum}. Bölüm · ${timeStr}` : `${sNum}. Sezon ${epNum}. Bölüm`);



            const animDelay = Math.min(idx * 0.045, 0.45);



            return `

            <div class="cw-slot" data-cw-id="${String(h.id).replace(/"/g, '&quot;')}" style="animation-delay:${animDelay}s">

                <article class="cw-card" onclick="resumeWatch('${safeIdJs}')">

                    <div class="cw-media">

                        <img class="cw-media-img${isPortraitFallback ? ' is-portrait-fallback' : ''}"

                             src="${displayImg}" alt="${safeTitleHtml}" loading="lazy"

                             onerror="if(this.src!=='${safeImgJs}'){this.src='${safeImgJs}';this.classList.add('is-portrait-fallback');}else{this.src='https://placehold.co/640x360/0c0e16/8b5cf6?text=Anitr';}">

                        <div class="cw-media-vignette"></div>

                        <div class="cw-resting-bar">

                            <span class="cw-corner-icon"><i class="fa-solid fa-play"></i></span>

                            <span class="cw-resting-title">${safeTitleHtml}</span>

                            <span class="cw-corner-ep">${epChip}</span>

                        </div>

                        <button type="button" class="cw-mobile-rm" onclick="event.stopPropagation();removeCWEntry('${safeIdJs}')" title="Listeden Kaldır" aria-label="Listeden Kaldır">

                            <i class="fa-solid fa-xmark"></i>

                        </button>

                        <div class="cw-progress-bar">

                            <div class="cw-progress-fill" style="width:${progress}%;"></div>

                        </div>

                    </div>

                    <div class="cw-drawer">

                        <div class="cw-drawer-inner">

                            <div class="cw-info-title" title="${safeTitleHtml}">${safeTitleHtml}</div>

                            <div class="cw-prime-status">

                                <i class="fa-solid fa-circle-play"></i>

                                <span>${statusText}</span>

                            </div>

                            <div class="cw-info-btns">

                                <button type="button" class="cw-btn-play" onclick="event.stopPropagation();resumeWatch('${safeIdJs}')" title="Kaldığın Yerden Oynat">

                                    <i class="fa-solid fa-play"></i>

                                </button>

                                <button type="button" class="cw-btn-circle" onclick="event.stopPropagation();openAddToListModal({id:'${safeIdJs}',title:'${safeTitleJs}',img:'${safeImgJs}',slug:'${safeSlugJs}'})" title="Listeme Ekle">

                                    <i class="fa-solid fa-plus"></i>

                                </button>

                                <button type="button" class="cw-btn-circle" onclick="event.stopPropagation();loadDetails('${safeIdJs}','${safeSlugJs}',${isMovBool},'${safeTitleJs}','${safeSynJs}','${safeImgJs}')" title="Anime Detayları">

                                    <i class="fa-solid fa-chevron-right"></i>

                                </button>

                                <button type="button" class="cw-btn-circle cw-btn-remove" onclick="event.stopPropagation();removeCWEntry('${safeIdJs}')" title="Kaldığın Yerden Sil">

                                    <i class="fa-solid fa-xmark"></i>

                                </button>

                            </div>

                            <div class="cw-meta-row">

                                <span class="cw-age-pill">${ageBadge}</span>

                                <span class="cw-cc-pill" title="Altyazı / Dublaj"><i class="fa-regular fa-closed-captioning"></i></span>

                                <span class="cw-meta-year">${year}</span>

                                <span class="cw-meta-dur">${durText}</span>

                            </div>

                            <p class="cw-desc">${cleanSynHtml}</p>

                        </div>

                    </div>

                </article>

            </div>`;

        }).join('');



        _enrichCwWideCards(items);

    }

}



window.removeCWEntry = function(id) {

    let h = getHistory().filter(a => String(a.id) !== String(id));

    saveHistory(h);

    renderContinueWatching();

};

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

                <img class="card-poster" src="${img}" alt="${attrTitle}" loading="lazy">

                <div class="card-hover-overlay">

                    <button class="quick-play-btn" onclick="event.stopPropagation();quickPlay('${id}','${attrSlug}',${isMovie},'${attrTitle}','${attrSynopsis}','${attrImg}')" title="Hızlı Oynat"><i class="fa-solid fa-play"></i></button>

                    <button class="quick-wl-btn" onclick="event.stopPropagation();openAddToListModal({id:'${id}',title:'${attrTitle}',img:'${attrImg}',slug:'${attrSlug}'})" title="Listeye Ekle"><i class="fa-solid fa-bookmark"></i></button>

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

    const container = btn.parentElement.querySelector('.anime-carousel, .cw-container, .bento-ribbon-carousel, .nf-row, .home-row');

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



function _hasValidSeasons(arr) {
    if (!Array.isArray(arr) || !arr.length) return false;
    return arr.some(s => (Array.isArray(s.Seasons) && s.Seasons.length > 0) || s.Number !== undefined || (s.Count && s.Count > 0));
}

async function _fetchSeasonsWithFallback(id, slug, title) {
    const cleanSlug = (slug && slug !== 'null' && slug !== 'undefined') ? slug : '';
    const qs = (id ? 'id=' + id : '') + (cleanSlug ? '&slug=' + encodeURIComponent(cleanSlug) : '') + '&source=' + encodeURIComponent(currentSource);
    let seasonsData = await fetchAPI('/seasons?' + qs);
    if (_hasValidSeasons(seasonsData)) {
        return { id, slug: cleanSlug, seasons: seasonsData, switched: false };
    }
    if (title) {
        const candidates = ['AnimeciX', 'AniHub'].filter(s => s !== currentSource);
        for (const altSrc of candidates) {
            if (altSrc === currentSource) continue;
            try {
                const res = await fetchAPI('/search?q=' + encodeURIComponent(title) + '&source=' + encodeURIComponent(altSrc));
                if (Array.isArray(res) && res.length > 0) {
                    const hit = res[0];
                    const nId = hit.ID || hit.id || '';
                    const nSlug = hit.Slug || hit.slug || '';
                    const altQs = (nId ? 'id=' + nId : '') + (nSlug ? '&slug=' + encodeURIComponent(nSlug) : '') + '&source=' + encodeURIComponent(altSrc);
                    const altSeasons = await fetchAPI('/seasons?' + altQs);
                    if (_hasValidSeasons(altSeasons)) {
                        currentSource = altSrc;
                        currentSourceKey = altSrc.replace(/\s+/g, '_');
                        currentSourceHistoryKey = 'anitr_history_' + currentSourceKey;
                        currentSourcePositionsKey = 'anitr_positions_' + currentSourceKey;
                        return { id: nId || id, slug: nSlug || cleanSlug, seasons: altSeasons, switched: true };
                    }
                }
            } catch (_) {}
        }
    }
    return { id, slug: cleanSlug, seasons: seasonsData || [], switched: false };
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



    const resolved = await _fetchSeasonsWithFallback(id, slug, title);
    id = resolved.id;
    slug = resolved.slug;
    const seasonsData = resolved.seasons;

    if (!_hasValidSeasons(seasonsData)) {

        showToast('❌ Bölümler alınamadı, detay sayfası açılıyor...');

        window._skipNextSeasonsFetch = true;
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

    const epsQs = (sId ? 'season_id=' + sId : '') + '&season_num=' + startSIdx + (id ? '&id=' + id : '') + (slug && slug !== 'null' && slug !== 'undefined' ? '&slug=' + encodeURIComponent(slug) : '') + '&source=' + encodeURIComponent(currentSource);

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



// ══════════════════════════════════════════════════════════════════════════
// KİŞİSEL KÜTÜPHANE SİSTEMİ (TAM SAYFA: LİSTELERİM · FAVORİLER · GEÇMİŞ · İZLEME LİSTESİ)
// ══════════════════════════════════════════════════════════════════════════

function generateListId() {
    return 'lst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}

const getMyLists = () => ls.get('anitr_my_lists', []);
const saveMyLists = (v) => ls.set('anitr_my_lists', v);

const _libState = {
    tab: 'lists',          // 'lists' | 'favorites' | 'history' | 'watchlist'
    detailId: null,        // aktif özel liste ID'si
    query: '',             // arama metni
    sort: {
        lists: 'updated',  // 'updated' | 'az' | 'count'
        favorites: 'default', // 'default' | 'az' | 'za'
        history: 'newest', // 'newest' | 'oldest' | 'progress' | 'az'
        watchlist: 'default', // 'default' | 'az' | 'za'
        detail: 'default'  // 'default' | 'az' | 'za'
    },
    subfilter: {
        favorites: 'all',  // 'all' | 'tv' | 'movie'
        watchlist: 'all',  // 'all' | 'tv' | 'movie'
        detail: 'all',     // 'all' | 'tv' | 'movie'
        history: 'all'     // 'all' | 'inprogress' | 'completed'
    },
    viewMode: localStorage.getItem('anitr_lib_viewmode') || 'grid', // 'grid' | 'rows'
    createOpen: false,
    newTag: 'Genel',
    quickAddOpen: false,
    renamingId: null
};

function _libEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _libRelDate(ts) {
    if (!ts) return 'Bilinmiyor';
    const d = new Date(ts), now = new Date();
    const diffSec = Math.max(0, Math.floor((now - d) / 1000));
    if (diffSec < 60) return 'Az önce';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + ' dk önce';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + ' sa önce';
    if (diffSec < 172800) return 'Dün';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function _libDayBucket(ts) {
    if (!ts) return 'Daha Eski';
    const d = new Date(ts), now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startItem  = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startToday - startItem) / 86400000);
    if (diffDays <= 0) return 'Bugün';
    if (diffDays === 1) return 'Dün';
    if (diffDays <= 7) return 'Son 7 Gün';
    return 'Daha Eski';
}

function _activateLibraryPage() {
    if (typeof closeNavDrawer === 'function') { try { closeNavDrawer(); } catch (_) {} }
    if (typeof closePgModal === 'function') { try { closePgModal(); } catch (_) {} }
    if (typeof statsModal !== 'undefined' && statsModal) statsModal.classList.add('hidden');

    const hv = document.getElementById('historyView');
    const wasHidden = !hv || hv.classList.contains('hidden');

    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');
    if (typeof leaveW2GRoom === 'function') leaveW2GRoom();
    if (typeof clearProfileCurrentAnime === 'function') clearProfileCurrentAnime();
    if (typeof setAmbientBackground === 'function') setAmbientBackground(null);

    if (typeof homeView !== 'undefined' && homeView) homeView.classList.add('hidden');
    if (typeof animeListView !== 'undefined' && animeListView) animeListView.classList.add('hidden');
    if (typeof watchView !== 'undefined' && watchView) watchView.classList.add('hidden');
    if (typeof malView !== 'undefined' && malView) malView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    const nv = document.getElementById('newsView'); if (nv) nv.classList.add('hidden');
    const stv = document.getElementById('statsView'); if (stv) stv.classList.add('hidden');

    if (hv) hv.classList.remove('hidden');
    if (window.setAnavActive) setAnavActive('library');
    if (wasHidden) window.scrollTo({ top: 0, behavior: 'smooth' });

    if (typeof vjsPlayer !== 'undefined' && vjsPlayer) {
        try { vjsPlayer.dispose(); } catch (e) {}
        vjsPlayer = null;
    }
}

function _moveLibTabInk() {
    const wrap = document.getElementById('libTabs');
    const ink = document.getElementById('libTabInk');
    if (!wrap || !ink) return;
    const act = wrap.querySelector('.lib-tab-btn.active');
    if (!act || !act.offsetWidth) return;
    ink.style.width = act.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + (act.offsetLeft - 3) + 'px)';
}

window.addEventListener('resize', _moveLibTabInk);

function showMyLists() {
    _libState.tab = 'lists';
    _libState.detailId = null;
    _libState.query = '';
    _activateLibraryPage();
    renderLibraryPage(false);
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    if (document.querySelectorAll('.mobile-nav-btn')[2]) document.querySelectorAll('.mobile-nav-btn')[2].classList.add('active');
}

function showListDetail(id) {
    _libState.tab = 'lists';
    _libState.detailId = id;
    _libState.query = '';
    _libState.quickAddOpen = false;
    _activateLibraryPage();
    renderLibraryPage(true);
}

function showFavorites() {
    _libState.tab = 'favorites';
    _libState.detailId = null;
    _libState.query = '';
    _activateLibraryPage();
    renderLibraryPage(false);
    document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
    if (document.querySelectorAll('.mobile-nav-btn')[3]) document.querySelectorAll('.mobile-nav-btn')[3].classList.add('active');
}

function showHistory() {
    _libState.tab = 'history';
    _libState.detailId = null;
    _libState.query = '';
    _activateLibraryPage();
    renderLibraryPage(false);
}

function showWatchlist() {
    _libState.tab = 'watchlist';
    _libState.detailId = null;
    _libState.query = '';
    _activateLibraryPage();
    renderLibraryPage(false);
}

window.libSwitchTab = function(tab) {
    if (!['lists', 'favorites', 'history', 'watchlist'].includes(tab)) return;
    _libState.tab = tab;
    _libState.detailId = null;
    _libState.query = '';
    _libState.createOpen = false;
    _libState.quickAddOpen = false;
    _libState.renamingId = null;
    renderLibraryPage(true);
};

window.libSetViewMode = function(mode) {
    if (mode !== 'grid' && mode !== 'rows') return;
    _libState.viewMode = mode;
    try { localStorage.setItem('anitr_lib_viewmode', mode); } catch (_) {}
    renderLibraryPage(true);
};

window.libSetSubfilter = function(key, val) {
    _libState.subfilter[key] = val;
    renderLibraryPage(true);
};

window.libSetSort = function(key, val) {
    _libState.sort[key] = val;
    renderLibraryPage(true);
};

window.libOnSearch = function(val) {
    _libState.query = String(val || '');
    renderLibraryPage(true, true);
};

window.libToggleCreate = function(force) {
    _libState.createOpen = typeof force === 'boolean' ? force : !_libState.createOpen;
    renderLibraryPage(true);
    if (_libState.createOpen) {
        setTimeout(() => { const inp = document.getElementById('libInlineListName'); if (inp) inp.focus(); }, 40);
    }
};

window.libSetNewTag = function(tag) {
    _libState.newTag = tag;
    document.querySelectorAll('.lib-tag-opt').forEach(b => b.classList.toggle('active', b.dataset.tag === tag));
};

window.libCreateQuickList = function(presetName, presetTag) {
    const inp = document.getElementById('libInlineListName');
    const name = (presetName || (inp ? inp.value : '') || '').trim();
    if (!name) {
        if (inp) { inp.focus(); }
        showToast('⚠️ Lütfen bir liste adı girin.');
        return;
    }
    const lists = getMyLists();
    const newId = generateListId();
    lists.unshift({
        id: newId,
        name: name.slice(0, 45),
        tag: presetTag || _libState.newTag || 'Genel',
        animes: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    saveMyLists(lists);
    _libState.createOpen = false;
    renderLibraryPage(true);
    showToast(`✅ "${name}" listesi oluşturuldu!`);
};

window.libStartRename = function(id, e) {
    if (e) e.stopPropagation();
    _libState.renamingId = id;
    renderLibraryPage(true);
    setTimeout(() => {
        const inp = document.getElementById('libRenameInput_' + id);
        if (inp) { inp.focus(); inp.select(); }
    }, 40);
};

window.libSaveRename = function(id, e) {
    if (e) e.stopPropagation();
    const inp = document.getElementById('libRenameInput_' + id);
    const val = (inp ? inp.value : '').trim();
    if (!val) { _libState.renamingId = null; renderLibraryPage(true); return; }
    const lists = getMyLists();
    const lst = lists.find(l => l.id === id);
    if (lst) {
        lst.name = val.slice(0, 45);
        lst.updatedAt = Date.now();
        saveMyLists(lists);
        showToast('✅ Liste adı güncellendi.');
    }
    _libState.renamingId = null;
    renderLibraryPage(true);
};

window.libDeleteList = function(id, e) {
    if (e) e.stopPropagation();
    const lists = getMyLists();
    const idx = lists.findIndex(l => l.id === id);
    if (idx === -1) return;
    const removed = lists[idx];
    lists.splice(idx, 1);
    saveMyLists(lists);
    if (_libState.detailId === id) _libState.detailId = null;
    renderLibraryPage(true);
    showToast(`🗑️ "${removed.name}" listesi silindi.`, 4800, {
        action: {
            label: 'Geri Al',
            icon: 'fa-rotate-left',
            onClick: function() {
                const cur = getMyLists();
                cur.splice(Math.min(idx, cur.length), 0, removed);
                saveMyLists(cur);
                renderLibraryPage(true);
                showToast(`✅ "${removed.name}" geri yüklendi.`);
            }
        }
    });
};

window.libToggleQuickAdd = function() {
    _libState.quickAddOpen = !_libState.quickAddOpen;
    renderLibraryPage(true);
};

window.libQuickAddAnimeToList = function(listId, encJson) {
    try {
        const anime = JSON.parse(decodeURIComponent(encJson));
        const lists = getMyLists();
        const lst = lists.find(l => l.id === listId);
        if (!lst) return;
        lst.animes = lst.animes || [];
        if (lst.animes.some(a => String(a.id) === String(anime.id))) {
            showToast('💡 Bu anime zaten listede bulunuyor.');
            return;
        }
        lst.animes.push({
            id: anime.id,
            title: anime.title,
            img: anime.img,
            slug: anime.slug || '',
            isMovie: !!anime.isMovie
        });
        lst.updatedAt = Date.now();
        saveMyLists(lists);
        renderLibraryPage(true);
        showToast(`✅ "${anime.title}" listeye eklendi!`);
    } catch (_) {}
};

window.removeAnimeFromList = function(listId, animeId, e) {
    if (e) e.stopPropagation();
    const lists = getMyLists();
    const lst = lists.find(l => l.id === listId);
    if (!lst || !lst.animes) return;
    const idx = lst.animes.findIndex(a => String(a.id) === String(animeId));
    if (idx === -1) return;
    const removed = lst.animes[idx];
    lst.animes.splice(idx, 1);
    lst.updatedAt = Date.now();
    saveMyLists(lists);
    renderLibraryPage(true);
    showToast(`🗑️ "${removed.title || 'Anime'}" listeden çıkarıldı.`, 4500, {
        action: {
            label: 'Geri Al',
            icon: 'fa-rotate-left',
            onClick: function() {
                const curLists = getMyLists();
                const target = curLists.find(l => l.id === listId);
                if (target) {
                    target.animes = target.animes || [];
                    target.animes.splice(Math.min(idx, target.animes.length), 0, removed);
                    target.updatedAt = Date.now();
                    saveMyLists(curLists);
                    renderLibraryPage(true);
                    showToast(`✅ "${removed.title}" tekrar listeye eklendi.`);
                }
            }
        }
    });
};

window.libRemoveFavorite = function(id, e) {
    if (e) e.stopPropagation();
    const favs = getFavorites();
    const idx = favs.findIndex(a => String(a.id) === String(id));
    if (idx === -1) return;
    const removed = favs[idx];
    favs.splice(idx, 1);
    saveFavorites(favs);
    renderLibraryPage(true);
    showToast(`🗑️ "${removed.title || 'Anime'}" favorilerden çıkarıldı.`, 4500, {
        action: {
            label: 'Geri Al',
            icon: 'fa-rotate-left',
            onClick: function() {
                const cur = getFavorites();
                cur.splice(Math.min(idx, cur.length), 0, removed);
                saveFavorites(cur);
                renderLibraryPage(true);
                showToast(`✅ "${removed.title}" favorilere geri eklendi.`);
            }
        }
    });
};

window.libRemoveWatchlist = function(id, e) {
    if (e) e.stopPropagation();
    const wl = getWatchlist();
    const idx = wl.findIndex(a => String(a.id) === String(id));
    if (idx === -1) return;
    const removed = wl[idx];
    wl.splice(idx, 1);
    saveWatchlist(wl);
    renderLibraryPage(true);
    showToast(`🗑️ "${removed.title || 'Anime'}" izleme listesinden çıkarıldı.`, 4500, {
        action: {
            label: 'Geri Al',
            icon: 'fa-rotate-left',
            onClick: function() {
                const cur = getWatchlist();
                cur.splice(Math.min(idx, cur.length), 0, removed);
                saveWatchlist(cur);
                renderLibraryPage(true);
                showToast(`✅ "${removed.title}" izleme listesine geri eklendi.`);
            }
        }
    });
};

window.libRemoveHistoryItem = function(id, e) {
    if (e) e.stopPropagation();
    const hist = getHistory();
    const idx = hist.findIndex(h => String(h.id) === String(id));
    if (idx === -1) return;
    const removed = hist[idx];
    hist.splice(idx, 1);
    saveHistory(hist);
    if (typeof renderContinueWatching === 'function') renderContinueWatching();
    renderLibraryPage(true);
    showToast(`🗑️ "${removed.title || 'Kayıt'}" geçmişten silindi.`, 4500, {
        action: {
            label: 'Geri Al',
            icon: 'fa-rotate-left',
            onClick: function() {
                const cur = getHistory();
                cur.splice(Math.min(idx, cur.length), 0, removed);
                saveHistory(cur);
                if (typeof renderContinueWatching === 'function') renderContinueWatching();
                renderLibraryPage(true);
                showToast(`✅ "${removed.title}" geçmişe geri yüklendi.`);
            }
        }
    });
};

window.libPickRandom = function(source) {
    let pool = [];
    if (source === 'favorites') pool = getFavorites();
    else if (source === 'watchlist') pool = getWatchlist();
    else if (source === 'detail' && _libState.detailId) {
        const lst = getMyLists().find(l => l.id === _libState.detailId);
        pool = (lst && lst.animes) ? lst.animes : [];
    }
    if (!pool.length) {
        showToast('⚠️ Seçim yapılacak anime bulunamadı.');
        return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    showToast(`🎲 "${pick.title}" açılıyor...`);
    loadDetails(pick.id || '', pick.slug || '', !!pick.isMovie, pick.title || '', '', pick.img || '');
};

window.libExportAll = function() {
    const payload = {
        exportedAt: new Date().toISOString(),
        myLists: getMyLists(),
        favorites: getFavorites(),
        watchlist: getWatchlist(),
        history: getHistory()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'anitr-kutuphane-yedek.json';
    a.click();
    showToast('💾 Kütüphane yedeği indirildi.');
};

window.libImportAll = function() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (!data || typeof data !== 'object') throw new Error('Invalid');
                if (Array.isArray(data.myLists)) saveMyLists(data.myLists);
                if (Array.isArray(data.favorites)) saveFavorites(data.favorites);
                if (Array.isArray(data.watchlist)) saveWatchlist(data.watchlist);
                if (Array.isArray(data.history)) {
                    saveHistory(data.history);
                    if (typeof renderContinueWatching === 'function') renderContinueWatching();
                }
                renderLibraryPage(true);
                showToast('✅ Kütüphane yedeği başarıyla geri yüklendi.');
            } catch (_) {
                showToast('❌ Geçersiz yedek dosyası.');
            }
        };
        r.readAsText(f);
    };
    inp.click();
};

window.sortWatchlist = function(mode) { _libState.sort.watchlist = mode; renderLibraryPage(true); };
window.sortFavorites = function(mode) { _libState.sort.favorites = mode; renderLibraryPage(true); };
window.sortMyLists   = function(mode) { _libState.sort.lists = mode; renderLibraryPage(true); };

function _buildAnimeGridCard(a, idx, removeFnCall, extraBadgeHtml) {
    const id = _libEsc(a.id || '');
    const slug = _libEsc(a.slug || '');
    const title = _libEsc(a.title || 'Bilinmiyor');
    const jsTitle = String(a.title || 'Bilinmiyor').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const jsSlug  = String(a.slug || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const img = _libEsc(a.img || 'https://placehold.co/240x360/0f0f1a/8b5cf6?text=?');
    const jsImg   = String(a.img || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const isMovie = !!(a.isMovie);

    return `
    <article class="lib-anime-card" onclick="loadDetails('${id}','${jsSlug}',${isMovie},'${jsTitle}','','${jsImg}')">
        <div class="lib-poster-wrap">
            <img class="lib-poster" src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/240x360/0f0f1a/8b5cf6?text=?'">
            <span class="lib-card-idx">${String(idx + 1).padStart(2, '0')}</span>
            ${extraBadgeHtml || `<span class="lib-card-tag">${isMovie ? 'Film' : 'Dizi'}</span>`}
            <div class="lib-poster-overlay">
                <button type="button" class="lib-ov-btn primary" title="Hızlı Oynat" onclick="event.stopPropagation();quickPlay('${id}','${jsSlug}',${isMovie},'${jsTitle}','','${jsImg}')">
                    <i class="fa-solid fa-play"></i>
                </button>
                <button type="button" class="lib-ov-btn" title="Özel Listeye Ekle" onclick="event.stopPropagation();openAddToListModal({id:'${id}',title:'${jsTitle}',img:'${jsImg}',slug:'${jsSlug}',isMovie:${isMovie}})">
                    <i class="fa-solid fa-plus"></i>
                </button>
                ${removeFnCall ? `<button type="button" class="lib-ov-btn danger" title="Kaldır" onclick="${removeFnCall}">
                    <i class="fa-solid fa-xmark"></i>
                </button>` : ''}
            </div>
        </div>
        <div class="lib-card-meta">
            <h4 class="lib-card-title" title="${title}">${title}</h4>
            <p class="lib-card-sub">${a.subLabel ? _libEsc(a.subLabel) : (isMovie ? 'Sinema Filmi' : 'Anime Serisi')}</p>
        </div>
    </article>`;
}

function _buildAnimeEditorialRow(a, idx, removeFnCall, rightMetaHtml, primaryBtnHtml) {
    const id = _libEsc(a.id || '');
    const title = _libEsc(a.title || 'Bilinmiyor');
    const jsTitle = String(a.title || 'Bilinmiyor').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const jsSlug  = String(a.slug || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const img = _libEsc(a.img || 'https://placehold.co/120x170/0f0f1a/8b5cf6?text=?');
    const jsImg   = String(a.img || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const isMovie = !!(a.isMovie);

    return `
    <div class="lib-row" onclick="loadDetails('${id}','${jsSlug}',${isMovie},'${jsTitle}','','${jsImg}')">
        <span class="lib-row-idx">${String(idx + 1).padStart(2, '0')}</span>
        <img class="lib-row-poster" src="${img}" alt="" loading="lazy" onerror="this.src='https://placehold.co/120x170/0f0f1a/8b5cf6?text=?'">
        <div class="lib-row-main">
            <strong class="lib-row-title">${title}</strong>
            <span class="lib-row-sub">${a.subLabel ? _libEsc(a.subLabel) : (isMovie ? 'Film' : 'Anime Serisi')}</span>
        </div>
        <div class="lib-row-meta">${rightMetaHtml || `<span class="lib-pill">${isMovie ? 'Film' : 'Dizi'}</span>`}</div>
        <div class="lib-row-actions" onclick="event.stopPropagation()">
            ${primaryBtnHtml || `<button type="button" class="lib-icon-btn" title="Hızlı Oynat" onclick="quickPlay('${id}','${jsSlug}',${isMovie},'${jsTitle}','','${jsImg}')"><i class="fa-solid fa-play"></i></button>`}
            <button type="button" class="lib-icon-btn" title="Özel Listeye Ekle" onclick="openAddToListModal({id:'${id}',title:'${jsTitle}',img:'${jsImg}',slug:'${jsSlug}',isMovie:${isMovie}})"><i class="fa-solid fa-plus"></i></button>
            ${removeFnCall ? `<button type="button" class="lib-icon-btn danger" title="Kaldır" onclick="${removeFnCall}"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>
    </div>`;
}

function renderLibraryPage(isSoftUpdate, preserveInputFocus) {
    const host = document.getElementById('libraryBody');
    if (!host) return;

    const lists = getMyLists();
    const favs  = getFavorites();
    const hist  = getHistory();
    const wl    = getWatchlist();
    const positions = (typeof getPositions === 'function') ? getPositions() : {};

    const tab = _libState.tab;
    const q = (_libState.query || '').trim().toLowerCase();
    const activeList = (tab === 'lists' && _libState.detailId) ? lists.find(l => l.id === _libState.detailId) : null;
    if (tab === 'lists' && _libState.detailId && !activeList) {
        _libState.detailId = null;
    }

    // Başlık & Alt Başlık
    let pageTitle = 'Listelerim';
    let pageSub = `<b>${lists.length}</b> özel liste · <b>${favs.length}</b> favori · <b>${hist.length}</b> geçmiş kaydı · <b>${wl.length}</b> izleme listesi`;
    if (activeList) {
        pageTitle = activeList.name || 'İsimsiz Liste';
        pageSub = `<b>${(activeList.animes || []).length}</b> anime · Kategori: <b>${_libEsc(activeList.tag || 'Genel')}</b> · Son güncelleme: <b>${_libRelDate(activeList.updatedAt || activeList.createdAt)}</b>`;
    } else if (tab === 'favorites') {
        pageTitle = 'Favorilerim';
        pageSub = `Beğendiğin ve öne çıkardığın <b>${favs.length}</b> anime serisi ve film`;
    } else if (tab === 'history') {
        pageTitle = 'İzleme Geçmişi';
        pageSub = `Son izlediğin bölümler, kaldığın dakikalar ve ilerleme durumun (<b>${hist.length}</b> kayıt)`;
    } else if (tab === 'watchlist') {
        pageTitle = 'İzleme Listesi';
        pageSub = `Daha sonra izlemek üzere kaydettiğin <b>${wl.length}</b> anime`;
    }

    // Sağ üst aksiyon butonları
    let topActionsHtml = '';
    if (activeList) {
        topActionsHtml = `
            <button type="button" class="lib-btn" onclick="showMyLists()"><i class="fa-solid fa-arrow-left"></i><span>Tüm Listeler</span></button>
            <button type="button" class="lib-btn primary" onclick="libToggleQuickAdd()"><i class="fa-solid fa-plus"></i><span>Hızlı Anime Ekle</span></button>
            ${(activeList.animes || []).length > 1 ? `<button type="button" class="lib-btn" onclick="libPickRandom('detail')"><i class="fa-solid fa-shuffle"></i><span>Rastgele</span></button>` : ''}
            <button type="button" class="lib-btn danger" onclick="libDeleteList('${activeList.id}', event)"><i class="fa-regular fa-trash-can"></i><span>Listeyi Sil</span></button>
        `;
    } else if (tab === 'lists') {
        topActionsHtml = `
            <button type="button" class="lib-btn primary" onclick="libToggleCreate()"><i class="fa-solid fa-plus"></i><span>Yeni Liste</span></button>
            <button type="button" class="lib-btn" onclick="libExportAll()" title="Tüm kütüphaneyi JSON olarak yedekle"><i class="fa-solid fa-arrow-down-to-bracket"></i><span>Yedekle</span></button>
            <button type="button" class="lib-btn" onclick="libImportAll()" title="JSON yedeğini geri yükle"><i class="fa-solid fa-arrow-up-from-bracket"></i><span>İçe Aktar</span></button>
        `;
    } else if (tab === 'favorites') {
        topActionsHtml = `
            ${favs.length > 1 ? `<button type="button" class="lib-btn" onclick="libPickRandom('favorites')"><i class="fa-solid fa-shuffle"></i><span>Rastgele Seç</span></button>` : ''}
            ${favs.length > 0 ? `<button type="button" class="lib-btn danger" onclick="if(confirm('Tüm favoriler temizlensin mi?')){saveFavorites([]);renderLibraryPage(true);}"><i class="fa-regular fa-trash-can"></i><span>Temizle</span></button>` : ''}
        `;
    } else if (tab === 'history') {
        topActionsHtml = `
            ${hist.length > 0 ? `<button type="button" class="lib-btn primary" onclick="resumeWatch('${_libEsc(hist[0].id)}')"><i class="fa-solid fa-play"></i><span>Son Bölüme Devam Et</span></button>` : ''}
            ${hist.length > 0 ? `<button type="button" class="lib-btn danger" onclick="if(confirm('Tüm izleme geçmişi temizlensin mi?')){saveHistory([]);if(typeof renderContinueWatching==='function')renderContinueWatching();renderLibraryPage(true);}"><i class="fa-regular fa-trash-can"></i><span>Geçmişi Temizle</span></button>` : ''}
        `;
    } else if (tab === 'watchlist') {
        topActionsHtml = `
            ${wl.length > 1 ? `<button type="button" class="lib-btn" onclick="libPickRandom('watchlist')"><i class="fa-solid fa-shuffle"></i><span>Rastgele Seç</span></button>` : ''}
            ${wl.length > 0 ? `<button type="button" class="lib-btn danger" onclick="if(confirm('İzleme listesi tamamen temizlensin mi?')){saveWatchlist([]);renderLibraryPage(true);}"><i class="fa-regular fa-trash-can"></i><span>Temizle</span></button>` : ''}
        `;
    }

    // Araç çubuğu sağ kontroller (Alt filtre + Sıralama + Görünüm modu)
    let toolbarRightHtml = '';
    const viewToggleHtml = `
        <div class="cat-density" role="group" aria-label="Görünüm Modu">
            <button type="button" class="${_libState.viewMode === 'grid' ? 'active' : ''}" onclick="libSetViewMode('grid')" title="Poster Izgara Görünümü">
                <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg>
            </button>
            <button type="button" class="${_libState.viewMode === 'rows' ? 'active' : ''}" onclick="libSetViewMode('rows')" title="Editoryal Satır Görünümü">
                <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/><rect x="1" y="11.5" width="14" height="2.5" rx="1"/></svg>
            </button>
        </div>`;

    if (tab === 'lists' && !activeList) {
        const sVal = _libState.sort.lists;
        toolbarRightHtml = `
            <select class="cat-select" onchange="libSetSort('lists', this.value)" aria-label="Liste Sıralaması">
                <option value="updated" ${sVal === 'updated' ? 'selected' : ''}>Son Güncellenen</option>
                <option value="count" ${sVal === 'count' ? 'selected' : ''}>Anime Sayısı</option>
                <option value="az" ${sVal === 'az' ? 'selected' : ''}>A → Z Sırala</option>
            </select>
            ${viewToggleHtml}
        `;
    } else if (tab === 'history') {
        const sf = _libState.subfilter.history;
        const sVal = _libState.sort.history;
        toolbarRightHtml = `
            <div class="lib-subpills">
                <button type="button" class="${sf === 'all' ? 'active' : ''}" onclick="libSetSubfilter('history','all')">Tümü</button>
                <button type="button" class="${sf === 'inprogress' ? 'active' : ''}" onclick="libSetSubfilter('history','inprogress')">Devam Edenler</button>
                <button type="button" class="${sf === 'completed' ? 'active' : ''}" onclick="libSetSubfilter('history','completed')">Tamamlananlar</button>
            </div>
            <select class="cat-select" onchange="libSetSort('history', this.value)" aria-label="Geçmiş Sıralaması">
                <option value="newest" ${sVal === 'newest' ? 'selected' : ''}>En Yeni</option>
                <option value="oldest" ${sVal === 'oldest' ? 'selected' : ''}>En Eski</option>
                <option value="progress" ${sVal === 'progress' ? 'selected' : ''}>İlerleme (%)</option>
                <option value="az" ${sVal === 'az' ? 'selected' : ''}>A → Z</option>
            </select>
            ${viewToggleHtml}
        `;
    } else {
        const key = activeList ? 'detail' : tab;
        const sf = _libState.subfilter[key] || 'all';
        const sVal = _libState.sort[key] || 'default';
        toolbarRightHtml = `
            <div class="lib-subpills">
                <button type="button" class="${sf === 'all' ? 'active' : ''}" onclick="libSetSubfilter('${key}','all')">Tümü</button>
                <button type="button" class="${sf === 'tv' ? 'active' : ''}" onclick="libSetSubfilter('${key}','tv')">Dizi</button>
                <button type="button" class="${sf === 'movie' ? 'active' : ''}" onclick="libSetSubfilter('${key}','movie')">Film</button>
            </div>
            <select class="cat-select" onchange="libSetSort('${key}', this.value)" aria-label="Sıralama">
                <option value="default" ${sVal === 'default' ? 'selected' : ''}>Eklenme Sırası</option>
                <option value="az" ${sVal === 'az' ? 'selected' : ''}>A → Z</option>
                <option value="za" ${sVal === 'za' ? 'selected' : ''}>Z → A</option>
            </select>
            ${viewToggleHtml}
        `;
    }

    // ANA İÇERİK OLUŞTURMA
    let bodyHtml = '';

    // 1. ÖZEL LİSTE DETAY GÖRÜNÜMÜ
    if (activeList) {
        let items = [...(activeList.animes || [])];
        const sf = _libState.subfilter.detail;
        if (sf === 'tv') items = items.filter(a => !a.isMovie);
        else if (sf === 'movie') items = items.filter(a => !!a.isMovie);
        if (q) items = items.filter(a => (a.title || '').toLowerCase().includes(q));
        if (_libState.sort.detail === 'az') items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        else if (_libState.sort.detail === 'za') items.sort((a, b) => (b.title || '').localeCompare(a.title || ''));

        // Hızlı Anime Ekleme Havuzu (Favoriler + İzleme Listesi + Geçmiş)
        let quickPoolHtml = '';
        if (_libState.quickAddOpen) {
            const existingIds = new Set((activeList.animes || []).map(a => String(a.id)));
            const poolMap = new Map();
            [...favs, ...wl, ...hist].forEach(item => {
                if (item && item.id && item.title && !existingIds.has(String(item.id)) && !poolMap.has(String(item.id))) {
                    poolMap.set(String(item.id), item);
                }
            });
            const candidates = Array.from(poolMap.values()).slice(0, 12);
            quickPoolHtml = `
            <div class="lib-quickadd-drawer">
                <div class="lib-qa-head">
                    <div>
                        <span class="lib-qa-kicker">KOLEKSİYONDAN HIZLI EKLE</span>
                        <h4>Favori, İzleme Listesi veya Geçmişindeki Animeleri Bu Listeye Ekle</h4>
                    </div>
                    <button type="button" class="lib-icon-btn" onclick="libToggleQuickAdd()"><i class="fa-solid fa-xmark"></i></button>
                </div>
                ${candidates.length ? `
                <div class="lib-qa-grid">
                    ${candidates.map(c => {
                        const enc = encodeURIComponent(JSON.stringify({ id: c.id, title: c.title, img: c.img || '', slug: c.slug || '', isMovie: !!c.isMovie }));
                        return `
                        <div class="lib-qa-item">
                            <img src="${_libEsc(c.img || 'https://placehold.co/80x110/0f0f1a/8b5cf6?text=?')}" alt="" loading="lazy">
                            <span>${_libEsc(c.title)}</span>
                            <button type="button" onclick="libQuickAddAnimeToList('${activeList.id}','${enc}')"><i class="fa-solid fa-plus"></i> Ekle</button>
                        </div>`;
                    }).join('')}
                </div>` : `<p class="lib-qa-empty">Kütüphanendeki tüm animeler zaten bu listede yer alıyor veya henüz favori/geçmiş kaydın yok.</p>`}
            </div>`;
        }

        if (!items.length) {
            bodyHtml = quickPoolHtml + `
            <div class="lib-empty">
                <span class="lib-empty-code">00 / BOŞ LİSTE</span>
                <h3>${q ? 'Aramana uygun anime bulunamadı' : 'Bu listede henüz anime yok'}</h3>
                <p>${q ? 'Farklı bir anahtar kelimeyle tekrar deneyebilirsin.' : 'Üstteki "Hızlı Anime Ekle" butonuyla mevcut kütüphanenden veya katalogdaki kartlardan bu listeye anime ekleyebilirsin.'}</p>
                <div class="lib-empty-actions">
                    ${!_libState.quickAddOpen ? `<button type="button" class="lib-btn primary" onclick="libToggleQuickAdd()"><i class="fa-solid fa-plus"></i> Hızlı Anime Ekle</button>` : ''}
                    <button type="button" class="lib-btn" onclick="showAnimeListView();setAnavActive('anime')">Kataloğa Göz At →</button>
                </div>
            </div>`;
        } else if (_libState.viewMode === 'rows') {
            bodyHtml = quickPoolHtml + `<div class="lib-rows-wrap">${items.map((a, i) =>
                _buildAnimeEditorialRow(a, i, `removeAnimeFromList('${activeList.id}','${_libEsc(a.id)}',event)`)
            ).join('')}</div>`;
        } else {
            bodyHtml = quickPoolHtml + `<div class="lib-grid">${items.map((a, i) =>
                _buildAnimeGridCard(a, i, `removeAnimeFromList('${activeList.id}','${_libEsc(a.id)}',event)`)
            ).join('')}</div>`;
        }
    }

    // 2. LİSTELERİM GENEL BAKIŞ
    else if (tab === 'lists') {
        let filteredLists = [...lists];
        if (q) {
            filteredLists = filteredLists.filter(l =>
                (l.name || '').toLowerCase().includes(q) ||
                (l.tag || '').toLowerCase().includes(q) ||
                (l.animes || []).some(a => (a.title || '').toLowerCase().includes(q))
            );
        }
        const sMode = _libState.sort.lists;
        if (sMode === 'az') filteredLists.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        else if (sMode === 'count') filteredLists.sort((a, b) => (b.animes || []).length - (a.animes || []).length);
        else filteredLists.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

        const tags = ['Genel', 'Sezonluk', 'Maraton', 'Başyapıtlar', 'Film Gecesi'];
        const createDrawerHtml = _libState.createOpen ? `
        <div class="lib-create-panel">
            <div class="lib-cp-top">
                <div>
                    <span class="lib-qa-kicker">YENİ KOLEKSİYON</span>
                    <h4>Özel Liste Oluştur</h4>
                </div>
                <button type="button" class="lib-icon-btn" onclick="libToggleCreate(false)"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="lib-cp-form">
                <input id="libInlineListName" type="text" class="lib-cp-input" maxlength="45" placeholder="Liste adı (ör. 2026 Kış Favorileri, En İyi Bilim Kurgu...)" onkeydown="if(event.key==='Enter')libCreateQuickList()">
                <div class="lib-cp-tags">
                    ${tags.map(t => `<button type="button" class="lib-tag-opt${_libState.newTag === t ? ' active' : ''}" data-tag="${t}" onclick="libSetNewTag('${t}')">${t}</button>`).join('')}
                </div>
                <button type="button" class="lib-btn primary" onclick="libCreateQuickList()"><i class="fa-solid fa-check"></i><span>Oluştur</span></button>
            </div>
            <div class="lib-cp-presets">
                <span>Hızlı Şablonlar:</span>
                <button type="button" onclick="libCreateQuickList('Başyapıt Seriler','Başyapıtlar')">+ Başyapıt Seriler</button>
                <button type="button" onclick="libCreateQuickList('Hafta Sonu Maratonu','Maraton')">+ Hafta Sonu Maratonu</button>
                <button type="button" onclick="libCreateQuickList('İzlenecek Anime Filmleri','Film Gecesi')">+ İzlenecek Anime Filmleri</button>
                <button type="button" onclick="libCreateQuickList('2026 Sezon Takibi','Sezonluk')">+ 2026 Sezon Takibi</button>
            </div>
        </div>` : '';

        if (!filteredLists.length) {
            bodyHtml = createDrawerHtml + `
            <div class="lib-empty">
                <span class="lib-empty-code">00 / KOLEKSİYON YOK</span>
                <h3>${q ? 'Aramana uygun özel liste bulunamadı' : 'Henüz özel bir liste oluşturmadın'}</h3>
                <p>${q ? 'Arama filtresini temizleyerek tüm listelerini görebilirsin.' : 'Kendi izleme koleksiyonlarını, favori seçkilerini veya film listelerini oluşturup düzenleyebilirsin.'}</p>
                <div class="lib-empty-actions">
                    <button type="button" class="lib-btn primary" onclick="libToggleCreate(true)"><i class="fa-solid fa-plus"></i> İlk Listeni Oluştur</button>
                </div>
            </div>`;
        } else if (_libState.viewMode === 'rows') {
            bodyHtml = createDrawerHtml + `
            <div class="lib-rows-wrap">
                ${filteredLists.map((lst, idx) => {
                    const count = (lst.animes || []).length;
                    const firstImg = (lst.animes && lst.animes[0] && lst.animes[0].img) ? lst.animes[0].img : '';
                    const isRenaming = _libState.renamingId === lst.id;
                    const previewNames = (lst.animes || []).slice(0, 3).map(a => a.title).join(', ') || 'Henüz içerik eklenmedi';
                    return `
                    <div class="lib-row" onclick="showListDetail('${lst.id}')">
                        <span class="lib-row-idx">${String(idx + 1).padStart(2, '0')}</span>
                        ${firstImg
                            ? `<img class="lib-row-poster" src="${_libEsc(firstImg)}" alt="" loading="lazy">`
                            : `<div class="lib-row-poster is-empty"><i class="fa-solid fa-layer-group"></i></div>`}
                        <div class="lib-row-main">
                            ${isRenaming
                                ? `<div class="lib-inline-rename" onclick="event.stopPropagation()">
                                    <input id="libRenameInput_${lst.id}" type="text" value="${_libEsc(lst.name || '')}" maxlength="45" onkeydown="if(event.key==='Enter')libSaveRename('${lst.id}',event);if(event.key==='Escape'){_libState.renamingId=null;renderLibraryPage(true);}">
                                    <button type="button" class="lib-btn primary sm" onclick="libSaveRename('${lst.id}',event)">Kaydet</button>
                                   </div>`
                                : `<strong class="lib-row-title">${_libEsc(lst.name || 'İsimsiz Liste')}</strong>`}
                            <span class="lib-row-sub">${_libEsc(previewNames)}</span>
                        </div>
                        <div class="lib-row-meta">
                            <span class="lib-pill">${_libEsc(lst.tag || 'Genel')}</span>
                            <span class="lib-row-count"><b>${count}</b> anime</span>
                        </div>
                        <div class="lib-row-actions" onclick="event.stopPropagation()">
                            <button type="button" class="lib-icon-btn" title="Adı Düzenle" onclick="libStartRename('${lst.id}',event)"><i class="fa-solid fa-pen"></i></button>
                            <button type="button" class="lib-icon-btn danger" title="Listeyi Sil" onclick="libDeleteList('${lst.id}',event)"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
        } else {
            bodyHtml = createDrawerHtml + `
            <div class="lib-lists-grid">
                ${filteredLists.map((lst, idx) => {
                    const animes = lst.animes || [];
                    const count = animes.length;
                    const slots = [0, 1, 2, 3].map(i => animes[i] ? animes[i].img : '');
                    const isRenaming = _libState.renamingId === lst.id;
                    const previewNames = animes.slice(0, 3).map(a => a.title).join(' · ') || 'Bu listede henüz anime yok';
                    return `
                    <article class="lib-list-card" onclick="showListDetail('${lst.id}')">
                        <div class="lib-lc-top">
                            <span class="lib-lc-idx">${String(idx + 1).padStart(2, '0')} / ${_libEsc((lst.tag || 'GENEL').toUpperCase())}</span>
                            <span class="lib-lc-count"><b>${count}</b> anime</span>
                        </div>
                        <div class="lib-lc-mosaic">
                            ${slots.map((src, si) => src
                                ? `<img src="${_libEsc(src)}" alt="" loading="lazy" onerror="this.style.opacity='0'">`
                                : `<div class="lib-lc-slot"><span>0${si + 1}</span></div>`
                            ).join('')}
                        </div>
                        <div class="lib-lc-body">
                            ${isRenaming
                                ? `<div class="lib-inline-rename" onclick="event.stopPropagation()">
                                    <input id="libRenameInput_${lst.id}" type="text" value="${_libEsc(lst.name || '')}" maxlength="45" onkeydown="if(event.key==='Enter')libSaveRename('${lst.id}',event);if(event.key==='Escape'){_libState.renamingId=null;renderLibraryPage(true);}">
                                    <button type="button" class="lib-btn primary sm" onclick="libSaveRename('${lst.id}',event)">Kaydet</button>
                                   </div>`
                                : `<h3 class="lib-lc-title">${_libEsc(lst.name || 'İsimsiz Liste')}</h3>`}
                            <p class="lib-lc-preview">${_libEsc(previewNames)}</p>
                        </div>
                        <div class="lib-lc-foot">
                            <span class="lib-lc-date">Güncelleme: ${_libRelDate(lst.updatedAt || lst.createdAt)}</span>
                            <div class="lib-lc-actions" onclick="event.stopPropagation()">
                                <button type="button" class="lib-icon-btn" title="Liste Adını Düzenle" onclick="libStartRename('${lst.id}',event)"><i class="fa-solid fa-pen"></i></button>
                                <button type="button" class="lib-icon-btn danger" title="Listeyi Sil" onclick="libDeleteList('${lst.id}',event)"><i class="fa-regular fa-trash-can"></i></button>
                                <span class="lib-lc-open" onclick="showListDetail('${lst.id}')">Aç →</span>
                            </div>
                        </div>
                    </article>`;
                }).join('')}
            </div>`;
        }
    }

    // 3. FAVORİLERİM VEYA İZLEME LİSTESİ
    else if (tab === 'favorites' || tab === 'watchlist') {
        const isFav = tab === 'favorites';
        let items = [...(isFav ? favs : wl)];
        const sf = _libState.subfilter[tab] || 'all';
        if (sf === 'tv') items = items.filter(a => !a.isMovie);
        else if (sf === 'movie') items = items.filter(a => !!a.isMovie);
        if (q) items = items.filter(a => (a.title || '').toLowerCase().includes(q));
        const sMode = _libState.sort[tab] || 'default';
        if (sMode === 'az') items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        else if (sMode === 'za') items.sort((a, b) => (b.title || '').localeCompare(a.title || ''));

        if (!items.length) {
            bodyHtml = `
            <div class="lib-empty">
                <span class="lib-empty-code">00 / ${isFav ? 'FAVORİ YOK' : 'LİSTE BOŞ'}</span>
                <h3>${q ? 'Aramana uygun sonuç bulunamadı' : (isFav ? 'Henüz favorilerine anime eklemedin' : 'İzleme listen şu an boş')}</h3>
                <p>${isFav
                    ? 'Anime detay sayfalarındaki kalp butonuna tıklayarak en sevdiğin serileri burada toplayabilirsin.'
                    : 'Daha sonra izlemek istediğin animeleri kartların üzerindeki yer imi ikonuyla buraya kaydedebilirsin.'}</p>
                <div class="lib-empty-actions">
                    <button type="button" class="lib-btn primary" onclick="showAnimeListView();setAnavActive('anime')">Kataloğu Keşfet →</button>
                </div>
            </div>`;
        } else if (_libState.viewMode === 'rows') {
            bodyHtml = `<div class="lib-rows-wrap">${items.map((a, i) => {
                const rmCall = isFav ? `libRemoveFavorite('${_libEsc(a.id)}',event)` : `libRemoveWatchlist('${_libEsc(a.id)}',event)`;
                return _buildAnimeEditorialRow(a, i, rmCall);
            }).join('')}</div>`;
        } else {
            bodyHtml = `<div class="lib-grid">${items.map((a, i) => {
                const rmCall = isFav ? `libRemoveFavorite('${_libEsc(a.id)}',event)` : `libRemoveWatchlist('${_libEsc(a.id)}',event)`;
                return _buildAnimeGridCard(a, i, rmCall);
            }).join('')}</div>`;
        }
    }

    // 4. İZLEME GEÇMİŞİ
    else if (tab === 'history') {
        let enriched = hist.map(h => {
            const savedSec = positions[(h.slug || h.id) + '_s' + (h.sIdx || 0) + '_e' + (h.eIdx || 0)] || 0;
            const progress = Math.min(100, Math.floor((savedSec / 1440) * 100));
            const minStr = Math.floor(savedSec / 60) + ':' + String(Math.floor(savedSec % 60)).padStart(2, '0');
            const epLabel = h.lastWatchedLabel || ('Bölüm ' + ((h.eIdx || 0) + 1));
            return Object.assign({}, h, {
                savedSec,
                progress,
                minStr,
                epLabel,
                subLabel: epLabel + (savedSec > 0 ? ` · ${minStr} (%${progress})` : '')
            });
        });

        const sf = _libState.subfilter.history;
        if (sf === 'inprogress') enriched = enriched.filter(h => h.progress > 0 && h.progress < 90);
        else if (sf === 'completed') enriched = enriched.filter(h => h.progress >= 90);

        if (q) enriched = enriched.filter(h => (h.title || '').toLowerCase().includes(q) || (h.epLabel || '').toLowerCase().includes(q));

        const sMode = _libState.sort.history;
        if (sMode === 'oldest') enriched.sort((a, b) => (a.lastWatchedAt || 0) - (b.lastWatchedAt || 0));
        else if (sMode === 'progress') enriched.sort((a, b) => b.progress - a.progress);
        else if (sMode === 'az') enriched.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        else enriched.sort((a, b) => (b.lastWatchedAt || 0) - (a.lastWatchedAt || 0));

        if (!enriched.length) {
            bodyHtml = `
            <div class="lib-empty">
                <span class="lib-empty-code">00 / GEÇMİŞ BOŞ</span>
                <h3>${q || sf !== 'all' ? 'Filtreye uygun izleme kaydı bulunamadı' : 'Henüz izleme geçmişin oluşmadı'}</h3>
                <p>Bir anime bölümü izlemeye başladığında kaldığın saniye ve bölüm bilgisi otomatik olarak buraya kaydedilir.</p>
                <div class="lib-empty-actions">
                    <button type="button" class="lib-btn primary" onclick="showAnimeListView();setAnavActive('anime')">İzlemeye Başla →</button>
                </div>
            </div>`;
        } else if (_libState.viewMode === 'grid') {
            bodyHtml = `<div class="lib-grid">${enriched.map((h, i) => {
                const badge = `<span class="lib-card-tag">${_libEsc(h.epLabel)}</span>`;
                const progBar = h.progress > 0 ? `<div class="lib-card-prog"><span style="width:${h.progress}%"></span></div>` : '';
                const id = _libEsc(h.id || '');
                const title = _libEsc(h.title || 'Bilinmiyor');
                const jsTitle = String(h.title || 'Bilinmiyor').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const jsSlug  = String(h.slug || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const img = _libEsc(h.img || 'https://placehold.co/240x360/0f0f1a/8b5cf6?text=?');
                const jsImg   = String(h.img || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const isMovie = !!(h.isMovie);
                return `
                <article class="lib-anime-card" onclick="loadDetails('${id}','${jsSlug}',${isMovie},'${jsTitle}','','${jsImg}')">
                    <div class="lib-poster-wrap">
                        <img class="lib-poster" src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/240x360/0f0f1a/8b5cf6?text=?'">
                        <span class="lib-card-idx">${String(i + 1).padStart(2, '0')}</span>
                        ${badge}
                        <div class="lib-poster-overlay">
                            <button type="button" class="lib-ov-btn primary" title="Kaldığın Yerden Devam Et" onclick="event.stopPropagation();resumeWatch('${id}')">
                                <i class="fa-solid fa-play"></i>
                            </button>
                            <button type="button" class="lib-ov-btn" title="Özel Listeye Ekle" onclick="event.stopPropagation();openAddToListModal({id:'${id}',title:'${jsTitle}',img:'${jsImg}',slug:'${jsSlug}',isMovie:${isMovie}})">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                            <button type="button" class="lib-ov-btn danger" title="Geçmişten Kaldır" onclick="libRemoveHistoryItem('${id}',event)">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        ${progBar}
                    </div>
                    <div class="lib-card-meta">
                        <h4 class="lib-card-title" title="${title}">${title}</h4>
                        <p class="lib-card-sub">${_libEsc(h.epLabel)}${h.savedSec > 0 ? ` · ${h.minStr}` : ''} · ${_libRelDate(h.lastWatchedAt)}</p>
                    </div>
                </article>`;
            }).join('')}</div>`;
        } else {
            // Kronolojik Gruplu Editoryal Satır Görünümü
            const groups = new Map();
            enriched.forEach(h => {
                const g = sMode === 'newest' ? _libDayBucket(h.lastWatchedAt) : 'Tüm Kayıtlar';
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g).push(h);
            });
            let globalIdx = 0;
            bodyHtml = Array.from(groups.entries()).map(([gName, gItems]) => `
                <div class="lib-hist-group">
                    <div class="lib-hist-ghead">
                        <span>${_libEsc(gName)}</span>
                        <small>${gItems.length} kayıt</small>
                    </div>
                    <div class="lib-rows-wrap">
                        ${gItems.map(h => {
                            const idx = globalIdx++;
                            const id = _libEsc(h.id || '');
                            const rightMeta = `
                                <div class="lib-hist-progwrap">
                                    <div class="lib-hist-progtext">
                                        <span>${_libEsc(h.epLabel)}</span>
                                        <b>${h.savedSec > 0 ? `${h.minStr} · %${h.progress}` : 'Başlandı'}</b>
                                    </div>
                                    <div class="lib-hist-progbar"><span style="width:${Math.max(4, h.progress)}%"></span></div>
                                </div>
                                <span class="lib-hist-date">${_libRelDate(h.lastWatchedAt)}</span>
                            `;
                            const playBtn = `
                                <button type="button" class="lib-resume-btn" onclick="resumeWatch('${id}')" title="Kaldığın Yerden Devam Et">
                                    <i class="fa-solid fa-play"></i><span>Devam Et</span>
                                </button>`;
                            return _buildAnimeEditorialRow(h, idx, `libRemoveHistoryItem('${id}',event)`, rightMeta, playBtn);
                        }).join('')}
                    </div>
                </div>
            `).join('');
        }
    }

    // Eğer sadece arama yapılıyorsa input odağını koru
    if (preserveInputFocus && document.getElementById('libContentMount')) {
        document.getElementById('libContentMount').innerHTML = bodyHtml;
        return;
    }

    host.innerHTML = `
    <div class="lib-shell${isSoftUpdate ? ' is-switching' : ''}">
        <!-- ÜST BAŞLIK -->
        <header class="lib-head">
            <div class="lib-head-left">
                <p class="cat-eyebrow">Kişisel Kütüphane${activeList ? ` &nbsp;/&nbsp; <button type="button" class="lib-bread-btn" onclick="showMyLists()">Listelerim</button>` : ''}</p>
                <h1 class="cat-title">${_libEsc(pageTitle)}</h1>
                <p class="cat-count">${pageSub}</p>
            </div>
            <div class="lib-head-right">
                <div class="cat-search lib-search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input id="libSearchInput" type="text" value="${_libEsc(_libState.query)}" placeholder="Koleksiyon içinde ara..." oninput="libOnSearch(this.value)">
                    <kbd class="cat-kbd">/</kbd>
                </div>
                <div class="lib-top-actions">
                    ${topActionsHtml}
                </div>
            </div>
        </header>

        <!-- ARAÇ ÇUBUĞU: SEKMELER & FİLTRELER -->
        <div class="lib-toolbar">
            <div class="lib-tabs" id="libTabs" role="tablist" aria-label="Kütüphane Bölümleri">
                <span class="lib-tabs-ink" id="libTabInk"></span>
                <button type="button" class="lib-tab-btn${tab === 'lists' ? ' active' : ''}" onclick="libSwitchTab('lists')">
                    <span>Listelerim</span><b>${lists.length}</b>
                </button>
                <button type="button" class="lib-tab-btn${tab === 'favorites' ? ' active' : ''}" onclick="libSwitchTab('favorites')">
                    <span>Favoriler</span><b>${favs.length}</b>
                </button>
                <button type="button" class="lib-tab-btn${tab === 'history' ? ' active' : ''}" onclick="libSwitchTab('history')">
                    <span>İzleme Geçmişi</span><b>${hist.length}</b>
                </button>
                <button type="button" class="lib-tab-btn${tab === 'watchlist' ? ' active' : ''}" onclick="libSwitchTab('watchlist')">
                    <span>İzleme Listesi</span><b>${wl.length}</b>
                </button>
            </div>
            <div class="lib-toolbar-right">
                ${toolbarRightHtml}
            </div>
        </div>

        <!-- İÇERİK ALANI -->
        <div id="libContentMount" class="lib-content">
            ${bodyHtml}
        </div>
    </div>`;

    requestAnimationFrame(_moveLibTabInk);
}

// "/" tuşu ile kütüphane aramasına odaklan
document.addEventListener('keydown', function(e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const hv = document.getElementById('historyView');
    if (!hv || hv.classList.contains('hidden')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    e.preventDefault();
    const inp = document.getElementById('libSearchInput');
    if (inp) inp.focus();
});

// Eski modal fonksiyonlarını yeni tam sayfa sistemle uyumlu tut
function createListModal() {
    const hv = document.getElementById('historyView');
    if (hv && !hv.classList.contains('hidden') && _libState.tab === 'lists' && !_libState.detailId) {
        libToggleCreate(true);
        return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'ml-dialog-overlay';
    overlay.innerHTML = `
        <div class="ml-dialog" id="createListDialog">
            <div class="ml-dialog-icon"><i class="fa-solid fa-layer-group"></i></div>
            <h3>Yeni Liste Oluştur</h3>
            <input class="ml-dialog-input" id="newListName" type="text" placeholder="Liste adı..."
                maxlength="45" autofocus onkeydown="if(event.key==='Enter')confirmCreateList()">
            <div class="ml-dialog-btns">
                <button class="ml-dialog-cancel" onclick="this.closest('.ml-dialog-overlay').remove()">İptal</button>
                <button class="ml-dialog-confirm" onclick="confirmCreateList()">
                    <i class="fa-solid fa-check"></i> Oluştur
                </button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    setTimeout(() => document.getElementById('newListName')?.focus(), 80);
}

function confirmCreateList() {
    const nameEl = document.getElementById('newListName');
    const name = (nameEl?.value || '').trim();
    if (!name) return;
    const lists = getMyLists();
    lists.unshift({
        id: generateListId(),
        name: name.slice(0, 45),
        tag: 'Genel',
        animes: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    });
    saveMyLists(lists);
    document.querySelector('.ml-dialog-overlay')?.remove();
    showToast('✅ "' + name + '" listesi oluşturuldu!');
    const hv = document.getElementById('historyView');
    if (hv && !hv.classList.contains('hidden')) renderLibraryPage(true);
}




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
    if (typeof closeNavDrawer === 'function') { try { closeNavDrawer(); } catch (_) {} }
    if (typeof closePgModal === 'function') { try { closePgModal(); } catch (_) {} }
    if (statsModal) statsModal.classList.add('hidden');
    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');
    const _dlv = document.getElementById('downloadsView'); if (_dlv) _dlv.classList.add('hidden');
    const _aiv = document.getElementById('aiView'); if (_aiv) _aiv.classList.add('hidden');
    if (typeof leaveW2GRoom === 'function') leaveW2GRoom();
    if (typeof clearProfileCurrentAnime === 'function') clearProfileCurrentAnime();
    if (typeof setAmbientBackground === 'function') setAmbientBackground(null);

    if (typeof homeView !== 'undefined' && homeView) homeView.classList.add('hidden');
    if (typeof animeListView !== 'undefined' && animeListView) animeListView.classList.add('hidden');
    if (typeof watchView !== 'undefined' && watchView) watchView.classList.add('hidden');
    if (typeof malView !== 'undefined' && malView) malView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    const nv = document.getElementById('newsView'); if (nv) nv.classList.add('hidden');
    const hv = document.getElementById('historyView'); if (hv) hv.classList.add('hidden');

    const stv = document.getElementById('statsView');
    if (stv) stv.classList.remove('hidden');

    if (window.setAnavActive) setAnavActive('stats');
    if (window.stxRender) window.stxRender();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (typeof vjsPlayer !== 'undefined' && vjsPlayer) {
        try { vjsPlayer.dispose(); } catch (e) {}
        vjsPlayer = null;
    }
}

function closeStats() {
    if (statsModal) statsModal.classList.add('hidden');
    const stv = document.getElementById('statsView');
    if (stv && !stv.classList.contains('hidden')) {
        showHomeView();
    }
}



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

    var src = (document.getElementById('catalogSourceFilter') || {}).value || 'anilist';

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

        grid.innerHTML = Array(14).fill('<div class="cat-skel"><div class="cat-skel-poster"></div><div class="cat-skel-line"></div><div class="cat-skel-line s"></div></div>').join('');

    }



    try {

        const catalogSource = document.getElementById('catalogSourceFilter')?.value || 'anilist';



        // ═══ ANIZIUM KATALOĞU ═══

        if (catalogSource === 'anizium') {

            const res = await fetch(`${API_BASE}/animes?platform=all&page=${animeListPage}`);

            const data = await res.json();



            if (animeListPage === 1 && grid) grid.innerHTML = '';

            if (data && (data.ip_banned || data.error_code === 1006 || data.status === 403)) {
                hasMoreAnime = false;
                if (counter) counter.innerHTML = `<b>0</b> anime<span class="cat-count-src">Anizium (IP Engelli)</span>`;
                if (grid) {
                    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem 1.5rem;max-width:620px;margin:1rem auto;border-radius:16px;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.28);color:var(--text1)">
                        <i class="fa-solid fa-shield-halved" style="font-size:2.2rem;color:#fb7185;display:block;margin-bottom:0.85rem"></i>
                        <h3 style="margin:0 0 0.5rem;font-size:1.1rem">Mevcut IP Adresiniz Anizium Tarafından Engellenmiş (Cloudflare Error 1006)</h3>
                        <p style="margin:0 0 1.2rem;color:var(--text3);font-size:0.9rem;line-height:1.5">Yeni koruma sayesinde Anizium artık otomatik veya seri istek atmaz; ancak daha önce banlanan bu IP'yi Anizium/Cloudflare tarafı açana kadar başka bir IP'ye geçmeniz veya AnimeciX / AniHub kullanmanız gerekir.</p>
                        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                            <button type="button" class="cat-btn" onclick="setCatalogSource('animecix')"><i class="fa-solid fa-play"></i> AnimeciX'e Geç</button>
                            <button type="button" class="cat-btn" onclick="setCatalogSource('anihub')"><i class="fa-solid fa-bolt"></i> AniHub'a Geç</button>
                            <button type="button" class="cat-btn cat-btn-ghost" onclick="fetch(API_BASE + '/anizium-reset').then(() => { animeListPage = 1; hasMoreAnime = true; loadMoreAnime(); })"><i class="fa-solid fa-rotate-right"></i> IP Değiştirdim, Tekrar Dene</button>
                        </div>
                    </div>`;
                }
                return;
            }

            if (data && data.page && data.page.data && data.page.data.length > 0) {

                hasMoreAnime = data.page.next_page !== null && data.page.next_page !== undefined;



                if (counter) {

                    const totalCount = data.total_anime || data.page.total || '1000+';

                    counter.innerHTML = `<b>${totalCount}</b> anime<span class="cat-count-src">Anizium</span>`;

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



                if (grid) grid.insertAdjacentHTML('beforeend', html);

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



        // ═══ ANİHUB KATALOĞU (anihub.com.tr) ═══
        if (catalogSource === 'anihub') {
            const searchQ = _catalogSearchQuery || '';
            let apiUrl = API_BASE + '/anihub-catalog?page=' + animeListPage + '&limit=30';
            if (searchQ) {
                apiUrl += '&search=' + encodeURIComponent(searchQ);
            }
            try {
                const res  = await fetch(apiUrl);
                const data = await res.json();
                if (animeListPage === 1 && grid) grid.innerHTML = '';
                const items = Array.isArray(data.items) ? data.items : [];
                const total = data.total || items.length;
                hasMoreAnime = !!data.hasMore;

                if (items.length > 0) {
                    if (counter) {
                        counter.innerHTML = '<b>' + total + '</b> anime<span class="cat-count-src">AniHub</span>';
                    }
                    window._anihubCatalogCache = window._anihubCatalogCache || {};
                    const html = items.map(function(m) {
                        const slug  = m.slug || '';
                        const numId = m.numericId || 0;
                        const title = m.title || 'Bilinmiyor';
                        const img   = m.poster || 'https://placehold.co/200x280/0c0c16/8b5cf6?text=?';
                        const year  = m.year ? String(m.year) : '';
                        const type  = m.contentType === 'movie' ? 'Film' : 'Dizi';
                        const qual  = m.videoQuality ? String(m.videoQuality).toUpperCase() : 'HD';
                        const safeTitle = title.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                        const safeSlug  = slug.replace(/'/g, "\'");
                        window._anihubCatalogCache[slug] = m;
                        return '<div class="anime-card" data-slug="' + safeSlug + '" onclick="openAniHubCatalogItem(this.dataset.slug)">' +
                            '<div class="card-poster-wrap">' +
                            '<img src="' + img + '" alt="' + safeTitle + '" class="card-poster" loading="lazy">' +
                            '<div class="card-badge">' + qual + '</div>' +
                            '<div class="card-hover-overlay"><button class="quick-play-btn"><i class="fa-solid fa-play"></i></button></div>' +
                            '</div>' +
                            '<div class="card-info" style="padding:10px;">' +
                            '<div class="card-title" style="font-size:13px;line-height:1.3;margin-bottom:4px;" title="' + safeTitle + '">' + title + '</div>' +
                            '<div style="font-size:11px;color:var(--text3);display:flex;justify-content:space-between;">' +
                            '<span>' + (year || 'AniHub') + '</span>' +
                            '<span>' + type + '</span>' +
                            '</div>' +
                            '</div>' +
                            '</div>';
                    }).join('');
                    if (grid) grid.insertAdjacentHTML('beforeend', html);
                    animeListPage++;
                    const moreBtn = document.getElementById('loadMoreAnimeBtn');
                    if (moreBtn) moreBtn.classList.toggle('hidden', !hasMoreAnime);
                } else {
                    hasMoreAnime = false;
                    if (animeListPage === 1 && grid) {
                        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem;color:var(--text3)">AniHub kataloğunda sonuç bulunamadı.</div>';
                    }
                }
            } catch (err) {
                console.error('AniHub katalog hatası:', err);
                hasMoreAnime = false;
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

                        counter.innerHTML = '<b>' + (total || items.length) + '</b> anime<span class="cat-count-src">AnimeciX</span>';

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

                    if (grid) grid.insertAdjacentHTML('beforeend', html);

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

                counter.innerHTML = `<b>${data.Page.pageInfo.total}</b> anime<span class="cat-count-src">AniList</span>`;

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



            if (grid) grid.insertAdjacentHTML('beforeend', html);

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

                <img class="card-poster" src="${img}" alt="${attrTitle}" loading="lazy">

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

// BİLDİRİM, GENEL DUYURU & SAYAÇ MERKEZİ (Global Supabase Sync)

// ══════════════════════════════════════════════════════════════



var _notifPanelOpen      = false;

var _notifFollowedList   = JSON.parse(localStorage.getItem('anitr_notif_followed') || '[]');

var _notifReadIds        = JSON.parse(localStorage.getItem('anitr_notif_read')     || '[]');

var _notifAnnouncements  = JSON.parse(localStorage.getItem('anitr_announcements_cache') || '[]');

var _notifAlerts         = [];

var _notifUpcoming       = [];

var _notifCurrentTab     = 'announcements';

var _notifLiveTickTimer  = null;



var _ANN_EP_KEY          = '__anitr_announcements_v1__';

var _ANN_ADMIN_CFG_KEY   = '__anitr_admin_cfg_v1__';

var _ANN_ADMIN_TOKEN_LS  = 'anitr_admin_session_hash';

var _annEditingUid       = null;



var _ANN_CATEGORIES = {

    duyuru:     { label: 'Duyuru',      icon: 'fa-bullhorn',             cls: 'cat-duyuru' },

    guncelleme: { label: 'Güncelleme',  icon: 'fa-rocket',               cls: 'cat-update' },

    etkinlik:   { label: 'Etkinlik',    icon: 'fa-champagne-glasses',    cls: 'cat-event'  },

    sayac:      { label: 'Geri Sayım',  icon: 'fa-hourglass-half',       cls: 'cat-timer'  },

    bakim:      { label: 'Önemli',      icon: 'fa-triangle-exclamation', cls: 'cat-alert'  }

};



function _notifEsc(s) {

    return String(s == null ? '' : s)

        .replace(/&/g, '&amp;').replace(/</g, '&lt;')

        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

}



function _saveNotifFollowed() {

    localStorage.setItem('anitr_notif_followed', JSON.stringify(_notifFollowedList));

}

function _saveNotifRead() {

    localStorage.setItem('anitr_notif_read', JSON.stringify(_notifReadIds.slice(-400)));

}

function _saveAnnouncementsCache() {

    try { localStorage.setItem('anitr_announcements_cache', JSON.stringify(_notifAnnouncements)); } catch (_) {}

}

function _annReadKey(a) {

    return 'ann_' + a.uid + '_' + (a.updatedAt || a.createdAt || 0);

}



function _notifTimeAgo(ts) {

    if (!ts) return '';

    var diff = Math.max(0, Date.now() - Number(ts));

    var m = Math.floor(diff / 60000);

    if (m < 1) return 'Az önce';

    if (m < 60) return m + ' dk önce';

    var h = Math.floor(m / 60);

    if (h < 24) return h + ' sa önce';

    var d = Math.floor(h / 24);

    if (d < 30) return d + ' gün önce';

    try { return new Date(Number(ts)).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }); } catch (_) { return ''; }

}



function _notifFormatLiveCountdown(ms) {

    if (ms <= 0) return 'Başladı / Yayında!';

    var s = Math.floor(ms / 1000);

    var d = Math.floor(s / 86400); s %= 86400;

    var h = Math.floor(s / 3600);  s %= 3600;

    var m = Math.floor(s / 60);

    var sec = s % 60;

    var pad = function(n) { return String(n).padStart(2, '0'); };

    if (d > 0) return d + 'g ' + pad(h) + 's ' + pad(m) + 'dk ' + pad(sec) + 'sn';

    return pad(h) + ':' + pad(m) + ':' + pad(sec);

}



function _startNotifLiveTicker() {

    if (_notifLiveTickTimer) clearInterval(_notifLiveTickTimer);

    _notifLiveTickTimer = setInterval(function() {

        if (!_notifPanelOpen) {

            clearInterval(_notifLiveTickTimer);

            _notifLiveTickTimer = null;

            return;

        }

        document.querySelectorAll('[data-countdown-ts]').forEach(function(el) {

            var target = Number(el.getAttribute('data-countdown-ts') || 0);

            if (!target) return;

            el.textContent = _notifFormatLiveCountdown(target - Date.now());

        });

    }, 1000);

}



/* Paneli aç / kapat */

function toggleNotifPanel(e) {

    if (e) e.stopPropagation();

    var panel = document.getElementById('notifPanel');

    if (!panel) return;

    _notifPanelOpen = !_notifPanelOpen;

    panel.classList.toggle('hidden', !_notifPanelOpen);

    if (_notifPanelOpen) {

        _notifFetchAnnouncements(true);

        _notifSyncActiveTabBtn();

        _notifRenderCurrentTab();

        _notifMarkVisibleRead();

        _startNotifLiveTicker();

        document.removeEventListener('click', _notifOutsideClick);

        setTimeout(function() {

            document.addEventListener('click', _notifOutsideClick);

        }, 15);

    } else {

        document.removeEventListener('click', _notifOutsideClick);

    }

}



function closeNotifPanel() {

    _notifPanelOpen = false;

    var panel = document.getElementById('notifPanel');

    if (panel) panel.classList.add('hidden');

    document.removeEventListener('click', _notifOutsideClick);

}



function _notifOutsideClick(e) {

    var wrap = document.getElementById('notifBellWrap');

    if (wrap && !wrap.contains(e.target)) {

        closeNotifPanel();

    }

}



function _notifSyncActiveTabBtn() {

    document.querySelectorAll('#notifPanel .notif-tab').forEach(function(b) {

        b.classList.toggle('active', b.getAttribute('data-nptab') === _notifCurrentTab);

    });

}



/* Sekme değiştir */

function switchNotifTab(tab, btn) {

    _notifCurrentTab = tab;

    if (btn) {

        document.querySelectorAll('#notifPanel .notif-tab').forEach(function(b) {

            b.classList.toggle('active', b === btn);

        });

    } else {

        _notifSyncActiveTabBtn();

    }

    _notifRenderCurrentTab();

    _notifMarkVisibleRead();

}



/* Mevcut sekmeyi render et */

function _notifRenderCurrentTab() {

    if (_notifCurrentTab === 'announcements') _notifRenderAnnouncements();

    else if (_notifCurrentTab === 'alerts')   _notifRenderAlerts();

    else if (_notifCurrentTab === 'upcoming') _notifRenderUpcoming();

    else if (_notifCurrentTab === 'followed') _notifRenderFollowed();

}



/* Duyurular sekmesi */

function _notifRenderAnnouncements() {

    var body = document.getElementById('notifPanelBody');

    if (!body) return;

    if (!_notifAnnouncements.length) {

        body.innerHTML =

            '<div class="notif-empty">' +

                '<i class="fa-solid fa-bullhorn"></i>' +

                '<p>Henüz yayınlanmış duyuru yok.<br><small>Platform duyuruları, etkinlikler ve önemli güncellemeler burada paylaşılır.</small></p>' +

            '</div>';

        return;

    }

    body.innerHTML = _notifAnnouncements.map(function(a) {

        var cat = _ANN_CATEGORIES[a.category] || _ANN_CATEGORIES.duyuru;

        var isRead = _notifReadIds.indexOf(_annReadKey(a)) !== -1;

        var hasTimer = a.countdownAt && Number(a.countdownAt) > 0;

        var diff = hasTimer ? (Number(a.countdownAt) - Date.now()) : 0;

        return '<div class="notif-ann-card ' + cat.cls + (a.pinned ? ' is-pinned' : '') + (isRead ? '' : ' is-unread') + '">' +

            '<div class="notif-ann-top">' +

                '<span class="notif-ann-badge ' + cat.cls + '"><i class="fa-solid ' + cat.icon + '"></i> ' + _notifEsc(cat.label) + '</span>' +

                (a.pinned ? '<span class="notif-ann-pin" title="Sabitlenmiş Duyuru"><i class="fa-solid fa-thumbtack"></i> Sabit</span>' : '') +

                '<span class="notif-ann-date">' + _notifEsc(_notifTimeAgo(a.updatedAt || a.createdAt)) + '</span>' +

            '</div>' +

            '<div class="notif-ann-title">' + _notifEsc(a.title) + '</div>' +

            (a.body ? '<div class="notif-ann-text">' + _notifEsc(a.body).replace(/\r?\n/g, '<br>') + '</div>' : '') +

            (a.img ? '<div class="notif-ann-media"><img src="' + _notifEsc(a.img) + '" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>' : '') +

            (hasTimer

                ? '<div class="notif-ann-countdown"><i class="fa-solid fa-hourglass-half"></i><span>Kalan Süre:</span><strong data-countdown-ts="' + Number(a.countdownAt) + '">' + _notifFormatLiveCountdown(diff) + '</strong></div>'

                : '') +

            (a.link

                ? '<a class="notif-ann-cta" href="' + _notifEsc(a.link) + '" target="_blank" rel="noopener noreferrer"><span>' + _notifEsc(a.linkLabel || 'Detayları Gör') + '</span><i class="fa-solid fa-arrow-up-right-from-square"></i></a>'

                : '') +

        '</div>';

    }).join('');

}



/* Yeni Bölümler sekmesi */

function _notifRenderAlerts() {

    var body = document.getElementById('notifPanelBody');

    if (!body) return;

    if (!_notifAlerts.length) {

        body.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>Yeni bölüm bildirimi yok.<br><small>Yaklaşan bölümler yayınlandıkça burada listelenir.</small></p></div>';

        return;

    }

    body.innerHTML = _notifAlerts.map(function(a) {

        var read = _notifReadIds.indexOf(a.id) !== -1;

        var safeTitleAttr = (a.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        var safeImgAttr   = (a.img || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        var clickAct = a.animeId

            ? 'loadDetails(\'' + a.animeId + '\',\'' + (a.slug || '') + '\',' + (a.isMovie || false) + ',\'' + safeTitleAttr + '\',\'\',\'' + safeImgAttr + '\')'

            : 'closeNotifPanel(); searchAnimeByName(\'' + safeTitleAttr + '\')';

        return '<div class="notif-item' + (read ? ' notif-read' : ' unread') + '" onclick="' + clickAct + '">' +

            '<div class="notif-item-img"><img src="' + _notifEsc(a.img || 'https://placehold.co/92x128/141420/8b5cf6?text=?') + '" alt="" loading="lazy"></div>' +

            '<div class="notif-item-info">' +

                '<div class="notif-item-title">' + _notifEsc(a.title || 'Bilinmiyor') + '</div>' +

                '<div class="notif-item-ep"><i class="fa-solid fa-play"></i> ' + _notifEsc(a.epLabel || 'Yeni Bölüm') + '</div>' +

                '<div class="notif-item-time"><i class="fa-regular fa-clock"></i> ' + _notifEsc(a.timeStr || '') + '</div>' +

            '</div>' +

            (read ? '' : '<span class="notif-dot"></span>') +

        '</div>';

    }).join('');

}



/* Geri Sayım sekmesi (Özel Duyuru Sayaçları + Anime Bölümleri) */

function _notifRenderUpcoming() {

    var body = document.getElementById('notifPanelBody');

    if (!body) return;

    var now = Date.now();

    var customTimers = _notifAnnouncements.filter(function(a) {

        return a.countdownAt && Number(a.countdownAt) > (now - 3600000);

    }).sort(function(a, b) { return Number(a.countdownAt) - Number(b.countdownAt); });



    if (!customTimers.length && !_notifUpcoming.length) {

        body.innerHTML = '<div class="notif-empty"><i class="fa-solid fa-hourglass-half"></i><p>Aktif geri sayım yok.<br><small>Özel etkinlik sayaçları ve yaklaşan anime bölümleri burada görünür.</small></p></div>';

        return;

    }



    var html = '';

    if (customTimers.length) {

        html += customTimers.map(function(c) {

            var diff = Number(c.countdownAt) - now;

            var cat = _ANN_CATEGORIES[c.category] || _ANN_CATEGORIES.sayac;

            return '<div class="notif-item notif-item-special" onclick="switchNotifTab(\'announcements\')">' +

                (c.img

                    ? '<div class="notif-item-img"><img src="' + _notifEsc(c.img) + '" alt="" loading="lazy"></div>'

                    : '<div class="notif-item-icon-box ' + cat.cls + '"><i class="fa-solid ' + cat.icon + '"></i></div>') +

                '<div class="notif-item-info">' +

                    '<div class="notif-special-tag"><i class="fa-solid fa-star"></i> ÖZEL SAYAÇ</div>' +

                    '<div class="notif-item-title">' + _notifEsc(c.title) + '</div>' +

                    '<div class="notif-item-countdown" data-countdown-ts="' + Number(c.countdownAt) + '">' + _notifFormatLiveCountdown(diff) + '</div>' +

                '</div>' +

            '</div>';

        }).join('');

    }



    html += _notifUpcoming.map(function(u) {

        var diff = u.airsAt - now;

        var safeTitleAttr = (u.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        return '<div class="notif-item" onclick="closeNotifPanel(); searchAnimeByName(\'' + safeTitleAttr + '\')">' +

            '<div class="notif-item-img"><img src="' + _notifEsc(u.img || 'https://placehold.co/92x128/141420/8b5cf6?text=?') + '" alt="" loading="lazy"></div>' +

            '<div class="notif-item-info">' +

                '<div class="notif-item-title">' + _notifEsc(u.title || 'Bilinmiyor') + '</div>' +

                '<div class="notif-item-ep"><i class="fa-solid fa-film"></i> ' + _notifEsc(u.epLabel || '') + '</div>' +

                '<div class="notif-item-time"><i class="fa-solid fa-hourglass-half"></i> <span data-countdown-ts="' + Number(u.airsAt) + '">' + _notifFormatLiveCountdown(diff) + '</span></div>' +

            '</div>' +

        '</div>';

    }).join('');



    body.innerHTML = html;

}



/* Takip edilen animeler sekmesi */

function _notifRenderFollowed() {

    var body = document.getElementById('notifPanelBody');

    if (!body) return;

    var badge = document.getElementById('notifFollowedCountBadge');

    if (badge) badge.textContent = _notifFollowedList.length;

    if (!_notifFollowedList.length) {

        body.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-bookmark"></i><p>Takip ettiğin anime yok.<br><small>İzleme veya detay sayfasındaki Takip Et butonuna basarak ekleyebilirsin.</small></p></div>';

        return;

    }

    body.innerHTML = _notifFollowedList.map(function(a) {

        var safeId    = String(a.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        var safeSlug  = String(a.slug || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        var safeTitle = String(a.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        var safeImg   = String(a.img || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        var openCall  = 'closeNotifPanel(); loadDetails(\'' + safeId + '\',\'' + safeSlug + '\',' + (!!a.isMovie) + ',\'' + safeTitle + '\',\'\',\'' + safeImg + '\')';

        return '<div class="notif-item notif-followed-row" onclick="' + openCall + '">' +

            '<div class="notif-item-img"><img src="' + _notifEsc(a.img || 'https://placehold.co/92x128/141420/8b5cf6?text=?') + '" alt="' + _notifEsc(a.title || '') + '" loading="lazy" onerror="this.src=\'https://placehold.co/92x128/141420/8b5cf6?text=?\'"></div>' +

            '<div class="notif-item-info">' +

                '<div class="notif-item-title">' + _notifEsc(a.title || 'Bilinmiyor') + '</div>' +

                '<div class="notif-followed-pill"><i class="fa-solid fa-bell"></i> Takip Ediliyor</div>' +

            '</div>' +

            '<button type="button" class="notif-unfollow-btn" title="Takibi bırak" onclick="notifUnfollow(\'' + safeId + '\',event)"><i class="fa-solid fa-xmark"></i></button>' +

        '</div>';

    }).join('');

}



/* Bir animeyi takibe al */

function notifFollow(id, slug, isMovie, title, img) {

    if (_notifFollowedList.some(function(a){ return String(a.id) === String(id); })) return;

    _notifFollowedList.unshift({ id: id, slug: slug, isMovie: !!isMovie, title: title, img: img });

    _saveNotifFollowed();

    _notifUpdateBadge();

    if (typeof Swal !== 'undefined') {

        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: '<b>' + _notifEsc(title) + '</b> takibe alındı', timer: 2000, showConfirmButton: false });

    } else if (typeof showToast === 'function') {

        showToast('🔔 ' + title + ' takibe alındı');

    }

}



/* Takibi bırak */

function notifUnfollow(id, e) {

    if (e) e.stopPropagation();

    _notifFollowedList = _notifFollowedList.filter(function(a){ return String(a.id) !== String(id); });

    _saveNotifFollowed();

    _notifUpdateBadge();

    if (_notifCurrentTab === 'followed') _notifRenderFollowed();

    if (typeof updateWatchFollowBtn === 'function') updateWatchFollowBtn();

}



/* Okundu badge'ini güncelle */

function _notifUpdateBadge() {

    var badge = document.getElementById('notifUnreadBadge');

    var followed = _notifFollowedList.length;

    var unreadAnn = _notifAnnouncements.filter(function(a){ return _notifReadIds.indexOf(_annReadKey(a)) === -1; }).length;

    var unreadAlerts = _notifAlerts.filter(function(a){ return _notifReadIds.indexOf(a.id) === -1; }).length;

    var total = unreadAnn + unreadAlerts;

    if (badge) {

        badge.textContent = total > 99 ? '99+' : String(total);

        badge.classList.toggle('hidden', total === 0);

    }

    var annBadge = document.getElementById('notifAnnCountBadge');

    if (annBadge) {

        annBadge.textContent = _notifAnnouncements.length;

        annBadge.classList.toggle('hidden', _notifAnnouncements.length === 0);

    }

    var followedBadge = document.getElementById('notifFollowedCountBadge');

    if (followedBadge) followedBadge.textContent = followed;

}



/* Görünür bildirimleri okundu işaretle */

function _notifMarkVisibleRead() {

    if (_notifCurrentTab === 'announcements') {

        _notifAnnouncements.forEach(function(a) {

            var k = _annReadKey(a);

            if (_notifReadIds.indexOf(k) === -1) _notifReadIds.push(k);

        });

        _saveNotifRead();

        _notifUpdateBadge();

    } else if (_notifCurrentTab === 'alerts') {

        _notifAlerts.forEach(function(a) {

            if (_notifReadIds.indexOf(a.id) === -1) _notifReadIds.push(a.id);

        });

        _saveNotifRead();

        _notifUpdateBadge();

    }

}



/* Tümünü okundu işaretle */

function markAllNotifsRead() {

    _notifAnnouncements.forEach(function(a) {

        var k = _annReadKey(a);

        if (_notifReadIds.indexOf(k) === -1) _notifReadIds.push(k);

    });

    _notifAlerts.forEach(function(a) {

        if (_notifReadIds.indexOf(a.id) === -1) _notifReadIds.push(a.id);

    });

    _saveNotifRead();

    _notifUpdateBadge();

    _notifRenderCurrentTab();

    if (typeof showToast === 'function') showToast('✓ Tüm bildirimler okundu işaretlendi');

}



/* ── Global Duyuru Senkronizasyonu (Supabase) ── */

async function _notifFetchAnnouncements(silent) {

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {

        _notifUpdateBadge();

        return;

    }

    try {

        var res = await supabaseClient

            .from('comments')

            .select('id, created_at, content')

            .eq('ep_key', _ANN_EP_KEY)

            .order('id', { ascending: true })

            .limit(250);

        if (res.error || !Array.isArray(res.data)) return;



        var map = new Map();

        res.data.forEach(function(row) {

            try {

                var payload = JSON.parse(row.content || '{}');

                if (!payload || !payload.uid) return;

                if (payload.op === 'delete') {

                    map.delete(payload.uid);

                } else if (payload.op === 'upsert' && payload.title) {

                    var existing = map.get(payload.uid);

                    map.set(payload.uid, {

                        uid: payload.uid,

                        title: String(payload.title).trim(),

                        body: String(payload.body || '').trim(),

                        category: payload.category || 'duyuru',

                        pinned: !!payload.pinned,

                        img: String(payload.img || '').trim(),

                        link: String(payload.link || '').trim(),

                        linkLabel: String(payload.linkLabel || '').trim(),

                        countdownAt: payload.countdownAt ? Number(payload.countdownAt) : 0,

                        createdAt: (existing && existing.createdAt) || payload.createdAt || new Date(row.created_at).getTime(),

                        updatedAt: payload.updatedAt || new Date(row.created_at).getTime()

                    });

                }

            } catch (_) {}

        });



        var list = Array.from(map.values()).sort(function(a, b) {

            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

            return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);

        });



        var toastedIds = [];

        try { toastedIds = JSON.parse(localStorage.getItem('anitr_ann_toasted') || '[]'); } catch (_) {}

        if (list.length) {

            var newest = list[0];

            var rk = _annReadKey(newest);

            if (!silent && toastedIds.indexOf(rk) === -1 && _notifReadIds.indexOf(rk) === -1) {

                toastedIds.push(rk);

                try { localStorage.setItem('anitr_ann_toasted', JSON.stringify(toastedIds.slice(-100))); } catch (_) {}

                if (typeof showToast === 'function') {

                    showToast('📢 Yeni Duyuru: ' + newest.title, 4500);

                }

                if ('Notification' in window && Notification.permission === 'granted') {

                    try { new Notification('📢 Anitr Duyuru: ' + newest.title, { body: newest.body || '' }); } catch (_) {}

                }

            }

        }



        _notifAnnouncements = list;

        _saveAnnouncementsCache();

        _notifUpdateBadge();

        if (_notifPanelOpen) _notifRenderCurrentTab();

    } catch (_) {}

}



/* ── Yönetici Şifre Doğrulama (SHA-256 + Salt) ── */

async function _sha256Hex(str) {

    if (window.crypto && window.crypto.subtle) {

        var buf = new TextEncoder().encode(str);

        var hashBuf = await window.crypto.subtle.digest('SHA-256', buf);

        return Array.from(new Uint8Array(hashBuf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');

    }

    var h = 5381;

    for (var i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);

    return 'fb_' + (h >>> 0).toString(16);

}



async function _fetchAdminCfg() {

    if (!supabaseClient) return null;

    try {

        var res = await supabaseClient

            .from('comments')

            .select('id, content')

            .eq('ep_key', _ANN_ADMIN_CFG_KEY)

            .order('id', { ascending: false })

            .limit(1);

        if (!res.error && res.data && res.data.length) {

            return JSON.parse(res.data[0].content || 'null');

        }

    } catch (_) {}

    return null;

}



window.openAnnouncementAdminModal = async function() {

    closeNotifPanel();

    var modal = document.getElementById('announcementAdminModal');

    var body  = document.getElementById('annAdminModalBody');

    var lockBtn = document.getElementById('annAdminLockBtn');

    if (!modal || !body) return;

    modal.classList.remove('hidden');

    body.innerHTML = '<div class="ann-loading"><div class="spinner" style="display:inline-block"></div><span>Yönetici durumu kontrol ediliyor...</span></div>';



    if (!supabaseClient) {

        body.innerHTML = '<div class="ann-loading" style="color:#f87171;">Supabase bağlantısı kurulamadı. Sayfayı yenileyip tekrar deneyin.</div>';

        return;

    }



    var cfg = await _fetchAdminCfg();

    var savedSessionHash = localStorage.getItem(_ANN_ADMIN_TOKEN_LS) || '';



    if (!cfg || !cfg.hash) {

        if (lockBtn) lockBtn.classList.add('hidden');

        _renderAdminSetupUI(body);

        return;

    }



    if (savedSessionHash && savedSessionHash === cfg.hash) {

        if (lockBtn) lockBtn.classList.remove('hidden');

        await _notifFetchAnnouncements(true);

        _renderAdminComposerUI(body);

    } else {

        if (lockBtn) lockBtn.classList.add('hidden');

        _renderAdminLoginUI(body, cfg);

    }

};



window.closeAnnouncementAdminModal = function() {

    var modal = document.getElementById('announcementAdminModal');

    if (modal) modal.classList.add('hidden');

    _annEditingUid = null;

};



window.lockAnnouncementAdmin = function() {

    localStorage.removeItem(_ANN_ADMIN_TOKEN_LS);

    _annEditingUid = null;

    showToast('🔒 Yönetici oturumu kilitlendi');

    closeAnnouncementAdminModal();

};



function _renderAdminSetupUI(body) {

    body.innerHTML =

        '<div class="ann-auth-box">' +

            '<div class="ann-auth-badge"><i class="fa-solid fa-shield-halved"></i> İlk Kurulum</div>' +

            '<h4>Yönetici Şifresi Belirle</h4>' +

            '<p>Herkese açık duyuru ve geri sayım yayınlayabilmek için yalnızca senin bileceğin bir yönetici şifresi oluştur. Şifren SHA-256 ile şifrelenerek saklanır.</p>' +

            '<div class="ann-field">' +

                '<label>Yeni Yönetici Şifresi</label>' +

                '<input type="password" id="annSetupPass1" class="ann-input" placeholder="En az 4 karakter...">' +

            '</div>' +

            '<div class="ann-field">' +

                '<label>Şifre Tekrar</label>' +

                '<input type="password" id="annSetupPass2" class="ann-input" placeholder="Şifreyi tekrar girin..." onkeydown="if(event.key===\'Enter\') submitAdminSetup()">' +

            '</div>' +

            '<button type="button" class="ann-submit-btn" onclick="submitAdminSetup()"><i class="fa-solid fa-check"></i> Şifreyi Kaydet ve Yönetim Paneline Geç</button>' +

        '</div>';

}



window.submitAdminSetup = async function() {

    var p1 = (document.getElementById('annSetupPass1') || {}).value || '';

    var p2 = (document.getElementById('annSetupPass2') || {}).value || '';

    if (p1.length < 4) { showToast('⚠️ Şifre en az 4 karakter olmalı'); return; }

    if (p1 !== p2) { showToast('⚠️ Şifreler eşleşmiyor'); return; }



    var salt = 'anitr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

    var hash = await _sha256Hex(salt + '::' + p1);

    var payload = JSON.stringify({ salt: salt, hash: hash, updatedAt: Date.now() });



    var res = await supabaseClient.from('comments').insert([{

        ep_key: _ANN_ADMIN_CFG_KEY,

        username: 'admin_cfg',

        content: payload

    }]);

    if (res.error) {

        showToast('❌ Kaydedilemedi: ' + res.error.message);

        return;

    }

    localStorage.setItem(_ANN_ADMIN_TOKEN_LS, hash);

    showToast('✅ Yönetici şifresi oluşturuldu!');

    openAnnouncementAdminModal();

};



function _renderAdminLoginUI(body, cfg) {

    body.innerHTML =

        '<div class="ann-auth-box">' +

            '<div class="ann-auth-badge"><i class="fa-solid fa-lock"></i> Yönetici Girişi</div>' +

            '<h4>Duyuru Yönetim Paneli</h4>' +

            '<p>Tüm kullanıcılara duyuru veya özel geri sayım göndermek için yönetici şifreni gir.</p>' +

            '<div class="ann-field">' +

                '<label>Yönetici Şifresi</label>' +

                '<input type="password" id="annLoginPass" class="ann-input" placeholder="Şifrenizi girin..." onkeydown="if(event.key===\'Enter\') submitAdminLogin()">' +

            '</div>' +

            '<button type="button" class="ann-submit-btn" onclick="submitAdminLogin()"><i class="fa-solid fa-unlock-keyhole"></i> Giriş Yap</button>' +

        '</div>';

    window._tmpAdminCfg = cfg;

    setTimeout(function() {

        var inp = document.getElementById('annLoginPass');

        if (inp) inp.focus();

    }, 50);

}



window.submitAdminLogin = async function() {

    var inp = document.getElementById('annLoginPass');

    var pass = inp ? inp.value : '';

    var cfg = window._tmpAdminCfg || (await _fetchAdminCfg());

    if (!cfg || !cfg.hash) return;

    var computed = await _sha256Hex((cfg.salt || '') + '::' + pass);

    if (computed !== cfg.hash) {

        showToast('❌ Hatalı yönetici şifresi!');

        if (inp) inp.value = '';

        return;

    }

    localStorage.setItem(_ANN_ADMIN_TOKEN_LS, cfg.hash);

    showToast('🔓 Yönetici girişi başarılı');

    openAnnouncementAdminModal();

};



function _toLocalDatetimeInputVal(ts) {

    if (!ts) return '';

    var d = new Date(Number(ts));

    if (isNaN(d.getTime())) return '';

    var pad = function(n) { return String(n).padStart(2, '0'); };

    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

}



function _renderAdminComposerUI(body) {

    var editing = _annEditingUid ? _notifAnnouncements.find(function(x){ return x.uid === _annEditingUid; }) : null;

    var curCat  = (editing && editing.category) || 'duyuru';

    var catBtns = Object.keys(_ANN_CATEGORIES).map(function(k) {

        var c = _ANN_CATEGORIES[k];

        return '<button type="button" class="ann-cat-chip ' + c.cls + (curCat === k ? ' active' : '') + '" data-cat="' + k + '" onclick="selectAnnCategory(\'' + k + '\', this)">' +

            '<i class="fa-solid ' + c.icon + '"></i><span>' + c.label + '</span></button>';

    }).join('');



    var existingHtml = _notifAnnouncements.length

        ? _notifAnnouncements.map(function(a) {

            var c = _ANN_CATEGORIES[a.category] || _ANN_CATEGORIES.duyuru;

            return '<div class="ann-manage-item">' +

                '<div class="ann-manage-info">' +

                    '<div class="ann-manage-badges">' +

                        '<span class="notif-ann-badge ' + c.cls + '"><i class="fa-solid ' + c.icon + '"></i> ' + _notifEsc(c.label) + '</span>' +

                        (a.pinned ? '<span class="notif-ann-pin"><i class="fa-solid fa-thumbtack"></i> Sabit</span>' : '') +

                        (a.countdownAt ? '<span class="ann-timer-tag"><i class="fa-solid fa-clock"></i> Sayaçlı</span>' : '') +

                        '<small>' + _notifEsc(_notifTimeAgo(a.updatedAt || a.createdAt)) + '</small>' +

                    '</div>' +

                    '<strong>' + _notifEsc(a.title) + '</strong>' +

                    (a.body ? '<p>' + _notifEsc(a.body) + '</p>' : '') +

                '</div>' +

                '<div class="ann-manage-btns">' +

                    '<button type="button" onclick="togglePinAnnouncement(\'' + a.uid + '\')" title="' + (a.pinned ? 'Sabiti Kaldır' : 'Üste Sabitle') + '"><i class="fa-solid fa-thumbtack"></i></button>' +

                    '<button type="button" onclick="editAnnouncement(\'' + a.uid + '\')" title="Düzenle"><i class="fa-solid fa-pen"></i></button>' +

                    '<button type="button" class="danger" onclick="deleteAnnouncement(\'' + a.uid + '\')" title="Sil"><i class="fa-solid fa-trash"></i></button>' +

                '</div>' +

            '</div>';

        }).join('')

        : '<div class="ann-empty-list">Henüz aktif duyuru bulunmuyor. Yukarıdan ilk duyurunu yayınlayabilirsin.</div>';



    body.innerHTML =

        '<div class="ann-composer">' +

            '<div class="ann-composer-title">' +

                '<span>' + (editing ? '✏️ Duyuruyu Düzenle' : '✨ Yeni Duyuru / Geri Sayım Oluştur') + '</span>' +

                (editing ? '<button type="button" class="ann-cancel-edit" onclick="cancelEditAnnouncement()">Düzenlemeyi İptal Et</button>' : '') +

            '</div>' +

            '<input type="hidden" id="annFormCategory" value="' + _notifEsc(curCat) + '">' +

            '<div class="ann-cat-row">' + catBtns + '</div>' +

            '<div class="ann-grid-2">' +

                '<div class="ann-field">' +

                    '<label>Başlık *</label>' +

                    '<input type="text" id="annFormTitle" class="ann-input" maxlength="120" placeholder="Örn: Büyük Güncelleme Yayında! / Cumartesi 21:00 Etkinliği" value="' + _notifEsc(editing ? editing.title : '') + '">' +

                '</div>' +

                '<div class="ann-field">' +

                    '<label>Geri Sayım Tarihi & Saati (İsteğe Bağlı)</label>' +

                    '<input type="datetime-local" id="annFormCountdown" class="ann-input" value="' + _notifEsc(editing ? _toLocalDatetimeInputVal(editing.countdownAt) : '') + '">' +

                '</div>' +

            '</div>' +

            '<div class="ann-field">' +

                '<label>Duyuru Açıklaması</label>' +

                '<textarea id="annFormBody" class="ann-textarea" rows="3" placeholder="Herkesin göreceği duyuru mesajını buraya yaz...">' + _notifEsc(editing ? editing.body : '') + '</textarea>' +

            '</div>' +

            '<div class="ann-grid-2">' +

                '<div class="ann-field">' +

                    '<label>Görsel / Afis URL (İsteğe Bağlı)</label>' +

                    '<input type="url" id="annFormImg" class="ann-input" placeholder="https://.../afis.jpg" value="' + _notifEsc(editing ? editing.img : '') + '">' +

                '</div>' +

                '<div class="ann-field">' +

                    '<label>Yönlendirme Linki (İsteğe Bağlı)</label>' +

                    '<input type="url" id="annFormLink" class="ann-input" placeholder="https://discord.gg/... veya bağlantı" value="' + _notifEsc(editing ? editing.link : '') + '">' +

                '</div>' +

            '</div>' +

            '<div class="ann-composer-foot">' +

                '<label class="ann-pin-check">' +

                    '<input type="checkbox" id="annFormPinned" ' + ((editing && editing.pinned) ? 'checked' : '') + '>' +

                    '<span><i class="fa-solid fa-thumbtack"></i> En Üste Sabitle</span>' +

                '</label>' +

                '<button type="button" class="ann-submit-btn" id="annPublishBtn" onclick="publishAnnouncement()">' +

                    '<i class="fa-solid fa-paper-plane"></i> ' + (editing ? 'Değişiklikleri Yayınla' : 'Herkese Yayınla') +

                '</button>' +

            '</div>' +

        '</div>' +

        '<div class="ann-manage-sec">' +

            '<div class="ann-manage-head">' +

                '<h4>Yayındaki Duyurular (' + _notifAnnouncements.length + ')</h4>' +

                '<button type="button" class="ann-pass-change-btn" onclick="openChangeAdminPassPrompt()"><i class="fa-solid fa-key"></i> Şifre Değiştir</button>' +

            '</div>' +

            '<div class="ann-manage-list">' + existingHtml + '</div>' +

        '</div>';

}



window.selectAnnCategory = function(cat, btn) {

    var hidden = document.getElementById('annFormCategory');

    if (hidden) hidden.value = cat;

    document.querySelectorAll('#announcementAdminModal .ann-cat-chip').forEach(function(b) {

        b.classList.toggle('active', b === btn);

    });

};



window.editAnnouncement = function(uid) {

    _annEditingUid = uid;

    var body = document.getElementById('annAdminModalBody');

    if (body) _renderAdminComposerUI(body);

};



window.cancelEditAnnouncement = function() {

    _annEditingUid = null;

    var body = document.getElementById('annAdminModalBody');

    if (body) _renderAdminComposerUI(body);

};



window.publishAnnouncement = async function() {

    var titleEl = document.getElementById('annFormTitle');

    var bodyEl  = document.getElementById('annFormBody');

    var catEl   = document.getElementById('annFormCategory');

    var cdEl    = document.getElementById('annFormCountdown');

    var imgEl   = document.getElementById('annFormImg');

    var linkEl  = document.getElementById('annFormLink');

    var pinEl   = document.getElementById('annFormPinned');

    var btn     = document.getElementById('annPublishBtn');



    var title = (titleEl && titleEl.value || '').trim();

    if (!title) {

        showToast('⚠️ Lütfen bir duyuru başlığı girin');

        if (titleEl) titleEl.focus();

        return;

    }



    var countdownAt = 0;

    if (cdEl && cdEl.value) {

        var parsedTs = new Date(cdEl.value).getTime();

        if (!isNaN(parsedTs)) countdownAt = parsedTs;

    }



    var now = Date.now();

    var uid = _annEditingUid || ('ann_' + now + '_' + Math.random().toString(36).slice(2, 7));

    var prev = _notifAnnouncements.find(function(x){ return x.uid === uid; });



    var eventObj = {

        op: 'upsert',

        uid: uid,

        title: title,

        body: (bodyEl && bodyEl.value || '').trim(),

        category: (catEl && catEl.value) || 'duyuru',

        pinned: !!(pinEl && pinEl.checked),

        img: (imgEl && imgEl.value || '').trim(),

        link: (linkEl && linkEl.value || '').trim(),

        linkLabel: 'Bağlantıyı Aç',

        countdownAt: countdownAt,

        createdAt: (prev && prev.createdAt) || now,

        updatedAt: now

    };



    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yayınlanıyor...'; }



    var res = await supabaseClient.from('comments').insert([{

        ep_key: _ANN_EP_KEY,

        username: currentUser || 'Yönetici',

        content: JSON.stringify(eventObj)

    }]);



    if (res.error) {

        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Herkese Yayınla'; }

        showToast('❌ Duyuru gönderilemedi: ' + res.error.message);

        return;

    }



    _annEditingUid = null;

    await _notifFetchAnnouncements(true);

    showToast('📢 Duyuru tüm kullanıcılara yayınlandı!');

    var body = document.getElementById('annAdminModalBody');

    if (body) _renderAdminComposerUI(body);

};



window.togglePinAnnouncement = async function(uid) {

    var target = _notifAnnouncements.find(function(x){ return x.uid === uid; });

    if (!target) return;

    var updated = Object.assign({}, target, {

        op: 'upsert',

        pinned: !target.pinned,

        updatedAt: Date.now()

    });

    var res = await supabaseClient.from('comments').insert([{

        ep_key: _ANN_EP_KEY,

        username: currentUser || 'Yönetici',

        content: JSON.stringify(updated)

    }]);

    if (!res.error) {

        await _notifFetchAnnouncements(true);

        var body = document.getElementById('annAdminModalBody');

        if (body) _renderAdminComposerUI(body);

        showToast(updated.pinned ? '📌 Duyuru üste sabitlendi' : 'Sabitleme kaldırıldı');

    }

};



window.deleteAnnouncement = async function(uid) {

    if (!confirm('Bu duyuruyu herkesten kaldırmak istediğine emin misin?')) return;

    var res = await supabaseClient.from('comments').insert([{

        ep_key: _ANN_EP_KEY,

        username: currentUser || 'Yönetici',

        content: JSON.stringify({ op: 'delete', uid: uid, updatedAt: Date.now() })

    }]);

    if (!res.error) {

        if (_annEditingUid === uid) _annEditingUid = null;

        await _notifFetchAnnouncements(true);

        var body = document.getElementById('annAdminModalBody');

        if (body) _renderAdminComposerUI(body);

        showToast('🗑️ Duyuru kaldırıldı');

    }

};



window.openChangeAdminPassPrompt = function() {

    var body = document.getElementById('annAdminModalBody');

    if (body) _renderAdminSetupUI(body);

};



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



// Sayfa yüklenince duyuru ve bildirimleri çek

document.addEventListener('DOMContentLoaded', function() {

    _notifUpdateBadge();

    setTimeout(function() { _notifFetchAnnouncements(false); }, 1200);

    setInterval(function() { _notifFetchAnnouncements(false); }, 60000);

    setTimeout(_notifFetchUpcoming, 2800);

    // Bölüm takvimini her 10 dakikada bir güncelle

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



// ── Watchlist / History Views (Moved to Unified Full-Page Library) ──



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

    const curSrc = typeof currentSource !== 'undefined' ? currentSource : 'AnimeciX';



    // 1. Primary: Go Backend with currentSource

    try {

        data = await fetchAPI('/search?q=' + encodeURIComponent(q) + '&source=' + encodeURIComponent(curSrc));

    } catch(e) {}



    // 2. Fallback: Go Backend with alternative source if empty

    if (!data || data.length === 0) {

        try {

            const altSrc = (curSrc === 'AnimeciX') ? 'AniHub' : 'AnimeciX';

            const altData = await fetchAPI('/search?q=' + encodeURIComponent(q) + '&source=' + encodeURIComponent(altSrc));

            if (altData && altData.length > 0) {

                data = altData;

            }

        } catch(e) {}

    }



    // 3. AniList GraphQL Search Fallback

    if (!data || data.length === 0) {

        try {

            const aniQuery = `

            query($search: String) {

              Page(page: 1, perPage: 20) {

                media(search: $search, type: ANIME, isAdult: false) {

                  id

                  idMal

                  title { romaji english native }

                  coverImage { large extraLarge }

                  averageScore

                  format

                  seasonYear

                  genres

                  description(asHtml: false)

                }

              }

            }`;

            const aniRes = await fetchAniList(aniQuery, { search: q });

            if (aniRes?.Page?.media && aniRes.Page.media.length > 0) {

                data = aniRes.Page.media.map(m => {

                    const t = m.title.romaji || m.title.english || 'Bilinmiyor';

                    return {

                        ID: '',

                        Slug: '',

                        Title: t,

                        TitleEnglish: m.title.english || t,

                        ImageURL: m.coverImage?.extraLarge || m.coverImage?.large || '',

                        Score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '-',

                        Type: m.format === 'MOVIE' ? 'Film' : 'Dizi',

                        IsMovie: m.format === 'MOVIE',

                        Year: m.seasonYear || '',

                        Genres: m.genres || [],

                        Synopsis: (m.description || '').replace(/\s+/g, ' ')

                    };

                });

            }

        } catch(e) {}

    }



    // 4. Jikan Fallback (MAL)

    if (!data || data.length === 0) {

        try {

            const res = await fetch('https://api.jikan.moe/v4/anime?q=' + encodeURIComponent(q) + '&limit=25');

            const json = await res.json();

            if (json.data && json.data.length > 0) {

                data = json.data.map(a => ({

                    ID: '',

                    Slug: '',

                    Title: a.title || '',

                    TitleEnglish: a.title_english || a.title || '',

                    ImageURL: a.images?.jpg?.image_url || '',

                    Score: a.score || '-',

                    Type: a.type || 'TV',

                    IsMovie: (a.type || '').toLowerCase() === 'movie',

                    Year: a.year || '',

                    Synopsis: a.synopsis || ''

                }));

            }

        } catch(e) {}

    }



    // 5. GitHub Static DB Fallback

    if ((!data || data.length === 0) && typeof appSettings !== 'undefined' && appSettings.homeDataSource === 'anitr') {

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

            

            const matched = allAnimes.filter(a => {

                const t = (a.title || a.title_english || a.name || '').toLowerCase();

                return t.includes(queryLower);

            });

            if (matched.length > 0) {

                data = matched.map(a => {

                    const imgUrl = a.images?.jpg?.image_url || a.image_url || a.Img || a.img || '';

                    return {

                        ID: a.id || a.ID || '',

                        Slug: a.slug || a.Slug || '',

                        Title: a.title || a.name || '',

                        TitleEnglish: a.title_english || '',

                        ImageURL: imgUrl.startsWith('/') ? 'https://raw.githubusercontent.com/FOXYorj/anitr-web-api/main' + imgUrl : imgUrl,

                        Score: a.score || a.Score || '-',

                        Type: a.type || a.Type || 'TV',

                        Year: a.year || a.Year || ''

                    };

                });

            }

        } catch(e) {}

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

    if (a.id || a.slug) {

        loadDetails(a.id, a.slug, a.isMovie, a.title, a.synopsis, a.img);

    } else {

        openAnimeCard(a.title);

    }

};

window.srPlay = function(i) {

    const a = _srItem(i); if (!a) return;

    if (a.id || a.slug) {

        quickPlay(a.id, a.slug, a.isMovie, a.title, a.synopsis, a.img);

    } else {

        openAnimeCard(a.title);

    }

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



// ── History & Favorites handled by Unified Library View ──



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

    if (typeof stopHeroTimer === 'function') stopHeroTimer();

    const cHero = document.getElementById('cinematicHero');

    if (cHero) cHero.classList.add('hidden');

    window.scrollTo({ top: 0, behavior: 'instant' });

    if (typeof continueWatch !== 'undefined' && continueWatch) continueWatch.classList.add('hidden');

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

                        `<button class="btn-play-primary" id="detailPlayBtn" onclick="playFirstEpisodeOrResume('${id}')">

                            <span><i class="fa-solid fa-play"></i> Kaldığın Yerden Devam Et <em>Bölüm ${histEntry.ep}</em></span>

                        </button>` :

                        `<button class="btn-play-primary" id="detailPlayBtn" onclick="playFirstEpisodeOrResume('${id}')">

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

            <div class="detail-source-bar" id="detailSourceBar" role="tablist" aria-label="İzleme Kaynağı Seçici">
                <span class="detail-source-lbl">YAYIN KAYNAĞI</span>
                <div class="detail-source-pills">
                    ${['AnimeciX', 'AniHub', 'Anizium Free', 'Anizium'].map(s => `<button type="button" class="detail-source-pill${currentSource === s ? ' active' : ''}" onclick="switchDetailSource('${s}')">${s}</button>`).join('')}
                </div>
            </div>
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

        const playFirstBtn = document.getElementById('detailPlayBtn') || document.getElementById('playBtn');

        if (playFirstBtn) {

            playFirstBtn.onclick = () => {

                currentEpisodes = [{ ID: '', Title: 'Film' }];

                watchEpisode(id, slug, isMovie, currentEpisodes[0], 0, 0, title, synopsis, img);

            };

        }

        return;

    }



    let seasonsData = [];
    if (window._skipNextSeasonsFetch) {
        window._skipNextSeasonsFetch = false;
    } else {
        const resolved = await _fetchSeasonsWithFallback(id, slug, title);
        id = resolved.id;
        slug = resolved.slug;
        seasonsData = resolved.seasons;
    }

    if (!_hasValidSeasons(seasonsData)) {

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

window.playFirstEpisodeOrResume = function(animeId) {

    const hist = getHistory().find(h => String(h.id) === String(animeId));

    if (hist && typeof resumeWatch === 'function') {

        resumeWatch(animeId);

        return;

    }

    const ep0 = document.getElementById('ep-btn-0');

    if (ep0) {

        ep0.click();

        return;

    }

    if (currentEpisodes && currentEpisodes.length > 0 && currentAnime) {

        watchEpisode(currentAnime.id, currentAnime.slug, currentAnime.isMovie, currentEpisodes[0], 0, 0, currentAnime.title, currentAnime.synopsis, currentAnime.img);

        return;

    }

    showToast('Bölümler yükleniyor, lütfen bekleyin...');

};



async function loadEpisodes(id, slug, seasonId, isMovie, animeTitle, synopsis, imgUrl) {

    const epsContainer = document.getElementById('episodesList');

    if (!epsContainer) return;

    epsContainer.innerHTML = Array(6).fill('<div class="skeleton"></div>').join('');



    const idArg   = id   ? 'id='   + id + '&season_id=' + id  : '';

    const slugArg = (slug && slug !== 'null' && slug !== 'undefined') ? 'slug=' + encodeURIComponent(slug) : '';

    const seasonArg = (seasonId !== undefined && seasonId !== null) ? 'season_num=' + encodeURIComponent(seasonId) : '';

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

    const playFirstBtn = document.getElementById('detailPlayBtn') || document.getElementById('playBtn');

    if (playFirstBtn) {

        playFirstBtn.onclick = () => watchEpisode(id, slug, isMovie, (currentEpisodes && currentEpisodes[0]) || epsData[0], parseInt(seasonId) || 0, 0, animeTitle, synopsis, imgUrl);

    }



    epsContainer.style.display = 'grid';

    epsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';

    epsContainer.style.gap = '15px';



    const fallbackThumb = imgUrl || 'https://placehold.co/320x180/1a1a28/e8a020?text=?';



    // RENDER ALL EPISODES IMMEDIATELY WITHOUT BLOCKING

    currentEpisodes.forEach((ep, idx) => {

        const epNum = ep.Number || (idx + 1);

        let label = ep.Title || ('Bölüm ' + epNum);

        if (label.toLowerCase().startsWith('episode ')) label = label;



        const thumb = ep.kitsuThumb || fallbackThumb;

        ep.kitsuThumb = thumb;

        ep.kitsuTitle = label;



        const key       = (slug || id) + '_s' + seasonId + '_e' + idx;

        const isWatched = watched.includes(key);

        const sIdx      = parseInt(seasonId) || 0;



        const btn = document.createElement('div');

        btn.id = 'ep-btn-' + idx;

        btn.className = 'episode-card' + (isWatched ? ' watched' : '');

        btn.dataset.epIdx = idx;

        btn.onclick = () => { if (!bulkDownloadMode) watchEpisode(id, slug, isMovie, ep, sIdx, idx, animeTitle, synopsis, imgUrl); };

        

        btn.innerHTML = `

            <div class="ep-card-thumb">

                <img class="ep-thumb-img" src="${thumb}" onerror="this.src='${fallbackThumb}'">

                <div class="ep-play-overlay"><i class="fa-solid fa-play"></i></div>

            </div>

            <div class="ep-card-info">

                <div class="ep-card-title"><span class="ep-card-num">${epNum}</span> <span class="ep-title-txt">${label}</span></div>

                <div class="ep-card-date">Yayınlandı</div>

            </div>

        `;

        epsContainer.appendChild(btn);

    });



    // Background Async Thumbnail Enrichment (Non-blocking)

    (async () => {

        try {

            let kitsuEps = {};

            const tvmRes = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(animeTitle)}&embed=episodes`).catch(() => null);

            if (tvmRes && tvmRes.ok) {

                const tvm = await tvmRes.json();

                if (tvm && tvm._embedded && tvm._embedded.episodes) {

                    const sNum = parseInt(seasonId) || 1;

                    tvm._embedded.episodes.forEach(e => {

                        if (e.season === sNum || sNum === 0 || sNum === 1) {

                            kitsuEps[e.number] = {

                                thumbnail: e.image ? e.image.original : null,

                                title: e.name,

                                airdate: e.airdate

                            };

                        }

                    });

                }

            }



            if (Object.keys(kitsuEps).length < Math.min(currentEpisodes.length, 5)) {

                const sNum = parseInt(seasonId) || 1;

                const q = sNum > 1 ? `${animeTitle} Season ${sNum}` : animeTitle;

                const searchRes = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}`).catch(() => null);

                if (searchRes && searchRes.ok) {

                    const searchData = await searchRes.json();

                    if (searchData.data && searchData.data.length > 0) {

                        const kitsuId = searchData.data[0].id;

                        const kRes = await fetch(`https://kitsu.io/api/edge/anime/${kitsuId}/episodes?page[limit]=20`).catch(() => null);

                        if (kRes && kRes.ok) {

                            const res = await kRes.json();

                            if (res.data) {

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

                        }

                    }

                }

            }



            if (Object.keys(kitsuEps).length > 0) {

                currentEpisodes.forEach((ep, idx) => {

                    const epNum = ep.Number || (idx + 1);

                    const kData = kitsuEps[epNum];

                    if (kData) {

                        if (kData.thumbnail) ep.kitsuThumb = kData.thumbnail;

                        if (kData.title) ep.kitsuTitle = kData.title;

                        const cardEl = document.getElementById('ep-btn-' + idx);

                        if (cardEl) {

                            if (kData.thumbnail) {

                                const imgEl = cardEl.querySelector('.ep-thumb-img');

                                if (imgEl) imgEl.src = kData.thumbnail;

                            }

                            if (kData.title) {

                                const tEl = cardEl.querySelector('.ep-title-txt');

                                if (tEl) tEl.textContent = kData.title;

                            }

                            if (kData.airdate) {

                                const dEl = cardEl.querySelector('.ep-card-date');

                                if (dEl) {

                                    try { dEl.textContent = new Date(kData.airdate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch(e){}

                                }

                            }

                        }

                    }

                });

            }

        } catch(e) {

            console.warn("Background thumbnail error:", e);

        }

    })();



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


// ── Çeviri Grubu Seçici (AnimeCiX) ───────────────────────
let _currentTransGroups = [];
let _currentTransArgs   = null;

function renderTranslationGroups(ep, id, slug, isMovie, sIdx, eIdx, animeTitle, synopsis, imgUrl) {
    const bar  = document.getElementById('translationGroupBar');
    const btns = document.getElementById('transGroupButtons');
    if (!bar || !btns) return;

    const groups = (ep && ep.Extra && Array.isArray(ep.Extra.groups) && ep.Extra.groups.length > 1)
        ? ep.Extra.groups
        : null;

    if (currentSource !== 'AnimeciX' || !groups) {
        bar.classList.add('hidden');
        return;
    }

    _currentTransGroups = groups;
    _currentTransArgs   = { id, slug, isMovie, sIdx, eIdx, animeTitle, synopsis, imgUrl };

    bar.classList.remove('hidden');
    btns.innerHTML = '';

    // Preferred group from localStorage
    const pref = localStorage.getItem('anitr_pref_group_animecix') || '';

    let activeIdx = 0;
    if (pref) {
        const pi = groups.findIndex(g => g.name === pref);
        if (pi >= 0) activeIdx = pi;
    }

    groups.forEach((g, i) => {
        const label = g.name && g.name.trim() ? g.name.trim() : ('Grup ' + (i + 1));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'trans-group-btn' + (i === activeIdx ? ' active' : '');
        btn.textContent = label;
        btn.onclick = () => selectTransGroup(i, btn);
        btns.appendChild(btn);
    });

    return activeIdx; // return preferred index so caller can use correct URL
}

function selectTransGroup(idx, btnEl) {
    if (!_currentTransGroups || !_currentTransArgs) return;

    // Update active state
    document.querySelectorAll('.trans-group-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    const g = _currentTransGroups[idx];
    if (!g) return;

    // Save preference
    if (g.name) localStorage.setItem('anitr_pref_group_animecix', g.name);

    // Build a fake episode with this group's URL
    const { id, slug, isMovie, sIdx, eIdx, animeTitle, synopsis, imgUrl } = _currentTransArgs;
    const fakeEp = { ...currentEpisode, ID: g.url };
    watchEpisode(id, slug, isMovie, fakeEp, sIdx, eIdx, animeTitle, synopsis, imgUrl);
}

async function watchEpisode(id, slug, isMovie, ep, sIdx, eIdx, animeTitle, synopsis, imgUrl) {

    if (!ep) { showToast('❌ Bölüm bilgileri eksik, lütfen tekrar deneyin.'); return; }

    currentEpisode = ep;

    const label  = ep.Title || ('Bölüm ' + (ep.Number || (eIdx + 1)));

    const epKey  = (slug || id) + '_s' + sIdx + '_e' + eIdx;



    addToHistory({ id, slug, isMovie, title: animeTitle, img: imgUrl, synopsis, lastWatchedLabel: label, ep, sIdx, eIdx, kitsuThumb: (ep && ep.kitsuThumb) ? ep.kitsuThumb : null });

    markWatched(epKey);



    showWatchView();

    // Çeviri grubu barını render et (AnimeciX için)
    const _prefGroupIdx = renderTranslationGroups(ep, id, slug, isMovie, sIdx, eIdx, animeTitle, synopsis, imgUrl);
    // Preferred grup URL'sini kullan
    if (typeof _prefGroupIdx === 'number' && _currentTransGroups && _currentTransGroups[_prefGroupIdx]) {
        ep = { ...ep, ID: _currentTransGroups[_prefGroupIdx].url };
    }

    const _epNumInit = ep.Number || (eIdx + 1);

    const _epPillEl = document.getElementById('watchEpPill');

    if (_epPillEl) _epPillEl.textContent = isMovie ? 'FİLM' : (_epNumInit + '. BÖLÜM');

    document.getElementById('watchTitle').textContent       = 'Yükleniyor...';

    document.getElementById('watchAnimeTitle').textContent  = animeTitle || '';

    document.getElementById('watchSource').textContent      = currentSource;

    document.getElementById('watchSynopsis').textContent    = synopsis   || 'Bu bölüm için henüz özet eklenmedi.';

    const _synWrap = document.getElementById('watchSynopsisWrapper');

    const _synBtn = document.getElementById('watchSynopsisBtn');

    if (_synWrap) _synWrap.classList.remove('expanded');

    if (_synBtn) _synBtn.classList.remove('active');



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

    if (typeof updateWatchFollowBtn === 'function') updateWatchFollowBtn();

    if (typeof updateWatchNavState === 'function') updateWatchNavState();

    if (typeof applyAmbient === 'function') applyAmbient();

    populateSidebarEpisodes(id, slug, isMovie, animeTitle, synopsis, imgUrl);

    if(typeof fetchComments === 'function') fetchComments(epKey);



    const resumeTime = getPosition(epKey);

    if (resumeTime > 10) {

        showToast('⏩ ' + Math.floor(resumeTime / 60) + ':' + String(Math.floor(resumeTime % 60)).padStart(2, '0') + ' kaldığı yerden devam ediliyor...', 3000);

    }



    const urlArg  = ep.ID   ? 'url='  + encodeURIComponent(ep.ID) : '';

    const idArg   = id      ? 'id='   + id   : '';

    const slugArg = (slug && slug !== 'null' && slug !== 'undefined') ? 'slug=' + encodeURIComponent(slug) : '';

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

    const legacyPosMap = ls.getRaw(currentSourcePositionsKey, {});



    const counterEl = document.getElementById('watchEpCounter');

    if (counterEl) {

        const curDisp = currentEpisodes.length ? Math.min(currentEIdx + 1, currentEpisodes.length) : 0;

        counterEl.textContent = `${curDisp} / ${currentEpisodes.length}`;

    }

    if (typeof updateWatchNavState === 'function') updateWatchNavState();



    // Detay sayfasındaki gibi: Kitsu kapağını tercih et, yoksa ana resmi kullan

    const fallbackCover = imgUrl || '';



    currentEpisodes.forEach((ep, idx) => {

        const epNum = ep.Number || (idx + 1);

        let label = ep.kitsuTitle || ep.Title || ('Bölüm ' + epNum);

        if (label.toLowerCase() === 'bölüm ' + epNum || label.toLowerCase() === 'episode ' + epNum)

            label = 'Bölüm ' + epNum;

        const safeLabel = String(label).replace(/</g, '&lt;').replace(/>/g, '&gt;');



        const key       = (slug || id) + '_s' + currentSIdx + '_e' + idx;

        const isWatched = watched.includes(key);

        const isActive  = idx === currentEIdx;



        const savedSec = (!isWatched || isActive) ? getPosition(key, legacyPosMap) : 0;

        const progPct  = savedSec > 15 ? Math.min(94, Math.max(8, Math.round((savedSec / 1420) * 100))) : 0;



        // Küçük resim: bölüm özel > ana kapak

        const thumb = ep.kitsuThumb || fallbackCover || 'https://placehold.co/320x180/1a1a28/5a5a78?text=?';



        const card = document.createElement('div');

        card.className = 'sep2-card' + (isActive ? ' active' : '') + (isWatched ? ' watched' : '');

        card.style.setProperty('--ep-i', Math.min(idx, 14));

        card.onclick = (e) => {

            if (e.target.closest('.sep2-mark-btn')) return;

            watchEpisode(id, slug, isMovie, ep, currentSIdx, idx, animeTitle, synopsis, imgUrl);

        };



        const statusIcon = isActive

            ? '<span class="sep2-badge playing">Şu An Oynatılıyor</span>'

            : isWatched

              ? '<span class="sep2-badge done"><i class="fa-solid fa-check"></i> İzlendi</span>'

              : '<span class="sep2-badge num">' + epNum + '. Bölüm</span>';



        card.innerHTML = `

            <div class="sep2-thumb-wrap">

                <img class="sep2-thumb" src="${thumb}" alt="" loading="lazy" onerror="if(!this.dataset.fb&&'${fallbackCover}'){this.dataset.fb='1';this.src='${fallbackCover}';}else{this.style.opacity='0';}">

                ${isActive

                    ? '<div class="sep2-eq" aria-hidden="true"><span></span><span></span><span></span></div>'

                    : `<span class="sep2-ep-chip">${epNum}</span><div class="sep2-play-layer"><i class="fa-solid fa-play"></i></div>`

                }

                ${progPct > 0 ? `<div class="sep2-prog"><i style="width:${progPct}%"></i></div>` : ''}

            </div>

            <div class="sep2-info">

                ${statusIcon}

                <div class="sep2-title">${safeLabel}</div>

            </div>

            <button type="button" class="sep2-mark-btn ${isWatched ? 'is-watched' : ''}" data-ep-num="${epNum}" title="${isWatched ? 'İzlenmedi olarak işaretle' : 'İzlendi olarak işaretle'}" onclick="toggleWatchedStatus('${key}', this.closest('.sep2-card'))">

                <i class="fa-solid fa-check"></i>

            </button>

        `;

        sidebar.appendChild(card);



        if (isActive) {

            setTimeout(() => {

                if (sidebar && sidebar.scrollHeight > sidebar.clientHeight) {

                    const targetTop = Math.max(0, card.offsetTop - (sidebar.clientHeight / 2) + (card.offsetHeight / 2));

                    sidebar.scrollTo({ top: targetTop, behavior: 'smooth' });

                }

            }, 260);

        }

    });

    try { anitrFillerOnWatch(); } catch (e) {}

}



// Helper to toggle watched status directly from sidebar

window.toggleWatchedStatus = function(key, cardEl) {

    let watched = getWatched();

    const isWatched = watched.includes(key);

    const btn = cardEl.querySelector('.sep2-mark-btn');

    const epNum = (btn && btn.dataset.epNum) ? btn.dataset.epNum : '';

    if (isWatched) {

        watched = watched.filter(w => w !== key);

        cardEl.classList.remove('watched');

        if (btn) {

            btn.classList.remove('is-watched');

            btn.title = 'İzlendi olarak işaretle';

        }

        if (!cardEl.classList.contains('active')) {

            const badge = cardEl.querySelector('.sep2-badge');

            if (badge) {

                badge.className = 'sep2-badge num';

                badge.textContent = epNum ? (epNum + '. Bölüm') : 'Bölüm';

            }

        }

        showToast('İzlendi işareti kaldırıldı.');

    } else {

        watched.push(key);

        cardEl.classList.add('watched');

        if (btn) {

            btn.classList.add('is-watched');

            btn.title = 'İzlenmedi olarak işaretle';

        }

        if (!cardEl.classList.contains('active')) {

            const badge = cardEl.querySelector('.sep2-badge');

            if (badge) {

                badge.className = 'sep2-badge done';

                badge.innerHTML = '<i class="fa-solid fa-check"></i> İzlendi';

            }

        }

        showToast('İzlendi olarak işaretlendi.');

    }

    saveWatched(watched);

};



window.updateWatchNavState = function() {

    const prevBtn = document.getElementById('watchPrevEpBtn');

    const nextBtn = document.getElementById('watchNextEpBtn');

    const hasPrev = Array.isArray(currentEpisodes) && currentEIdx > 0;

    const hasNext = Array.isArray(currentEpisodes) && (currentEIdx + 1) < currentEpisodes.length;

    if (prevBtn) prevBtn.disabled = !hasPrev;

    if (nextBtn) nextBtn.disabled = !hasNext;

};



window.playPrevEpisode = function() {

    if (!currentAnime || !Array.isArray(currentEpisodes) || !currentEpisodes.length) return;

    if (currentEIdx > 0) {

        const prevEp = currentEpisodes[currentEIdx - 1];

        watchEpisode(currentAnime.id, currentAnime.slug, currentAnime.isMovie, prevEp, currentSIdx, currentEIdx - 1, currentAnime.title, currentAnime.synopsis, currentAnime.img);

    } else {

        showToast('İlk bölümdesiniz.');

    }

};



window.playNextEpisodeManual = function() {

    if (!currentAnime || !Array.isArray(currentEpisodes) || !currentEpisodes.length) return;

    if (currentEIdx + 1 < currentEpisodes.length) {

        const nextEp = currentEpisodes[currentEIdx + 1];

        watchEpisode(currentAnime.id, currentAnime.slug, currentAnime.isMovie, nextEp, currentSIdx, currentEIdx + 1, currentAnime.title, currentAnime.synopsis, currentAnime.img);

    } else {

        showToast('Bu sezonun son bölümündesiniz.');

    }

};



window.backToAnimeDetails = function() {

    if (currentAnime && (currentAnime.id || currentAnime.slug)) {

        loadDetails(currentAnime.id, currentAnime.slug, currentAnime.isMovie, currentAnime.title, currentAnime.synopsis, currentAnime.img);

    } else {

        loadHome();

    }

};



window.toggleWatchSynopsis = function() {

    const wrap = document.getElementById('watchSynopsisWrapper');

    const btn  = document.getElementById('watchSynopsisBtn');

    if (!wrap) return;

    const exp = wrap.classList.toggle('expanded');

    if (btn) btn.classList.toggle('active', exp);

};



window.updateWatchFollowBtn = function() {

    const btn = document.getElementById('watchFollowBtn');

    if (!btn || !currentAnime) return;

    const keyId = String(currentAnime.id || currentAnime.slug || '');

    const isFollowed = Array.isArray(_notifFollowedList) && _notifFollowedList.some(a =>

        (keyId && String(a.id) === keyId) || (currentAnime.slug && a.slug === currentAnime.slug)

    );

    btn.classList.toggle('active', isFollowed);

    btn.innerHTML = isFollowed

        ? '<i class="fa-solid fa-bell"></i><span>Takip Ediliyor</span>'

        : '<i class="fa-regular fa-bell"></i><span>Takip Et</span>';

};



window.toggleFollowFromWatch = function() {

    if (!currentAnime) return;

    const idKey = currentAnime.id || currentAnime.slug;

    const isFollowed = Array.isArray(_notifFollowedList) && _notifFollowedList.some(a =>

        String(a.id) === String(idKey) || (currentAnime.slug && a.slug === currentAnime.slug)

    );

    if (isFollowed) {

        const target = _notifFollowedList.find(a => String(a.id) === String(idKey) || (currentAnime.slug && a.slug === currentAnime.slug));

        if (target) notifUnfollow(target.id);

        showToast('Takip bırakıldı.');

    } else {

        notifFollow(idKey, currentAnime.slug || '', !!currentAnime.isMovie, currentAnime.title || '', currentAnime.img || '');

    }

    updateWatchFollowBtn();

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

function _toStreamProxyUrl(rawUrl) {

    if (!rawUrl || typeof rawUrl !== 'string') return '';

    const u = rawUrl.trim();

    if (!u || u.startsWith('/api/proxy') || u.startsWith('blob:') || u.startsWith('data:') || u.startsWith('/')) {

        return u;

    }

    return '/api/proxy?url=' + encodeURIComponent(u);

}



function _inferStreamMime(rawUrl) {

    const clean = String(rawUrl || '').toLowerCase().split('?')[0];

    if (clean.endsWith('.m3u8') || String(rawUrl || '').toLowerCase().includes('.m3u8')) {

        return 'application/x-mpegURL';

    }

    if (clean.endsWith('.webm')) return 'video/webm';

    return 'video/mp4';

}



function openPlayer(watch, resumeAt) {

    resumeAt = resumeAt || 0;

    const rawUrls   = (watch.Urls || []).filter(Boolean);

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



    if (!rawUrls.length) { showToast('❌ Oynatılabilir video bulunamadı.'); return; }



    const urls      = rawUrls.map(_toStreamProxyUrl);

    const mimeTypes = rawUrls.map(_inferStreamMime);

    const videoUrl  = urls[0];

    const mimeType  = mimeTypes[0];



    // Altyazı parçaları

    const trackDefs = [];

    if (subtitles && subtitles.length > 0) {

        subtitles.forEach(sub => {

            trackDefs.push({ kind: 'subtitles', label: sub.Label || sub.Group.toUpperCase(), srclang: sub.Group, src: '/api/proxy?url=' + encodeURIComponent(sub.Link), default: sub.Group === 'tr' });

        });

    } else if (trCaption) {

        trackDefs.push({ kind: 'subtitles', label: 'Türkçe', srclang: 'tr', src: '/api/proxy?url=' + encodeURIComponent(trCaption), default: true });

    }



    // Video.js başlat veya native fallback

    if (typeof videojs === 'undefined') {

        console.warn('Video.js CDN not ready; falling back to native player.');

        const nativeEl = document.getElementById('animePlayer');

        if (nativeEl) {

            nativeEl.src = videoUrl;

            nativeEl.controls = true;

            if (resumeAt > 10) {

                nativeEl.addEventListener('loadedmetadata', () => { nativeEl.currentTime = resumeAt; }, { once: true });

            }

            nativeEl.play().catch(() => {});

        }

        return;

    }



    try {

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

    } catch(err) {

        console.error('Video.js initialization error, using native HTML5 video:', err);

        const nativeEl = document.getElementById('animePlayer');

        if (nativeEl) {

            nativeEl.src = videoUrl;

            nativeEl.controls = true;

            if (resumeAt > 10) {

                nativeEl.addEventListener('loadedmetadata', () => { nativeEl.currentTime = resumeAt; }, { once: true });

            }

            nativeEl.play().catch(() => {});

        }

        return;

    }



    // Kaynak yükle

    vjsPlayer.src({ src: videoUrl, type: mimeType });



    // Çoklu kalite bilgisini anında ata ve kaynak hatasında alt kaliteye otomatik geç

    if (urls.length > 1) {

        _buildQualityMenu(vjsPlayer, urls, labels, mimeType, mimeTypes);

    }

    let _autoFallbackIdx = 0;

    vjsPlayer.on('error', function() {

        // Anizium / Anizium Free akışı başarısız olduğunda art arda tüm kalite URL'lerine istek atmayı engelle

        if (typeof currentSource === 'string' && currentSource.toLowerCase().indexOf('anizium') !== -1) {

            showToast('⚠️ Anizium video bağlantısı alınamadı (IP banı riskine karşı otomatik tekrar durduruldu). Başka bir kaynak seçin.', 4000);

            return;

        }

        const nextIdx = _autoFallbackIdx + 1;

        if (nextIdx < urls.length) {

            _autoFallbackIdx = nextIdx;

            const nextLbl = labels[nextIdx] || ((nextIdx + 1) + '. kaynak');

            if (vjsPlayer._anitrQuality) vjsPlayer._anitrQuality.current = nextIdx;

            showToast('⚠️ Üst kalite açılamadı, ' + nextLbl + ' deneniyor...', 2800);

            vjsPlayer.error(null);

            vjsPlayer.src({ src: urls[nextIdx], type: mimeTypes[nextIdx] || mimeType });

            vjsPlayer.play().catch(() => {});

        }

    });



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

                // Frame thumbnail capture (Kaldigim Kare ozelligi)

                if ((appSettings.cwThumbnail || 'cover') === 'frame') {

                    const _lastCap = parseInt(localStorage.getItem('anitr_cw_thumb_last_' + currentEpisodeKey) || '0');

                    if (tFloor - _lastCap >= 30) {

                        try {

                            const _vidEl = document.getElementById('animePlayer')

                                ? document.getElementById('animePlayer').querySelector('video')

                                : document.querySelector('video');

                            if (_vidEl && _vidEl.videoWidth > 0 && !_vidEl.paused) {

                                const _cnv = document.createElement('canvas');

                                _cnv.width = 320; _cnv.height = 180;

                                _cnv.getContext('2d').drawImage(_vidEl, 0, 0, 320, 180);

                                const _dataUrl = _cnv.toDataURL('image/jpeg', 0.4);

                                localStorage.setItem('anitr_cw_thumb_' + currentEpisodeKey, _dataUrl);

                                localStorage.setItem('anitr_cw_thumb_last_' + currentEpisodeKey, String(tFloor));

                                const _tKeys = Object.keys(localStorage).filter(k => k.startsWith('anitr_cw_thumb_') && !k.includes('_last_'));

                                if (_tKeys.length > 30) {

                                    _tKeys.slice(0, _tKeys.length - 30).forEach(k => {

                                        localStorage.removeItem(k);

                                        localStorage.removeItem(k.replace('anitr_cw_thumb_', 'anitr_cw_thumb_last_'));

                                    });

                                }

                            }

                        } catch(_e) {}

                    }

                }

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



const _malState = {
    tab: 'watching',
    query: '',
    sort: 'default',
    viewMode: localStorage.getItem('anitr_mal_viewmode') || 'grid',
    loading: false,
    error: '',
    profile: null,
    items: {} // status -> array
};

function _malEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _moveMalTabInk() {
    const wrap = document.getElementById('malStatusTabs');
    const ink = document.getElementById('malTabInk');
    if (!wrap || !ink) return;
    const act = wrap.querySelector('.lib-tab-btn.active');
    if (!act || !act.offsetWidth) return;
    ink.style.width = act.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + (act.offsetLeft - 3) + 'px)';
}
window.addEventListener('resize', _moveMalTabInk);

function checkMALStatus() {
    const savedUser = (localStorage.getItem('anitr_mal_username') || '').trim();
    malUser = savedUser;
    if (document.getElementById('malUsernameInput')) {
        document.getElementById('malUsernameInput').value = malUser;
    }
}

window.connectMALDirect = async function(usernameArg) {
    const inp = document.getElementById('malQuickUserInput') || document.getElementById('malEmptyUserInput');
    const u = String(usernameArg != null ? usernameArg : (inp ? inp.value : '')).trim();
    if (!u) {
        showToast('⚠️ Lütfen bir MyAnimeList kullanıcı adı girin.');
        return;
    }
    localStorage.setItem('anitr_mal_username', u);
    malUser = u;
    _malState.items = {};
    _malState.profile = null;
    _malState.error = '';
    showToast(`🔄 "${u}" MAL profili senkronize ediliyor...`);
    renderMALPage(true);
    fetchMALProfileSummary(u);
    await loadMALList(_malState.tab);
};

window.disconnectMALAccount = function() {
    localStorage.removeItem('anitr_mal_username');
    malUser = '';
    _malState.items = {};
    _malState.profile = null;
    _malState.error = '';
    renderMALPage(true);
    showToast('🗑️ MyAnimeList hesap bağlantısı kaldırıldı.');
};

async function fetchMALProfileSummary(username) {
    if (!username) return;
    try {
        const res = await fetch(`${API_BASE}/mal/profile?username=${encodeURIComponent(username)}`);
        if (res.ok) {
            const data = await res.json();
            _malState.profile = data;
            renderMALPage(true, true);
        }
    } catch (_) {}
}

let currentMALTab = 'watching';

function switchMALTab(status) {
    currentMALTab = status;
    _malState.tab = status;
    _malState.error = '';
    renderMALPage(true);
    if (_malState.items[status] && _malState.items[status].length) {
        return;
    }
    loadMALList(status);
}

window.malSetViewMode = function(mode) {
    _malState.viewMode = mode;
    try { localStorage.setItem('anitr_mal_viewmode', mode); } catch (_) {}
    renderMALPage(true);
};

window.malOnSearch = function(val) {
    _malState.query = String(val || '');
    renderMALPage(true, true);
};

window.malOnSort = function(val) {
    _malState.sort = val || 'default';
    renderMALPage(true);
};

window.renderMALFilteredGrid = function() {
    const si = document.getElementById('malListSearchInput');
    const so = document.getElementById('malListSortSelect');
    if (si) _malState.query = si.value;
    if (so) _malState.sort = so.value;
    renderMALPage(true, true);
};

window.malSyncToAnitrLibrary = function() {
    const activeItems = _malState.items[_malState.tab] || [];
    if (!activeItems.length) {
        showToast('⚠️ Aktarılacak anime bulunamadı.');
        return;
    }
    const statusNames = {
        watching: 'MAL · İzleniyor',
        completed: 'MAL · Tamamlananlar',
        plantowatch: 'MAL · Planlananlar',
        onhold: 'MAL · Beklemede',
        dropped: 'MAL · Bırakılanlar',
        recs: 'MAL · Öneriler'
    };
    const listName = statusNames[_malState.tab] || `MAL · ${malUser}`;
    const lists = getMyLists();
    let target = lists.find(l => l.name === listName);
    if (!target) {
        target = {
            id: generateListId(),
            name: listName,
            tag: 'MyAnimeList',
            animes: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        lists.unshift(target);
    }
    const existing = new Set((target.animes || []).map(a => String(a.title || '').toLowerCase()));
    let added = 0;
    activeItems.forEach(item => {
        const title = item.title || '';
        if (!title || existing.has(title.toLowerCase())) return;
        existing.add(title.toLowerCase());
        const img = (item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || item.image_url || '');
        target.animes.push({
            id: item.mal_id || ('mal_' + Date.now() + '_' + added),
            title: title,
            img: img,
            slug: '',
            isMovie: item.type === 'Movie'
        });
        added++;
    });
    target.updatedAt = Date.now();
    saveMyLists(lists);
    showToast(`✅ ${added} anime "${listName}" özel listene aktarıldı!`, 4600, {
        action: {
            label: 'Listeyi Gör',
            icon: 'fa-arrow-right',
            onClick: function() { showListDetail(target.id); }
        }
    });
};

async function loadMALList(status = _malState.tab) {
    if (!malUser) {
        renderMALPage(true);
        return;
    }
    _malState.tab = status;
    currentMALTab = status;
    _malState.loading = true;
    _malState.error = '';
    renderMALPage(true);

    if (!_malState.profile) fetchMALProfileSummary(malUser);

    try {
        const endpoint = status === 'recs'
            ? `${API_BASE}/mal/recommendations?username=${encodeURIComponent(malUser)}`
            : `${API_BASE}/mal/watchlist?username=${encodeURIComponent(malUser)}&status=${encodeURIComponent(status)}`;
        const res = await fetch(endpoint);
        if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.error || `MAL verisi alınamadı (HTTP ${res.status})`);
        }
        const data = await res.json();
        _malState.items[status] = Array.isArray(data) ? data : [];
        _malState.loading = false;
        renderMALPage(true);
    } catch (err) {
        _malState.loading = false;
        _malState.error = err.message || 'Bağlantı hatası oluştu.';
        renderMALPage(true);
    }
}

function renderMALPage(isSoft, keepInputFocus) {
    const host = document.getElementById('malPageBody');
    if (!host) return;

    const statusTabs = [
        ['watching',    'İzleniyor'],
        ['completed',   'Tamamlandı'],
        ['plantowatch', 'Planlanan'],
        ['onhold',      'Beklemede'],
        ['dropped',     'Bırakıldı'],
        ['recs',        'Özel Öneriler']
    ];

    const rawList = _malState.items[_malState.tab] || [];
    const q = (_malState.query || '').trim().toLowerCase();
    let filtered = [...rawList];
    if (q) {
        filtered = filtered.filter(it => (it.title || '').toLowerCase().includes(q));
    }
    if (_malState.sort === 'score_desc') {
        filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (_malState.sort === 'ep_desc') {
        filtered.sort((a, b) => (b.episodes_watched || b.episodes || 0) - (a.episodes_watched || a.episodes || 0));
    } else if (_malState.sort === 'title_asc') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    // Hesaplanan özet metrikler
    const allLoaded = Object.values(_malState.items).flat();
    const activeCount = rawList.length;
    const ratedItems = rawList.filter(i => Number(i.score) > 0);
    const avgScore = ratedItems.length
        ? (ratedItems.reduce((s, i) => s + Number(i.score), 0) / ratedItems.length).toFixed(2)
        : (_malState.profile?.statistics?.anime?.mean_score || '—');
    const totalEps = rawList.reduce((s, i) => s + Number(i.episodes_watched || i.num_episodes_watched || i.episodes || 0), 0) ||
        (_malState.profile?.statistics?.anime?.episodes_watched || 0);
    const estHours = Math.round((totalEps * 24) / 60);

    // İçerik Gövdesi
    let contentHtml = '';
    if (!malUser) {
        contentHtml = `
        <div class="mal-onboard-card">
            <div class="mal-ob-left">
                <span class="stx-panel-kicker">ŞİFRESİZ API SENKRONİZASYONU</span>
                <h2 class="mal-ob-title">MyAnimeList Profilini Anitr ile Eşle</h2>
                <p class="mal-ob-desc">Herhangi bir şifre veya OAuth izni gerekmeden, yalnızca herkese açık MyAnimeList kullanıcı adını girerek izleme durumlarını, verdiğin puanları ve sana özel önerileri Anitr içerisinde görüntüleyebilir ve yerel kütüphanene aktarabilirsin.</p>
                <div class="mal-ob-form">
                    <input id="malEmptyUserInput" type="text" class="lib-cp-input" placeholder="MAL kullanıcı adın (ör. Xinil)..." onkeydown="if(event.key==='Enter')connectMALDirect(this.value)">
                    <button type="button" class="lib-btn primary" onclick="connectMALDirect(document.getElementById('malEmptyUserInput').value)">
                        <i class="fa-solid fa-arrow-right"></i><span>Profili Yükle</span>
                    </button>
                </div>
                <div class="lib-cp-presets" style="border-top:none;padding-top:4px">
                    <span>Örnek Profiller:</span>
                    <button type="button" onclick="connectMALDirect('Xinil')">Xinil</button>
                    <button type="button" onclick="connectMALDirect('Garnt')">Garnt</button>
                    <button type="button" onclick="connectMALDirect('Joey')">Joey</button>
                </div>
            </div>
            <div class="mal-ob-right">
                <div class="mal-ob-spec"><span>01</span><div><strong>Tüm Durum Listeleri</strong><small>İzleniyor, Tamamlandı, Planlanan, Beklemede ve Bırakılanlar</small></div></div>
                <div class="mal-ob-spec"><span>02</span><div><strong>Tek Tıkla Anitr'de İzle</strong><small>MAL listendeki herhangi bir animeye tıklayarak Anitr'de anında aç</small></div></div>
                <div class="mal-ob-spec"><span>03</span><div><strong>Yerel Kütüphaneye Aktarım</strong><small>MAL listelerini Anitr Özel Listelerim bölümüne tek tıkla kopyala</small></div></div>
            </div>
        </div>`;
    } else if (_malState.loading) {
        contentHtml = `<div class="lib-grid">${Array(12).fill('<div class="cat-skel"><div class="cat-skel-poster"></div><div class="cat-skel-line"></div><div class="cat-skel-line s"></div></div>').join('')}</div>`;
    } else if (_malState.error) {
        contentHtml = `
        <div class="lib-empty">
            <span class="lib-empty-code">BAĞLANTI UYARISI</span>
            <h3>MyAnimeList Verisi Alınamadı</h3>
            <p>${_malEsc(_malState.error)} — Kullanıcı adının doğru olduğundan ve MAL listesinin herkese açık (Public) olduğundan emin ol.</p>
            <div class="lib-empty-actions">
                <button type="button" class="lib-btn primary" onclick="loadMALList('${_malState.tab}')"><i class="fa-solid fa-rotate-right"></i> Tekrar Dene</button>
                <button type="button" class="lib-btn danger" onclick="disconnectMALAccount()">Hesabı Değiştir</button>
            </div>
        </div>`;
    } else if (!filtered.length) {
        contentHtml = `
        <div class="lib-empty">
            <span class="lib-empty-code">00 / KAYIT YOK</span>
            <h3>${q ? 'Aramana uygun anime bulunamadı' : 'Bu MAL sekmesinde anime bulunmuyor'}</h3>
            <p>${q ? 'Arama kutusunu temizleyerek tüm listeyi görebilirsin.' : 'Farklı bir durum sekmesine (Tamamlandı, Planlanan vb.) geçiş yapabilirsin.'}</p>
        </div>`;
    } else if (_malState.viewMode === 'rows') {
        contentHtml = `<div class="lib-rows-wrap">${filtered.map((item, idx) => {
            const img = _malEsc(item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || item.image_url || 'https://placehold.co/120x170/0f0f1a/8b5cf6?text=?');
            const title = _malEsc(item.title || 'Bilinmiyor');
            const safeTitle = String(item.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeImg = String(item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const score = item.score ? Number(item.score).toFixed(1) : '—';
            const eps = item.episodes_watched || item.num_episodes_watched || item.episodes || 0;
            return `
            <div class="lib-row" onclick="searchMALAnime('${safeTitle}')">
                <span class="lib-row-idx">${String(idx + 1).padStart(2, '0')}</span>
                <img class="lib-row-poster" src="${img}" alt="" loading="lazy" onerror="this.src='https://placehold.co/120x170/0f0f1a/8b5cf6?text=?'">
                <div class="lib-row-main">
                    <strong class="lib-row-title">${title}</strong>
                    <span class="lib-row-sub">${eps ? `${eps} Bölüm` : 'MyAnimeList Kaydı'}${item.type ? ` · ${_malEsc(item.type)}` : ''}</span>
                </div>
                <div class="lib-row-meta">
                    <span class="lib-pill">Puan: <b>${score}</b></span>
                </div>
                <div class="lib-row-actions" onclick="event.stopPropagation()">
                    <button type="button" class="lib-resume-btn" onclick="searchMALAnime('${safeTitle}')"><i class="fa-solid fa-play"></i><span>Anitr'de Aç</span></button>
                    <button type="button" class="lib-icon-btn" title="Anitr Listeme Ekle" onclick="openAddToListModal({id:'${item.mal_id || safeTitle}',title:'${safeTitle}',img:'${safeImg}',slug:''})"><i class="fa-solid fa-plus"></i></button>
                </div>
            </div>`;
        }).join('')}</div>`;
    } else {
        contentHtml = `<div class="lib-grid">${filtered.map((item, idx) => {
            const img = _malEsc(item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || item.image_url || 'https://placehold.co/240x360/0f0f1a/8b5cf6?text=?');
            const title = _malEsc(item.title || 'Bilinmiyor');
            const safeTitle = String(item.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeImg = String(item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const score = item.score ? `★ ${Number(item.score).toFixed(1)}` : 'MAL';
            const eps = item.episodes_watched || item.num_episodes_watched || item.episodes || 0;
            return `
            <article class="lib-anime-card" onclick="searchMALAnime('${safeTitle}')">
                <div class="lib-poster-wrap">
                    <img class="lib-poster" src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/240x360/0f0f1a/8b5cf6?text=?'">
                    <span class="lib-card-idx">${String(idx + 1).padStart(2, '0')}</span>
                    <span class="lib-card-tag">${score}</span>
                    <div class="lib-poster-overlay">
                        <button type="button" class="lib-ov-btn primary" title="Anitr'de Ara ve İzle" onclick="event.stopPropagation();searchMALAnime('${safeTitle}')">
                            <i class="fa-solid fa-play"></i>
                        </button>
                        <button type="button" class="lib-ov-btn" title="Özel Listeme Ekle" onclick="event.stopPropagation();openAddToListModal({id:'${item.mal_id || safeTitle}',title:'${safeTitle}',img:'${safeImg}',slug:''})">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                </div>
                <div class="lib-card-meta">
                    <h4 class="lib-card-title" title="${title}">${title}</h4>
                    <p class="lib-card-sub">${eps ? `${eps} bölüm` : 'Anime'} · Puan: ${item.score || '—'}</p>
                </div>
            </article>`;
        }).join('')}</div>`;
    }

    if (keepInputFocus && document.getElementById('malContentMount')) {
        document.getElementById('malContentMount').innerHTML = contentHtml;
        return;
    }

    host.innerHTML = `
    <div class="lib-shell${isSoft ? ' is-switching' : ''}">
        <header class="lib-head">
            <div class="lib-head-left">
                <p class="cat-eyebrow">MyAnimeList Entegrasyonu</p>
                <h1 class="cat-title">MAL Kütüphanesi &amp; Senkronizasyon</h1>
                <p class="cat-count">
                    ${malUser
                        ? `Bağlı Profil: <b>@${_malEsc(malUser)}</b> <span class="cat-count-src">Aktif sekmede <b>${activeCount}</b> anime</span>`
                        : 'Şifresiz MyAnimeList profil senkronizasyonu ve yerel kütüphane aktarımı'}
                </p>
            </div>
            <div class="lib-head-right">
                <div class="mal-user-bar">
                    <input id="malQuickUserInput" type="text" value="${_malEsc(malUser)}" placeholder="MAL kullanıcı adı..." onkeydown="if(event.key==='Enter')connectMALDirect(this.value)">
                    <button type="button" class="lib-btn primary sm" onclick="connectMALDirect()">
                        <i class="fa-solid fa-arrows-rotate"></i><span>${malUser ? 'Yenile' : 'Bağlan'}</span>
                    </button>
                    ${malUser ? `<button type="button" class="lib-btn sm" onclick="malSyncToAnitrLibrary()" title="Bu sekmedeki animeleri Anitr Listelerim'e kopyala"><i class="fa-solid fa-file-import"></i><span>Listeme Aktar</span></button>` : ''}
                    ${malUser ? `<button type="button" class="lib-btn danger sm" onclick="disconnectMALAccount()" title="Bağlantıyı Kes"><i class="fa-solid fa-link-slash"></i></button>` : ''}
                </div>
            </div>
        </header>

        ${malUser ? `
        <section class="stx-kpis" aria-label="MAL Profil Özeti">
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>01</span><small>AKTİF SEKME</small></div>
                <div class="stx-kpi-val">${activeCount}<em>anime</em></div>
                <p class="stx-kpi-foot">@${_malEsc(malUser)} profilinden çekilen kayıt</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>02</span><small>İZLENEN BÖLÜM</small></div>
                <div class="stx-kpi-val">${totalEps}<em>bölüm</em></div>
                <p class="stx-kpi-foot">Bu listedeki toplam bölüm sayısı</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>03</span><small>ORTALAMA PUAN</small></div>
                <div class="stx-kpi-val">${avgScore}<em>/ 10</em></div>
                <p class="stx-kpi-foot">${ratedItems.length} puanlanmış anime ortalaması</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>04</span><small>TAHMİNİ SÜRE</small></div>
                <div class="stx-kpi-val">${estHours}<em>saat</em></div>
                <p class="stx-kpi-foot">Yaklaşık ${(estHours / 24).toFixed(1)} gün toplam izleme</p>
            </article>
        </section>

        <div class="lib-toolbar">
            <div class="lib-tabs" id="malStatusTabs" role="tablist">
                <span class="lib-tabs-ink" id="malTabInk"></span>
                ${statusTabs.map(([st, lbl]) => {
                    const cnt = _malState.items[st] ? _malState.items[st].length : '';
                    return `<button type="button" class="lib-tab-btn${_malState.tab === st ? ' active' : ''}" onclick="switchMALTab('${st}')">
                        <span>${lbl}</span>${cnt !== '' ? `<b>${cnt}</b>` : ''}
                    </button>`;
                }).join('')}
            </div>
            <div class="lib-toolbar-right">
                <div class="cat-search" style="width:220px">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input id="malListSearchInput" type="text" value="${_malEsc(_malState.query)}" placeholder="MAL listende ara..." oninput="malOnSearch(this.value)" style="height:36px;font-size:13px">
                </div>
                <select id="malListSortSelect" class="cat-select" onchange="malOnSort(this.value)">
                    <option value="default" ${_malState.sort === 'default' ? 'selected' : ''}>Varsayılan Sıra</option>
                    <option value="score_desc" ${_malState.sort === 'score_desc' ? 'selected' : ''}>Puana Göre (Yüksek → Düşük)</option>
                    <option value="ep_desc" ${_malState.sort === 'ep_desc' ? 'selected' : ''}>Bölüm Sayısına Göre</option>
                    <option value="title_asc" ${_malState.sort === 'title_asc' ? 'selected' : ''}>A → Z Sırala</option>
                </select>
                <div class="cat-density">
                    <button type="button" class="${_malState.viewMode === 'grid' ? 'active' : ''}" onclick="malSetViewMode('grid')" title="Poster Izgara"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg></button>
                    <button type="button" class="${_malState.viewMode === 'rows' ? 'active' : ''}" onclick="malSetViewMode('rows')" title="Editoryal Satır"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/><rect x="1" y="11.5" width="14" height="2.5" rx="1"/></svg></button>
                </div>
            </div>
        </div>` : ''}

        <div id="malContentMount" class="lib-content">
            ${contentHtml}
        </div>
    </div>`;

    requestAnimationFrame(_moveMalTabInk);
}

function searchMALAnime(title) {
    if (typeof searchAnimeByName === 'function') {
        searchAnimeByName(title);
        return;
    }
    if (searchInput) searchInput.value = title;
    if (searchBtn) searchBtn.click();
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

            const _w2gSt = document.getElementById('w2gStatus');

            if (_w2gSt) { _w2gSt.textContent = `🛜 ${msg.roomName} odasında`; _w2gSt.style.display = 'inline-block'; }

            const _w2gInd = document.getElementById('w2gIndicator');

            const _w2gRm  = document.getElementById('w2gRoomIdDisp');

            if (_w2gRm) _w2gRm.textContent = msg.roomName || '';

            if (_w2gInd) _w2gInd.classList.remove('hidden');

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



const _dlState = {
    filter: 'all', // 'all' | 'completed' | 'hd' | 'tr'
    query: '',
    sort: 'newest', // 'newest' | 'oldest' | 'az'
    groupByAnime: false,
    viewMode: localStorage.getItem('anitr_dl_viewmode') || 'rows',
    addLinkOpen: false
};

function _moveDlTabInk() {
    const wrap = document.getElementById('dlTabs');
    const ink = document.getElementById('dlTabInk');
    if (!wrap || !ink) return;
    const act = wrap.querySelector('.lib-tab-btn.active');
    if (!act || !act.offsetWidth) return;
    ink.style.width = act.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + (act.offsetLeft - 3) + 'px)';
}
window.addEventListener('resize', _moveDlTabInk);

function showDownloadsModal() {
    if (typeof closeNavDrawer === 'function') { try { closeNavDrawer(); } catch (_) {} }
    if (typeof closePgModal === 'function') { try { closePgModal(); } catch (_) {} }
    const dm = document.getElementById('downloadsModal');
    if (dm) dm.classList.add('hidden');

    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');
    if (typeof leaveW2GRoom === 'function') leaveW2GRoom();
    if (typeof clearProfileCurrentAnime === 'function') clearProfileCurrentAnime();
    if (typeof setAmbientBackground === 'function') setAmbientBackground(null);

    if (typeof homeView !== 'undefined' && homeView) homeView.classList.add('hidden');
    if (typeof animeListView !== 'undefined' && animeListView) animeListView.classList.add('hidden');
    if (typeof watchView !== 'undefined' && watchView) watchView.classList.add('hidden');
    if (typeof malView !== 'undefined' && malView) malView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    const nv = document.getElementById('newsView'); if (nv) nv.classList.add('hidden');

    const dv = document.getElementById('downloadsView');
    if (dv) dv.classList.remove('hidden');

    if (window.setAnavActive) setAnavActive('downloads');
    if (typeof vjsPlayer !== 'undefined' && vjsPlayer) { try { vjsPlayer.dispose(); } catch (e) {} vjsPlayer = null; }

    loadDownloads();
    renderDownloads(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeDownloadsModal() {
    const dm = document.getElementById('downloadsModal');
    if (dm) dm.classList.add('hidden');
    const dv = document.getElementById('downloadsView');
    if (dv && !dv.classList.contains('hidden')) showHomeView();
}

window.dlSetFilter = function(f) {
    _dlState.filter = f;
    renderDownloads(true);
};

window.dlSetSort = function(s) {
    _dlState.sort = s;
    renderDownloads(true);
};

window.dlSetViewMode = function(m) {
    _dlState.viewMode = m;
    try { localStorage.setItem('anitr_dl_viewmode', m); } catch (_) {}
    renderDownloads(true);
};

window.dlToggleGroup = function() {
    _dlState.groupByAnime = !_dlState.groupByAnime;
    renderDownloads(true);
};

window.dlOnSearch = function(val) {
    _dlState.query = String(val || '');
    renderDownloads(true, true);
};

window.dlToggleAddLink = function(force) {
    _dlState.addLinkOpen = typeof force === 'boolean' ? force : !_dlState.addLinkOpen;
    renderDownloads(true);
};

window.dlSaveExternalLink = function() {
    const tEl = document.getElementById('dlExtAnimeTitle');
    const eEl = document.getElementById('dlExtEpTitle');
    const uEl = document.getElementById('dlExtUrl');
    const qEl = document.getElementById('dlExtQuality');
    const animeTitle = (tEl ? tEl.value : '').trim();
    const epTitle = (eEl ? eEl.value : '').trim() || 'Bölüm 1';
    const url = (uEl ? uEl.value : '').trim();
    const quality = (qEl ? qEl.value : '1080').trim();
    if (!animeTitle || !url) {
        showToast('⚠️ Lütfen anime adını ve video/indirme bağlantısını girin.');
        return;
    }
    downloads.unshift({
        id: Date.now(),
        animeId: '',
        animeTitle: animeTitle,
        episodeTitle: epTitle,
        image: 'https://placehold.co/200x280/0f0f1a/8b5cf6?text=MP4',
        quality: quality,
        lang: 'jp',
        status: 'completed',
        url: url,
        filename: `${animeTitle} - ${epTitle} (${quality}p).mp4`
    });
    saveDownloads();
    _dlState.addLinkOpen = false;
    renderDownloads(true);
    showToast('✅ İndirme bağlantısı arşive eklendi.');
};

window.dlExportM3U = function() {
    if (!downloads.length) {
        showToast('⚠️ Dışa aktarılacak kayıt yok.');
        return;
    }
    let m3u = '#EXTM3U\n';
    downloads.forEach(d => {
        if (d.url) {
            m3u += `#EXTINF:-1,${d.animeTitle || 'Anime'} - ${d.episodeTitle || 'Bölüm'} (${d.quality || '1080'}p)\n${d.url}\n`;
        }
    });
    const blob = new Blob([m3u], { type: 'audio/x-mpegurl;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'anitr-indirilenler.m3u8';
    a.click();
    showToast('💾 M3U oynatma listesi indirildi.');
};

window.dlCopyLink = function(url, e) {
    if (e) e.stopPropagation();
    if (!url) return;
    navigator.clipboard?.writeText(url);
    showToast('📋 Video bağlantısı panoya kopyalandı.');
};

window.clearAllDownloads = function() {
    if (!downloads.length) return;
    const backup = [...downloads];
    downloads = [];
    saveDownloads();
    renderDownloads(true);
    showToast('🗑️ Tüm indirme geçmişi temizlendi.', 4800, {
        action: {
            label: 'Geri Al',
            icon: 'fa-rotate-left',
            onClick: function() {
                downloads = backup;
                saveDownloads();
                renderDownloads(true);
                showToast('✅ İndirme geçmişi geri yüklendi.');
            }
        }
    });
};

window.removeDownload = function(id, e) {
    if (e) e.stopPropagation();
    const idx = downloads.findIndex(d => String(d.id) === String(id));
    if (idx === -1) return;
    const removed = downloads[idx];
    downloads.splice(idx, 1);
    saveDownloads();
    renderDownloads(true);
    showToast(`🗑️ "${removed.animeTitle || 'Bölüm'}" indirme arşivinden silindi.`, 4500, {
        action: {
            label: 'Geri Al',
            icon: 'fa-rotate-left',
            onClick: function() {
                downloads.splice(Math.min(idx, downloads.length), 0, removed);
                saveDownloads();
                renderDownloads(true);
                showToast('✅ Kayıt geri yüklendi.');
            }
        }
    });
};

function renderDownloads(isSoft, keepInputFocus) {
    const host = document.getElementById('downloadsPageBody');
    if (!host) return;

    const total = downloads.length;
    const completedCount = downloads.filter(d => d.status === 'completed').length;
    const hdCount = downloads.filter(d => String(d.quality || '').includes('1080') || String(d.quality || '').includes('720')).length;
    const trCount = downloads.filter(d => d.lang === 'tr').length;
    const uniqueSeries = new Set(downloads.map(d => (d.animeTitle || '').trim()).filter(Boolean)).size;

    let items = [...downloads];
    if (_dlState.filter === 'completed') items = items.filter(d => d.status === 'completed');
    else if (_dlState.filter === 'hd') items = items.filter(d => String(d.quality || '').includes('1080') || String(d.quality || '').includes('720'));
    else if (_dlState.filter === 'tr') items = items.filter(d => d.lang === 'tr');

    const q = (_dlState.query || '').trim().toLowerCase();
    if (q) {
        items = items.filter(d =>
            (d.animeTitle || '').toLowerCase().includes(q) ||
            (d.episodeTitle || '').toLowerCase().includes(q)
        );
    }

    if (_dlState.sort === 'oldest') items.sort((a, b) => (a.id || 0) - (b.id || 0));
    else if (_dlState.sort === 'az') items.sort((a, b) => (a.animeTitle || '').localeCompare(b.animeTitle || ''));
    else items.sort((a, b) => (b.id || 0) - (a.id || 0));

    const addDrawerHtml = _dlState.addLinkOpen ? `
    <div class="lib-create-panel">
        <div class="lib-cp-top">
            <div>
                <span class="lib-qa-kicker">HARİCİ BAĞLANTI KAYDI</span>
                <h4>Doğrudan Bölüm / Video Bağlantısını Arşive Ekle</h4>
            </div>
            <button type="button" class="lib-icon-btn" onclick="dlToggleAddLink(false)"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="lib-cp-form">
            <input id="dlExtAnimeTitle" type="text" class="lib-cp-input" placeholder="Anime adı (ör. Solo Leveling)...">
            <input id="dlExtEpTitle" type="text" class="lib-cp-input" style="max-width:180px" placeholder="Bölüm (ör. 1. Bölüm)">
            <input id="dlExtUrl" type="url" class="lib-cp-input" placeholder="Video / MP4 / M3U8 URL...">
            <select id="dlExtQuality" class="cat-select" style="height:40px">
                <option value="1080">1080p Full HD</option>
                <option value="720">720p HD</option>
                <option value="480">480p SD</option>
            </select>
            <button type="button" class="lib-btn primary" onclick="dlSaveExternalLink()"><i class="fa-solid fa-check"></i><span>Kaydet</span></button>
        </div>
    </div>` : '';

    const buildRow = (dl, idx) => {
        const title = _libEsc(dl.animeTitle || 'Bilinmiyor');
        const safeTitle = String(dl.animeTitle || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const ep = _libEsc(dl.episodeTitle || 'Bölüm');
        const img = _libEsc(dl.image || 'https://placehold.co/120x170/0f0f1a/8b5cf6?text=?');
        const qual = _libEsc(String(dl.quality || '1080').replace(/p$/i, '') + 'p');
        const lang = dl.lang === 'tr' ? 'TR Dublaj' : 'JP / Altyazı';
        const safeUrl = String(dl.url || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const dateStr = dl.id ? _libRelDate(dl.id) : '';
        return `
        <div class="lib-row" onclick="if('${safeTitle}')searchAnimeByName('${safeTitle}')">
            <span class="lib-row-idx">${String(idx + 1).padStart(2, '0')}</span>
            <img class="lib-row-poster" src="${img}" alt="" loading="lazy" onerror="this.src='https://placehold.co/120x170/0f0f1a/8b5cf6?text=?'">
            <div class="lib-row-main">
                <strong class="lib-row-title">${title}</strong>
                <span class="lib-row-sub">${ep}${dateStr ? ` · ${dateStr}` : ''}</span>
            </div>
            <div class="lib-row-meta">
                <span class="lib-pill">${qual}</span>
                <span class="lib-pill">${lang}</span>
                <span class="lib-pill" style="color:${dl.status === 'completed' ? '#a78bfa' : 'var(--pg-muted)'}">${dl.status === 'completed' ? 'Tamamlandı' : 'Hazırlanıyor'}</span>
            </div>
            <div class="lib-row-actions" onclick="event.stopPropagation()">
                ${dl.url ? `<button type="button" class="lib-resume-btn" onclick="window.open('${safeUrl}','_blank')"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>Dosyayı Aç</span></button>` : ''}
                ${dl.url ? `<button type="button" class="lib-icon-btn" title="Bağlantıyı Kopyala" onclick="dlCopyLink('${safeUrl}',event)"><i class="fa-regular fa-copy"></i></button>` : ''}
                <button type="button" class="lib-icon-btn danger" title="Kaydı Sil" onclick="removeDownload('${dl.id}',event)"><i class="fa-solid fa-xmark"></i></button>
            </div>
        </div>`;
    };

    let bodyHtml = '';
    if (!items.length) {
        bodyHtml = addDrawerHtml + `
        <div class="lib-empty">
            <span class="lib-empty-code">00 / ARŞİV BOŞ</span>
            <h3>${q || _dlState.filter !== 'all' ? 'Filtreye uygun indirme kaydı bulunamadı' : 'Henüz indirilen bir bölüm yok'}</h3>
            <p>Herhangi bir anime bölümünü izlerken oynatıcı altındaki "İndir" butonuna tıklayarak bölümleri cihazına kaydedebilir veya harici bağlantıları burada arşivleyebilirsin.</p>
            <div class="lib-empty-actions">
                <button type="button" class="lib-btn primary" onclick="showAnimeListView();setAnavActive('anime')">Kataloğa Göz At →</button>
                <button type="button" class="lib-btn" onclick="dlToggleAddLink(true)"><i class="fa-solid fa-plus"></i> Harici Bağlantı Kaydet</button>
            </div>
        </div>`;
    } else if (_dlState.viewMode === 'grid') {
        bodyHtml = addDrawerHtml + `<div class="lib-grid">${items.map((dl, idx) => {
            const title = _libEsc(dl.animeTitle || 'Bilinmiyor');
            const safeTitle = String(dl.animeTitle || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const ep = _libEsc(dl.episodeTitle || 'Bölüm');
            const img = _libEsc(dl.image || 'https://placehold.co/240x360/0f0f1a/8b5cf6?text=?');
            const qual = _libEsc(String(dl.quality || '1080').replace(/p$/i, '') + 'p');
            const safeUrl = String(dl.url || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `
            <article class="lib-anime-card" onclick="if('${safeTitle}')searchAnimeByName('${safeTitle}')">
                <div class="lib-poster-wrap">
                    <img class="lib-poster" src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/240x360/0f0f1a/8b5cf6?text=?'">
                    <span class="lib-card-idx">${String(idx + 1).padStart(2, '0')}</span>
                    <span class="lib-card-tag">${qual}</span>
                    <div class="lib-poster-overlay">
                        ${dl.url ? `<button type="button" class="lib-ov-btn primary" title="Dosyayı Aç / İndir" onclick="event.stopPropagation();window.open('${safeUrl}','_blank')"><i class="fa-solid fa-play"></i></button>` : ''}
                        ${dl.url ? `<button type="button" class="lib-ov-btn" title="Bağlantıyı Kopyala" onclick="dlCopyLink('${safeUrl}',event)"><i class="fa-regular fa-copy"></i></button>` : ''}
                        <button type="button" class="lib-ov-btn danger" title="Sil" onclick="removeDownload('${dl.id}',event)"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div class="lib-card-meta">
                    <h4 class="lib-card-title" title="${title}">${title}</h4>
                    <p class="lib-card-sub">${ep} · ${dl.lang === 'tr' ? 'TR' : 'JP'}</p>
                </div>
            </article>`;
        }).join('')}</div>`;
    } else if (_dlState.groupByAnime) {
        const groups = new Map();
        items.forEach(d => {
            const k = d.animeTitle || 'Diğer';
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(d);
        });
        let gIdx = 0;
        bodyHtml = addDrawerHtml + Array.from(groups.entries()).map(([gName, gList]) => `
            <div class="lib-hist-group">
                <div class="lib-hist-ghead">
                    <span>${_libEsc(gName)}</span>
                    <small>${gList.length} bölüm</small>
                </div>
                <div class="lib-rows-wrap">
                    ${gList.map(dl => buildRow(dl, gIdx++)).join('')}
                </div>
            </div>
        `).join('');
    } else {
        bodyHtml = addDrawerHtml + `<div class="lib-rows-wrap">${items.map((dl, idx) => buildRow(dl, idx)).join('')}</div>`;
    }

    if (keepInputFocus && document.getElementById('dlContentMount')) {
        document.getElementById('dlContentMount').innerHTML = bodyHtml;
        return;
    }

    host.innerHTML = `
    <div class="lib-shell${isSoft ? ' is-switching' : ''}">
        <header class="lib-head">
            <div class="lib-head-left">
                <p class="cat-eyebrow">Çevrimdışı Arşiv</p>
                <h1 class="cat-title">İndirilenler</h1>
                <p class="cat-count">Cihazına indirdiğin bölümler ve kayıtlı medya bağlantıların <span class="cat-count-src"><b>${total}</b> bölüm · <b>${uniqueSeries}</b> seri</span></p>
            </div>
            <div class="lib-head-right">
                <div class="cat-search lib-search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                    <input id="dlSearchInput" type="text" value="${_libEsc(_dlState.query)}" placeholder="İndirilenlerde ara..." oninput="dlOnSearch(this.value)">
                </div>
                <div class="lib-top-actions">
                    <button type="button" class="lib-btn primary" onclick="dlToggleAddLink()"><i class="fa-solid fa-plus"></i><span>Bağlantı Ekle</span></button>
                    ${total > 0 ? `<button type="button" class="lib-btn" onclick="dlExportM3U()" title="M3U8 Oynatma Listesi Olarak İndir"><i class="fa-solid fa-file-export"></i><span>M3U Dışa Aktar</span></button>` : ''}
                    ${total > 0 ? `<button type="button" class="lib-btn danger" onclick="clearAllDownloads()"><i class="fa-regular fa-trash-can"></i><span>Temizle</span></button>` : ''}
                </div>
            </div>
        </header>

        <section class="stx-kpis" aria-label="İndirme Özeti">
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>01</span><small>TOPLAM KAYIT</small></div>
                <div class="stx-kpi-val">${total}<em>bölüm</em></div>
                <p class="stx-kpi-foot">Arşivlenen toplam bölüm sayısı</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>02</span><small>TAMAMLANAN</small></div>
                <div class="stx-kpi-val">${completedCount}<em>dosya</em></div>
                <p class="stx-kpi-foot">İndirmesi tamamlanan medya bağlantıları</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>03</span><small>FARKLI SERİ</small></div>
                <div class="stx-kpi-val">${uniqueSeries}<em>anime</em></div>
                <p class="stx-kpi-foot">İndirme arşivindeki benzersiz seriler</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>04</span><small>YÜKSEK ÇÖZÜNÜRLÜK</small></div>
                <div class="stx-kpi-val">${hdCount}<em>HD</em></div>
                <p class="stx-kpi-foot">720p ve 1080p kalitesindeki kayıtlar</p>
            </article>
        </section>

        <div class="lib-toolbar">
            <div class="lib-tabs" id="dlTabs" role="tablist">
                <span class="lib-tabs-ink" id="dlTabInk"></span>
                <button type="button" class="lib-tab-btn${_dlState.filter === 'all' ? ' active' : ''}" onclick="dlSetFilter('all')"><span>Tümü</span><b>${total}</b></button>
                <button type="button" class="lib-tab-btn${_dlState.filter === 'completed' ? ' active' : ''}" onclick="dlSetFilter('completed')"><span>Tamamlanan</span><b>${completedCount}</b></button>
                <button type="button" class="lib-tab-btn${_dlState.filter === 'hd' ? ' active' : ''}" onclick="dlSetFilter('hd')"><span>HD (720p/1080p)</span><b>${hdCount}</b></button>
                <button type="button" class="lib-tab-btn${_dlState.filter === 'tr' ? ' active' : ''}" onclick="dlSetFilter('tr')"><span>TR Dublaj</span><b>${trCount}</b></button>
            </div>
            <div class="lib-toolbar-right">
                <button type="button" class="lib-btn sm${_dlState.groupByAnime ? ' primary' : ''}" onclick="dlToggleGroup()">
                    <i class="fa-solid fa-layer-group"></i><span>Seriye Göre Grupla</span>
                </button>
                <select class="cat-select" onchange="dlSetSort(this.value)">
                    <option value="newest" ${_dlState.sort === 'newest' ? 'selected' : ''}>En Yeni</option>
                    <option value="oldest" ${_dlState.sort === 'oldest' ? 'selected' : ''}>En Eski</option>
                    <option value="az" ${_dlState.sort === 'az' ? 'selected' : ''}>Anime Adı (A → Z)</option>
                </select>
                <div class="cat-density">
                    <button type="button" class="${_dlState.viewMode === 'grid' ? 'active' : ''}" onclick="dlSetViewMode('grid')" title="Poster Izgara"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg></button>
                    <button type="button" class="${_dlState.viewMode === 'rows' ? 'active' : ''}" onclick="dlSetViewMode('rows')" title="Editoryal Satır"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="1"/><rect x="1" y="6.75" width="14" height="2.5" rx="1"/><rect x="1" y="11.5" width="14" height="2.5" rx="1"/></svg></button>
                </div>
            </div>
        </div>

        <div id="dlContentMount" class="lib-content">
            ${bodyHtml}
        </div>
    </div>`;

    requestAnimationFrame(_moveDlTabInk);
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



const SCH_DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
var _schedOnlyFollowed = false;

function _schedEsc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _schedDateFor(dayIdx) {
    const today = new Date().getDay();
    const offset = (dayIdx - today + 7) % 7;
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return { offset: offset, date: d };
}

function _schedMoveInk() {
    const wrap = document.getElementById('scheduleDayTabs');
    const ink = document.getElementById('schInk');
    if (!wrap || !ink) return;
    const act = wrap.querySelector('.sch-day.active');
    if (!act || !act.offsetWidth) return;
    if (!ink.dataset.ready) ink.style.transition = 'none';
    ink.style.width = act.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + act.offsetLeft + 'px)';
    if (!ink.dataset.ready) { void ink.offsetWidth; ink.style.transition = ''; ink.dataset.ready = '1'; }
}

function renderScheduleDayTabs(grouped) {
    const el = document.getElementById('scheduleDayTabs');
    if (!el) return;
    const today = new Date().getDay();
    const order = [0, 1, 2, 3, 4, 5, 6].map(o => (today + o) % 7);
    el.innerHTML = '<span class="sch-ink" id="schInk"></span>' + order.map((idx, o) => {
        const d = _schedDateFor(idx).date;
        const count = (grouped[idx] || []).length;
        const label = o === 0 ? 'Bugün' : o === 1 ? 'Yarın' : SCH_DAYS_SHORT[idx];
        return `<button type="button" class="sch-day${idx === scheduleActiveDay ? ' active' : ''}${o === 0 ? ' today' : ''}" data-day="${idx}" onclick="switchScheduleDay(${idx})">` +
            `<span class="sch-day-name">${label}</span><span class="sch-day-num">${d.getDate()}</span><span class="sch-day-count">${count} yayın</span></button>`;
    }).join('');
    requestAnimationFrame(_schedMoveInk);
}

function switchScheduleDay(dayIdx) {
    scheduleActiveDay = dayIdx;
    const container = document.getElementById('scheduleContainer');
    if (!container || !container._grouped) return;
    document.querySelectorAll('#scheduleDayTabs .sch-day').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.day) === dayIdx);
    });
    _schedMoveInk();
    _schedSearchQ = '';
    _schedGenreFilter = '';
    _schedUpdateSubbar(dayIdx, container._grouped);
    renderScheduleDay(container._grouped, dayIdx);
}

function _schedUpdateSubbar(dayIdx, grouped) {
    const bar = document.getElementById('schedSubbar');
    if (!bar) return;
    const items = grouped[dayIdx] || [];
    const info = _schedDateFor(dayIdx);
    const dayLabel = info.offset === 0 ? 'Bugün' : info.offset === 1 ? 'Yarın' : SCHEDULE_DAYS_TR[dayIdx];
    const dateStr = info.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    const gc = {};
    items.forEach(m => (m.genres || []).forEach(g => { gc[g] = (gc[g] || 0) + 1; }));
    const genres = Object.entries(gc).sort((a, b) => b[1] - a[1]).slice(0, 14).map(e => e[0]);
    bar.innerHTML = `
        <div class="sch-bar-left">
            <h2 class="sch-bar-day">${dayLabel}</h2>
            <span class="sch-bar-date">${dateStr}</span>
            <span class="sch-bar-count">${items.length} yayın</span>
        </div>
        <div class="sch-bar-right">
            <label class="sch-search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
                <input id="schedSearchInput" type="text" placeholder="Bu gün içinde ara" autocomplete="off" oninput="_schedOnSearch(this.value)" value="${_schedEsc(_schedSearchQ)}">
            </label>
            ${genres.length ? `<select class="sch-select" aria-label="Tür" onchange="_schedSetGenre(this.value)">
                <option value="">Tüm türler</option>
                ${genres.map(g => `<option value="${_schedEsc(g)}"${_schedGenreFilter === g ? ' selected' : ''}>${_schedEsc(g)}</option>`).join('')}
            </select>` : ''}
            <button type="button" class="sch-toggle${_schedOnlyFollowed ? ' on' : ''}" onclick="_schedToggleOnlyFollowed()" aria-pressed="${_schedOnlyFollowed}">
                <span class="sch-toggle-dot"></span>Takip ettiklerim
            </button>
        </div>`;
}

function _schedToggleOnlyFollowed() {
    _schedOnlyFollowed = !_schedOnlyFollowed;
    const container = document.getElementById('scheduleContainer');
    if (!container || !container._grouped) return;
    _schedUpdateSubbar(scheduleActiveDay, container._grouped);
    renderScheduleDay(container._grouped, scheduleActiveDay);
}

function _schedClearFilters() {
    _schedSearchQ = ''; _schedGenreFilter = ''; _schedOnlyFollowed = false;
    const container = document.getElementById('scheduleContainer');
    if (!container || !container._grouped) return;
    _schedUpdateSubbar(scheduleActiveDay, container._grouped);
    renderScheduleDay(container._grouped, scheduleActiveDay);
}

function renderScheduleDay(grouped, dayIdx, silent) {
    const grid = document.getElementById('scheduleGrid');
    if (!grid) return;
    grid.classList.toggle('sch-silent', !!silent);
    const followed = _notifFollowedList || [];
    const nowSec = Date.now() / 1000;
    const airOf = m => m.nextAiringEpisode?.airingAt || 0;

    let items = (grouped[dayIdx] || []).slice();
    const filtered = !!(_schedSearchQ || _schedGenreFilter || _schedOnlyFollowed);
    if (_schedSearchQ) {
        items = items.filter(m => ((m.title?.romaji || '') + ' ' + (m.title?.english || '')).toLowerCase().includes(_schedSearchQ));
    }
    if (_schedGenreFilter) items = items.filter(m => (m.genres || []).includes(_schedGenreFilter));
    if (_schedOnlyFollowed) {
        items = items.filter(m => followed.some(f => f.title === (m.title?.romaji || m.title?.english)));
    }
    items.sort((a, b) => {
        const ta = airOf(a) || Infinity, tb = airOf(b) || Infinity;
        if (ta !== tb) return ta - tb;
        return (b.popularity || 0) - (a.popularity || 0);
    });

    if (!items.length) {
        const msg = _schedOnlyFollowed && !filtered ? '' : (filtered ? 'Bu filtrelerle eşleşen yayın yok.' : 'Bu gün için yayın bulunamadı.');
        grid.innerHTML = `<div class="sch-empty"><p>${msg}</p>${filtered ? '<button type="button" onclick="_schedClearFilters()">Filtreleri temizle</button>' : ''}</div>`;
        return;
    }

    const isToday = _schedDateFor(dayIdx).offset === 0;
    let nextMarked = false;
    const groups = [];
    items.forEach((m, i) => {
        const at = airOf(m);
        const key = at ? String(new Date(at * 1000).getHours()).padStart(2, '0') + ':00' : 'Belirsiz';
        let g = groups[groups.length - 1];
        if (!g || g.key !== key) { g = { key: key, rows: [] }; groups.push(g); }
        g.rows.push(m);
    });

    let rowIdx = 0;
    grid.innerHTML = groups.map(g => {
        const rows = g.rows.map(m => {
            const title = m.title?.romaji || m.title?.english || 'Bilinmiyor';
            const t = _schedEsc(title);
            const img = _schedEsc(m.coverImage?.large || m.coverImage?.medium || '');
            const at = airOf(m);
            const secs = at ? at - nowSec : 0;
            const timeStr = at ? new Date(at * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
            const cd = secs > 0 ? formatTimeUntil(secs) : null;
            const score = m.averageScore ? (m.averageScore / 10).toFixed(1) : '';
            const studio = m.studios?.nodes?.[0]?.name || '';
            const fmt = m.format === 'MOVIE' ? 'Film' : (m.format || 'TV');
            const eps = m.episodes ? m.episodes + ' bölüm' : 'Süresiz';
            const genres = (m.genres || []).slice(0, 2);
            const isFollowed = followed.some(f => f.title === title);
            const isNext = isToday && !nextMarked && secs > 0 && !filtered;
            if (isNext) nextMarked = true;
            const soon = secs > 0 && secs <= 3600;
            const idx = Math.min(rowIdx++, 14);
            return `<article class="sch-row${soon ? ' soon' : ''}${isNext ? ' is-next' : ''}" style="--i:${idx}" tabindex="0" data-title="${t}" data-img="${img}" ` +
                `onclick="searchAnimeByName(this.dataset.title)" onkeydown="if(event.key==='Enter')searchAnimeByName(this.dataset.title)">` +
                `<img class="sch-poster" src="${img}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` +
                `<div class="sch-main">` +
                    `<h3 class="sch-name" title="${t}">${_schedEsc(title)}${isNext ? '<span class="sch-next-label">Sıradaki</span>' : ''}</h3>` +
                    `<p class="sch-meta">${[studio, fmt, eps].filter(Boolean).map(_schedEsc).join(' · ')}</p>` +
                    `<div class="sch-tags">${genres.map(x => `<span class="sch-tag" data-g="${_schedEsc(x)}" onclick="event.stopPropagation();_schedSetGenre(this.dataset.g)">${_schedEsc(x)}</span>`).join('')}</div>` +
                `</div>` +
                `<div class="sch-ep">` +
                    `<span class="sch-ep-num">${m.nextAiringEpisode?.episode ? 'Bölüm ' + m.nextAiringEpisode.episode : ''}</span>` +
                    `<span class="sch-ep-time">${cd ? timeStr + ' · ' + cd : timeStr}</span>` +
                `</div>` +
                `<span class="sch-score${score >= 8 ? ' hi' : ''}">${score ? '★ ' + score : ''}</span>` +
                `<div class="sch-actions">` +
                    `<button type="button" class="sch-icon-btn${isFollowed ? ' active' : ''}" title="${isFollowed ? 'Takipten çık' : 'Takip et'}" aria-label="Takip" ` +
                        `onclick="event.stopPropagation();_schedToggleFollow(this.closest('.sch-row').dataset.title,this.closest('.sch-row').dataset.img)">` +
                        `<i class="fa-${isFollowed ? 'solid' : 'regular'} fa-bell"></i></button>` +
                    `<button type="button" class="sch-icon-btn sch-watch" title="İzle" aria-label="İzle" onclick="event.stopPropagation();searchAnimeByName(this.closest('.sch-row').dataset.title)"><i class="fa-solid fa-play"></i></button>` +
                `</div>` +
            `</article>`;
        }).join('');
        return `<section class="sch-group"><div class="sch-group-h">${g.key}</div><div class="sch-rows">${rows}</div></section>`;
    }).join('');
}







var _schedSearchQ = '';

var _schedGenreFilter = '';











function _schedSetGenre(g) {
    _schedGenreFilter = (g === _schedGenreFilter) ? '' : g;
    const container = document.getElementById('scheduleContainer');
    if (!container || !container._grouped) return;
    _schedUpdateSubbar(scheduleActiveDay, container._grouped);
    renderScheduleDay(container._grouped, scheduleActiveDay);
}



function _schedOnSearch(val) {

    _schedSearchQ = val.trim().toLowerCase();

    const container = document.getElementById('scheduleContainer');

    if (!container || !container._grouped) return;

    renderScheduleDay(container._grouped, scheduleActiveDay);

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
    if (container.dataset.loaded === 'true') { requestAnimationFrame(_schedMoveInk); return; }

    const skelRow = '<div class="sch-skel-row"><div class="sch-skel-poster"></div><div class="sch-skel-text"><div class="sch-skel-line"></div><div class="sch-skel-line s"></div></div></div>';
    container.innerHTML = '<div class="sch"><div class="sch-head"><div><p class="sch-eyebrow">Yükleniyor</p><h1 class="sch-title">Yayın Takvimi</h1></div></div>' +
        '<div class="sch-list">' + Array(6).fill(skelRow).join('') + '</div></div>';

    try {
        const query = `
        query {
          Page(page: 1, perPage: 50) {
            media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
              title { romaji english }
              coverImage { extraLarge large medium }
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

        const grouped = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
        let totalAiring = 0;
        data.Page.media.forEach(m => {
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
        const nowSec = Date.now() / 1000;
        const soonCount = data.Page.media.filter(m => {
            const t = (m.nextAiringEpisode?.airingAt || 0) - nowSec;
            return t > 0 && t <= 21600;
        }).length;

        container.innerHTML = `
        <div class="sch">
            <header class="sch-head">
                <div>
                    <p class="sch-eyebrow">${_schedGetSeason()}</p>
                    <h1 class="sch-title">Yayın Takvimi</h1>
                </div>
                <div class="sch-head-stats">
                    <div><b>${totalAiring}</b><span>yayında</span></div>
                    <div><b>${todayCount}</b><span>bugün</span></div>
                    <div><b>${soonCount}</b><span>6 saat içinde</span></div>
                </div>
            </header>
            <nav id="scheduleDayTabs" class="sch-days" aria-label="Gün seçimi"></nav>
            <div id="schedSubbar" class="sch-bar"></div>
            <div id="scheduleGrid" class="sch-list"></div>
        </div>`;

        container._grouped = grouped;
        container.dataset.loaded = 'true';
        _schedSearchQ = '';
        _schedGenreFilter = '';
        _schedOnlyFollowed = false;

        scheduleActiveDay = today;
        renderScheduleDayTabs(grouped);
        _schedUpdateSubbar(today, grouped);
        renderScheduleDay(grouped, today);

        if (!container._tickInterval) {
            container._tickInterval = setInterval(() => {
                const c = document.getElementById('scheduleContainer');
                const v = document.getElementById('scheduleView');
                if (c && c.dataset.loaded === 'true' && v && !v.classList.contains('hidden')) {
                    renderScheduleDay(c._grouped, scheduleActiveDay, true);
                }
            }, 60000);
        }
        if (!window._schedResizeBound) {
            window._schedResizeBound = true;
            window.addEventListener('resize', _schedMoveInk);
        }
    } catch (err) {
        container.innerHTML = `<div class="sch"><div class="sch-empty">
            <p>Takvim yüklenemedi</p>
            <p style="font-size:12px;margin-top:6px;opacity:.7">${err.message}</p>
            <button type="button" onclick="document.getElementById('scheduleContainer').dataset.loaded='';loadSchedule()">Tekrar dene</button>
        </div></div>`;
    }
}



function _schedGetSeason() {
    const d = new Date(), m = d.getMonth();
    const s = m <= 2 ? 'Kış' : m <= 5 ? 'İlkbahar' : m <= 8 ? 'Yaz' : 'Sonbahar';
    return s + ' ' + d.getFullYear();
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

    const views = ['homeView','animeListView','watchView','malView','scheduleView','historyView','newsView'];



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



// ══════════════════════════════════════════════════════════════════════════
// AKILLI KEŞİF & ÖNERİ STÜDYOSU (TAM SAYFA #aiView — SIFIR KLİŞE, ANILIST + LLM MOTORU)
// ══════════════════════════════════════════════════════════════════════════

const _dscState = {
    mode: 'mood', // 'mood' | 'similar' | 'taste' | 'prompt'
    mood: 'dark',
    format: 'all', // 'all' | 'short' | 'long' | 'movie'
    era: 'all',    // 'all' | 'modern' | '2010s' | 'retro'
    minScore: 75,
    hideWatched: true,
    simQuery: '',
    promptText: '',
    loading: false,
    results: [],
    aiNoteHtml: '',
    sourceTitle: ''
};

const _DSC_MOODS = {
    dark:      { code: '01', name: 'Karanlık & Psikolojik', desc: 'Gerilim, derin karakter analizi ve distopik atmosfer', genres: ['Psychological', 'Thriller'] },
    action:    { code: '02', name: 'Yüksek Tempo & Aksiyon', desc: 'Sürükleyici savaş koreografileri ve yüksek adrenalin', genres: ['Action', 'Adventure'] },
    mystery:   { code: '03', name: 'Gizem & Zeka Savaşı',    desc: 'Dedektiflik, kurgu katmanları ve stratejik düellolar', genres: ['Mystery', 'Supernatural'] },
    scifi:     { code: '04', name: 'Bilim Kurgu & Siberpunk', desc: 'Gelecek teknolojileri, uzay ve felsefi bilim kurgu', genres: ['Sci-Fi'] },
    fantasy:   { code: '05', name: 'Epik Fantastik Dünya',   desc: 'Büyü evrenleri, mitoloji ve geniş dünya inşası', genres: ['Fantasy', 'Adventure'] },
    cozy:      { code: '06', name: 'Sıcak & Rahatlatıcı',    desc: 'Gündelik yaşam, huzurlu atmosfer ve samimi hikayeler', genres: ['Slice of Life', 'Comedy'] },
    emotional: { code: '07', name: 'Duygusal & Dram',        desc: 'İz bırakan karakter gelişimleri ve güçlü dram', genres: ['Drama', 'Romance'] },
    sports:    { code: '08', name: 'Rekabet & Spor',         desc: 'Takım ruhu, turnuva heyecanı ve azim hikayeleri', genres: ['Sports'] }
};

function _moveDscTabInk() {
    const wrap = document.getElementById('dscTabs');
    const ink = document.getElementById('dscTabInk');
    if (!wrap || !ink) return;
    const act = wrap.querySelector('.lib-tab-btn.active');
    if (!act || !act.offsetWidth) return;
    ink.style.width = act.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + (act.offsetLeft - 3) + 'px)';
}
window.addEventListener('resize', _moveDscTabInk);

window.showAIModal = function() {
    if (typeof closeNavDrawer === 'function') { try { closeNavDrawer(); } catch (_) {} }
    if (typeof closePgModal === 'function') { try { closePgModal(); } catch (_) {} }
    const aim = document.getElementById('aiModal');
    if (aim) aim.classList.add('hidden');

    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');
    if (typeof leaveW2GRoom === 'function') leaveW2GRoom();
    if (typeof clearProfileCurrentAnime === 'function') clearProfileCurrentAnime();
    if (typeof setAmbientBackground === 'function') setAmbientBackground(null);

    if (typeof homeView !== 'undefined' && homeView) homeView.classList.add('hidden');
    if (typeof animeListView !== 'undefined' && animeListView) animeListView.classList.add('hidden');
    if (typeof watchView !== 'undefined' && watchView) watchView.classList.add('hidden');
    if (typeof malView !== 'undefined' && malView) malView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    const nv = document.getElementById('newsView'); if (nv) nv.classList.add('hidden');

    const aiv = document.getElementById('aiView');
    if (aiv) aiv.classList.remove('hidden');

    if (window.setAnavActive) setAnavActive('ai');
    if (typeof vjsPlayer !== 'undefined' && vjsPlayer) { try { vjsPlayer.dispose(); } catch (e) {} vjsPlayer = null; }

    renderDiscoveryPage(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!_dscState.results.length && !_dscState.loading) {
        dscRunMoodSearch();
    }
};

window.closeAIModal = function() {
    const aim = document.getElementById('aiModal');
    if (aim) aim.classList.add('hidden');
    const aiv = document.getElementById('aiView');
    if (aiv && !aiv.classList.contains('hidden')) showHomeView();
};

window.dscSwitchMode = function(mode) {
    if (!['mood', 'similar', 'taste', 'prompt'].includes(mode)) return;
    _dscState.mode = mode;
    _dscState.aiNoteHtml = '';
    renderDiscoveryPage(true);
    if (mode === 'mood' && !_dscState.results.length) dscRunMoodSearch();
    else if (mode === 'taste') dscRunTasteAnalysis();
};

window.dscSelectMood = function(m) {
    _dscState.mood = m;
    dscRunMoodSearch();
};

window.dscSetFilter = function(key, val) {
    _dscState[key] = val;
    dscRunMoodSearch();
};

async function dscRunMoodSearch() {
    const moodCfg = _DSC_MOODS[_dscState.mood] || _DSC_MOODS.dark;
    _dscState.loading = true;
    _dscState.aiNoteHtml = '';
    _dscState.sourceTitle = `${moodCfg.name} Seçkisi`;
    renderDiscoveryPage(true);

    try {
        const watchedTitles = new Set(
            [...getFavorites(), ...getHistory(), ...getWatchlist()].map(x => String(x.title || '').toLowerCase()).filter(Boolean)
        );

        let formatFilter = '';
        if (_dscState.format === 'movie') formatFilter = ', format: MOVIE';
        else if (_dscState.format === 'short' || _dscState.format === 'long') formatFilter = ', format_in: [TV, ONA]';

        let dateFilter = '';
        if (_dscState.era === 'modern') dateFilter = ', startDate_greater: 20200000';
        else if (_dscState.era === '2010s') dateFilter = ', startDate_greater: 20100000, startDate_lesser: 20200000';
        else if (_dscState.era === 'retro') dateFilter = ', startDate_lesser: 20100000';

        const genreListStr = JSON.stringify(moodCfg.genres);
        const query = `
        query {
          Page(page: 1, perPage: 28) {
            media(type: ANIME, isAdult: false, genre_in: ${genreListStr}, averageScore_greater: ${_dscState.minScore}, sort: [SCORE_DESC, POPULARITY_DESC]${formatFilter}${dateFilter}) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              averageScore
              episodes
              format
              seasonYear
              genres
              studios(isMain: true) { nodes { name } }
              description(asHtml: false)
            }
          }
        }`;
        const data = await fetchAniList(query);
        let media = (data && data.Page && data.Page.media) ? data.Page.media : [];

        if (_dscState.format === 'short') media = media.filter(m => m.episodes && m.episodes <= 14);
        else if (_dscState.format === 'long') media = media.filter(m => !m.episodes || m.episodes >= 20);

        if (_dscState.hideWatched && watchedTitles.size > 0) {
            media = media.filter(m => {
                const r = (m.title?.romaji || '').toLowerCase();
                const e = (m.title?.english || '').toLowerCase();
                return !watchedTitles.has(r) && !watchedTitles.has(e);
            });
        }

        _dscState.results = media.slice(0, 12).map((m, i) => ({
            id: m.id,
            title: m.title?.romaji || m.title?.english || 'Bilinmiyor',
            img: m.coverImage?.extraLarge || m.coverImage?.large || '',
            score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.0',
            matchPct: Math.max(82, Math.min(99, Math.round((m.averageScore || 80) + (6 - Math.min(6, i))))),
            episodes: m.episodes || null,
            format: m.format === 'MOVIE' ? 'Film' : 'Dizi',
            year: m.seasonYear || '',
            genres: (m.genres || []).slice(0, 3),
            studio: (m.studios?.nodes && m.studios.nodes[0]) ? m.studios.nodes[0].name : '',
            desc: String(m.description || '').replace(/<[^>]*>/g, '').slice(0, 180)
        }));
    } catch (e) {
        _dscState.results = [];
    } finally {
        _dscState.loading = false;
        renderDiscoveryPage(true);
    }
}

window.dscRunSimilarSearch = async function(seedTitle) {
    const inp = document.getElementById('dscSimInput');
    const qTitle = String(seedTitle != null ? seedTitle : (inp ? inp.value : _dscState.simQuery)).trim();
    if (!qTitle) {
        showToast('⚠️ Lütfen referans bir anime adı girin veya seçin.');
        return;
    }
    _dscState.simQuery = qTitle;
    _dscState.loading = true;
    _dscState.sourceTitle = `"${qTitle}" Benzeri Seriler`;
    renderDiscoveryPage(true);

    try {
        const query = `
        query ($search: String) {
          Media(search: $search, type: ANIME, isAdult: false) {
            id
            title { romaji english }
            genres
            recommendations(sort: [RATING_DESC], perPage: 14) {
              nodes {
                rating
                mediaRecommendation {
                  id
                  title { romaji english }
                  coverImage { extraLarge large }
                  averageScore
                  episodes
                  format
                  seasonYear
                  genres
                  studios(isMain: true) { nodes { name } }
                  description(asHtml: false)
                }
              }
            }
          }
        }`;
        const data = await fetchAniList(query, { search: qTitle });
        const base = data && data.Media;
        const recNodes = (base && base.recommendations && base.recommendations.nodes) ? base.recommendations.nodes : [];
        let list = recNodes.map((n, i) => {
            const m = n.mediaRecommendation;
            if (!m) return null;
            return {
                id: m.id,
                title: m.title?.romaji || m.title?.english || 'Bilinmiyor',
                img: m.coverImage?.extraLarge || m.coverImage?.large || '',
                score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.0',
                matchPct: Math.max(84, Math.min(99, 97 - i * 2)),
                episodes: m.episodes || null,
                format: m.format === 'MOVIE' ? 'Film' : 'Dizi',
                year: m.seasonYear || '',
                genres: (m.genres || []).slice(0, 3),
                studio: (m.studios?.nodes && m.studios.nodes[0]) ? m.studios.nodes[0].name : '',
                desc: String(m.description || '').replace(/<[^>]*>/g, '').slice(0, 180)
            };
        }).filter(Boolean);

        if (base && base.title) {
            _dscState.sourceTitle = `"${base.title.romaji || base.title.english}" İçin Benzer Seriler`;
        }
        _dscState.results = list.slice(0, 12);
    } catch (_) {
        _dscState.results = [];
    } finally {
        _dscState.loading = false;
        renderDiscoveryPage(true);
    }
};

window.dscRunTasteAnalysis = async function() {
    _dscState.loading = true;
    _dscState.aiNoteHtml = '';
    _dscState.sourceTitle = 'Kütüphane & İzleme Zevki Analizi';
    renderDiscoveryPage(true);

    const localPool = [...getFavorites(), ...getHistory(), ...getWatchlist()];
    const sampleTitles = Array.from(new Set(localPool.map(a => a.title).filter(Boolean))).slice(0, 8);

    try {
        // En sevilen serilerden veya genel yüksek puanlılardan öneri derle
        let topGenres = ['Action', 'Psychological', 'Fantasy'];
        if (window._animeMeta) {
            const gCount = {};
            Object.values(window._animeMeta).forEach(m => (m.genres || []).forEach(g => { gCount[g] = (gCount[g] || 0) + 1; }));
            const sortedG = Object.entries(gCount).sort((a, b) => b[1] - a[1]).map(e => e[0]);
            if (sortedG.length >= 2) topGenres = sortedG.slice(0, 3);
        }

        const query = `
        query {
          Page(page: 1, perPage: 20) {
            media(type: ANIME, isAdult: false, genre_in: ${JSON.stringify(topGenres)}, averageScore_greater: 78, sort: [TRENDING_DESC, SCORE_DESC]) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              averageScore
              episodes
              format
              seasonYear
              genres
              studios(isMain: true) { nodes { name } }
              description(asHtml: false)
            }
          }
        }`;
        const data = await fetchAniList(query);
        const watchedSet = new Set(sampleTitles.map(t => t.toLowerCase()));
        const media = ((data && data.Page && data.Page.media) || []).filter(m => {
            const r = (m.title?.romaji || '').toLowerCase();
            return !watchedSet.has(r);
        });

        _dscState.results = media.slice(0, 12).map((m, i) => ({
            id: m.id,
            title: m.title?.romaji || m.title?.english || 'Bilinmiyor',
            img: m.coverImage?.extraLarge || m.coverImage?.large || '',
            score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.2',
            matchPct: Math.max(85, 98 - i * 2),
            episodes: m.episodes || null,
            format: m.format === 'MOVIE' ? 'Film' : 'Dizi',
            year: m.seasonYear || '',
            genres: (m.genres || []).slice(0, 3),
            studio: (m.studios?.nodes && m.studios.nodes[0]) ? m.studios.nodes[0].name : '',
            desc: String(m.description || '').replace(/<[^>]*>/g, '').slice(0, 180)
        }));

        // Eğer kullanıcı AI API anahtarı girdiyse, ek olarak kişisel analiz metni de üret
        if (appSettings.aiEnabled && appSettings.aiApiKey && sampleTitles.length > 0) {
            const prompt = `Kullanıcının kütüphanesindeki animeler: ${sampleTitles.join(', ')}. Bu zevk profilini 3 kısa maddede analiz et ve neden seçilen türlerin (${topGenres.join(', ')}) uyumlu olduğunu kısaca açıkla.`;
            const aiTxt = await callAIAPI(prompt);
            if (aiTxt && typeof marked !== 'undefined') {
                _dscState.aiNoteHtml = marked.parse(aiTxt);
            }
        }
    } catch (_) {
        _dscState.results = [];
    } finally {
        _dscState.loading = false;
        renderDiscoveryPage(true);
    }
};

window.dscRunCustomPrompt = async function(presetText) {
    const inp = document.getElementById('dscPromptInput');
    const text = String(presetText != null ? presetText : (inp ? inp.value : _dscState.promptText)).trim();
    if (!text) {
        showToast('⚠️ Lütfen nasıl bir anime aradığınızı yazın.');
        return;
    }
    _dscState.promptText = text;
    _dscState.loading = true;
    _dscState.aiNoteHtml = '';
    _dscState.sourceTitle = `Özel Sorgu: "${text.slice(0, 42)}${text.length > 42 ? '...' : ''}"`;
    renderDiscoveryPage(true);

    // Metinden anahtar tür çıkarımı (API anahtarı olmasa bile gerçek sonuç döndürür)
    const low = text.toLowerCase();
    const detectedGenres = [];
    if (low.includes('karanlık') || low.includes('psikolojik') || low.includes('zeka') || low.includes('gerilim')) detectedGenres.push('Psychological', 'Thriller');
    if (low.includes('aksiyon') || low.includes('savaş') || low.includes('dövüş') || low.includes('shonen')) detectedGenres.push('Action');
    if (low.includes('bilim kurgu') || low.includes('siberpunk') || low.includes('uzay') || low.includes('gelecek')) detectedGenres.push('Sci-Fi');
    if (low.includes('büyü') || low.includes('fantastik') || low.includes('isekai')) detectedGenres.push('Fantasy');
    if (low.includes('gizem') || low.includes('dedektif') || low.includes('suç')) detectedGenres.push('Mystery');
    if (low.includes('romantik') || low.includes('aşk') || low.includes('duygusal') || low.includes('dram')) detectedGenres.push('Romance', 'Drama');
    if (low.includes('komedi') || low.includes('eğlenceli') || low.includes('rahat')) detectedGenres.push('Comedy', 'Slice of Life');
    if (!detectedGenres.length) detectedGenres.push('Action', 'Mystery', 'Sci-Fi');

    try {
        const query = `
        query {
          Page(page: 1, perPage: 16) {
            media(type: ANIME, isAdult: false, genre_in: ${JSON.stringify(Array.from(new Set(detectedGenres)))}, averageScore_greater: 76, sort: [SCORE_DESC, POPULARITY_DESC]) {
              id
              title { romaji english }
              coverImage { extraLarge large }
              averageScore
              episodes
              format
              seasonYear
              genres
              studios(isMain: true) { nodes { name } }
              description(asHtml: false)
            }
          }
        }`;
        const data = await fetchAniList(query);
        const media = (data && data.Page && data.Page.media) || [];
        _dscState.results = media.slice(0, 12).map((m, i) => ({
            id: m.id,
            title: m.title?.romaji || m.title?.english || 'Bilinmiyor',
            img: m.coverImage?.extraLarge || m.coverImage?.large || '',
            score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.0',
            matchPct: Math.max(84, 98 - i * 2),
            episodes: m.episodes || null,
            format: m.format === 'MOVIE' ? 'Film' : 'Dizi',
            year: m.seasonYear || '',
            genres: (m.genres || []).slice(0, 3),
            studio: (m.studios?.nodes && m.studios.nodes[0]) ? m.studios.nodes[0].name : '',
            desc: String(m.description || '').replace(/<[^>]*>/g, '').slice(0, 180)
        }));

        if (appSettings.aiEnabled && appSettings.aiApiKey) {
            const aiRes = await callAIAPI(`Kullanıcı şu kriterde anime arıyor: "${text}". Kısa, net ve editoryal bir dille 4 nokta atışı anime önerisi ve nedenlerini Markdown olarak yaz.`);
            if (aiRes && typeof marked !== 'undefined') {
                _dscState.aiNoteHtml = marked.parse(aiRes);
            }
        }
    } catch (_) {
        _dscState.results = [];
    } finally {
        _dscState.loading = false;
        renderDiscoveryPage(true);
    }
};

window.askAIForMAL = function() {
    showAIModal();
    dscSwitchMode('taste');
};

window.askAICustom = function() {
    dscRunCustomPrompt();
};

function renderDiscoveryPage(isSoft) {
    const host = document.getElementById('aiPageBody');
    if (!host) return;

    const mode = _dscState.mode;
    const localSeeds = Array.from(new Set(
        [...getFavorites(), ...getHistory(), ...getWatchlist()].map(a => a && a.title).filter(Boolean)
    )).slice(0, 8);

    // Mod Kontrol Paneli
    let controlsHtml = '';
    if (mode === 'mood') {
        controlsHtml = `
        <section class="dsc-control-box">
            <div class="dsc-mood-grid">
                ${Object.entries(_DSC_MOODS).map(([k, cfg]) => `
                    <button type="button" class="dsc-mood-card${_dscState.mood === k ? ' active' : ''}" onclick="dscSelectMood('${k}')">
                        <div class="dsc-mc-top">
                            <span>${cfg.code}</span>
                            <small>${cfg.genres.join(' · ')}</small>
                        </div>
                        <strong>${_libEsc(cfg.name)}</strong>
                        <p>${_libEsc(cfg.desc)}</p>
                    </button>
                `).join('')}
            </div>
            <div class="dsc-filter-strip">
                <div class="dsc-filter-group">
                    <span class="dsc-fg-lbl">FORMAT</span>
                    <div class="lib-subpills">
                        <button type="button" class="${_dscState.format === 'all' ? 'active' : ''}" onclick="dscSetFilter('format','all')">Tümü</button>
                        <button type="button" class="${_dscState.format === 'short' ? 'active' : ''}" onclick="dscSetFilter('format','short')">Kısa Seri (≤14 Böl.)</button>
                        <button type="button" class="${_dscState.format === 'long' ? 'active' : ''}" onclick="dscSetFilter('format','long')">Uzun Seri (20+ Böl.)</button>
                        <button type="button" class="${_dscState.format === 'movie' ? 'active' : ''}" onclick="dscSetFilter('format','movie')">Sinema Filmi</button>
                    </div>
                </div>
                <div class="dsc-filter-group">
                    <span class="dsc-fg-lbl">DÖNEM</span>
                    <div class="lib-subpills">
                        <button type="button" class="${_dscState.era === 'all' ? 'active' : ''}" onclick="dscSetFilter('era','all')">Tüm Yıllar</button>
                        <button type="button" class="${_dscState.era === 'modern' ? 'active' : ''}" onclick="dscSetFilter('era','modern')">2020–2026</button>
                        <button type="button" class="${_dscState.era === '2010s' ? 'active' : ''}" onclick="dscSetFilter('era','2010s')">2010–2019</button>
                        <button type="button" class="${_dscState.era === 'retro' ? 'active' : ''}" onclick="dscSetFilter('era','retro')">Klasik (≤2009)</button>
                    </div>
                </div>
                <div class="dsc-filter-group">
                    <span class="dsc-fg-lbl">MİN. PUAN</span>
                    <div class="lib-subpills">
                        ${[70, 75, 80, 85].map(sc => `<button type="button" class="${_dscState.minScore === sc ? 'active' : ''}" onclick="dscSetFilter('minScore',${sc})">${(sc / 10).toFixed(1)}+</button>`).join('')}
                    </div>
                </div>
                <button type="button" class="lib-btn sm${_dscState.hideWatched ? ' primary' : ''}" onclick="dscSetFilter('hideWatched',!_dscState.hideWatched)">
                    <i class="fa-solid ${_dscState.hideWatched ? 'fa-eye-slash' : 'fa-eye'}"></i><span>İzlenenleri Gizle</span>
                </button>
            </div>
        </section>`;
    } else if (mode === 'similar') {
        const defaultSeeds = localSeeds.length ? localSeeds : ['Death Note', 'Attack on Titan', 'Steins;Gate', 'Vinland Saga', 'Sousou no Frieren', 'Cyberpunk: Edgerunners'];
        controlsHtml = `
        <section class="lib-create-panel" style="margin-bottom:0">
            <div class="lib-cp-top">
                <div>
                    <span class="lib-qa-kicker">REFERANS ANİME EŞLEŞTİRME</span>
                    <h4>Sevdiğin Bir Animeyi Yaz, Aynı Kurgusal Dokuya Sahip Serileri Bulalım</h4>
                </div>
            </div>
            <div class="lib-cp-form">
                <input id="dscSimInput" type="text" class="lib-cp-input" value="${_libEsc(_dscState.simQuery)}" placeholder="Anime adı yazın (ör. Steins;Gate, Monster, Jujutsu Kaisen)..." onkeydown="if(event.key==='Enter')dscRunSimilarSearch()">
                <button type="button" class="lib-btn primary" onclick="dscRunSimilarSearch()"><i class="fa-solid fa-magnifying-glass"></i><span>Benzerlerini Bul</span></button>
            </div>
            <div class="lib-cp-presets">
                <span>${localSeeds.length ? 'Senin Kütüphanenden:' : 'Popüler Referanslar:'}</span>
                ${defaultSeeds.map(t => {
                    const safeT = String(t).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                    return `<button type="button" onclick="dscRunSimilarSearch('${safeT}')">${_libEsc(t)}</button>`;
                }).join('')}
            </div>
        </section>`;
    } else if (mode === 'taste') {
        controlsHtml = `
        <section class="lib-create-panel" style="margin-bottom:0">
            <div class="lib-cp-top">
                <div>
                    <span class="lib-qa-kicker">OTOMATİK PROFİL SENTEZİ</span>
                    <h4>Kütüphanendeki Favoriler, Geçmiş ve MAL Verilerine Göre Kişisel Seçki</h4>
                </div>
                <button type="button" class="lib-btn primary sm" onclick="dscRunTasteAnalysis()"><i class="fa-solid fa-arrows-rotate"></i><span>Analizi Yenile</span></button>
            </div>
            <p style="margin:0;font-size:13px;color:var(--pg-muted);line-height:1.5">
                ${localSeeds.length
                    ? `Analiz edilen referans serilerin: <b style="color:var(--pg-text)">${_libEsc(localSeeds.join(' · '))}</b>`
                    : 'Henüz yerel favori veya geçmiş kaydın az olduğu için genel yüksek puanlı trend seriler üzerinden eşleştirme yapılıyor.'}
            </p>
        </section>`;
    } else if (mode === 'prompt') {
        const hasKey = !!(appSettings && appSettings.aiEnabled && appSettings.aiApiKey);
        controlsHtml = `
        <section class="lib-create-panel" style="margin-bottom:0">
            <div class="lib-cp-top">
                <div>
                    <span class="lib-qa-kicker">DOĞAL DİL SORGUSU &amp; AKILLI EŞLEŞTİRME</span>
                    <h4>Nasıl Bir Hikaye, Atmosfer veya Karakter Aradığını Kendi Cümlelerinle Anlat</h4>
                </div>
                <button type="button" class="lib-btn sm" onclick="openSettings()"><i class="fa-solid fa-sliders"></i><span>API Ayarları (${hasKey ? 'Aktif' : 'Yerel Motor'})</span></button>
            </div>
            <div class="lib-cp-form">
                <input id="dscPromptInput" type="text" class="lib-cp-input" value="${_libEsc(_dscState.promptText)}" placeholder="Örn: Ana karakterin zekasıyla kazandığı karanlık ve sürükleyici bir gizem serisi..." onkeydown="if(event.key==='Enter')dscRunCustomPrompt()">
                <button type="button" class="lib-btn primary" onclick="dscRunCustomPrompt()"><i class="fa-solid fa-arrow-right"></i><span>Eşleştir</span></button>
            </div>
            <div class="lib-cp-presets">
                <span>Örnek Sorgular:</span>
                <button type="button" onclick="dscRunCustomPrompt('Death Note ve Monster tarzı karanlık psikolojik zeka savaşı')">Karanlık psikolojik zeka savaşı</button>
                <button type="button" onclick="dscRunCustomPrompt('Siberpunk ve distopik gelecekte geçen sürükleyici bilim kurgu')">Siberpunk &amp; distopik bilim kurgu</button>
                <button type="button" onclick="dscRunCustomPrompt('Yorucu bir günün ardından izlenecek sıcak ve huzurlu gündelik yaşam')">Sıcak &amp; huzurlu gündelik yaşam</button>
                <button type="button" onclick="dscRunCustomPrompt('Sıfırdan güçlenen ana karakterli yüksek tempolu fantastik aksiyon')">Yüksek tempolu fantastik aksiyon</button>
            </div>
        </section>`;
    }

    // Sonuç Listesi
    let resultsHtml = '';
    if (_dscState.loading) {
        resultsHtml = `<div class="dsc-results-grid">${Array(6).fill('<div class="dsc-skel-card"></div>').join('')}</div>`;
    } else if (!_dscState.results.length) {
        resultsHtml = `
        <div class="lib-empty">
            <span class="lib-empty-code">00 / SONUÇ YOK</span>
            <h3>Eşleşen anime bulunamadı</h3>
            <p>Filtre kriterlerini esneterek veya farklı bir referans seri seçerek tekrar deneyebilirsin.</p>
        </div>`;
    } else {
        resultsHtml = `
        <div class="dsc-results-head">
            <span class="stx-panel-kicker">${_libEsc(_dscState.sourceTitle || 'ÖNERİLEN SERİLER')}</span>
            <span class="dsc-res-count"><b>${_dscState.results.length}</b> yüksek uyumlu eşleşme bulundu</span>
        </div>
        ${_dscState.aiNoteHtml ? `<div class="dsc-ai-editorial-note"><span class="lib-qa-kicker">ASİSTAN DEĞERLENDİRMESİ</span><div class="dsc-ai-prose">${_dscState.aiNoteHtml}</div></div>` : ''}
        <div class="dsc-results-grid">
            ${_dscState.results.map((r, idx) => {
                const title = _libEsc(r.title);
                const safeTitle = String(r.title || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const safeImg = String(r.img || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `
                <article class="dsc-rec-card" onclick="searchAnimeByName('${safeTitle}')">
                    <div class="dsc-rec-poster">
                        <img src="${_libEsc(r.img)}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/220x320/0f0f1a/8b5cf6?text=?'">
                        <span class="dsc-match-badge">%${r.matchPct} Uyum</span>
                    </div>
                    <div class="dsc-rec-body">
                        <div class="dsc-rec-top">
                            <span class="dsc-rec-idx">${String(idx + 1).padStart(2, '0')} · ${_libEsc(r.format)}${r.year ? ` · ${r.year}` : ''}</span>
                            <span class="dsc-rec-score">★ ${_libEsc(r.score)}</span>
                        </div>
                        <h3 class="dsc-rec-title">${title}</h3>
                        <p class="dsc-rec-desc">${_libEsc(r.desc || 'Açıklama bulunmuyor.')}</p>
                        <div class="dsc-rec-tags">
                            ${(r.genres || []).map(g => `<span>${_libEsc(g)}</span>`).join('')}
                            ${r.episodes ? `<span>${r.episodes} Bölüm</span>` : ''}
                        </div>
                        <div class="dsc-rec-foot" onclick="event.stopPropagation()">
                            <button type="button" class="lib-resume-btn" onclick="searchAnimeByName('${safeTitle}')">
                                <i class="fa-solid fa-play"></i><span>Anitr'de Aç</span>
                            </button>
                            <button type="button" class="lib-icon-btn" title="Özel Listeme Ekle" onclick="openAddToListModal({id:'${r.id}',title:'${safeTitle}',img:'${safeImg}',slug:''})">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </article>`;
            }).join('')}
        </div>`;
    }

    host.innerHTML = `
    <div class="lib-shell${isSoft ? ' is-switching' : ''}">
        <header class="lib-head">
            <div class="lib-head-left">
                <p class="cat-eyebrow">Kişiselleştirilmiş Kürasyon</p>
                <h1 class="cat-title">Akıllı Keşif Stüdyosu</h1>
                <p class="cat-count">Ruh haline, sevdiğin serilere, kütüphane analizine ve doğal dil sorgularına göre anime eşleştirme motoru</p>
            </div>
            <div class="lib-head-right">
                <div class="lib-top-actions">
                    <button type="button" class="lib-btn" onclick="loadRandom()"><i class="fa-solid fa-shuffle"></i><span>Rastgele Anime</span></button>
                    <button type="button" class="lib-btn" onclick="showMALView()"><i class="fa-solid fa-link"></i><span>MAL Senkronizasyonu</span></button>
                </div>
            </div>
        </header>

        <div class="lib-toolbar">
            <div class="lib-tabs" id="dscTabs" role="tablist">
                <span class="lib-tabs-ink" id="dscTabInk"></span>
                <button type="button" class="lib-tab-btn${mode === 'mood' ? ' active' : ''}" onclick="dscSwitchMode('mood')"><span>Atmosfer &amp; Filtre</span></button>
                <button type="button" class="lib-tab-btn${mode === 'similar' ? ' active' : ''}" onclick="dscSwitchMode('similar')"><span>Benzer Seri Bulucu</span></button>
                <button type="button" class="lib-tab-btn${mode === 'taste' ? ' active' : ''}" onclick="dscSwitchMode('taste')"><span>Kütüphane Analizi</span></button>
                <button type="button" class="lib-tab-btn${mode === 'prompt' ? ' active' : ''}" onclick="dscSwitchMode('prompt')"><span>Serbest Sorgu</span></button>
            </div>
        </div>

        ${controlsHtml}

        <div class="lib-content">
            ${resultsHtml}
        </div>
    </div>`;

    requestAnimationFrame(_moveDscTabInk);
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

function _buildQualityMenu(player, urls, labels, mimeType, mimeTypes) {

    player._anitrQuality = {

        urls: urls,

        labels: labels || [],

        mimeType: mimeType,

        mimeTypes: Array.isArray(mimeTypes) ? mimeTypes : null,

        current: 0

    };

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

                    const itemMime = (q.mimeTypes && q.mimeTypes[i]) ? q.mimeTypes[i] : q.mimeType;

                    q.current = i;

                    p.src({ src: u, type: itemMime });

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

    /* ── Ayarlar sekmeleri (yeni tasarim) ── */

    window.stgTab = function(name){

        const m = document.getElementById('settingsModal'); if (!m) return;

        m.querySelectorAll('.stg-navitem[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));

        m.querySelectorAll('.stg-panel[data-panel]').forEach(p => p.classList.toggle('active', p.dataset.panel === name));

        const content = m.querySelector('.stg-content'); if (content) content.scrollTo({ top: 0 });

    };

    window.stgFilter = function(q){ /* removed */ };

    function initStg(){ stgTab('appearance'); }





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

        const qb = document.getElementById('wtCinemaQuickBtn');

        if (qb) qb.classList.toggle('on', on);

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

            let src = p.currentSrc && p.currentSrc();

            let srcType = p.currentType && p.currentType();

            const q = p._anitrQuality;

            if (q && Array.isArray(q.urls) && q.urls.length > 1) {

                const lowIdx = q.urls.length - 1;

                src = q.urls[lowIdx] || src;

                srcType = (q.mimeTypes && q.mimeTypes[lowIdx]) ? q.mimeTypes[lowIdx] : (q.mimeType || srcType);

            }

            if (!src) return false;

            if (tp && tpSrc === src) return true;

            destroy(); tpSrc = src;

            const v = document.createElement('video');

            v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.crossOrigin = 'anonymous'; v.className = 'video-js';

            frame.prepend(v);

            try {

                tp = videojs(v, { controls: false, muted: true, preload: 'metadata', autoplay: false, loadingSpinner: false, bigPlayButton: false, controlBar: false, errorDisplay: false, textTrackDisplay: false, posterImage: false });

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

                tp.src({ src, type: srcType });

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
        const s = Math.max(0, Math.round(sec || 0));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}<em>sa</em> ${m}<em>dk</em>` : `${m}<em>dk</em>`;
    };
    const fmtDurText = (sec) => {
        const s = Math.max(0, Math.round(sec || 0));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
    };

    const RANKS = [
        { min: 0,   code: '01', name: 'Çaylak',           sub: 'Başlangıç Kademesi' },
        { min: 5,   code: '02', name: 'Düzenli İzleyici', sub: 'Haftalık Takipçi' },
        { min: 20,  code: '03', name: 'Anime Sever',      sub: 'Katalog Kaşifi' },
        { min: 50,  code: '04', name: 'Otaku',            sub: 'Deneyimli İzleyici' },
        { min: 100, code: '05', name: 'Kıdemli Otaku',    sub: 'Arşiv Ustası' },
        { min: 250, code: '06', name: 'Efsane',           sub: 'Koleksiyon Lideri' }
    ];

    let stxRange = 7;
    try {
        const savedR = parseInt(localStorage.getItem('anitr_stx_range'), 10);
        if ([7, 14, 30].includes(savedR)) stxRange = savedR;
    } catch (_) {}

    let stxGoalHours = 6;
    try {
        const savedG = parseInt(localStorage.getItem('anitr_stx_goal'), 10);
        if ([3, 6, 10, 15].includes(savedG)) stxGoalHours = savedG;
    } catch (_) {}

    function movePeriodInk() {
        const wrap = document.getElementById('stxPeriods');
        const ink = document.getElementById('stxPeriodInk');
        if (!wrap || !ink) return;
        const act = wrap.querySelector('.stx-period-btn.active');
        if (!act || !act.offsetWidth) return;
        ink.style.width = act.offsetWidth + 'px';
        ink.style.transform = 'translateX(' + (act.offsetLeft - 3) + 'px)';
    }

    window.stxSetRange = function(days) {
        if (![7, 14, 30].includes(days)) return;
        stxRange = days;
        try { localStorage.setItem('anitr_stx_range', String(days)); } catch (_) {}
        window.stxRender(true);
    };

    window.stxSetGoal = function(hours) {
        if (![3, 6, 10, 15].includes(hours)) return;
        stxGoalHours = hours;
        try { localStorage.setItem('anitr_stx_goal', String(hours)); } catch (_) {}
        window.stxRender(true);
    };

    window.stxOpenAnime = function(title) {
        if (!title) return;
        if (typeof searchAnimeByName === 'function') {
            searchAnimeByName(title);
        } else if (typeof searchInput !== 'undefined' && searchInput) {
            searchInput.value = title;
            if (typeof handleSearch === 'function') handleSearch();
        }
    };

    window.stxRender = function(keepScroll){
        flush();
        const s = load();
        const watchedArr = (typeof getWatched === 'function') ? getWatched() : [];
        const favsArr    = (typeof getFavorites === 'function') ? getFavorites() : [];
        const wlArr      = (typeof getWatchlist === 'function') ? getWatchlist() : [];
        const histArr    = (typeof getHistory === 'function') ? getHistory() : [];
        const myListsArr = (typeof getMyLists === 'function') ? getMyLists() : [];

        const watched = watchedArr.length, favs = favsArr.length, wl = wlArr.length, hist = histArr.length, myListsCount = myListsArr.length;
        const epsTracked = Object.values(s.eps).filter(v => v >= 120).length;
        const epCount = Math.max(epsTracked, watched);
        let total = s.total, estimated = false;
        if (total < 60 && watched > 0) { total = watched * 24 * 60; estimated = true; }
        const hours = total / 3600;

        // Seviye hesabı
        let ri = 0;
        RANKS.forEach((r, i) => { if (hours >= r.min) ri = i; });
        const cur = RANKS[ri], nxt = RANKS[ri + 1];
        const prog = nxt ? Math.min(100, Math.max(0, ((hours - cur.min) / (nxt.min - cur.min)) * 100)) : 100;
        const remHours = nxt ? Math.max(0.1, (nxt.min - hours)).toFixed(1).replace(/\.0$/, '') : 0;

        // Seri & Aktif Günler
        let streak = 0;
        const dd = new Date();
        if (!(s.days[dayKey(dd)] > 0)) dd.setDate(dd.getDate() - 1);
        while (s.days[dayKey(dd)] > 0) { streak++; dd.setDate(dd.getDate() - 1); }

        const dayValues = Object.values(s.days).filter(v => v > 0);
        const activeDays = dayValues.length;
        const bestDay = Math.max(0, ...Object.values(s.days));
        const avgPerActiveDay = activeDays > 0 ? Math.round(s.total / activeDays) : 0;

        // Seçili periyot (7 / 14 / 30 gün)
        const shortDays = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
        const shortMonths = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
        const periodData = [];
        for (let i = stxRange - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dk = dayKey(d);
            const val = s.days[dk] || 0;
            const dateLbl = d.getDate() + ' ' + shortMonths[d.getMonth()];
            const barLbl = stxRange === 7 ? shortDays[d.getDay()] : (stxRange === 14 ? String(d.getDate()).padStart(2, '0') + ' ' + shortMonths[d.getMonth()] : String(d.getDate()).padStart(2, '0'));
            periodData.push({
                label: barLbl,
                fullDate: dateLbl + ' (' + shortDays[d.getDay()] + ')',
                sec: val,
                min: Math.round(val / 60),
                today: i === 0
            });
        }
        const pMax = Math.max(60, ...periodData.map(d => d.sec));
        const pTotal = periodData.reduce((acc, d) => acc + d.sec, 0);
        const pActive = periodData.filter(d => d.sec > 0).length;
        const pAvg = Math.round(pTotal / stxRange);
        const avgLinePct = pTotal > 0 ? Math.min(96, Math.max(6, (pAvg / pMax) * 100)) : 0;

        // Son 7 gün toplamı (Haftalık Hedef için)
        let last7Sec = 0;
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last7Sec += (s.days[dayKey(d)] || 0);
        }
        const goalSec = stxGoalHours * 3600;
        const goalPct = Math.min(100, Math.round((last7Sec / goalSec) * 100));

        // 12 Haftalık (84 Günlük) Aktivite Matrisi (Pzt..Paz satırları, 12 hafta sütunu)
        const today = new Date();
        const todayDowMon = (today.getDay() + 6) % 7; // Pzt=0 .. Paz=6
        const totalCells = 11 * 7 + (todayDowMon + 1);
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (totalCells - 1));

        const weeks = [];
        let active84 = 0;
        for (let w = 0; w < 12; w++) {
            const col = [];
            let monthTag = '';
            for (let dow = 0; dow < 7; dow++) {
                const idx = w * 7 + dow;
                const cellDate = new Date(startDate);
                cellDate.setDate(startDate.getDate() + idx);
                if (dow === 0 && (w === 0 || cellDate.getDate() <= 7)) {
                    monthTag = shortMonths[cellDate.getMonth()];
                }
                const isFuture = cellDate > today && dayKey(cellDate) !== dayKey(today);
                const dk = dayKey(cellDate);
                const sec = isFuture ? 0 : (s.days[dk] || 0);
                const mins = Math.round(sec / 60);
                if (sec > 0) active84++;
                let lv = 0;
                if (mins > 0 && mins < 20) lv = 1;
                else if (mins >= 20 && mins < 45) lv = 2;
                else if (mins >= 45 && mins < 90) lv = 3;
                else if (mins >= 90) lv = 4;
                col.push({
                    lv: isFuture ? -1 : lv,
                    isToday: dk === dayKey(today),
                    tip: `${cellDate.getDate()} ${shortMonths[cellDate.getMonth()]} · ${mins > 0 ? mins + ' dk izleme' : 'İzleme yok'}`
                });
            }
            weeks.push({ month: monthTag, cells: col });
        }
        const consistencyPct = Math.round((active84 / 84) * 100);

        // En Çok İzlenen Animeler (s.anime boşsa geçmişten zenginleştir)
        let animeArr = Object.values(s.anime).filter(a => a && a.title).sort((a, b) => b.sec - a.sec).slice(0, 6);
        let animeFromHistory = false;
        if (!animeArr.length && histArr.length) {
            animeFromHistory = true;
            const seen = new Set();
            histArr.forEach(h => {
                const t = (h && h.title) ? String(h.title).trim() : '';
                if (!t || seen.has(t) || animeArr.length >= 6) return;
                seen.add(t);
                animeArr.push({
                    title: t,
                    img: h.img || '',
                    sec: 24 * 60,
                    studio: h.lastWatchedLabel || ('Bölüm ' + ((h.eIdx || 0) + 1)),
                    genres: []
                });
            });
        }
        const aMax = animeArr.length ? Math.max(1, animeArr[0].sec) : 1;
        const aSum = animeArr.reduce((acc, a) => acc + a.sec, 0) || 1;

        // Favori Türler
        const gmap = {};
        Object.entries(s.anime).forEach(([id, a]) => {
            let gs = a.genres || [];
            if ((!gs || !gs.length) && window._animeMeta && window._animeMeta[id]) {
                gs = window._animeMeta[id].genres || [];
            }
            (gs || []).forEach(g => { gmap[g] = (gmap[g] || 0) + Math.max(60, a.sec || 0); });
        });
        if (!Object.keys(gmap).length && window._animeMeta) {
            Object.values(window._animeMeta).forEach(m => {
                (m.genres || []).forEach(g => { gmap[g] = (gmap[g] || 0) + 600; });
            });
        }
        const genres = Object.entries(gmap).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const gMax = genres.length ? Math.max(1, genres[0][1]) : 1;
        const gSum = genres.reduce((acc, g) => acc + g[1], 0) || 1;

        const sinceDate = s.since ? new Date(s.since).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Bugün';

        const host = document.getElementById('statsBody');
        if (!host) return;

        host.innerHTML = `
        <div class="stx-shell${keepScroll ? ' is-switching' : ''}">
            <!-- ÜST BAŞLIK -->
            <header class="stx-head">
                <div class="stx-head-left">
                    <p class="cat-eyebrow">Kişisel Analiz</p>
                    <h1 class="cat-title">İzleme İstatistikleri</h1>
                    <p class="cat-count">İzleme alışkanlıkların, günlük tempon ve kütüphane dağılımın <span class="cat-count-src">Kayıt başlangıcı: <b>${esc(sinceDate)}</b></span></p>
                </div>
                <div class="stx-head-right">
                    <div class="stx-periods" id="stxPeriods" role="tablist" aria-label="Zaman Aralığı">
                        <span class="stx-periods-ink" id="stxPeriodInk"></span>
                        <button type="button" class="stx-period-btn${stxRange === 7 ? ' active' : ''}" onclick="stxSetRange(7)">7 Gün</button>
                        <button type="button" class="stx-period-btn${stxRange === 14 ? ' active' : ''}" onclick="stxSetRange(14)">14 Gün</button>
                        <button type="button" class="stx-period-btn${stxRange === 30 ? ' active' : ''}" onclick="stxSetRange(30)">30 Gün</button>
                    </div>
                    <div class="stx-top-actions">
                        <button type="button" class="stx-btn" onclick="stxExport()" title="İstatistik verilerini JSON olarak indir">
                            <i class="fa-solid fa-arrow-down-to-bracket"></i><span>Dışa Aktar</span>
                        </button>
                        <button type="button" class="stx-btn" onclick="stxImport()" title="Yedeklenen JSON dosyasını geri yükle">
                            <i class="fa-solid fa-arrow-up-from-bracket"></i><span>İçe Aktar</span>
                        </button>
                        <button type="button" class="stx-btn danger" onclick="if(confirm('Tüm izleme istatistiklerin ve kullanıcı verilerin sıfırlansın mı?')){resetAllUserData();}" title="Tüm verileri sıfırla">
                            <i class="fa-regular fa-trash-can"></i><span>Sıfırla</span>
                        </button>
                    </div>
                </div>
            </header>

            <!-- SEVİYE & TOPLAM SÜRE ŞERİDİ -->
            <section class="stx-level-strip">
                <div class="stx-lvl-main">
                    <div class="stx-lvl-badge">
                        <span class="stx-lvl-kicker">SEVİYE</span>
                        <strong class="stx-lvl-num">${cur.code}</strong>
                    </div>
                    <div class="stx-lvl-info">
                        <div class="stx-lvl-topline">
                            <div>
                                <span class="stx-lvl-sub">${esc(cur.sub)}</span>
                                <h2 class="stx-lvl-title">${esc(cur.name)}</h2>
                            </div>
                            <div class="stx-lvl-next">
                                ${nxt
                                    ? `<span>Sonraki: <b>${esc(nxt.name)}</b> (${remHours} sa kaldı)</span><strong>%${prog.toFixed(0)}</strong>`
                                    : `<span>Maksimum kademeye ulaşıldı</span><strong>%100</strong>`}
                            </div>
                        </div>
                        <div class="stx-lvl-bar"><span style="width:${prog.toFixed(1)}%"></span></div>
                        <div class="stx-lvl-steps">
                            ${RANKS.map((r, idx) => `
                                <div class="stx-step${idx < ri ? ' is-done' : (idx === ri ? ' is-current' : '')}">
                                    <span class="stx-step-code">${r.code}</span>
                                    <span class="stx-step-name">${esc(r.name)}</span>
                                    <small>${r.min}sa+</small>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="stx-lvl-total">
                    <span class="stx-total-kicker">${estimated ? 'TAHMİNİ TOPLAM SÜRE' : 'TOPLAM İZLEME SÜRESİ'}</span>
                    <div class="stx-total-val">${fmtDur(total)}</div>
                    <span class="stx-total-sub">${activeDays > 0 ? `Aktif günlerde ort. <b>${fmtDurText(avgPerActiveDay)}</b>` : 'Henüz günlük süre kaydı yok'}</span>
                </div>
            </section>

            <!-- 4 ANA METRİK (HAIRLINE TABLO) -->
            <section class="stx-kpis" aria-label="Temel Göstergeler">
                <article class="stx-kpi">
                    <div class="stx-kpi-head"><span>01</span><small>İZLENEN BÖLÜM</small></div>
                    <div class="stx-kpi-val">${epCount}<em>bölüm</em></div>
                    <p class="stx-kpi-foot">${epsTracked > 0 ? `${epsTracked} bölüm süre takipli tamamlandı` : `${watched} bölüm işaretlendi`}</p>
                </article>
                <article class="stx-kpi">
                    <div class="stx-kpi-head"><span>02</span><small>GÜNCEL SERİ</small></div>
                    <div class="stx-kpi-val">${streak}<em>gün</em></div>
                    <p class="stx-kpi-foot">${streak > 0 ? 'Kesintisiz günlük izleme serisi aktif' : 'Seriyi başlatmak için bugün bir bölüm izle'}</p>
                </article>
                <article class="stx-kpi">
                    <div class="stx-kpi-head"><span>03</span><small>AKTİF GÜN</small></div>
                    <div class="stx-kpi-val">${activeDays}<em>gün</em></div>
                    <p class="stx-kpi-foot">${activeDays > 0 ? `Toplam ${activeDays} farklı günde anime izlendi` : 'İzleme yaptığın günler burada sayılır'}</p>
                </article>
                <article class="stx-kpi">
                    <div class="stx-kpi-head"><span>04</span><small>GÜNLÜK REKOR</small></div>
                    <div class="stx-kpi-val">${fmtDur(bestDay)}</div>
                    <p class="stx-kpi-foot">${bestDay > 0 ? 'Tek günde ulaşılan en yüksek izleme süresi' : 'Kişisel rekorun ilk izlemeyle kaydedilir'}</p>
                </article>
            </section>

            <!-- ORTA ANALİZ GRİDİ: GÜNLÜK TEMPO & 12 HAFTALIK MATRİS -->
            <section class="stx-main-grid">
                <!-- SOL: GÜNLÜK İZLEME TEMPOSU -->
                <article class="stx-panel">
                    <div class="stx-panel-head">
                        <div>
                            <span class="stx-panel-kicker">ZAMAN SERİSİ</span>
                            <h3 class="stx-panel-title">Son ${stxRange} Günlük Tempo</h3>
                        </div>
                        <div class="stx-panel-meta">
                            <span>Toplam: <b>${fmtDurText(pTotal)}</b></span>
                            <span class="sep">·</span>
                            <span>Günlük Ort: <b>${fmtDurText(pAvg)}</b></span>
                        </div>
                    </div>

                    <div class="stx-chart-wrap range-${stxRange}">
                        <div class="stx-chart-guides">
                            <span></span><span></span><span></span><span></span>
                        </div>
                        ${pTotal > 0 ? `<div class="stx-chart-avg" style="bottom:${avgLinePct.toFixed(1)}%" title="Günlük Ortalama: ${fmtDurText(pAvg)}"><span>Ort. ${Math.round(pAvg / 60)} dk</span></div>` : ''}
                        <div class="stx-bars">
                            ${periodData.map(d => {
                                const hPct = d.sec > 0 ? Math.max(8, (d.sec / pMax) * 100) : 3;
                                return `
                                <div class="stx-bar-col${d.today ? ' is-today' : ''}${d.sec > 0 ? ' has-val' : ''}" data-tip="${esc(d.fullDate)} · ${d.min} dk">
                                    <div class="stx-bar-track">
                                        <div class="stx-bar-fill" style="height:${hPct.toFixed(1)}%"></div>
                                    </div>
                                    <span class="stx-bar-lbl">${esc(d.label)}</span>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>

                    <!-- HAFTALIK HEDEF ÇUBUĞU -->
                    <div class="stx-goal-box">
                        <div class="stx-goal-top">
                            <div class="stx-goal-title">
                                <span>Haftalık İzleme Hedefi</span>
                                <b>${fmtDurText(last7Sec)} / ${stxGoalHours} saat (%${goalPct})</b>
                            </div>
                            <div class="stx-goal-pills">
                                ${[3, 6, 10, 15].map(g => `<button type="button" class="stx-goal-pill${stxGoalHours === g ? ' active' : ''}" onclick="stxSetGoal(${g})">${g}sa</button>`).join('')}
                            </div>
                        </div>
                        <div class="stx-goal-bar"><span style="width:${goalPct}%"></span></div>
                    </div>
                </article>

                <!-- SAĞ: 12 HAFTALIK SÜREKLİLİK MATRİSİ -->
                <article class="stx-panel">
                    <div class="stx-panel-head">
                        <div>
                            <span class="stx-panel-kicker">DEVAMLILIK HARİTASI</span>
                            <h3 class="stx-panel-title">Son 12 Hafta (84 Gün)</h3>
                        </div>
                        <div class="stx-panel-meta">
                            <span><b>${active84}</b> aktif gün</span>
                            <span class="sep">·</span>
                            <span><b>%${consistencyPct}</b> devamlılık</span>
                        </div>
                    </div>

                    <div class="stx-heatmap-wrap">
                        <div class="stx-hm-months">
                            <span></span>
                            ${weeks.map(w => `<span>${esc(w.month)}</span>`).join('')}
                        </div>
                        <div class="stx-hm-body">
                            <div class="stx-hm-days">
                                <span>Pzt</span>
                                <span>Çar</span>
                                <span>Cum</span>
                                <span>Paz</span>
                            </div>
                            <div class="stx-hm-grid">
                                ${weeks.map(w => `
                                    <div class="stx-hm-col">
                                        ${w.cells.map(c => c.lv < 0
                                            ? `<span class="stx-hm-cell is-future"></span>`
                                            : `<span class="stx-hm-cell lv-${c.lv}${c.isToday ? ' is-today' : ''}" data-tip="${esc(c.tip)}"></span>`
                                        ).join('')}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <div class="stx-hm-foot">
                            <span class="stx-hm-note">${pActive} / ${stxRange} gün son periyotta aktif</span>
                            <div class="stx-hm-legend">
                                <span>Az</span>
                                <i class="lv-0"></i><i class="lv-1"></i><i class="lv-2"></i><i class="lv-3"></i><i class="lv-4"></i>
                                <span>Çok</span>
                            </div>
                        </div>
                    </div>
                </article>
            </section>

            <!-- ALT KIRILIM: EN ÇOK İZLENENLER & TÜR / KÜTÜPHANE -->
            <section class="stx-bottom-grid">
                <!-- SOL: EN ÇOK İZLENEN ANİMELER -->
                <article class="stx-panel">
                    <div class="stx-panel-head">
                        <div>
                            <span class="stx-panel-kicker">SERİ SIRALAMASI</span>
                            <h3 class="stx-panel-title">En Çok İzlenen Animeler</h3>
                        </div>
                        <div class="stx-panel-meta">
                            <span>${animeFromHistory ? 'Son izleme geçmişinden' : `İlk ${animeArr.length} seri`}</span>
                        </div>
                    </div>

                    ${animeArr.length ? `
                    <div class="stx-top-list">
                        ${animeArr.map((a, i) => {
                            const pct = Math.max(4, Math.round((a.sec / aMax) * 100));
                            const share = Math.max(1, Math.round((a.sec / aSum) * 100));
                            const safeTitle = String(a.title || '').replace(/'/g, "\'");
                            const sub = a.studio || ((a.genres && a.genres.length) ? a.genres.slice(0, 2).join(' · ') : 'Anime Serisi');
                            return `
                            <div class="stx-top-row" onclick="stxOpenAnime('${safeTitle}')" role="button" tabindex="0">
                                <span class="stx-top-idx">${String(i + 1).padStart(2, '0')}</span>
                                ${a.img ? `<img class="stx-top-poster" src="${esc(a.img)}" alt="" loading="lazy">` : `<div class="stx-top-poster is-empty"><i class="fa-solid fa-film"></i></div>`}
                                <div class="stx-top-body">
                                    <div class="stx-top-line">
                                        <strong class="stx-top-name">${esc(a.title)}</strong>
                                        <span class="stx-top-dur">${animeFromHistory ? esc(sub) : fmtDur(a.sec)} <em>%${share}</em></span>
                                    </div>
                                    <div class="stx-top-bar"><span style="width:${pct}%"></span></div>
                                </div>
                                <i class="fa-solid fa-arrow-up-right stx-top-go"></i>
                            </div>`;
                        }).join('')}
                    </div>` : `
                    <div class="stx-empty-box">
                        <p>Henüz kaydedilmiş bir anime izleme verisi bulunmuyor.</p>
                        <button type="button" class="stx-btn" onclick="showAnimeListView();setAnavActive('anime')">Kataloğa Göz At →</button>
                    </div>`}
                </article>

                <!-- SAĞ: TÜR DAĞILIMI & KÜTÜPHANE ÖZETİ -->
                <div class="stx-right-stack">
                    <article class="stx-panel">
                        <div class="stx-panel-head">
                            <div>
                                <span class="stx-panel-kicker">KATEGORİ ANALİZİ</span>
                                <h3 class="stx-panel-title">Tür Dağılımı</h3>
                            </div>
                            <div class="stx-panel-meta">
                                <span>${genres.length ? `${genres.length} aktif tür` : 'Veri bekleniyor'}</span>
                            </div>
                        </div>

                        ${genres.length ? `
                        <div class="stx-genre-list">
                            ${genres.map((g, i) => {
                                const pct = Math.max(6, Math.round((g[1] / gMax) * 100));
                                const share = Math.max(1, Math.round((g[1] / gSum) * 100));
                                return `
                                <div class="stx-genre-row">
                                    <span class="stx-genre-idx">${String(i + 1).padStart(2, '0')}</span>
                                    <span class="stx-genre-name">${esc(g[0])}</span>
                                    <div class="stx-genre-bar"><span style="width:${pct}%"></span></div>
                                    <span class="stx-genre-val"><b>%${share}</b> · ${fmtDurText(g[1])}</span>
                                </div>`;
                            }).join('')}
                        </div>` : `
                        <div class="stx-empty-box compact">
                            <p>İzlediğin animelerin tür dağılımı bölümleri izledikçe burada otomatik oluşturulur.</p>
                        </div>`}
                    </article>

                    <!-- KÜTÜPHANE KISAYOL KARTLARI -->
                    <section class="stx-lib-grid" aria-label="Kütüphane Özeti">
                        <button type="button" class="stx-lib-card" onclick="showFavorites()">
                            <span class="stx-lib-label">FAVORİLER</span>
                            <div class="stx-lib-row"><strong>${favs}</strong><span>anime →</span></div>
                        </button>
                        <button type="button" class="stx-lib-card" onclick="showWatchlist()">
                            <span class="stx-lib-label">İZLEME LİSTESİ</span>
                            <div class="stx-lib-row"><strong>${wl}</strong><span>anime →</span></div>
                        </button>
                        <button type="button" class="stx-lib-card" onclick="showHistory()">
                            <span class="stx-lib-label">İZLEME GEÇMİŞİ</span>
                            <div class="stx-lib-row"><strong>${hist}</strong><span>kayıt →</span></div>
                        </button>
                        <button type="button" class="stx-lib-card" onclick="showMyLists()">
                            <span class="stx-lib-label">ÖZEL LİSTELERİM</span>
                            <div class="stx-lib-row"><strong>${myListsCount}</strong><span>liste →</span></div>
                        </button>
                    </section>
                </div>
            </section>
        </div>`;

        requestAnimationFrame(movePeriodInk);
    };

    window.addEventListener('resize', movePeriodInk);

    window.stxExport = function(){
        const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'anitr-istatistikler.json';
        a.click();
        if (typeof showToast === 'function') showToast('💾 İstatistik verileri dışa aktarıldı.');
    };

    window.stxImport = function(){
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'application/json,.json';
        inp.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (typeof data !== 'object' || data === null) throw new Error('Geçersiz dosya');
                    const merged = Object.assign({ total: 0, days: {}, anime: {}, eps: {}, since: Date.now() }, data);
                    save(merged);
                    window.stxRender(true);
                    if (typeof showToast === 'function') showToast('✅ İstatistik yedeği başarıyla yüklendi.');
                } catch (_) {
                    if (typeof showToast === 'function') showToast('❌ Geçersiz istatistik JSON dosyası.');
                }
            };
            reader.readAsText(file);
        };
        inp.click();
    };

})();



window.openUserProfile = async function(username) {

    if (!username) return;

    if (typeof currentUser !== 'undefined' && username === currentUser) {

        showProfileModal();

        return;

    }



    showLoader();

    try {

        const { data, error } = await supabaseClient.from('profiles').select('*').eq('username', username).single();

        var ext = {};

        try {

            const extRes = await supabaseClient

                .from('comments')

                .select('content')

                .eq('ep_key', '__anitr_prf_ext_v1__:' + username)

                .order('id', { ascending: false })

                .limit(1);

            if (!extRes.error && extRes.data && extRes.data.length) {

                ext = JSON.parse(extRes.data[0].content || '{}') || {};

            }

        } catch (_) {}

        hideLoader();



        if (error || !data) {

            showToast('Kullanıcı bulunamadı!');

            return;

        }



        _prf2ViewingTargetUser = username;

        var shell = document.getElementById('prf2Shell');

        if (shell) {

            shell.classList.add('is-visitor-mode');

            shell.classList.remove('is-self-preview');

        }



        var vp = _prfEnsureDefaults({

            username: ext.displayName || data.username || username,

            nameColor: data.name_color || '#ffffff',

            bio: data.bio || '',

            discord: data.discord || '',

            favGenre: data.fav_genre || '',

            favGenres: ext.favGenres || (data.fav_genre ? [data.fav_genre] : []),

            avatar: data.avatar_url || '',

            banner: data.banner_url || '',

            accentTheme: ext.accentTheme || 'violet',

            avatarFrame: ext.avatarFrame || 'aurora',

            bannerPreset: ext.bannerPreset || 'nebula',

            nameGradient: ext.nameGradient || 'none',

            customTitle: ext.customTitle || 'Anime Sever',

            statusEmoji: ext.statusEmoji || '✨',

            statusText: ext.statusText || (data.current_anime ? ('İzliyor: ' + data.current_anime) : 'Anitr Üyesi'),

            watchPref: ext.watchPref || 'sub',

            watchTimePref: ext.watchTimePref || 'night',

            malUser: ext.malUser || '',

            anilistUser: ext.anilistUser || '',

            socialLink: ext.socialLink || '',

            showcaseAnimes: ext.showcaseAnimes || [null, null, null, null],

            favCharacter: ext.favCharacter || null,

            favQuote: ext.favQuote || '',

            weeklyGoal: (ext.publicStats && ext.publicStats.weeklyGoal) || 10

        });



        _prfApplyVisualIdentity(vp, vp.username, username);

        var pubStats = ext.publicStats || {

            epCount: 0, totalHours: 0, favCount: 0, watchlistCount: 0,

            followedCount: 0, notesCount: 0, showcaseCount: (vp.showcaseAnimes || []).filter(Boolean).length,

            streak: 1, bestStreak: 1, weekCount: 0, xp: 120, level: 2, nextXp: 240, xpPct: 50,

            tierName: 'Anitr Üyesi', recentHist: []

        };

        _prfRenderStatsAndAchievements(pubStats, vp);

        _prfRenderShowcaseGrid(vp, true);

        _prfRenderFavCharCard(vp);



        var curBox = document.getElementById('profileCurrentWatching');

        var pPill  = document.getElementById('prf2PresencePill');

        var pText  = document.getElementById('prf2PresenceText');

        if (data.show_current !== false && data.current_anime) {

            if (pPill) pPill.classList.add('is-watching');

            if (pText) pText.textContent = 'İzliyor: ' + data.current_anime;

            if (curBox) {

                curBox.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:11px;border-radius:11px;background:rgba(139,92,246,0.14);border:1px solid rgba(139,92,246,0.35);">' +

                    '<i class="fa-solid fa-circle-play" style="color:#c4b5fd;font-size:18px;"></i>' +

                    '<div><div style="font-size:10px;color:#c4b5fd;font-weight:800;">ŞU AN İZLİYOR</div><strong style="color:#fff;font-size:13px;">' + _prfEsc(data.current_anime) + '</strong></div>' +

                '</div>';

            }

        } else {

            if (pPill) pPill.classList.remove('is-watching');

            if (pText) pText.textContent = 'Çevrimiçi';

            if (curBox) curBox.innerHTML = '<div style="padding:10px;border-radius:10px;background:rgba(255,255,255,0.025);color:#9ca3af;font-size:12px;">Şu an bir anime izlemiyor veya gizli.</div>';

        }



        // Arkadaş Ekle / Mesaj Gönder Butonları

        var visAct = document.getElementById('prf2VisitorActions');

        if (visAct) {

            var actHtml = '';

            if (typeof currentUser !== 'undefined' && currentUser) {

                const { data: fData } = await supabaseClient.from('friends').select('status').or(`and(sender.eq.${currentUser},receiver.eq.${username}),and(sender.eq.${username},receiver.eq.${currentUser})`).maybeSingle();

                if (fData && fData.status === 'accepted') {

                    actHtml += `<button type="button" class="prf2-btn-save" onclick="closeProfileModal(); showSocialView(); openIntegratedChat('${_prfEsc(username)}')"><i class="fa-solid fa-message"></i> Mesaj Gönder</button>`;

                } else if (fData && fData.status === 'pending') {

                    actHtml += `<button type="button" class="prf2-btn-ghost" disabled><i class="fa-solid fa-clock"></i> Arkadaşlık İsteği Bekliyor</button>`;

                } else {

                    actHtml += `<button type="button" class="prf2-btn-save" onclick="sendFriendRequest('${_prfEsc(username)}')"><i class="fa-solid fa-user-plus"></i> Arkadaş Ekle</button>`;

                }

            }

            actHtml += `<button type="button" class="prf2-btn-ghost" onclick="prfGiveKudos()"><i class="fa-solid fa-hands-clapping" style="color:#fde047"></i> Profili Alkışla</button>`;

            visAct.innerHTML = actHtml;

            visAct.classList.remove('hidden');

        }



        var pv = document.getElementById('profileView');
        if (pv) pv.classList.add('is-visitor-view');
        var eb = document.getElementById('prfPageEyebrow');
        var mt = document.getElementById('prfPageMainTitle');
        var st = document.getElementById('prfPageSubTitle');
        if (eb) eb.textContent = 'TOPLULUK PROFİLİ / @' + String(username).toUpperCase();
        if (mt) mt.textContent = (vp.username || username) + ' · Profil Vitrini';
        if (st) st.textContent = 'Kullanıcının vitrin serileri, izleme istatistikleri ve başarımları.';
        _openProfilePageView();
        switchPrf2Tab('overview');
        _prfFetchKudosCount(username);

    } catch (e) {

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

// TRACE.MOE — REMOVED

// ══════════════════════════════════════════════════════

window.openTraceMoeModal = function() { console.log('[TraceMoe] Removed'); }; void function() {

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

var _anitrFiller = { key: '', ready: false, loading: false, failed: false, fillers: new Set(), mixed: new Set(), recaps: new Set(), total: 0, malId: 0, source: '' };
var _anitrFillerMode = 'all';          // all | canon | mixed | filler
var _anitrFillerPrevIdx = -1;
var _anitrFillerHandled = '';

function anitrFillerEnabled() {
    return !(typeof appSettings !== 'undefined' && appSettings && appSettings.showFillers === false);
}
function _fillerSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function _fillerCacheGet(key) {
    try {
        var all = JSON.parse(localStorage.getItem('anitr_filler_v2') || '{}');
        var e = all[key];
        if (e && Date.now() - e.t < 3 * 86400000) return e;
    } catch (e) {}
    return null;
}
function _fillerCacheSet(key, val) {
    try {
        var all = JSON.parse(localStorage.getItem('anitr_filler_v2') || '{}');
        all[key] = val;
        var keys = Object.keys(all);
        if (keys.length > 80) {
            keys.sort(function (a, b) { return all[a].t - all[b].t; });
            delete all[keys[0]];
        }
        localStorage.setItem('anitr_filler_v2', JSON.stringify(all));
    } catch (e) {}
}

var _anitrFillerBackoffUntil = 0;

async function _jikanGetJson(url, timeoutMs) {
    var ms = timeoutMs || 9500;
    for (var a = 0; a < 2; a++) {
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, ms) : null;
        try {
            var r = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
            if (timer) clearTimeout(timer);
            if (r.status === 429 && a === 0) { await _fillerSleep(1200); continue; }
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return await r.json();
        } catch (err) {
            if (timer) clearTimeout(timer);
            if (a === 0) { await _fillerSleep(500); continue; }
            throw err;
        }
    }
    throw new Error('Filler API istek limiti');
}

function _parseFillerResponseFlags(res) {
    var fillers = [], mixed = [], recaps = [], maxFlagEp = 0;
    var flagsObj = (res && res.flags) || {};
    Object.keys(flagsObj).forEach(function (epStr) {
        var n = parseInt(epStr, 10);
        if (!n) return;
        if (n > maxFlagEp) maxFlagEp = n;
        var fl = flagsObj[epStr];
        if (!fl) return;
        if (fl.mixed || fl.kind === 'mixed') {
            mixed.push(n);
        } else if (fl.filler || fl.kind === 'filler') {
            fillers.push(n);
        } else if (fl.recap || fl.kind === 'recap') {
            recaps.push(n);
        }
    });
    return { fillers: fillers, mixed: mixed, recaps: recaps, maxFlagEp: maxFlagEp };
}

async function anitrFillerEnsure(title, seasonId) {
    if (!title && typeof currentAnime !== 'undefined' && currentAnime && currentAnime.title) {
        title = currentAnime.title;
    }
    if (!anitrFillerEnabled() || !title) return;
    var sNum = parseInt(seasonId) || 1;
    if (sNum > 30 || sNum < 1) sNum = 1;
    var key = String(title).toLowerCase().trim() + '|' + sNum;
    if (_anitrFiller.key === key && (_anitrFiller.ready || _anitrFiller.loading)) return;

    var cached = _fillerCacheGet(key);
    if (!cached && Date.now() < _anitrFillerBackoffUntil) {
        _anitrFiller = { key: key, ready: false, loading: false, failed: true, fillers: new Set(), mixed: new Set(), recaps: new Set(), total: 0, malId: 0, source: '' };
        anitrFillerRender();
        return;
    }

    _anitrFiller = { key: key, ready: false, loading: true, failed: false, fillers: new Set(), mixed: new Set(), recaps: new Set(), total: 0, malId: 0, source: '' };
    anitrFillerRender();

    try {
        var fillers, mixed, recaps, total, malId, srcName;
        if (cached) {
            fillers = cached.f || [];
            mixed = cached.x || [];
            recaps = cached.r || [];
            total = cached.n || 0;
            malId = cached.m || 0;
            srcName = cached.s || '';
        } else {
            var q = sNum > 1 ? title + ' season ' + sNum : title;
            var res = await _jikanGetJson('/api/filler?title=' + encodeURIComponent(q), 10000);
            if (_anitrFiller.key !== key) return;

            var parsed = _parseFillerResponseFlags(res);
            // Eğer sNum > 1 ile sonuç boş döndüyse ana anime başlığıyla tekrar dene
            if (sNum > 1 && (!res || !res.mal_id || (parsed.fillers.length === 0 && parsed.mixed.length === 0 && parsed.recaps.length === 0))) {
                try {
                    var baseRes = await _jikanGetJson('/api/filler?title=' + encodeURIComponent(title), 10000);
                    if (_anitrFiller.key !== key) return;
                    if (baseRes && baseRes.mal_id) {
                        res = baseRes;
                        parsed = _parseFillerResponseFlags(baseRes);
                    }
                } catch (_) {}
            }

            if (!res || !res.mal_id) {
                if (res && res.unreachable) {
                    _anitrFillerBackoffUntil = Date.now() + 120000;
                }
                _anitrFiller.loading = false;
                _anitrFiller.failed = true;
                anitrFillerRender();
                return;
            }
            malId = res.mal_id;
            srcName = res.source || 'API';
            fillers = parsed.fillers;
            mixed = parsed.mixed;
            recaps = parsed.recaps;
            var epLen = (typeof currentEpisodes !== 'undefined' && Array.isArray(currentEpisodes)) ? currentEpisodes.length : 0;
            total = Math.max(res.total || 0, parsed.maxFlagEp, epLen);
            _fillerCacheSet(key, { t: Date.now(), f: fillers, x: mixed, r: recaps, n: total, m: malId, s: srcName });
        }
        if (_anitrFiller.key !== key) return;
        _anitrFiller.fillers = new Set(fillers);
        _anitrFiller.mixed = new Set(mixed);
        _anitrFiller.recaps = new Set(recaps);
        _anitrFiller.total = total;
        _anitrFiller.malId = malId;
        _anitrFiller.source = srcName;
        _anitrFiller.ready = true;
        _anitrFiller.loading = false;
    } catch (err) {
        if (_anitrFiller.key !== key) return;
        _anitrFillerBackoffUntil = Date.now() + 60000;
        _anitrFiller.loading = false;
        _anitrFiller.failed = true;
    }
    anitrFillerRender();
    _fillerMaybeAutoSkip();
}

function _fillerEpNum(ep, idx) { return parseInt(ep && ep.Number) || (idx + 1); }

function anitrFillerType(epNum, epObj) {
    var f = _anitrFiller;
    if (!anitrFillerEnabled()) return null;
    if (epObj && epObj.Extra) {
        var fk = String(epObj.Extra.fillerKind || epObj.Extra.filler_type || '').toLowerCase();
        if (fk === 'mixed' || fk === 'half' || fk === 'yari_filler') return 'mixed';
        if (fk === 'filler') return 'filler';
        if (fk === 'recap') return 'recap';
    }
    if (!f.ready) return null;
    if (f.mixed && f.mixed.has(epNum)) return 'mixed';
    if (f.fillers && f.fillers.has(epNum)) return 'filler';
    if (f.recaps && f.recaps.has(epNum)) return 'recap';
    if (f.total && epNum > f.total) return null;
    return 'canon';
}

function _fillerHidden(t) {
    if (_anitrFillerMode === 'canon') return t === 'filler' || t === 'recap';
    if (_anitrFillerMode === 'mixed') return t !== 'mixed';
    if (_anitrFillerMode === 'filler') return t !== 'filler' && t !== 'mixed' && t !== 'recap';
    return false;
}

function _fillerBadgeHTML(t, cls) {
    if (t === 'filler') {
        return '<span class="' + cls + ' filler" title="Filler Bölüm (Ana hikayeden bağımsız)"><i class="fa-solid fa-fire-flame-curved"></i> Filler</span>';
    }
    if (t === 'mixed') {
        return '<span class="' + cls + ' mixed" title="Yarı Filler Bölüm (Canon + Filler karışımı)"><i class="fa-solid fa-circle-half-stroke"></i> Yarı Filler</span>';
    }
    if (t === 'recap') {
        return '<span class="' + cls + ' recap" title="Özet Bölümü"><i class="fa-solid fa-rotate-left"></i> Özet</span>';
    }
    return '<span class="' + cls + ' canon" title="Canon Bölüm (Ana hikaye)"><i class="fa-solid fa-circle-check"></i> Canon</span>';
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
        var t = anitrFillerType(_fillerEpNum(eps[j], j), eps[j]);
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
        var t = anitrFillerType(_fillerEpNum(ep, idx), ep);
        var guardKey = _anitrFiller.key + '#' + idx;
        if (t !== 'filler' && t !== 'recap') return;
        if (_anitrFillerHandled === guardKey) return;
        _anitrFillerHandled = guardKey;
        if (_anitrFillerPrevIdx >= 0 && idx === _anitrFillerPrevIdx + 1) {
            if (typeof showToast === 'function') showToast('⏭️ Filler bölüm otomatik atlanıyor...');
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
    _anitrFillerPrevIdx = prev;
    _fillerMaybeAutoSkip();
    _anitrFillerPrevIdx = cur;
}

function _fillerCounts(eps) {
    var cnt = { canon: 0, mixed: 0, filler: 0, recap: 0 };
    eps.forEach(function (ep, i) {
        var t = anitrFillerType(_fillerEpNum(ep, i), ep);
        if (t && cnt[t] !== undefined) cnt[t]++;
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

    // Kapalıysa her şeyi temizle
    if (!on) {
        if (detailBar) detailBar.remove();
        if (wbar) { wbar.innerHTML = ''; wbar.classList.add('hidden'); }
        if (banner) { banner.innerHTML = ''; banner.classList.add('hidden'); }
        if (cbadge) cbadge.classList.add('hidden');
        document.querySelectorAll('.ep-thumb-badge-wrap.fl, .sep2-type-badge, .sep2-thumb-filler-tag').forEach(function (n) { n.remove(); });
        document.querySelectorAll('.is-filler-ep, .is-mixed-ep, .is-recap-ep').forEach(function (n) {
            n.classList.remove('is-filler-ep', 'is-mixed-ep', 'is-recap-ep');
        });
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
                detailBar.innerHTML = '<div class="filler-ctrl-inner"><div class="filler-ctrl-stats"><span class="filler-stat-chip recap"><i class="fa-solid fa-spinner fa-spin"></i> Filler & Yarı Filler verisi API\'den çekiliyor...</span></div></div>';
            } else {
                var pill = function (m, label) {
                    return '<button type="button" class="filler-filter-btn' + (_anitrFillerMode === m ? ' active' : '') + '" onclick="anitrFillerSetMode(\'' + m + '\')">' + label + '</button>';
                };
                detailBar.innerHTML =
                    '<div class="filler-ctrl-inner">' +
                    '<div class="filler-ctrl-stats">' +
                    '<span class="filler-stat-chip canon"><i class="fa-solid fa-circle-check"></i> ' + cnt.canon + ' Canon</span>' +
                    '<span class="filler-stat-chip mixed"><i class="fa-solid fa-circle-half-stroke"></i> ' + cnt.mixed + ' Yarı Filler</span>' +
                    '<span class="filler-stat-chip filler"><i class="fa-solid fa-fire-flame-curved"></i> ' + cnt.filler + ' Filler</span>' +
                    (cnt.recap ? '<span class="filler-stat-chip recap"><i class="fa-solid fa-rotate-left"></i> ' + cnt.recap + ' Özet</span>' : '') +
                    '</div>' +
                    '<div class="filler-ctrl-actions">' +
                    '<div class="filler-filter-pills">' +
                    pill('all', 'Tümü') +
                    pill('canon', 'Sadece Canon') +
                    pill('mixed', 'Yarı Filler') +
                    pill('filler', 'Filler') +
                    '</div>' +
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
        var t = anitrFillerType(_fillerEpNum(ep, idx), ep);
        card.classList.toggle('is-filler-ep', t === 'filler');
        card.classList.toggle('is-mixed-ep', t === 'mixed');
        card.classList.toggle('is-recap-ep', t === 'recap');
        card.classList.toggle('fl-hidden', f.ready && _fillerHidden(t));
        var th = card.querySelector('.ep-card-thumb');
        if (!th) return;
        var old = th.querySelector('.ep-thumb-badge-wrap.fl');
        if (old) old.remove();
        if (t === 'filler' || t === 'mixed' || t === 'recap') {
            th.insertAdjacentHTML('beforeend', '<div class="ep-thumb-badge-wrap fl">' + _fillerBadgeHTML(t, 'ep-type-badge') + '</div>');
        }
    });

    // ── İzleme sayfası sağ bölüm listesi (#watchEpisodesList .sep2-card) ──
    document.querySelectorAll('#watchEpisodesList .sep2-card').forEach(function (card, idx) {
        var ep = eps[idx];
        if (!ep) return;
        var t = anitrFillerType(_fillerEpNum(ep, idx), ep);
        card.classList.toggle('is-filler-ep', t === 'filler');
        card.classList.toggle('is-mixed-ep', t === 'mixed');
        card.classList.toggle('is-recap-ep', t === 'recap');
        card.classList.toggle('fl-hidden', f.ready && _fillerHidden(t) && idx !== currentEIdx);

        // Sağ listedeki kartın bilgi satırına "Filler" / "Yarı Filler" / "Özet" rozetini ekle
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
            if (t === 'filler' || t === 'mixed' || t === 'recap') {
                row.insertAdjacentHTML('beforeend', _fillerBadgeHTML(t, 'sep2-type-badge'));
            }
        }

        // Ayrıca küçük resim (thumbnail) üzerinde de net etiket göster
        var thumbWrap = card.querySelector('.sep2-thumb-wrap');
        if (thumbWrap) {
            var oldTag = thumbWrap.querySelector('.sep2-thumb-filler-tag');
            if (oldTag) oldTag.remove();
            if (t === 'filler' || t === 'mixed' || t === 'recap') {
                var tagLabel = t === 'filler' ? 'FILLER' : (t === 'mixed' ? 'YARI FILLER' : 'ÖZET');
                thumbWrap.insertAdjacentHTML('beforeend', '<span class="sep2-thumb-filler-tag ' + t + '">' + tagLabel + '</span>');
            }
        }
    });

    // ── İzleme sayfası sağ üst kontrol çubuğu (#watchFillerControlBar) ──
    if (wbar) {
        if (f.loading && eps.length) {
            wbar.classList.remove('hidden');
            wbar.innerHTML =
                '<div class="watch-filler-loading">' +
                '<i class="fa-solid fa-circle-notch fa-spin"></i>' +
                '<span>Filler & Yarı Filler verisi API\'den çekiliyor...</span>' +
                '</div>';
        } else if (f.ready && eps.length) {
            wbar.classList.remove('hidden');
            var wp = function (m, label) {
                return '<button type="button" class="wf-pill' + (_anitrFillerMode === m ? ' active' : '') + '" onclick="anitrFillerSetMode(\'' + m + '\')">' + label + '</button>';
            };
            wbar.innerHTML =
                '<div class="watch-filler-row">' +
                '<div class="watch-filler-pills">' +
                wp('all', 'Tümü') +
                wp('canon', 'Canon') +
                wp('mixed', 'Yarı Filler') +
                wp('filler', 'Filler') +
                '</div>' +
                '<label class="wf-skip-label" title="Filler bölümleri otomatik atla"><input type="checkbox" ' + (autoOn ? 'checked' : '') + ' onchange="anitrFillerSetAutoSkip(this.checked)"> Atla</label>' +
                '</div>' +
                '<div class="watch-filler-summary">' +
                '<span class="wf-sum canon"><i class="fa-solid fa-circle-check"></i> ' + cnt.canon + ' Canon</span>' +
                '<span class="wf-sum mixed"><i class="fa-solid fa-circle-half-stroke"></i> ' + cnt.mixed + ' Yarı Filler</span>' +
                '<span class="wf-sum filler"><i class="fa-solid fa-fire-flame-curved"></i> ' + cnt.filler + ' Filler' + (cnt.recap ? ' · ' + cnt.recap + ' Özet' : '') + '</span>' +
                '</div>';
        } else {
            wbar.innerHTML = '';
            wbar.classList.add('hidden');
        }
    }

    // ── İzleme sayfası uyarı bandı + üst rozet ──
    var curIdx = (typeof currentEIdx === 'number') ? currentEIdx : -1;
    var curEp = eps[curIdx];
    var ct = (curEp && f.ready) ? anitrFillerType(_fillerEpNum(curEp, curIdx), curEp) : null;
    if (cbadge) {
        if (ct) {
            cbadge.className = 'wd2-badge-canon ' + ct;
            cbadge.innerHTML = ct === 'canon' ? '<i class="fa-solid fa-circle-check"></i> Canon'
                : ct === 'mixed' ? '<i class="fa-solid fa-circle-half-stroke"></i> Yarı Filler'
                : ct === 'filler' ? '<i class="fa-solid fa-fire-flame-curved"></i> Filler'
                : '<i class="fa-solid fa-rotate-left"></i> Özet';
        } else {
            cbadge.classList.add('hidden');
        }
    }
    if (banner) {
        if (ct === 'filler' || ct === 'mixed' || ct === 'recap') {
            banner.className = 'watch-filler-alert ' + ct;
            var titleTxt = ct === 'filler' ? 'Filler Bölüm'
                : ct === 'mixed' ? 'Yarı Filler Bölüm'
                : 'Özet Bölümü';
            var descTxt = ct === 'filler' ? 'Bu bölüm ana hikayeyle doğrudan bağlantılı değildir.'
                : ct === 'mixed' ? 'Bu bölüm hem ana hikaye (canon) hem de filler sahneler içeriyor.'
                : 'Bu bölüm önceki bölümlerin özetidir.';
            var iconCls = ct === 'mixed' ? 'fa-circle-half-stroke' : 'fa-triangle-exclamation';
            banner.innerHTML =
                '<div class="wfa-left"><i class="fa-solid ' + iconCls + '"></i>' +
                '<span><b>' + titleTxt + '</b> — ' + descTxt + '</span></div>' +
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





// ═══ NAVBAR 2026 — drawer, aktif durum, kayan mürekkep & spotlight ═══

(function () {
    function moveAnavInk(immediate) {
        const wrap = document.getElementById('anavLinks');
        const ink = document.getElementById('anavInk');
        if (!wrap || !ink) return;
        const act = wrap.querySelector('.anav-link.active');
        if (!act || !act.offsetWidth) {
            ink.style.opacity = '0';
            return;
        }
        if (immediate) ink.style.transition = 'none';
        ink.style.opacity = '1';
        ink.style.width = act.offsetWidth + 'px';
        ink.style.transform = 'translateX(' + act.offsetLeft + 'px)';
        if (immediate) { void ink.offsetWidth; ink.style.transition = ''; }
    }

    window.setAnavActive = function (key) {
        if (key === 'animes') key = 'anime';
        document.querySelectorAll('.anav-link').forEach(b => b.classList.toggle('active', b.dataset.key === key));
        moveAnavInk(false);
    };

    function initAnavInteractions() {
        const nav = document.getElementById('anav');
        const wrap = document.getElementById('anavLinks');
        const hInk = document.getElementById('anavHoverInk');
        if (nav) {
            nav.addEventListener('pointermove', e => {
                const r = nav.getBoundingClientRect();
                nav.style.setProperty('--anav-mx', (e.clientX - r.left).toFixed(1) + 'px');
                nav.style.setProperty('--anav-my', (e.clientY - r.top).toFixed(1) + 'px');
            }, { passive: true });
        }
        if (wrap && hInk) {
            wrap.querySelectorAll('.anav-link').forEach(btn => {
                btn.addEventListener('pointerenter', () => {
                    hInk.style.width = btn.offsetWidth + 'px';
                    hInk.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
                    hInk.style.opacity = '1';
                });
            });
            wrap.addEventListener('pointerleave', () => {
                hInk.style.opacity = '0';
            });
            if ('ResizeObserver' in window) new ResizeObserver(() => moveAnavInk(true)).observe(wrap);
        }
        setTimeout(() => moveAnavInk(true), 40);
        window.addEventListener('load', () => moveAnavInk(true));
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAnavInteractions);
    else initAnavInteractions();

    window.openNavDrawer = function () {

        const d = document.getElementById('adrawer'), bd = document.getElementById('adrawerBackdrop'), bg = document.getElementById('anavBurger');

        if (!d) return;

        d.classList.add('open'); bd && bd.classList.add('open');

        d.setAttribute('aria-hidden', 'false'); bg && bg.setAttribute('aria-expanded', 'true');

        document.body.style.overflow = 'hidden';

    };

    window.closeNavDrawer = function () {

        const d = document.getElementById('adrawer'), bd = document.getElementById('adrawerBackdrop'), bg = document.getElementById('anavBurger');

        if (!d) return;

        d.classList.remove('open'); bd && bd.classList.remove('open');

        d.setAttribute('aria-hidden', 'true'); bg && bg.setAttribute('aria-expanded', 'false');

        document.body.style.overflow = '';

    };

    window.toggleNavDrawer = function () {

        const d = document.getElementById('adrawer');

        if (d && d.classList.contains('open')) closeNavDrawer(); else openNavDrawer();

    };

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNavDrawer(); });



    let last = window.scrollY;

    window.addEventListener('scroll', () => {

        const nav = document.getElementById('anav'); if (!nav) return;

        const y = window.scrollY;

        nav.classList.toggle('anav--solid', y > 40);

        if (y > 200 && y > last + 6) nav.classList.add('anav--hidden');

        else if (y < last - 6 || y <= 200) nav.classList.remove('anav--hidden');

        const prog = document.getElementById('anavProgress');
        if (prog) {
            const maxS = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
            const ratio = Math.min(1, Math.max(0, y / maxS));
            prog.style.transform = 'scaleX(' + ratio.toFixed(3) + ')';
        }

        last = y;

    }, { passive: true });

})();



// ═══════════════════════════════════════════
//  NEWS PAGE — Anime Haberleri
// ═══════════════════════════════════════════
let _newsItems  = [];
let _newsLoaded = false;

async function _translateNewsText(text) {
    if (!text || text.length < 5) return text;
    if (/[\u00c7\u00e7\u011e\u011f\u0130\u0131\u00d6\u00f6\u015e\u015f\u00dc\u00fc]/.test(text)) return text;
    var ck = 'ann_tr_' + Math.abs(text.split('').reduce(function(a,c){return(a*31+c.charCodeAt(0))|0;},0));
    var cached = localStorage.getItem(ck);
    if (cached) return cached;
    try {
        var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=' + encodeURIComponent(text.slice(0,350));
        var r = await fetch(url);
        var d = await r.json();
        var tr = Array.isArray(d[0]) ? d[0].map(function(x){return x&&x[0]?x[0]:'';}).join('') : text;
        if (tr && tr.length > 4) { localStorage.setItem(ck, tr); return tr; }
    } catch(e) {}
    return text;
}

async function _renderNewsGrid(items) {
    var grid = document.getElementById('newsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    items.forEach(function(item, i) {
        var card = document.createElement('div');
        card.className = 'news-card';
        card.dataset.idx  = i;
        card.dataset.cats = (item.cats||[]).join(' ');
        card.dataset.link = item.link||'';
        card.addEventListener('click', function() { window.open(this.dataset.link, '_blank'); });

        // Thumbnail
        if (item.thumb) {
            var img = document.createElement('img');
            img.className = 'news-card-thumb';
            img.src = item.thumb;
            img.alt = '';
            img.loading = 'lazy';
            img.onerror = function() { this.style.display='none'; };
            card.appendChild(img);
        } else {
            var ph = document.createElement('div');
            ph.className = 'news-card-thumb-placeholder';
            ph.innerHTML = '<i class="fa-solid fa-newspaper"></i>';
            card.appendChild(ph);
        }

        // Body
        var body = document.createElement('div');
        body.className = 'news-card-body';

        // Categories
        if (item.cats && item.cats.length) {
            var catsDiv = document.createElement('div');
            catsDiv.className = 'news-card-cats';
            item.cats.slice(0,3).forEach(function(c) {
                var sp = document.createElement('span');
                sp.className = 'news-card-cat';
                sp.textContent = c;
                catsDiv.appendChild(sp);
            });
            body.appendChild(catsDiv);
        }

        // Title
        var titleEl = document.createElement('p');
        titleEl.className = 'news-card-title';
        titleEl.textContent = item.title||'';
        body.appendChild(titleEl);

        // Description
        var descEl = document.createElement('p');
        descEl.className = 'news-card-desc';
        descEl.textContent = item.desc||'';
        body.appendChild(descEl);

        // Footer
        var foot = document.createElement('div');
        foot.className = 'news-card-foot';
        var dateStr = item.pubDate ? new Date(item.pubDate).toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'}) : '';
        var dateEl = document.createElement('span');
        dateEl.className = 'news-card-date';
        dateEl.textContent = dateStr;
        var linkEl = document.createElement('span');
        linkEl.className = 'news-card-link';
        linkEl.textContent = 'Habere Git \u2192';
        foot.appendChild(dateEl);
        foot.appendChild(linkEl);
        body.appendChild(foot);

        card.appendChild(body);
        grid.appendChild(card);
    });
}

async function loadNewsView(forceRefresh) {
    var grid = document.getElementById('newsGrid');
    if (!grid) return;
    if (_newsLoaded && !forceRefresh) return;
    grid.innerHTML = '<div class="news-loading"><div class="spinner"></div><span>Haberler y\u00fckleniyor...</span></div>';
    try {
        var RSS_URL = encodeURIComponent('https://www.animenewsnetwork.com/news/rss.xml');
        var API = 'https://api.rss2json.com/v1/api.json?rss_url=' + RSS_URL + '&count=40';
        var r = await fetch(API);
        var data = await r.json();
        if (!data.items || data.items.length === 0) throw new Error('No items');
        _newsItems = data.items.map(function(item) {
            var thumb = (item.thumbnail) || (item.enclosure && item.enclosure.link ? item.enclosure.link : '');
            if (!thumb && item.content) {
                var m = item.content.match(/src="([^"]+\.(jpg|jpeg|png|webp))"/i);
                if (m) thumb = m[1];
            }
            var desc = (item.description || '').replace(/<[^>]*>/g,'').trim();
            var cats = (item.categories || []).map(function(c){return c.toLowerCase();});
            return { title: item.title||'', desc: desc.slice(0,250), thumb: thumb, link: item.link||'', pubDate: item.pubDate||'', cats: cats };
        });
        await _renderNewsGrid(_newsItems);
        _newsLoaded = true;
        // Background translation
        (async function() {
            for (var i = 0; i < _newsItems.length; i++) {
                var item = _newsItems[i];
                var results = await Promise.all([
                    _translateNewsText(item.title),
                    _translateNewsText(item.desc)
                ]);
                item.trTitle = results[0];
                item.trDesc  = results[1];
                var card = grid.querySelector('[data-idx="'+i+'"]');
                if (card) {
                    var tEl = card.querySelector('.news-card-title');
                    var dEl = card.querySelector('.news-card-desc');
                    if (tEl && results[0] !== item.title) tEl.textContent = results[0];
                    if (dEl && results[1] !== item.desc)  dEl.textContent = results[1];
                }
                await new Promise(function(res){setTimeout(res,80);});
            }
        })();
    } catch(e) {
        grid.innerHTML = '<div class="news-loading"><i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;font-size:2rem;"></i><span>Haberler y\u00fcklenemedi. L\u00fctfen tekrar deneyin.</span></div>';
    }
}

function filterNewsCards(cat, btn) {
    document.querySelectorAll('.news-filter-btn').forEach(function(b){b.classList.remove('active');});
    if (btn) btn.classList.add('active');
    document.querySelectorAll('.news-card').forEach(function(card) {
        if (cat === 'all') {
            card.removeAttribute('data-hidden');
        } else {
            var cats = (card.dataset.cats || '').toLowerCase();
            if (cats.includes(cat)) card.removeAttribute('data-hidden');
            else card.setAttribute('data-hidden', '1');
        }
    });
}

function showNewsView() {
    _closeSocialPages();
    const _abv = document.getElementById('aboutView'); if (_abv) _abv.classList.add('hidden');
    if (typeof leaveW2GRoom === 'function') leaveW2GRoom();
    if (typeof clearProfileCurrentAnime === 'function') clearProfileCurrentAnime();
    var nv = document.getElementById('newsView');
    if (nv) nv.classList.remove('hidden');
    if (typeof homeView !== 'undefined' && homeView) homeView.classList.add('hidden');
    if (typeof animeListView !== 'undefined' && animeListView) animeListView.classList.add('hidden');
    if (typeof watchView !== 'undefined' && watchView) watchView.classList.add('hidden');
    if (typeof malView !== 'undefined' && malView) malView.classList.add('hidden');
    var sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    var hv = document.getElementById('historyView'); if (hv) hv.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadNewsView(false);
    if (typeof vjsPlayer !== 'undefined' && vjsPlayer) { try { vjsPlayer.dispose(); } catch(e) {} vjsPlayer = null; }
}
window.showNewsView   = showNewsView;
window.loadNewsView   = loadNewsView;
window.filterNewsCards = filterNewsCards;


// ══════════════════════════════════════════════════════════════════
// ── ANITR HAKKINDA (ABOUT VIEW) 2026 ─────────────────────────────
// ══════════════════════════════════════════════════════════════════

const _ab2State = {
    section: 'all', // 'all' | 'features' | 'preview' | 'shortcuts'
    shot: 'home'    // 'home' | 'anime' | 'schedule' | 'news'
};

const _AB2_SHOTS = {
    home:     { title: 'Ana Sayfa & Sinematik Vitrin', path: 'anitr.web / anasayfa', img: '/assets/showcase-home.png', desc: 'Canlı sezon trendleri, kaldığın yerden devam et şeridi ve hızlı erişim vitrini.', action: "showHomeView()" },
    anime:    { title: 'Çoklu Kaynak Anime Kataloğu',  path: 'anitr.web / animeler', img: '/assets/showcase-anime.png', desc: 'Anizium, AnimeCiX, TürkAnime ve AniList kaynakları arasında anlık geçiş ve filtreleme.', action: "showAnimeListView();setAnavActive('anime')" },
    schedule: { title: 'Canlı Haftalık Yayın Takvimi', path: 'anitr.web / takvim',   img: '/assets/showcase-schedule.png', desc: 'Saatlik gruplanmış yayın akışı, canlı geri sayım rozetleri ve bildirim takibi.', action: "showScheduleView();setAnavActive('schedule')" },
    news:     { title: 'Güncel Anime Haberleri',       path: 'anitr.web / haberler', img: '/assets/showcase-news.png', desc: 'Anime dünyasından anlık çevrilen güncel duyurular ve sektör haberleri.', action: "showNewsView();setAnavActive('news')" }
};

function _moveAb2TabInk() {
    const wrap = document.getElementById('ab2Tabs');
    const ink = document.getElementById('ab2TabInk');
    if (!wrap || !ink) return;
    const act = wrap.querySelector('.lib-tab-btn.active');
    if (!act || !act.offsetWidth) return;
    ink.style.width = act.offsetWidth + 'px';
    ink.style.transform = 'translateX(' + (act.offsetLeft - 3) + 'px)';
}
window.addEventListener('resize', _moveAb2TabInk);

function showAboutView() {
    if (typeof closeNavDrawer === 'function') { try { closeNavDrawer(); } catch (_) {} }
    if (typeof closePgModal === 'function') { try { closePgModal(); } catch (_) {} }
    _closeSocialPages();
    if (typeof leaveW2GRoom === 'function') leaveW2GRoom();
    if (typeof clearProfileCurrentAnime === 'function') clearProfileCurrentAnime();
    if (typeof setAmbientBackground === 'function') setAmbientBackground(null);

    const abv = document.getElementById('aboutView');
    if (abv) abv.classList.remove('hidden');

    if (typeof homeView !== 'undefined' && homeView) homeView.classList.add('hidden');
    if (typeof animeListView !== 'undefined' && animeListView) animeListView.classList.add('hidden');
    if (typeof watchView !== 'undefined' && watchView) watchView.classList.add('hidden');
    if (typeof malView !== 'undefined' && malView) malView.classList.add('hidden');
    const sv = document.getElementById('scheduleView'); if (sv) sv.classList.add('hidden');
    const nv = document.getElementById('newsView'); if (nv) nv.classList.add('hidden');

    if (typeof setAnavActive === 'function') setAnavActive('about');
    renderAboutPage(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (typeof vjsPlayer !== 'undefined' && vjsPlayer) {
        try { vjsPlayer.dispose(); } catch(e) {}
        vjsPlayer = null;
    }
}

window.ab2SetSection = function(sec) {
    _ab2State.section = sec;
    renderAboutPage(true);
};

window.abSwitchShot = function(btnOrKey, maybeKey) {
    const key = maybeKey || btnOrKey;
    if (!_AB2_SHOTS[key]) return;
    _ab2State.shot = key;
    renderAboutPage(true);
};

function switchShowcaseTab(btnEl, imgSrc, urlText) {}
function initAboutAnimations() {}

function renderAboutPage(isSoft) {
    const host = document.getElementById('aboutPageBody');
    if (!host) return;

    const watchedCount = (typeof getWatched === 'function') ? getWatched().length : 0;
    const favCount     = (typeof getFavorites === 'function') ? getFavorites().length : 0;
    const listCount    = (typeof getMyLists === 'function') ? getMyLists().length : 0;
    const sec = _ab2State.section;
    const curShot = _AB2_SHOTS[_ab2State.shot] || _AB2_SHOTS.home;

    const modules = [
        { code: '01', cat: 'KATALOG & KAYNAK', title: 'Çoklu Kaynak Mimarisi', desc: 'Anizium, AnimeCiX, TürkAnime ve AniList veritabanlarını tek arayüzde birleştirir. Bir kaynakta sorun olduğunda yedek kaynak anında devreye girer.', act: "showAnimeListView();setAnavActive('anime')", actLbl: 'Kataloğu Aç →' },
        { code: '02', cat: 'YAYIN AKIŞI',      title: 'Canlı Yayın Takvimi',   desc: 'Haftanın her günü yayınlanan bölümleri saatlik düzende, canlı geri sayım rozetleri ve yayın bildirimleriyle takip et.', act: "showScheduleView();setAnavActive('schedule')", actLbl: 'Takvime Git →' },
        { code: '03', cat: 'EŞZAMANLI İZLEME', title: 'Birlikte İzle (Watch2Gether)', desc: 'Supabase Realtime altyapısıyla arkadaşlarınla milisaniyelik senkronize video oynatma, canlı oda sohbeti ve anlık tepkiler.', act: "showOnlineRooms();setAnavActive('together')", actLbl: 'Odaları Gör →' },
        { code: '04', cat: 'TOPLULUK',         title: 'Anitr Sosyal',          desc: 'İnceleme, öneri, anket paylaşımı, arkadaş listesi, çevrimiçi durum takibi ve gerçek zamanlı özel mesajlaşma merkezi.', act: "showFriendsModal();setAnavActive('community')", actLbl: 'Topluluğa Katıl →' },
        { code: '05', cat: 'SİNEMA DENEYİMİ',  title: 'Ambilight & Gelişmiş Oynatıcı', desc: 'Videonun renklerini gerçek zamanlı örnekleyen Ambilight atmosfer ışığı, otomatik intro atlama, bölüm önizleme kareleri ve 4K keskinleştirme.', act: "showHomeView();setAnavActive('home')", actLbl: 'Ana Sayfa →' },
        { code: '06', cat: 'KOLEKSİYON',       title: 'Kişisel Kütüphane & Özel Listeler', desc: 'Özel koleksiyon listeleri, favoriler, kaldığın dakikayı hatırlayan izleme geçmişi ve tek tıkla JSON yedekleme.', act: "showMyLists()", actLbl: 'Kütüphaneyi Aç →' },
        { code: '07', cat: 'VERİ ANALİZİ',     title: 'Gerçek Zamanlı İstatistikler', desc: 'İzlediğin her saniyeyi kaydeden seviye sistemi, 7/14/30 günlük tempo grafikleri ve 12 haftalık devamlılık matrisi.', act: "showStats()", actLbl: 'İstatistikler →' },
        { code: '08', cat: 'KEŞİF & ENTEGRASYON', title: 'Akıllı Keşif & MyAnimeList', desc: 'Şifresiz MyAnimeList profil senkronizasyonu, atmosfer/ruh hali filtreli öneri motoru ve benzer seri bulucu.', act: "showAIModal()", actLbl: 'Keşif Stüdyosu →' }
    ];

    const shortcuts = [
        ['Space / K', 'Oynat veya Duraklat'],
        ['F',         'Tam Ekran Modu'],
        ['T',         'Sinema (Geniş Ekran) Modu'],
        ['J / L',     '10 Saniye Geri / İleri Sar'],
        ['M',         'Sesi Kapat / Aç'],
        ['S',         'İntroyu Hızlı Atla (+85 sn)'],
        ['/',         'Katalog veya Kütüphane İçi Arama'],
        ['Ctrl + K',  'Genel Hızlı Arama Penceresi'],
        ['Ctrl + H',  'İzleme Geçmişini Aç']
    ];

    host.innerHTML = `
    <div class="lib-shell${isSoft ? ' is-switching' : ''}">
        <header class="lib-head">
            <div class="lib-head-left">
                <p class="cat-eyebrow">Platform Rehberi &amp; Mimari · 2026</p>
                <h1 class="cat-title">Anitr Hakkında</h1>
                <p class="cat-count">Reklamsız, çoklu kaynaklı, gerçek zamanlı sosyal etkileşimli modern anime platformu</p>
            </div>
            <div class="lib-head-right">
                <div class="lib-top-actions">
                    <button type="button" class="lib-btn primary" onclick="showAnimeListView();setAnavActive('anime')"><i class="fa-solid fa-play"></i><span>Kataloğu Keşfet</span></button>
                    <button type="button" class="lib-btn" onclick="showOnlineRooms();setAnavActive('together')"><i class="fa-solid fa-tv"></i><span>Birlikte İzle</span></button>
                </div>
            </div>
        </header>

        <section class="stx-kpis" aria-label="Platform Göstergeleri">
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>01</span><small>KAYNAK MOTORU</small></div>
                <div class="stx-kpi-val">4<em>kaynak</em></div>
                <p class="stx-kpi-foot">Anizium, AnimeCiX, TürkAnime ve AniList entegrasyonu</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>02</span><small>REKLAM &amp; İZLEYİCİ</small></div>
                <div class="stx-kpi-val">%0<em>reklam</em></div>
                <p class="stx-kpi-foot">Açılır pencere veya video önü kesinti bulunmaz</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>03</span><small>CANLI SENKRONİZASYON</small></div>
                <div class="stx-kpi-val">W2G<em>odaları</em></div>
                <p class="stx-kpi-foot">Supabase Realtime ile eşzamanlı oda ve sohbet</p>
            </article>
            <article class="stx-kpi">
                <div class="stx-kpi-head"><span>04</span><small>SENİN ARŞİVİN</small></div>
                <div class="stx-kpi-val">${watchedCount}<em>bölüm</em></div>
                <p class="stx-kpi-foot">${favCount} favori anime · ${listCount} özel koleksiyon listesi</p>
            </article>
        </section>

        <div class="lib-toolbar">
            <div class="lib-tabs" id="ab2Tabs" role="tablist">
                <span class="lib-tabs-ink" id="ab2TabInk"></span>
                <button type="button" class="lib-tab-btn${sec === 'all' ? ' active' : ''}" onclick="ab2SetSection('all')"><span>Tüm Bölümler</span></button>
                <button type="button" class="lib-tab-btn${sec === 'features' ? ' active' : ''}" onclick="ab2SetSection('features')"><span>Sistem Modülleri</span><b>8</b></button>
                <button type="button" class="lib-tab-btn${sec === 'preview' ? ' active' : ''}" onclick="ab2SetSection('preview')"><span>Ekran Önizlemeleri</span><b>4</b></button>
                <button type="button" class="lib-tab-btn${sec === 'shortcuts' ? ' active' : ''}" onclick="ab2SetSection('shortcuts')"><span>Kısayollar &amp; Mimari</span></button>
            </div>
        </div>

        ${(sec === 'all' || sec === 'features') ? `
        <section class="ab2-section">
            <div class="ab2-sec-head">
                <div>
                    <span class="stx-panel-kicker">AKTİF PLATFORM ÖZELLİKLERİ</span>
                    <h2 class="ab2-sec-title">Anitr İçerisinde Yer Alan Modüller</h2>
                </div>
                <span class="ab2-sec-note">Tüm özellikler ek eklenti gerektirmeden tarayıcıda çalışır</span>
            </div>
            <div class="ab2-mod-grid">
                ${modules.map(m => `
                    <article class="ab2-mod-card" onclick="${m.act}">
                        <div class="ab2-mc-top">
                            <span>${m.code}</span>
                            <small>${m.cat}</small>
                        </div>
                        <h3 class="ab2-mc-title">${m.title}</h3>
                        <p class="ab2-mc-desc">${m.desc}</p>
                        <span class="ab2-mc-link">${m.actLbl}</span>
                    </article>
                `).join('')}
            </div>
        </section>` : ''}

        ${(sec === 'all' || sec === 'preview') ? `
        <section class="ab2-section">
            <div class="ab2-sec-head">
                <div>
                    <span class="stx-panel-kicker">ARAYÜZ ÖNİZLEMESİ</span>
                    <h2 class="ab2-sec-title">Uygulama İçi Ekran Görüntüleri</h2>
                </div>
                <div class="lib-subpills">
                    <button type="button" class="${_ab2State.shot === 'home' ? 'active' : ''}" onclick="abSwitchShot('home')">Ana Sayfa</button>
                    <button type="button" class="${_ab2State.shot === 'anime' ? 'active' : ''}" onclick="abSwitchShot('anime')">Katalog</button>
                    <button type="button" class="${_ab2State.shot === 'schedule' ? 'active' : ''}" onclick="abSwitchShot('schedule')">Takvim</button>
                    <button type="button" class="${_ab2State.shot === 'news' ? 'active' : ''}" onclick="abSwitchShot('news')">Haberler</button>
                </div>
            </div>
            <div class="ab2-shot-viewer">
                <div class="ab2-shot-bar">
                    <div class="ab2-shot-meta">
                        <span class="ab2-shot-path">${curShot.path}</span>
                        <span class="ab2-shot-desc">${curShot.desc}</span>
                    </div>
                    <button type="button" class="lib-btn sm primary" onclick="${curShot.action}">Bu Sayfayı Canlı Aç →</button>
                </div>
                <div class="ab2-shot-canvas">
                    <img id="ab-shots-img" src="${curShot.img}" alt="${curShot.title}" loading="lazy">
                </div>
            </div>
        </section>` : ''}

        ${(sec === 'all' || sec === 'shortcuts') ? `
        <section class="stx-main-grid">
            <article class="stx-panel">
                <div class="stx-panel-head">
                    <div>
                        <span class="stx-panel-kicker">HIZLI KONTROL</span>
                        <h3 class="stx-panel-title">Oynatıcı &amp; Arayüz Klavye Kısayolları</h3>
                    </div>
                    <div class="stx-panel-meta"><span>9 aktif kısayol</span></div>
                </div>
                <div class="ab2-sc-list">
                    ${shortcuts.map(([k, d]) => `
                        <div class="ab2-sc-row">
                            <kbd>${k}</kbd>
                            <span>${d}</span>
                        </div>
                    `).join('')}
                </div>
            </article>

            <article class="stx-panel">
                <div class="stx-panel-head">
                    <div>
                        <span class="stx-panel-kicker">TEKNİK MİMARİ</span>
                        <h3 class="stx-panel-title">Neden Anitr Kullanmalısın?</h3>
                    </div>
                    <div class="stx-panel-meta"><span>Go + Modern Web</span></div>
                </div>
                <div class="ab2-arch-list">
                    <div class="ab2-arch-item">
                        <span>01</span>
                        <div>
                            <strong>Yüksek Hızlı Go Proxy &amp;HLS Akışı</strong>
                            <p>Go tabanlı arka uç sunucusu, HLS (.m3u8) ve MP4 akışlarını CORS veya CDN engeline takılmadan doğrudan oynatıcıya aktarır.</p>
                        </div>
                    </div>
                    <div class="ab2-arch-item">
                        <span>02</span>
                        <div>
                            <strong>Gizlilik Odaklı Yerel Depolama + Bulut Senkron</strong>
                            <p>İzleme geçmişin, saniye bazlı kaldığın yer ve istatistiklerin cihazında anında saklanır; isteğe bağlı profilinle senkronize edilir.</p>
                        </div>
                    </div>
                    <div class="ab2-arch-item">
                        <span>03</span>
                        <div>
                            <strong>Sade &amp; Odaklı Editoryal Arayüz</strong>
                            <p>Göz yoran neon efektler veya karmaşık pencereler yerine tipografi odaklı, hızlı ve akıcı tam sayfa deneyimi sunar.</p>
                        </div>
                    </div>
                </div>
            </article>
        </section>` : ''}
    </div>`;

    requestAnimationFrame(_moveAb2TabInk);
}

window.showAboutView = showAboutView;
window.switchShowcaseTab = switchShowcaseTab;

function handleAnitrHash() {
    const hash = (window.location.hash || '').toLowerCase();
    if (hash === '#about' || hash === '#hakkinda') {
        showAboutView();
    } else if (hash === '#anime' || hash === '#animeler') {
        if (typeof showAnimeListView === 'function') showAnimeListView();
    } else if (hash === '#schedule' || hash === '#takvim') {
        if (typeof showScheduleView === 'function') showScheduleView();
    } else if (hash === '#news' || hash === '#haberler') {
        if (typeof showNewsView === 'function') showNewsView();
    } else if (hash === '#community' || hash === '#topluluk' || hash === '#social') {
        if (typeof showFriendsModal === 'function') showFriendsModal();
    } else if (hash === '#together' || hash === '#birlikte' || hash === '#w2g') {
        if (typeof showOnlineRooms === 'function') showOnlineRooms();
    } else if (hash === '#stats' || hash === '#istatistikler') {
        if (typeof showStats === 'function') showStats();
    } else if (hash === '#lists' || hash === '#listelerim') {
        if (typeof showMyLists === 'function') showMyLists();
    } else if (hash === '#favorites' || hash === '#favoriler') {
        if (typeof showFavorites === 'function') showFavorites();
    } else if (hash === '#history' || hash === '#gecmis') {
        if (typeof showHistory === 'function') showHistory();
    } else if (hash === '#watchlist' || hash === '#izlemelistesi') {
        if (typeof showWatchlist === 'function') showWatchlist();
    } else if (hash === '#downloads' || hash === '#indirilenler') {
        if (typeof showDownloadsModal === 'function') showDownloadsModal();
    } else if (hash === '#ai' || hash === '#kesif' || hash === '#asistan') {
        if (typeof showAIModal === 'function') showAIModal();
    } else if (hash === '#mal' || hash === '#myanimelist') {
        if (typeof showMALView === 'function') showMALView();
    } else if (hash === '#profile' || hash === '#profil') {
        if (typeof showProfileModal === 'function') showProfileModal();
    }
}
window.addEventListener('hashchange', handleAnitrHash);
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(handleAnitrHash, 100);
});


// ── Katalog: kart yoğunluğu ──
function setCatalogDensity(mode) {
    var g = document.getElementById('animeListGrid');
    if (!g) return;
    g.classList.toggle('is-dense', mode === 'dense');
    document.querySelectorAll('#animeListView .cat-density button').forEach(function (b) {
        b.classList.toggle('active', b.dataset.mode === mode);
    });
    try { localStorage.setItem('anitr_cat_density', mode); } catch (e) {}
}

(function catalogEnhance() {
    function init() {
        // kayıtlı yoğunluk
        var saved = 'comfy';
        try { saved = localStorage.getItem('anitr_cat_density') || 'comfy'; } catch (e) {}
        setCatalogDensity(saved);

        // kaynak seçici: kayan gösterge
        var w = document.getElementById('catSources');
        var ink = document.getElementById('catSourceInk');
        function move() {
            if (!w || !ink) return;
            var a = w.querySelector('.catalog-source-btn.active');
            if (!a || !a.offsetWidth) return;
            if (!ink.dataset.ready) ink.style.transition = 'none';
            ink.style.width = a.offsetWidth + 'px';
            ink.style.transform = 'translateX(' + a.offsetLeft + 'px)';
            if (!ink.dataset.ready) { void ink.offsetWidth; ink.style.transition = ''; ink.dataset.ready = '1'; }
        }
        if (w) {
            new MutationObserver(move).observe(w, { subtree: true, attributes: true, attributeFilter: ['class'] });
            if ('ResizeObserver' in window) new ResizeObserver(move).observe(w);
            move();
        }

        // sonsuz kaydırma
        var btn = document.getElementById('loadMoreAnimeBtn');
        if (btn && 'IntersectionObserver' in window) {
            new IntersectionObserver(function (es) {
                es.forEach(function (e) {
                    if (e.isIntersecting && !btn.classList.contains('hidden') && typeof loadMoreAnime === 'function') loadMoreAnime();
                });
            }, { rootMargin: '500px' }).observe(btn);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

    // "/" ile katalog aramasına odaklan
    document.addEventListener('keydown', function (e) {
        if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
        var v = document.getElementById('animeListView');
        if (!v || v.classList.contains('hidden')) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        e.preventDefault();
        var i = document.getElementById('catalogSearchInput');
        if (i) i.focus();
    });
})();


// ── AniHub Katalog Kartı Açıcı & Detay Sayfası Kaynak Değiştirici ──
window.openAniHubCatalogItem = function(slug) {
    var m = (window._anihubCatalogCache && window._anihubCatalogCache[slug]) || null;
    currentSource = 'AniHub';
    currentSourceKey = 'AniHub';
    currentSourceHistoryKey = 'anitr_history_AniHub';
    currentSourcePositionsKey = 'anitr_positions_AniHub';
    if (m) {
        loadDetails(m.numericId || '', m.slug || slug, m.contentType === 'movie', m.title || slug, m.description || '', m.poster || '');
    } else {
        loadDetails('', slug, false, slug, '', '');
    }
};

window.switchDetailSource = async function(newSrc) {
    if (!newSrc || !currentAnime || !currentAnime.title) return;
    showLoader();
    try {
        var res = await fetchAPI('/search?q=' + encodeURIComponent(currentAnime.title) + '&source=' + encodeURIComponent(newSrc));
        if (!Array.isArray(res) || !res.length) {
            hideLoader();
            if (newSrc.toLowerCase().indexOf('anizium') !== -1) {
                try {
                    var st = await fetch(API_BASE + '/anizium-status').then(function(r) { return r.json(); });
                    if (st && st.ip_banned) {
                        showToast('🛡️ ' + (st.reason || 'Anizium Cloudflare IP engeli aktif.'), 5000);
                        return;
                    }
                } catch (_) {}
            }
            showToast('Bu anime ' + newSrc + ' kaynağında bulunamadı.');
            return;
        }
        var hit = res[0];
        currentSource = newSrc;
        currentSourceKey = newSrc.replace(/\s+/g, '_');
        currentSourceHistoryKey = 'anitr_history_' + currentSourceKey;
        currentSourcePositionsKey = 'anitr_positions_' + currentSourceKey;
        hideLoader();
        showToast('Kaynak değiştirildi: ' + newSrc);
        loadDetails(
            hit.ID || hit.id || '',
            hit.Slug || hit.slug || '',
            !!(hit.IsMovie || hit.isMovie || hit.TitleType === 'movie'),
            currentAnime.title || hit.Title || hit.title,
            currentAnime.synopsis || hit.Synopsis || hit.synopsis || '',
            currentAnime.img || hit.ImageURL || hit.Img || ''
        );
    } catch (e) {
        hideLoader();
        showToast('Kaynak değiştirilirken hata oluştu.');
    }
};

window.addEventListener('resize', function() {
    if (typeof _movePrfTabInk === 'function') _movePrfTabInk();
});
