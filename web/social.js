/* ============================================================
   ANITR SOSYAL v5  +  BİRLİKTE İZLE (Supabase Realtime)
   - Sosyal Merkez: Akış · Arkadaşlar · Sohbet · Keşfet · İstekler
   - Birlikte İzle: Supabase Realtime (Presence + Broadcast) ile
     canlı oda listesi, senkron oynatma, oda sohbeti, tepkiler
   Bağımlılık: app.js (supabaseClient, currentUser, showToast ...)
   ============================================================ */
(function () {
    'use strict';
    if (window.__sv5Loaded) return;
    window.__sv5Loaded = true;

    /* ───────────── Yardımcılar ───────────── */
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
    var esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };
    var sb = function () { return (typeof supabaseClient !== 'undefined' && supabaseClient) || null; };
    var me = function () { return (typeof currentUser !== 'undefined' && currentUser) || ''; };
    var toast = function (m, d) { try { showToast(m, d); } catch (_) {} };
    var RID = Math.random().toString(36).slice(2, 8);
    var q = function (v) { return '"' + String(v).replace(/"/g, '') + '"'; };

    function ago(d) {
        if (!d) return 'Az önce';
        var s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
        if (s < 60) return 'Az önce';
        if (s < 3600) return Math.floor(s / 60) + ' dk önce';
        if (s < 86400) return Math.floor(s / 3600) + ' sa önce';
        if (s < 2592000) return Math.floor(s / 86400) + ' gün önce';
        return new Date(d).toLocaleDateString('tr-TR');
    }
    function hhmm(d) { return new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }
    function dayLabel(d) {
        var t = new Date(d), n = new Date();
        var a = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
        var b = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
        var diff = Math.round((b - a) / 86400000);
        if (diff === 0) return 'Bugün';
        if (diff === 1) return 'Dün';
        return t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    }
    function hue(u) { var h = 0, s = String(u || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
    function asciiSlug(s) {
        var map = { 'ğ': 'g', 'ü': 'u', 'ş': 's', 'ı': 'i', 'ö': 'o', 'ç': 'c' };
        return String(s || '').toLowerCase().replace(/[ğüşıöç]/g, function (c) { return map[c]; })
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
    }
    function confirmBox(title, text, okLabel) {
        if (typeof Swal !== 'undefined') {
            return Swal.fire({ title: title, text: text, icon: 'question', showCancelButton: true, confirmButtonColor: '#8b5cf6', cancelButtonColor: '#374151', confirmButtonText: okLabel || 'Evet', cancelButtonText: 'İptal', background: '#12141f', color: '#fff' })
                .then(function (r) { return !!r.isConfirmed; });
        }
        return Promise.resolve(window.confirm(title + '\n' + text));
    }
    function snack(html, onClick, ms) {
        var el = document.createElement('div');
        el.className = 'sv5-snack';
        el.innerHTML = html;
        document.body.appendChild(el);
        var kill = function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 380); };
        el.addEventListener('click', function () { if (onClick) onClick(); kill(); });
        setTimeout(kill, ms || 6000);
    }

    /* ───────────── Profil / Avatar önbelleği ───────────── */
    var profCache = {};
    var onlineSet = new Set();

    function loadProfiles(names) {
        var c = sb();
        if (!c) return Promise.resolve();
        var need = Array.from(new Set(names)).filter(function (n) {
            return n && !(profCache[n] && profCache[n]._t > Date.now() - 45000);
        }).slice(0, 80);
        if (!need.length) return Promise.resolve();
        return c.from('profiles').select('username,avatar_url,name_color,current_anime,last_active,bio,created_at').in('username', need)
            .then(function (r) {
                (r.data || []).forEach(function (p) { p._t = Date.now(); profCache[p.username] = p; });
                need.forEach(function (n) { if (!profCache[n]) profCache[n] = { _t: Date.now() }; });
            }).catch(function () {});
    }
    function status(u) {
        var p = profCache[u] || {};
        var fresh = p.last_active && (Date.now() - new Date(p.last_active).getTime()) < 6 * 60000;
        if (p.current_anime && fresh) return 'watch';
        if (onlineSet.has(u) || fresh) return 'on';
        return '';
    }
    function statusText(u) {
        var p = profCache[u] || {};
        var st = status(u);
        if (st === 'watch') return '<small class="live">▶ ' + esc(p.current_anime) + ' izliyor</small>';
        if (st === 'on') return '<small class="on">Çevrimiçi</small>';
        return '<small>' + (p.last_active ? 'Son görülme ' + ago(p.last_active) : 'Çevrimdışı') + '</small>';
    }
    function av(u, size, dot) {
        size = size || 40;
        var p = profCache[u] || {};
        var letter = esc((String(u || '?')[0] || '?').toUpperCase());
        var h = hue(u);
        var img = p.avatar_url ? '<img src="' + esc(p.avatar_url) + '" alt="" loading="lazy" style="position:absolute;inset:0" onerror="this.remove()">' : '';
        return '<span class="sv5-avatar" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.4) + 'px;--av-bg:linear-gradient(135deg,hsl(' + h + ' 62% 44%),hsl(' + ((h + 50) % 360) + ' 62% 30%))">' +
            letter + img + (dot ? '<i class="sv5-dot ' + status(u) + '"></i>' : '') + '</span>';
    }

    /* ───────────── Durum ───────────── */
    var S = {
        tab: 'feed', kind: 'status', rating: 9, attach: null, filter: 'all',
        posts: [], likes: {}, myLikes: new Set(), polls: {}, cmts: {}, openCmts: new Set(), feedAt: 0, newPosts: 0,
        rel: [], friends: [], reqIn: [], reqOut: [],
        inbox: {}, chatWith: null, typingUntil: 0, lastTypingSent: 0, unreadTotal: 0, threadTimer: null,
        discoverQ: '', discoverTimer: null, onlineCount: 1, onlineUserKey: ''
    };
    function readMap() { try { return JSON.parse(localStorage.getItem('sv5_read_' + me()) || '{}'); } catch (_) { return {}; } }
    function setRead(u) { var m = readMap(); m[u] = Date.now(); try { localStorage.setItem('sv5_read_' + me(), JSON.stringify(m)); } catch (_) {} }

    /* ───────────── Supabase Realtime kanalları ───────────── */
    var onlineCh = null, socCh = null;
    function initRealtime() {
        var c = sb();
        if (!c) return;
        var uKey = (me() || 'guest') + '#' + RID;
        if (onlineCh && S.onlineUserKey !== uKey) {
            try { onlineCh.untrack(); c.removeChannel(onlineCh); } catch (_) {}
            onlineCh = null;
        }
        if (!onlineCh) {
            S.onlineUserKey = uKey;
            onlineCh = c.channel('anitr-online', { config: { presence: { key: uKey } } });
            var sync = function () {
                var set = new Set(), count = 0;
                var st = onlineCh.presenceState();
                Object.keys(st).forEach(function (k) {
                    count++;
                    st[k].forEach(function (m) { if (m.user) set.add(m.user); });
                });
                onlineSet = set;
                S.onlineCount = Math.max(1, set.size || count);
                updateOnlineUI();
            };
            onlineCh.on('presence', { event: 'sync' }, sync).on('presence', { event: 'join' }, sync).on('presence', { event: 'leave' }, sync)
                .subscribe(function (s) { if (s === 'SUBSCRIBED') onlineCh.track({ user: me() || '', guest: !me(), at: Date.now() }); });
        }
        if (!socCh) {
            socCh = c.channel('anitr-social', { config: { broadcast: { self: false } } });
            socCh.on('broadcast', { event: 'new_post' }, function (m) { onNewPost(m.payload || {}); })
                .on('broadcast', { event: 'poll_vote' }, function (m) { onPollVoteEvt(m.payload || {}); })
                .on('broadcast', { event: 'post_cmt' }, function (m) { onPostCmtEvt(m.payload || {}); })
                .on('broadcast', { event: 'dm' }, function (m) { onDm(m.payload || {}); })
                .on('broadcast', { event: 'typing' }, function (m) { onTyping(m.payload || {}); })
                .on('broadcast', { event: 'friend' }, function (m) { onFriendEvt(m.payload || {}); })
                .subscribe();
        }
    }
    function sendSoc(event, payload) { if (socCh) { try { socCh.send({ type: 'broadcast', event: event, payload: payload }); } catch (_) {} } }

    function updateOnlineUI() {
        var el = $('#sv5Live');
        if (el) el.textContent = Math.max(1, S.onlineCount || onlineSet.size) + ' çevrimiçi';
        if ($('#sv5')) { renderSide(); if (S.tab === 'friends' && me()) renderFriends(); }
    }

    /* ───────────── Sosyal Merkez: iskelet ───────────── */
    var KINDS = [
        ['status', 'fa-comment-dots', 'Durum'],
        ['review', 'fa-star', 'İnceleme'],
        ['recommend', 'fa-thumbs-up', 'Öneri'],
        ['poll', 'fa-square-poll-horizontal', 'Anket']
    ];
    var NAVS = [
        ['feed', 'Akış'],
        ['friends', 'Arkadaşlar'],
        ['chat', 'Sohbet'],
        ['discover', 'Keşfet'],
        ['pulse', 'Nabız'],
        ['requests', 'İstekler']
    ];

    function showPageView(which) {
        if (typeof closeDrawer === 'function') { try { closeDrawer(); } catch (_) {} }
        if (typeof closeNavDrawer === 'function') { try { closeNavDrawer(); } catch (_) {} }
        ['homeView', 'animeListView', 'watchView', 'malView', 'scheduleView', 'newsView', 'aboutView', 'historyView', 'statsView', 'downloadsView', 'aiView', 'profileView'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (typeof vjsPlayer !== 'undefined' && vjsPlayer && typeof vjsPlayer.pause === 'function') {
            try { vjsPlayer.pause(); } catch (_) {}
        }
        if (which === 'sv5') {
            closeLobby();
            var s = $('#sv5');
            if (s) s.classList.add('open');
            if (window.setAnavActive) window.setAnavActive('community');
        } else if (which === 'wt5') {
            closeHub();
            var w = $('#wt5');
            if (w) w.classList.add('open');
            if (window.setAnavActive) window.setAnavActive('together');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function buildHub() {
        if ($('#sv5')) return;
        var root = document.createElement('div');
        root.id = 'sv5';
        root.className = 'soc-page';
        root.innerHTML =
            '<div class="sv5-shell" aria-label="Anitr Sosyal">' +
              '<header class="sv5-top">' +
                '<div class="sv5-brand">' +
                  '<p class="cat-eyebrow">Topluluk</p>' +
                  '<h1 class="cat-title">Anitr Sosyal</h1>' +
                  '<p class="cat-count">İnceleme, öneri, anket ve arkadaşlarınla anlık etkileşim</p>' +
                '</div>' +
                '<div class="sv5-top-right">' +
                  '<span class="sv5-live"><i></i><span id="sv5Live">1 çevrimiçi</span></span>' +
                  '<div class="sv5-me" data-act="myprofile" id="sv5Me"></div>' +
                '</div>' +
              '</header>' +
              '<div class="sv5-rail" id="sv5Rail">' +
                '<div class="sv5-nav-tabs" id="sv5NavTabs">' +
                  '<span class="sv5-nav-ink" id="sv5NavInk"></span>' +
                  NAVS.map(function (n) {
                      return '<button class="sv5-nav" data-tab="' + n[0] + '"><span>' + n[1] + '</span><b class="sv5-badge sv5-hidden" id="sv5b-' + n[0] + '">0</b></button>';
                  }).join('') +
                '</div>' +
                '<div class="sv5-rail-right">' +
                  '<button class="sv5-nav sv5-nav-w2g" data-act="rooms"><span>Birlikte İzle</span><b class="sv5-badge sv5-hidden" id="sv5b-rooms">0</b><i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px;opacity:.6"></i></button>' +
                '</div>' +
              '</div>' +
              '<div class="sv5-body" id="sv5Body">' +
                '<div class="sv5-main" id="sv5Main">' +
                  '<section class="sv5-pane" data-pane="feed" id="sv5-pane-feed"></section>' +
                  '<section class="sv5-pane" data-pane="friends" id="sv5-pane-friends"></section>' +
                  '<section class="sv5-pane pane-chat" data-pane="chat" id="sv5-pane-chat"></section>' +
                  '<section class="sv5-pane" data-pane="discover" id="sv5-pane-discover"></section>' +
                  '<section class="sv5-pane" data-pane="pulse" id="sv5-pane-pulse"></section>' +
                  '<section class="sv5-pane" data-pane="requests" id="sv5-pane-requests"></section>' +
                '</div>' +
                '<aside class="sv5-side" id="sv5Side"></aside>' +
              '</div>' +
            '</div>';
        (document.getElementById('app') || document.body).appendChild(root);

        root.addEventListener('click', onHubClick);
        root.addEventListener('input', onHubInput);
        root.addEventListener('keydown', onHubKey);
        window.addEventListener('resize', function () { moveNavInk(); moveGlide(); });
        buildFeedShell();
    }

    function moveNavInk() {
        var wrap = $('#sv5NavTabs'), ink = $('#sv5NavInk');
        var act = wrap && $('.sv5-nav.active[data-tab]', wrap);
        if (!wrap || !ink || !act) return;
        ink.style.width = act.offsetWidth + 'px';
        ink.style.transform = 'translateX(' + (act.offsetLeft - 4) + 'px)';
    }

    function openHub(tab) {
        buildHub();
        showPageView('sv5');
        initRealtime();
        ensureLobby();
        renderMe();
        syncComposerAuth();
        switchTab(tab || S.tab || 'feed');
        setTimeout(moveNavInk, 30);
        if (me()) loadRelations().then(function () { loadInbox(); });
    }
    function closeHub() {
        var root = $('#sv5');
        if (root) root.classList.remove('open');
        if (S.threadTimer) { clearInterval(S.threadTimer); S.threadTimer = null; }
    }
    function authPromptHtml(title, desc) {
        return '<div class="sv5-auth">' +
            '<h3>' + esc(title || 'Anitr Sosyal\'e katıl') + '</h3><p>' + esc(desc || 'Arkadaş eklemek, anlık sohbet etmek ve istekleri yönetmek için hesabına giriş yap.') + '</p>' +
            '<button class="sv5-btn primary" data-act="login" style="height:40px;padding:0 22px;font-size:13px">Giriş Yap / Kayıt Ol</button></div>';
    }
    function renderMe() {
        var box = $('#sv5Me');
        if (!box) return;
        if (!me()) {
            box.innerHTML = '<span class="sv5-avatar" style="width:32px;height:32px;font-size:12px;--av-bg:rgba(255,255,255,.08)"><i class="fa-regular fa-user"></i></span><div><b>Misafir</b><small>Giriş yap</small></div>';
            return;
        }
        loadProfiles([me()]).then(function () {
            if (me()) box.innerHTML = av(me(), 32, true) + '<div><b>@' + esc(me()) + '</b><small>Profil</small></div>';
        });
        box.innerHTML = av(me(), 32, true) + '<div><b>@' + esc(me()) + '</b><small>Profil</small></div>';
    }
    function syncComposerAuth() {
        var comp = $('#sv5ComposerWrap'), gbar = $('#sv5GuestBar');
        if (comp) comp.classList.toggle('sv5-hidden', !me());
        if (gbar) gbar.classList.toggle('sv5-hidden', !!me());
        if (me()) setTimeout(moveGlide, 40);
    }

    function lockShellScroll() {
        ['#sv5-pane-chat', '#sv5-chat', '#sv5Thread'].forEach(function (sel) {
            var el = $(sel);
            if (el) { el.scrollTop = 0; el.scrollLeft = 0; }
        });
    }

    function switchTab(t) {
        S.tab = t;
        $$('.sv5-nav[data-tab]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === t); });
        $$('.sv5-pane').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-pane') === t); });
        moveNavInk();
        var chat = t === 'chat' && !!me();
        $('#sv5Main').classList.toggle('chat-mode', chat);
        $('#sv5Body').classList.toggle('no-side', chat);
        $('#sv5Side').classList.toggle('sv5-hidden', chat);
        syncComposerAuth();
        if (t === 'feed') { if (Date.now() - S.feedAt > 15000 || !S.posts.length) loadFeed(); else renderFeed(); }
        else if (t === 'friends') { if (!me()) $('#sv5-pane-friends').innerHTML = authPromptHtml('Arkadaşlarını Gör', 'Arkadaş listeni görmek ve birlikte izleme odalarına katılmak için giriş yap.'); else renderFriends(); }
        else if (t === 'chat') { if (!me()) $('#sv5-pane-chat').innerHTML = authPromptHtml('Canlı Mesajlaşma', 'Arkadaşlarınla gerçek zamanlı sohbet etmek ve oda daveti göndermek için giriş yap.'); else renderChatShell(); }
        else if (t === 'discover') renderDiscover();
        else if (t === 'pulse') renderPulse();
        else if (t === 'requests') { if (!me()) $('#sv5-pane-requests').innerHTML = authPromptHtml('Arkadaşlık İstekleri', 'Gelen ve gönderilen arkadaşlık isteklerini yönetmek için giriş yap.'); else renderRequests(); }
        renderSide();
        lockShellScroll();
    }

    /* ───────────── Etkileşim (delegation) ───────────── */
    function onHubClick(e) {
        var navBtn = e.target.closest('.sv5-nav[data-tab]');
        if (navBtn) { switchTab(navBtn.getAttribute('data-tab')); return; }
        var el = e.target.closest('[data-act]');
        if (!el) {
            var sp = e.target.closest('.sv5-spoiler');
            if (sp) sp.classList.add('shown');
            return;
        }
        var act = el.getAttribute('data-act');
        var u = el.getAttribute('data-u');
        var id = el.getAttribute('data-id');
        switch (act) {
            case 'close': if (typeof showHomeView === 'function') showHomeView(); else closeHub(); break;
            case 'login': if (typeof openAuthModal === 'function') openAuthModal(); else if (typeof showAuthModal === 'function') showAuthModal(); break;
            case 'rooms': openLobby(); break;
            case 'myprofile':
                if (!me()) { if (typeof openAuthModal === 'function') openAuthModal(); else if (typeof showAuthModal === 'function') showAuthModal(); }
                else if (typeof showProfileModal === 'function') showProfileModal();
                break;
            case 'profile': if (typeof openUserProfile === 'function') openUserProfile(u); break;
            case 'dm': openThread(u); break;
            case 'add': addFriend(u); break;
            case 'accept': answerRequest(id, u, true); break;
            case 'reject': answerRequest(id, u, false); break;
            case 'cancel': answerRequest(id, u, false, true); break;
            case 'remove': removeFriend(id, u); break;
            case 'invite': sendRoomInvite(u); break;
            case 'joinfriendroom': joinRoomByName(el.getAttribute('data-room')); break;
            case 'acceptinvite': joinRoomByName(el.getAttribute('data-room'), el.getAttribute('data-pw') || ''); break;
            case 'kind': setKind(el.getAttribute('data-kind')); break;
            case 'star': S.rating = parseInt(el.getAttribute('data-v'), 10); paintStars(); break;
            case 'attach': attachCurrent(); break;
            case 'publish': publish(); break;
            case 'filter': S.filter = el.getAttribute('data-f'); paintFilters(); loadFeed(); break;
            case 'refresh': loadFeed(); break;
            case 'newposts': S.newPosts = 0; loadFeed(); break;
            case 'like': toggleLike(id); break;
            case 'vote': votePoll(id, parseInt(el.getAttribute('data-opt'), 10)); break;
            case 'togglecmts': togglePostCmts(id); break;
            case 'sendcmt': submitPostCmt(id); break;
            case 'delcmt': deletePostCmt(id, el.getAttribute('data-cid')); break;
            case 'delpost': deletePost(id); break;
            case 'openanime': openAnimeFromPost(id); break;
            case 'searchanime':
                closeHub();
                if (typeof searchAnimeByName === 'function') searchAnimeByName(el.getAttribute('data-title'), el.getAttribute('data-title'));
                else if (typeof handleSearch === 'function') handleSearch(el.getAttribute('data-title'));
                break;
            case 'setgoal':
                try { localStorage.setItem('sv5_weekly_goal', String(parseInt(el.getAttribute('data-g'), 10) || 10)); } catch (_) {}
                renderPulse();
                toast('🎯 Haftalık hedef güncellendi!');
                break;
            case 'emoji': toggleEmoji(); break;
            case 'pickemoji': insertEmoji(el.getAttribute('data-e')); break;
            case 'send': sendDm(); break;
            case 'back': S.chatWith = null; $('#sv5-chat') && $('#sv5-chat').classList.remove('thread-open'); renderThread(); break;
            case 'invitehere': if (S.chatWith) sendRoomInvite(S.chatWith); break;
            case 'gofriends': switchTab('friends'); break;
            case 'gofind': switchTab('discover'); break;
            case 'gopulse': switchTab('pulse'); break;
            case 'sidejoin': joinRoomByName(el.getAttribute('data-room')); break;
        }
    }
    function onHubInput(e) {
        var t = e.target;
        if (t.id === 'sv5Text') { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }
        else if (t.id === 'sv5Discover') {
            clearTimeout(S.discoverTimer);
            S.discoverTimer = setTimeout(function () { S.discoverQ = t.value.trim(); runDiscover(); }, 320);
        } else if (t.id === 'sv5FriendFilter') renderFriends();
        else if (t.id === 'sv5ContactFilter') renderContacts();
        else if (t.id === 'sv5Msg') sendTyping();
    }
    function onHubKey(e) {
        if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'sv5Msg') { e.preventDefault(); sendDm(); }
        else if (e.key === 'Enter' && !e.shiftKey && e.target.classList && e.target.classList.contains('sv5-cmt-inp')) {
            e.preventDefault();
            submitPostCmt(e.target.getAttribute('data-id'));
        }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'sv5Text') { e.preventDefault(); publish(); }
    }

    /* ───────────── AKIŞ ───────────── */
    function buildFeedShell() {
        var pane = $('#sv5-pane-feed');
        pane.innerHTML =
            '<div class="sv5-guest-bar sv5-hidden" id="sv5GuestBar">' +
              '<div><b>Topluluk Akışı</b>Paylaşım yapmak, anketlerde oy kullanmak ve mesajlaşmak için hesabına giriş yap.</div>' +
              '<button class="sv5-btn primary sm" data-act="login">Giriş Yap</button>' +
            '</div>' +
            '<div class="sv5-composer" id="sv5ComposerWrap">' +
              '<div class="sv5-comp-row"><div id="sv5CompAv"></div>' +
                '<textarea id="sv5Text" class="sv5-input" rows="2" maxlength="600" placeholder="Ne izliyorsun? İncelemeni, önerini veya anket sorusunu yaz..."></textarea></div>' +
              '<div class="sv5-poll-maker sv5-hidden" id="sv5PollMaker">' +
                '<input id="sv5Poll1" class="sv5-input" placeholder="1. Seçenek" maxlength="60">' +
                '<input id="sv5Poll2" class="sv5-input" placeholder="2. Seçenek" maxlength="60">' +
                '<input id="sv5Poll3" class="sv5-input" placeholder="3. Seçenek (isteğe bağlı)" maxlength="60">' +
                '<input id="sv5Poll4" class="sv5-input" placeholder="4. Seçenek (isteğe bağlı)" maxlength="60">' +
              '</div>' +
              '<div class="sv5-comp-extra"><input id="sv5Anime" class="sv5-input" placeholder="İlgili anime adı (isteğe bağlı)" maxlength="80">' +
                '<button class="sv5-btn" data-act="attach" title="Şu an izlediğin animeyi ekle"><i class="fa-solid fa-film"></i> İzlediğimi ekle</button></div>' +
              '<div class="sv5-comp-bar"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
                '<div class="sv5-kinds" id="sv5Kinds"><span class="sv5-kinds-glide" id="sv5Glide"></span>' +
                  KINDS.map(function (k) { return '<button class="sv5-kind' + (k[0] === S.kind ? ' active' : '') + '" data-act="kind" data-kind="' + k[0] + '">' + k[2] + '</button>'; }).join('') +
                '</div><span class="sv5-stars sv5-hidden" id="sv5Stars"></span>' +
                '<label class="sv5-spoiler-tg"><input type="checkbox" id="sv5Spoiler"> Spoiler</label></div>' +
                '<button class="sv5-btn primary" data-act="publish">Paylaş</button></div>' +
            '</div>' +
            '<div class="sv5-feed-toolbar"><div class="sv5-filters" id="sv5Filters"></div>' +
            '<button class="sv5-btn sm" data-act="refresh"><i class="fa-solid fa-rotate-right"></i> Yenile</button></div>' +
            '<div id="sv5NewPill"></div>' +
            '<div class="sv5-feed" id="sv5Feed"><div class="sv5-loading"><span class="sv5-spin"></span></div></div>';
        paintFilters(); paintStars(); syncComposerAuth();
        setTimeout(moveGlide, 60);
    }
    function moveGlide() {
        var wrap = $('#sv5Kinds'), g = $('#sv5Glide'), a = wrap && $('.sv5-kind.active', wrap);
        if (!g || !a) return;
        g.style.width = a.offsetWidth + 'px';
        g.style.transform = 'translateX(' + (a.offsetLeft - 3) + 'px)';
    }
    function setKind(k) {
        S.kind = k;
        $$('.sv5-kind').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-kind') === k); });
        $('#sv5Stars').classList.toggle('sv5-hidden', k !== 'review');
        var pm = $('#sv5PollMaker'); if (pm) pm.classList.toggle('sv5-hidden', k !== 'poll');
        moveGlide();
    }
    function paintStars() {
        var el = $('#sv5Stars'); if (!el) return;
        var h = '';
        for (var i = 1; i <= 10; i++) h += '<button data-act="star" data-v="' + i + '" class="' + (i <= S.rating ? 'on' : '') + '"><i class="fa-solid fa-star"></i></button>';
        el.innerHTML = h + '<em>' + S.rating + '/10</em>';
    }
    function paintFilters() {
        var el = $('#sv5Filters'); if (!el) return;
        var F = [
            ['all', 'Tümü'],
            ['friends', 'Arkadaşlarım'],
            ['review', 'İncelemeler'],
            ['recommend', 'Öneriler'],
            ['poll', 'Anketler'],
            ['status', 'Durumlar']
        ];
        el.innerHTML = F.map(function (f) { return '<button class="sv5-chip' + (S.filter === f[0] ? ' active' : '') + '" data-act="filter" data-f="' + f[0] + '">' + f[1] + '</button>'; }).join('');
    }
    function attachCurrent() {
        var a = (typeof currentAnime !== 'undefined' && currentAnime && currentAnime.title) ? currentAnime : null;
        if (!a) { toast('Şu an oynatılan bir anime yok.'); return; }
        S.attach = { title: a.title, img: a.img || '', id: a.id || '', slug: a.slug || '' };
        $('#sv5Anime').value = a.title;
        toast('🎬 Eklendi: ' + a.title);
    }
    function parsePostContent(raw) {
        var s = String(raw || '');
        var m = s.match(/\n?\[\[POLL:(\[[\s\S]*?\])\]\]$/);
        if (!m) return { text: s, poll: null };
        var opts = null;
        try {
            var parsed = JSON.parse(m[1]);
            if (Array.isArray(parsed) && parsed.length >= 2) opts = parsed.map(function (x) { return String(x || '').slice(0, 80); });
        } catch (_) {}
        return { text: s.slice(0, m.index).trim(), poll: opts };
    }
    async function publish() {
        var c = sb();
        if (!c || !me()) { toast('Paylaşım için giriş yapmalısın.'); return; }
        var text = ($('#sv5Text').value || '').trim();
        var title = ($('#sv5Anime').value || '').trim();
        var finalContent = text;
        if (S.kind === 'poll') {
            var opts = ['sv5Poll1', 'sv5Poll2', 'sv5Poll3', 'sv5Poll4'].map(function (id) { return (($('#' + id) || {}).value || '').trim(); }).filter(Boolean);
            if (opts.length < 2) { toast('Anket için en az 2 seçenek gir.'); return; }
            if (!text) { toast('Anket sorusunu yaz.'); return; }
            finalContent = text + '\n[[POLL:' + JSON.stringify(opts) + ']]';
        } else if (!text && !title) {
            toast('Bir şeyler yaz veya anime seç.');
            return;
        }
        var att = (S.attach && S.attach.title === title) ? S.attach : null;
        var row = {
            username: me(), kind: S.kind, content: finalContent, anime_title: title || null,
            anime_img: att ? (att.img || null) : null, anime_id: att && att.id ? String(att.id) : null, anime_slug: att && att.slug ? att.slug : null,
            rating: S.kind === 'review' ? S.rating : null, spoiler: $('#sv5Spoiler').checked
        };
        var btn = $('[data-act="publish"]'); if (btn) btn.setAttribute('disabled', '1');
        var r = await c.from('social_posts').insert([row]);
        if (r.error) {
            delete row.anime_id; delete row.anime_slug;
            r = await c.from('social_posts').insert([row]);
        }
        if (btn) btn.removeAttribute('disabled');
        if (r.error) { toast('Gönderi yayınlanamadı: ' + r.error.message); return; }
        $('#sv5Text').value = ''; $('#sv5Text').style.height = ''; $('#sv5Anime').value = ''; $('#sv5Spoiler').checked = false; S.attach = null;
        ['sv5Poll1', 'sv5Poll2', 'sv5Poll3', 'sv5Poll4'].forEach(function (id) { var el = $('#' + id); if (el) el.value = ''; });
        toast('✨ Gönderin yayınlandı!');
        sendSoc('new_post', { user: me() });
        loadFeed();
    }
    async function loadFeed() {
        var c = sb();
        var list = $('#sv5Feed');
        if (!list) return;
        if (!c) { list.innerHTML = '<div class="sv5-empty"><i class="fa-solid fa-plug-circle-xmark"></i><strong>Bağlantı yok</strong>Supabase\'e ulaşılamadı.</div>'; return; }
        S.newPosts = 0; var np = $('#sv5NewPill'); if (np) np.innerHTML = '';
        if (!S.posts.length) list.innerHTML = '<div class="sv5-loading"><span class="sv5-spin"></span></div>';
        if (S.filter === 'friends' && !me()) {
            list.innerHTML = '<div class="sv5-empty"><i class="fa-solid fa-user-lock"></i><strong>Giriş gerekli</strong>Arkadaşlarının gönderilerini görmek için giriş yap.</div>';
            return;
        }
        var qy = c.from('social_posts').select('*').order('created_at', { ascending: false }).limit(40);
        if (S.filter === 'friends') qy = qy.in('username', [me()].concat(S.friends.map(function (f) { return f.username; })));
        else if (S.filter !== 'all') qy = qy.eq('kind', S.filter);
        var r = await qy;
        if (r.error) { list.innerHTML = '<div class="sv5-empty"><i class="fa-solid fa-triangle-exclamation"></i><strong>Akış yüklenemedi</strong>' + esc(r.error.message) + '</div>'; return; }
        S.posts = r.data || [];
        S.feedAt = Date.now();
        var ids = S.posts.map(function (p) { return p.id; });
        S.likes = {}; S.myLikes = new Set(); S.polls = {}; S.cmts = {};
        var profNames = S.posts.map(function (p) { return p.username; });
        if (me()) profNames.push(me());
        if (ids.length) {
            var epKeys = ids.map(function (id) { return '__sv5_poll__:' + id; }).concat(ids.map(function (id) { return '__sv5_cmt__:' + id; }));
            var resArr = await Promise.all([
                c.from('social_likes').select('post_id,username').in('post_id', ids),
                c.from('comments').select('id,ep_key,username,content,created_at').in('ep_key', epKeys).order('created_at', { ascending: true })
            ]);
            var lr = resArr[0], cr = resArr[1];
            (lr.data || []).forEach(function (l) {
                S.likes[l.post_id] = (S.likes[l.post_id] || 0) + 1;
                if (l.username === me()) S.myLikes.add(l.post_id);
            });
            (cr.data || []).forEach(function (row) {
                var ek = String(row.ep_key || '');
                if (ek.indexOf('__sv5_poll__:') === 0) {
                    var pid = ek.slice(13);
                    if (!S.polls[pid]) S.polls[pid] = {};
                    S.polls[pid][row.username] = parseInt(row.content, 10) || 0;
                } else if (ek.indexOf('__sv5_cmt__:') === 0) {
                    var cid = ek.slice(12);
                    if (!S.cmts[cid]) S.cmts[cid] = [];
                    S.cmts[cid].push(row);
                    if (row.username) profNames.push(row.username);
                }
            });
        }
        await loadProfiles(profNames);
        renderFeed();
        var ca = $('#sv5CompAv'); if (ca && me()) ca.innerHTML = av(me(), 42, false);
    }
    function renderFeed() {
        var list = $('#sv5Feed'); if (!list) return;
        if (!S.posts.length) {
            list.innerHTML = '<div class="sv5-empty"><i class="fa-regular fa-comment-dots"></i><strong>Henüz gönderi yok</strong>İlk paylaşımı sen yap ve sohbeti başlat!</div>';
            return;
        }
        list.innerHTML = S.posts.map(function (p, i) {
            var pid = String(p.id);
            var liked = S.myLikes.has(p.id), n = S.likes[p.id] || 0;
            var parsed = parsePostContent(p.content);
            var tag = p.kind === 'review' ? '<span class="sv5-kindtag review"><i class="fa-solid fa-star"></i> İnceleme' + (p.rating ? ' · ' + p.rating + '/10' : '') + '</span>'
                : p.kind === 'recommend' ? '<span class="sv5-kindtag recommend"><i class="fa-solid fa-thumbs-up"></i> Öneri</span>'
                : (p.kind === 'poll' || parsed.poll) ? '<span class="sv5-kindtag poll"><i class="fa-solid fa-square-poll-horizontal"></i> Anket</span>'
                : '<span class="sv5-kindtag status"><i class="fa-solid fa-comment-dots"></i> Durum</span>';
            var anime = p.anime_title ? '<div class="sv5-post-anime" data-act="openanime" data-id="' + esc(p.id) + '">' +
                (p.anime_img ? '<img src="' + esc(p.anime_img) + '" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{className:\'ph\',innerHTML:\'<i class=&quot;fa-solid fa-film&quot;></i>\'}))">' : '<div class="ph"><i class="fa-solid fa-film"></i></div>') +
                '<div><b>' + esc(p.anime_title) + '</b>' + (p.kind === 'review' && p.rating ? '<small>★ ' + p.rating + '/10</small>' : '<small style="color:var(--sv-mute);font-weight:600">Animeye git</small>') + '</div><i class="fa-solid fa-chevron-right go"></i></div>' : '';
            var body = !parsed.text ? '' : (p.spoiler
                ? '<div class="sv5-spoiler"><div class="txt sv5-post-body">' + esc(parsed.text) + '</div><div class="warn"><i class="fa-solid fa-triangle-exclamation"></i> Spoiler içerir — görmek için dokun</div></div>'
                : '<div class="sv5-post-body">' + esc(parsed.text) + '</div>');
            var pollHtml = '';
            if (parsed.poll) {
                var voteMap = S.polls[pid] || {};
                var voters = Object.keys(voteMap);
                var totalV = voters.length;
                var myV = me() && voteMap.hasOwnProperty(me()) ? voteMap[me()] : -1;
                pollHtml = '<div class="sv5-poll">' + parsed.poll.map(function (optText, idx) {
                    var cnt = voters.filter(function (u) { return voteMap[u] === idx; }).length;
                    var pct = totalV ? Math.round((cnt * 100) / totalV) : 0;
                    var isMine = myV === idx;
                    return '<button type="button" class="sv5-poll-opt' + (isMine ? ' voted' : '') + '" data-act="vote" data-id="' + esc(pid) + '" data-opt="' + idx + '">' +
                        '<span class="sv5-poll-bar" style="--pct:' + pct + '%"></span>' +
                        '<span>' + (isMine ? '<i class="fa-solid fa-circle-check" style="color:#a78bfa;margin-right:6px"></i>' : '') + esc(optText) + '</span>' +
                        '<em>%' + pct + ' (' + cnt + ')</em></button>';
                }).join('') + '<div class="sv5-poll-meta"><i class="fa-solid fa-check-to-slot"></i> Toplam ' + totalV + ' oy · Oy vermek için seçeneğe tıkla</div></div>';
            }
            var cmts = S.cmts[pid] || [];
            var isOpen = S.openCmts.has(pid);
            var cmtHtml = '<div class="sv5-cmts' + (isOpen ? ' open' : '') + '" id="sv5c-' + esc(pid) + '">' +
                (cmts.length ? '<div class="sv5-cmt-list">' + cmts.map(function (cm) {
                    var own = me() && cm.username === me();
                    return '<div class="sv5-cmt-row">' + av(cm.username, 28, false) +
                        '<div class="cb"><b data-act="profile" data-u="' + esc(cm.username) + '">@' + esc(cm.username) + '</b><small>' + ago(cm.created_at) + '</small><p>' + esc(cm.content) + '</p></div>' +
                        (own ? '<button class="sv5-act del" style="height:24px;padding:0 6px" data-act="delcmt" data-id="' + esc(pid) + '" data-cid="' + esc(cm.id) + '" title="Sil"><i class="fa-solid fa-xmark"></i></button>' : '') +
                        '</div>';
                }).join('') + '</div>' : '<div style="font-size:12px;color:var(--sv-mute)">Henüz yorum yok. İlk yorumu sen yaz!</div>') +
                (me() ? '<div class="sv5-cmt-form"><input class="sv5-input sv5-cmt-inp" id="sv5ci-' + esc(pid) + '" data-id="' + esc(pid) + '" placeholder="Yorum yaz..." maxlength="280"><button class="sv5-btn primary sm" data-act="sendcmt" data-id="' + esc(pid) + '"><i class="fa-solid fa-paper-plane"></i></button></div>' : '') +
                '</div>';
            var mine = me() && p.username === me();
            return '<article class="sv5-post sv5-rise" style="--i:' + Math.min(i, 10) + '">' +
                '<div class="sv5-post-head">' + av(p.username, 40, true) +
                '<div class="sv5-post-who" data-act="profile" data-u="' + esc(p.username) + '"><b>@' + esc(p.username) + '</b><small>' + ago(p.created_at) + '</small></div>' + tag + '</div>' +
                anime + body + pollHtml +
                '<div class="sv5-post-foot"><button class="sv5-act' + (liked ? ' liked' : '') + '" data-act="like" data-id="' + esc(p.id) + '"><i class="fa-' + (liked ? 'solid' : 'regular') + ' fa-heart"></i><span>' + n + '</span></button>' +
                '<button class="sv5-act" data-act="togglecmts" data-id="' + esc(pid) + '"><i class="fa-regular fa-comment-dots"></i><span>' + cmts.length + ' Yorum</span></button>' +
                (!mine && me() ? '<button class="sv5-act" data-act="dm" data-u="' + esc(p.username) + '"><i class="fa-regular fa-paper-plane"></i> Mesaj</button>' : '') +
                '<button class="sv5-act" data-act="profile" data-u="' + esc(p.username) + '"><i class="fa-regular fa-user"></i> Profil</button><span class="sv5-spacer"></span>' +
                (mine ? '<button class="sv5-act del" data-act="delpost" data-id="' + esc(p.id) + '"><i class="fa-regular fa-trash-can"></i></button>' : '') +
                '</div>' + cmtHtml + '</article>';
        }).join('');
    }
    async function votePoll(postId, optIdx) {
        var c = sb(); if (!c || !me()) { toast('Oy kullanmak için giriş yapmalısın.'); return; }
        var pid = String(postId);
        if (!S.polls[pid]) S.polls[pid] = {};
        S.polls[pid][me()] = optIdx;
        renderFeedKeepScroll();
        var ek = '__sv5_poll__:' + pid;
        await c.from('comments').delete().eq('ep_key', ek).eq('username', me());
        var r = await c.from('comments').insert([{ ep_key: ek, username: me(), content: String(optIdx) }]);
        if (r.error) { toast('Oy kaydedilemedi.'); return; }
        sendSoc('poll_vote', { postId: pid, user: me(), opt: optIdx });
    }
    function onPollVoteEvt(p) {
        if (!p || !p.postId || !p.user) return;
        var pid = String(p.postId);
        if (!S.polls[pid]) S.polls[pid] = {};
        S.polls[pid][p.user] = parseInt(p.opt, 10) || 0;
        if ($('#sv5.open') && S.tab === 'feed') renderFeedKeepScroll();
    }
    function togglePostCmts(postId) {
        var pid = String(postId);
        if (S.openCmts.has(pid)) S.openCmts.delete(pid);
        else S.openCmts.add(pid);
        renderFeedKeepScroll();
        if (S.openCmts.has(pid)) setTimeout(function () { var inp = $('#sv5ci-' + pid); if (inp) inp.focus(); }, 60);
    }
    async function submitPostCmt(postId) {
        var c = sb(); if (!c || !me()) { toast('Yorum yapmak için giriş yapmalısın.'); return; }
        var pid = String(postId);
        var inp = $('#sv5ci-' + pid);
        var text = (inp ? inp.value : '').trim();
        if (!text) return;
        inp.value = '';
        var r = await c.from('comments').insert([{ ep_key: '__sv5_cmt__:' + pid, username: me(), content: text }]).select();
        if (r.error) { toast('Yorum gönderilemedi.'); return; }
        var row = (r.data && r.data[0]) || { id: Date.now(), ep_key: '__sv5_cmt__:' + pid, username: me(), content: text, created_at: new Date().toISOString() };
        if (!S.cmts[pid]) S.cmts[pid] = [];
        S.cmts[pid].push(row);
        renderFeedKeepScroll();
        sendSoc('post_cmt', { postId: pid, row: row });
    }
    async function deletePostCmt(postId, cid) {
        var c = sb(); if (!c || !me()) return;
        var pid = String(postId);
        var r = await c.from('comments').delete().eq('id', cid).eq('username', me());
        if (r.error) { toast('Yorum silinemedi.'); return; }
        S.cmts[pid] = (S.cmts[pid] || []).filter(function (x) { return String(x.id) !== String(cid); });
        renderFeedKeepScroll();
    }
    function onPostCmtEvt(p) {
        if (!p || !p.postId || !p.row) return;
        var pid = String(p.postId);
        if (!S.cmts[pid]) S.cmts[pid] = [];
        if (!S.cmts[pid].some(function (x) { return String(x.id) === String(p.row.id); })) {
            S.cmts[pid].push(p.row);
            loadProfiles([p.row.username]).then(function () {
                if ($('#sv5.open') && S.tab === 'feed') renderFeedKeepScroll();
            });
        }
    }
    async function toggleLike(id) {
        var c = sb(); if (!c || !me()) { toast('Beğenmek için giriş yap.'); return; }
        var key = String(id);
        var post = S.posts.filter(function (p) { return String(p.id) === key; })[0];
        if (!post) return;
        var pid = post.id, liked = S.myLikes.has(pid);
        if (liked) { S.myLikes.delete(pid); S.likes[pid] = Math.max(0, (S.likes[pid] || 1) - 1); }
        else { S.myLikes.add(pid); S.likes[pid] = (S.likes[pid] || 0) + 1; }
        renderFeedKeepScroll();
        var r = liked ? await c.from('social_likes').delete().eq('post_id', pid).eq('username', me())
                      : await c.from('social_likes').insert([{ post_id: pid, username: me() }]);
        if (r.error) {
            if (liked) { S.myLikes.add(pid); S.likes[pid] = (S.likes[pid] || 0) + 1; } else { S.myLikes.delete(pid); S.likes[pid] = Math.max(0, (S.likes[pid] || 1) - 1); }
            renderFeedKeepScroll(); toast('İşlem başarısız.');
        }
    }
    function renderFeedKeepScroll() { var m = $('#sv5Main'), t = m ? m.scrollTop : 0; renderFeed(); if (m) m.scrollTop = t; $$('.sv5-post').forEach(function (e) { e.style.animation = 'none'; }); }
    async function deletePost(id) {
        var ok = await confirmBox('Gönderi silinsin mi?', 'Bu işlem geri alınamaz.', 'Evet, sil');
        if (!ok) return;
        var c = sb(); if (!c) return;
        var r = await c.from('social_posts').delete().eq('id', id).eq('username', me());
        if (r.error) { toast('Silinemedi: ' + r.error.message); return; }
        S.posts = S.posts.filter(function (p) { return String(p.id) !== String(id); });
        renderFeedKeepScroll(); toast('Gönderi silindi.');
    }
    function openAnimeFromPost(id) {
        var p = S.posts.filter(function (x) { return String(x.id) === String(id); })[0];
        if (!p) return;
        closeHub();
        if (p.anime_id && typeof loadDetails === 'function') loadDetails(p.anime_id, p.anime_slug || '', false, p.anime_title, '', p.anime_img || '');
        else if (typeof searchAnimeByName === 'function') searchAnimeByName(p.anime_title, p.anime_title);
        else if (typeof handleSearch === 'function') { handleSearch(p.anime_title); toast('🔍 Aranıyor: ' + p.anime_title); }
    }
    function onNewPost(p) {
        if (!p || p.user === me()) return;
        if ($('#sv5.open') && S.tab === 'feed') {
            S.newPosts++;
            var pill = $('#sv5NewPill');
            if (pill) pill.innerHTML = '<div class="sv5-newpill"><button data-act="newposts"><i class="fa-solid fa-arrow-up"></i> ' + S.newPosts + ' yeni gönderi</button></div>';
        }
    }

    /* ───────────── İLİŞKİLER (arkadaşlık) ───────────── */
    async function loadRelations() {
        var c = sb(); if (!c || !me()) return;
        var r = await c.from('friends').select('id,sender,receiver,status,created_at').or('sender.eq.' + q(me()) + ',receiver.eq.' + q(me()));
        S.rel = r.data || [];
        S.friends = []; S.reqIn = []; S.reqOut = [];
        S.rel.forEach(function (f) {
            var other = f.sender === me() ? f.receiver : f.sender;
            if (f.status === 'accepted') S.friends.push({ id: f.id, username: other });
            else if (f.receiver === me()) S.reqIn.push({ id: f.id, username: other, at: f.created_at });
            else S.reqOut.push({ id: f.id, username: other, at: f.created_at });
        });
        await loadProfiles(S.rel.map(function (f) { return f.sender === me() ? f.receiver : f.sender; }));
        renderBadges(); renderSide();
        if (S.tab === 'friends') renderFriends();
        if (S.tab === 'requests') renderRequests();
        if (S.tab === 'chat') renderContacts();
        if (S.tab === 'discover') paintDiscoverButtons();
    }
    function relOf(u) {
        if (S.friends.some(function (f) { return f.username === u; })) return 'friend';
        if (S.reqIn.some(function (f) { return f.username === u; })) return 'in';
        if (S.reqOut.some(function (f) { return f.username === u; })) return 'out';
        return '';
    }
    function setBadge(id, n, alert) {
        var el = $('#' + id); if (!el) return;
        el.textContent = n > 99 ? '99+' : n;
        el.classList.toggle('sv5-hidden', !n);
        el.classList.toggle('alert', !!alert);
    }
    function renderBadges() {
        setBadge('sv5b-friends', S.friends.length, false);
        setBadge('sv5b-requests', S.reqIn.length, true);
        setBadge('sv5b-chat', S.unreadTotal, true);
        setBadge('sv5b-rooms', W.rooms.length, false);
        var navBtn = $('#friendsBtnNav');
        if (navBtn) {
            var dot = $('.sv5-navdot', navBtn);
            var n = S.unreadTotal + S.reqIn.length;
            if (n && !dot) { dot = document.createElement('span'); dot.className = 'sv5-navdot'; navBtn.appendChild(dot); }
            if (dot) { dot.textContent = n > 9 ? '9+' : n; dot.style.display = n ? 'inline-flex' : 'none'; }
        }
        var rBtn = $('#roomsBtnNav');
        if (rBtn) {
            var rdot = $('.wt5-navdot', rBtn);
            var rn = W.rooms.length;
            if (rn && !rdot) { rdot = document.createElement('span'); rdot.className = 'wt5-navdot'; rBtn.appendChild(rdot); }
            if (rdot) { rdot.textContent = rn > 9 ? '9+' : rn; rdot.style.display = rn ? 'inline-flex' : 'none'; }
        }
    }
    async function addFriend(u) {
        var c = sb(); if (!c || !me()) { toast('Giriş yapmalısın.'); return; }
        if (!u || u === me()) return;
        var rel = relOf(u);
        if (rel === 'friend') { toast('Zaten arkadaşsınız.'); return; }
        if (rel === 'out') { toast('İstek zaten gönderildi.'); return; }
        if (rel === 'in') { var rq = S.reqIn.filter(function (x) { return x.username === u; })[0]; return answerRequest(rq.id, u, true); }
        var r = await c.from('friends').insert([{ sender: me(), receiver: u, status: 'pending' }]);
        if (r.error) { toast('İstek gönderilemedi.'); return; }
        toast('✉️ Arkadaşlık isteği gönderildi: @' + u);
        sendSoc('friend', { to: u, from: me(), kind: 'req' });
        await loadRelations();
    }
    async function answerRequest(id, u, accept, cancel) {
        var c = sb(); if (!c) return;
        var r = accept ? await c.from('friends').update({ status: 'accepted' }).eq('id', id) : await c.from('friends').delete().eq('id', id);
        if (r.error) { toast('İşlem başarısız.'); return; }
        toast(accept ? '✅ @' + u + ' artık arkadaşın!' : (cancel ? 'İstek geri çekildi.' : 'İstek reddedildi.'));
        if (accept) sendSoc('friend', { to: u, from: me(), kind: 'accept' });
        await loadRelations();
    }
    async function removeFriend(id, u) {
        var ok = await confirmBox('Arkadaşlıktan çıkar', '@' + u + ' arkadaş listenden çıkarılsın mı?', 'Evet, çıkar');
        if (!ok) return;
        var c = sb(); if (!c) return;
        var r = await c.from('friends').delete().eq('id', id);
        if (r.error) { toast('İşlem başarısız.'); return; }
        toast('@' + u + ' çıkarıldı.');
        await loadRelations();
    }
    function onFriendEvt(p) {
        if (!p || p.to !== me()) return;
        loadRelations();
        if (p.kind === 'req') snack('<i class="fa-solid fa-user-plus" style="color:#c4b5fd"></i> <b>@' + esc(p.from) + '</b> sana arkadaşlık isteği gönderdi', function () { openHub('requests'); });
        else if (p.kind === 'accept') snack('<i class="fa-solid fa-user-check" style="color:#6ee7b7"></i> <b>@' + esc(p.from) + '</b> isteğini kabul etti!', function () { openHub('friends'); });
    }

    /* ───────────── ARKADAŞLAR ───────────── */
    function friendRoom(u) {
        for (var i = 0; i < W.rooms.length; i++) {
            var r = W.rooms[i];
            if (r.host === u || (r.members || []).indexOf(u) !== -1) return r;
        }
        return null;
    }
    function userCard(u, opts) {
        opts = opts || {};
        var st = status(u), p = profCache[u] || {};
        var room = friendRoom(u);
        var btns = '';
        if (opts.friend) {
            btns = '<button class="sv5-btn primary sm" data-act="dm" data-u="' + esc(u) + '"><i class="fa-solid fa-comments"></i> Mesaj</button>' +
                (W.room ? '<button class="sv5-btn sm icon green" data-act="invite" data-u="' + esc(u) + '" title="Odaya davet et"><i class="fa-solid fa-tv"></i></button>' : '') +
                '<button class="sv5-btn sm icon" data-act="profile" data-u="' + esc(u) + '" title="Profil"><i class="fa-solid fa-id-card"></i></button>' +
                '<button class="sv5-btn sm icon danger" data-act="remove" data-u="' + esc(u) + '" data-id="' + esc(opts.relId) + '" title="Çıkar"><i class="fa-solid fa-user-xmark"></i></button>';
        } else {
            var rel = relOf(u);
            btns = (rel === 'friend' ? '<button class="sv5-btn primary sm" data-act="dm" data-u="' + esc(u) + '"><i class="fa-solid fa-comments"></i> Mesaj</button>'
                : rel === 'out' ? '<button class="sv5-btn sm" disabled><i class="fa-solid fa-clock"></i> İstek gönderildi</button>'
                : rel === 'in' ? '<button class="sv5-btn green sm" data-act="add" data-u="' + esc(u) + '"><i class="fa-solid fa-check"></i> Kabul et</button>'
                : '<button class="sv5-btn primary sm" data-act="add" data-u="' + esc(u) + '"><i class="fa-solid fa-user-plus"></i> Ekle</button>') +
                '<button class="sv5-btn sm icon" data-act="profile" data-u="' + esc(u) + '"><i class="fa-solid fa-id-card"></i></button>';
        }
        return '<div class="sv5-ucard ' + (st === 'watch' ? 'watching' : st === 'on' ? 'online' : '') + ' sv5-rise" style="--i:' + (opts.i || 0) + '" data-u="' + esc(u) + '">' +
            '<div class="sv5-ucard-top">' + av(u, 46, true) + '<div class="sv5-ucard-info" data-act="profile" data-u="' + esc(u) + '"><b>@' + esc(u) + '</b>' + statusText(u) + '</div></div>' +
            (room ? '<div class="sv5-ucard-room"><i class="fa-solid fa-tv"></i> Odada: ' + esc(room.name) + '<button class="sv5-btn green sm" data-act="joinfriendroom" data-room="' + esc(room.name) + '">Katıl</button></div>' : '') +
            '<div class="sv5-ucard-actions">' + btns + '</div></div>';
    }
    function renderFriends() {
        var pane = $('#sv5-pane-friends'); if (!pane) return;
        var existing = $('#sv5FriendFilter');
        var qv = existing ? existing.value.trim().toLowerCase() : '';
        var list = S.friends.slice().sort(function (a, b) {
            var w = { watch: 0, on: 1, '': 2 };
            var d = w[status(a.username)] - w[status(b.username)];
            return d || a.username.localeCompare(b.username);
        }).filter(function (f) { return !qv || f.username.toLowerCase().indexOf(qv) !== -1 || String((profCache[f.username] || {}).current_anime || '').toLowerCase().indexOf(qv) !== -1; });
        var cWatch = S.friends.filter(function (f) { return status(f.username) === 'watch'; }).length;
        var cOn = S.friends.filter(function (f) { return status(f.username); }).length;
        if (!existing) {
            pane.innerHTML = '<div class="sv5-phead"><div><h3><i class="fa-solid fa-user-group"></i> Arkadaşlar</h3><p><span id="sv5FrStat"></span></p></div>' +
                '<button class="sv5-btn sm primary" data-act="gofind"><i class="fa-solid fa-user-plus"></i> Arkadaş Ekle</button></div>' +
                '<div class="sv5-searchbar"><i class="fa-solid fa-magnifying-glass"></i><input id="sv5FriendFilter" class="sv5-input" placeholder="Arkadaşlarında ara..."></div>' +
                '<div class="sv5-grid" id="sv5FriendGrid"></div>';
        }
        $('#sv5FrStat').textContent = S.friends.length + ' arkadaş · ' + cOn + ' çevrimiçi · ' + cWatch + ' izliyor';
        var grid = $('#sv5FriendGrid');
        if (!S.friends.length) {
            grid.innerHTML = '<div class="sv5-empty"><i class="fa-solid fa-user-group"></i><strong>Henüz arkadaşın yok</strong>Keşfet sekmesinden diğer anime severleri bulabilirsin.<br><br><button class="sv5-btn primary" data-act="gofind"><i class="fa-solid fa-compass"></i> Üyeleri Keşfet</button></div>';
            return;
        }
        grid.innerHTML = list.length ? list.map(function (f, i) { return userCard(f.username, { friend: true, relId: f.id, i: Math.min(i, 8) }); }).join('')
            : '<div class="sv5-empty"><i class="fa-solid fa-magnifying-glass"></i>Sonuç bulunamadı.</div>';
    }

    /* ───────────── İSTEKLER ───────────── */
    function renderRequests() {
        var pane = $('#sv5-pane-requests'); if (!pane) return;
        var row = function (r, out, i) {
            return '<div class="sv5-ucard sv5-rise" style="--i:' + i + '"><div class="sv5-ucard-top">' + av(r.username, 46, true) +
                '<div class="sv5-ucard-info" data-act="profile" data-u="' + esc(r.username) + '"><b>@' + esc(r.username) + '</b><small>' + (out ? 'İstek gönderdin · ' : 'Sana istek gönderdi · ') + ago(r.at) + '</small></div></div>' +
                '<div class="sv5-ucard-actions">' + (out
                    ? '<button class="sv5-btn danger sm" data-act="cancel" data-id="' + esc(r.id) + '" data-u="' + esc(r.username) + '"><i class="fa-solid fa-xmark"></i> Geri çek</button>'
                    : '<button class="sv5-btn green sm" data-act="accept" data-id="' + esc(r.id) + '" data-u="' + esc(r.username) + '"><i class="fa-solid fa-check"></i> Kabul et</button><button class="sv5-btn danger sm" data-act="reject" data-id="' + esc(r.id) + '" data-u="' + esc(r.username) + '"><i class="fa-solid fa-xmark"></i> Reddet</button>') +
                '</div></div>';
        };
        pane.innerHTML = '<div class="sv5-phead"><div><h3><i class="fa-solid fa-user-plus"></i> Arkadaşlık İstekleri</h3><p>Gelen ve gönderdiğin istekler</p></div></div>' +
            '<div class="sv5-section"><h4><i class="fa-solid fa-inbox"></i> Gelen (' + S.reqIn.length + ')</h4><div class="sv5-grid">' +
            (S.reqIn.length ? S.reqIn.map(function (r, i) { return row(r, false, i); }).join('') : '<div class="sv5-empty" style="padding:24px"><i class="fa-regular fa-envelope-open"></i>Bekleyen isteğin yok.</div>') + '</div></div>' +
            '<div class="sv5-section"><h4><i class="fa-solid fa-paper-plane"></i> Gönderilen (' + S.reqOut.length + ')</h4><div class="sv5-grid">' +
            (S.reqOut.length ? S.reqOut.map(function (r, i) { return row(r, true, i); }).join('') : '<div class="sv5-empty" style="padding:24px"><i class="fa-regular fa-paper-plane"></i>Gönderilmiş istek yok.</div>') + '</div></div>';
    }

    /* ───────────── KEŞFET ───────────── */
    function renderDiscover() {
        var pane = $('#sv5-pane-discover'); if (!pane) return;
        if (!$('#sv5Discover')) {
            pane.innerHTML = '<div class="sv5-phead"><div><h3><i class="fa-solid fa-compass"></i> Üyeleri Keşfet</h3><p>Anime izleyen diğer kullanıcıları bul ve arkadaş ekle</p></div></div>' +
                '<div class="sv5-searchbar"><i class="fa-solid fa-magnifying-glass"></i><input id="sv5Discover" class="sv5-input" placeholder="Kullanıcı adı ara..." value="' + esc(S.discoverQ) + '"></div>' +
                '<div id="sv5DiscoverBody"></div>';
        }
        runDiscover();
    }
    async function runDiscover() {
        var c = sb(), body = $('#sv5DiscoverBody'); if (!c || !body) return;
        body.innerHTML = '<div class="sv5-loading"><span class="sv5-spin"></span></div>';
        var mine = me();
        if (S.discoverQ) {
            var r = await c.from('profiles').select('username,avatar_url,name_color,current_anime,last_active,bio,created_at').ilike('username', '%' + S.discoverQ.replace(/[%_]/g, '') + '%').neq('username', mine).limit(24);
            (r.data || []).forEach(function (p) { p._t = Date.now(); profCache[p.username] = p; });
            var users = (r.data || []).map(function (p) { return p.username; });
            body.innerHTML = '<div class="sv5-section"><div class="sv5-grid">' + (users.length ? users.map(function (u, i) { return userCard(u, { i: Math.min(i, 8) }); }).join('') : '<div class="sv5-empty"><i class="fa-solid fa-user-slash"></i>Kullanıcı bulunamadı.</div>') + '</div></div>';
            return;
        }
        var since = new Date(Date.now() - 10 * 60000).toISOString();
        var a = await c.from('profiles').select('username,avatar_url,name_color,current_anime,last_active,bio,created_at').gt('last_active', since).neq('username', mine).limit(30);
        var b = await c.from('profiles').select('username,avatar_url,name_color,current_anime,last_active,bio,created_at').order('created_at', { ascending: false }).neq('username', mine).limit(8);
        [].concat(a.data || [], b.data || []).forEach(function (p) { p._t = Date.now(); profCache[p.username] = p; });
        var watching = (a.data || []).filter(function (p) { return p.current_anime; }).slice(0, 6).map(function (p) { return p.username; });
        var activeNow = (a.data || []).filter(function (p) { return !p.current_anime; }).slice(0, 6).map(function (p) { return p.username; });
        var fresh = (b.data || []).map(function (p) { return p.username; });
        var sec = function (title, icon, arr, empty) {
            return '<div class="sv5-section"><h4><i class="fa-solid ' + icon + '"></i> ' + title + '</h4><div class="sv5-grid">' +
                (arr.length ? arr.map(function (u, i) { return userCard(u, { i: i }); }).join('') : '<div class="sv5-empty" style="padding:22px">' + empty + '</div>') + '</div></div>';
        };
        body.innerHTML = sec('Şu an izleyenler', 'fa-circle-play', watching, 'Şu an anime izleyen kimse yok.') +
            sec('Aktif üyeler', 'fa-bolt', activeNow, 'Aktif başka üye yok.') +
            sec('Yeni katılanlar', 'fa-seedling', fresh, 'Yeni üye yok.');
    }
    function paintDiscoverButtons() { if ($('#sv5Discover')) runDiscover(); }

    /* ───────────── NABIZ & SIRALAMA (PULSE) ───────────── */
    function countWeeklyWatched() {
        var cutoff = Date.now() - 7 * 86400000;
        var seen = {}, count = 0;
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i) || '';
                if (k.indexOf('anitr_history_') !== 0) continue;
                var arr = JSON.parse(localStorage.getItem(k) || '[]');
                if (!Array.isArray(arr)) continue;
                arr.forEach(function (it) {
                    var ts = it && (it.timestamp || it.updatedAt || it.watchedAt || 0);
                    var id = (it && (it.id || it.slug || it.title) || '') + '_' + (it && it.sIdx) + '_' + (it && it.eIdx);
                    if (id && !seen[id] && (!ts || ts >= cutoff)) { seen[id] = 1; count++; }
                });
            }
        } catch (_) {}
        return count;
    }
    async function renderPulse() {
        var pane = $('#sv5-pane-pulse'); if (!pane) return;
        var goal = 10;
        try { goal = Math.max(1, parseInt(localStorage.getItem('sv5_weekly_goal') || '10', 10) || 10); } catch (_) {}
        var done = countWeeklyWatched();
        var pct = Math.min(100, Math.round((done * 100) / goal));
        pane.innerHTML =
            '<div class="sv5-phead"><div><h3><i class="fa-solid fa-bolt-lightning"></i> Topluluk Nabzı & Sıralama</h3><p>Haftalık izleme hedefin, trend animeler ve en aktif üyeler</p></div></div>' +
            '<div class="sv5-pulse-grid">' +
              '<div class="sv5-pcard span2 sv5-rise" style="--i:0">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
                  '<h4><i class="fa-solid fa-bullseye"></i> Haftalık İzleme Hedefin</h4>' +
                  '<span style="font-size:13px;font-weight:800;color:#6ee7b7">' + done + ' / ' + goal + ' bölüm (%' + pct + ')</span>' +
                '</div>' +
                '<div class="sv5-goal-bar"><div class="sv5-goal-fill" style="width:' + pct + '%"></div></div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">' +
                  '<small style="color:var(--sv-mute)">Son 7 günde izlediğin bölümler otomatik hesaplanır.</small>' +
                  '<div class="sv5-goal-pills">' +
                    [5, 10, 20, 35].map(function (g) {
                        return '<button class="sv5-chip' + (goal === g ? ' active' : '') + '" style="height:28px;padding:0 11px;font-size:11.5px" data-act="setgoal" data-g="' + g + '">' + g + ' Bölüm</button>';
                    }).join('') +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="sv5-pcard sv5-rise" style="--i:1"><h4><i class="fa-solid fa-fire"></i> Toplulukta Konuşulan Animeler</h4><div id="sv5PulseAnime"><div class="sv5-loading" style="padding:18px"><span class="sv5-spin"></span></div></div></div>' +
              '<div class="sv5-pcard sv5-rise" style="--i:2"><h4><i class="fa-solid fa-trophy"></i> En Aktif Üyeler</h4><div id="sv5PulseLeaders"><div class="sv5-loading" style="padding:18px"><span class="sv5-spin"></span></div></div></div>' +
            '</div>';
        var c = sb(); if (!c) return;
        var res = await Promise.all([
            c.from('social_posts').select('id,username,anime_title').order('created_at', { ascending: false }).limit(80),
            c.from('social_likes').select('post_id').limit(200),
            c.from('profiles').select('username,avatar_url,current_anime,last_active').order('last_active', { ascending: false }).limit(40)
        ]);
        var posts = (res[0] && res[0].data) || [];
        var likes = (res[1] && res[1].data) || [];
        var profs = (res[2] && res[2].data) || [];
        profs.forEach(function (p) { p._t = Date.now(); profCache[p.username] = p; });
        var postOwner = {}, scores = {}, animeCounts = {};
        posts.forEach(function (p) {
            postOwner[p.id] = p.username;
            if (p.username) scores[p.username] = (scores[p.username] || 0) + 3;
            if (p.anime_title) animeCounts[p.anime_title] = (animeCounts[p.anime_title] || 0) + 2;
        });
        likes.forEach(function (l) {
            var u = postOwner[l.post_id];
            if (u) scores[u] = (scores[u] || 0) + 2;
        });
        profs.forEach(function (p) {
            if (p.current_anime) animeCounts[p.current_anime] = (animeCounts[p.current_anime] || 0) + 3;
            if (p.username && !scores[p.username]) scores[p.username] = 1;
        });
        var topAnime = Object.keys(animeCounts).sort(function (a, b) { return animeCounts[b] - animeCounts[a]; }).slice(0, 6);
        var topUsers = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; }).slice(0, 6);
        await loadProfiles(topUsers);
        var aBox = $('#sv5PulseAnime'), lBox = $('#sv5PulseLeaders');
        if (aBox) {
            aBox.innerHTML = topAnime.length ? '<div style="display:flex;flex-direction:column;gap:7px">' + topAnime.map(function (t, idx) {
                return '<div class="sv5-rank-row" data-act="searchanime" data-title="' + esc(t) + '">' +
                    '<span class="sv5-rank-num">#' + (idx + 1) + '</span>' +
                    '<div style="min-width:0;flex:1"><b style="font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(t) + '</b></div>' +
                    '<span class="sv5-rank-pts"><i class="fa-solid fa-bolt"></i> ' + animeCounts[t] + ' etki</span></div>';
            }).join('') + '</div>' : '<div style="font-size:12.5px;color:var(--sv-mute)">Henüz yeterli veri yok.</div>';
        }
        if (lBox) {
            lBox.innerHTML = topUsers.length ? '<div style="display:flex;flex-direction:column;gap:7px">' + topUsers.map(function (u, idx) {
                var numStr = idx < 9 ? '0' + (idx + 1) : String(idx + 1);
                return '<div class="sv5-rank-row" data-act="profile" data-u="' + esc(u) + '">' +
                    '<span class="sv5-rank-num">' + numStr + '</span>' +
                    av(u, 30, true) +
                    '<div style="min-width:0;flex:1"><b style="font-size:12.5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">@' + esc(u) + '</b></div>' +
                    '<span class="sv5-rank-pts">' + scores[u] + ' puan</span></div>';
            }).join('') + '</div>' : '<div style="font-size:12.5px;color:var(--sv-mute)">Henüz sıralama oluşmadı.</div>';
        }
    }

    /* ───────────── SOHBET (DM) ───────────── */
    var EMOJIS = ['😂', '😭', '🔥', '😱', '❤️', '👏', '🥺', '😎', '🍿', '⚔️', '💀', '✨', '👍', '🙏', '🤔', '🎉'];
    function renderChatShell() {
        var pane = $('#sv5-pane-chat'); if (!pane) return;
        if (!$('#sv5-chat')) {
            pane.innerHTML = '<div class="sv5-chat" id="sv5-chat">' +
                '<div class="sv5-contacts"><div class="sv5-contacts-head"><h4><i class="fa-solid fa-bolt"></i> Mesajlar</h4><input id="sv5ContactFilter" class="sv5-input" placeholder="Sohbetlerde ara..."></div><div class="sv5-contacts-list" id="sv5Contacts"></div></div>' +
                '<div class="sv5-thread" id="sv5Thread"></div></div>';
        }
        renderContacts(); renderThread();
    }
    async function loadInbox() {
        var c = sb(); if (!c || !me()) return;
        var r = await c.from('friend_messages').select('id,sender,receiver,message,created_at,read_at').or('sender.eq.' + q(me()) + ',receiver.eq.' + q(me())).order('created_at', { ascending: false }).limit(300);
        if (r.error) return;
        var rm = readMap(), inbox = {}, total = 0;
        (r.data || []).forEach(function (m) {
            var other = m.sender === me() ? m.receiver : m.sender;
            if (!inbox[other]) inbox[other] = { last: m, unread: 0 };
            var seen = m.read_at || (rm[other] && new Date(m.created_at).getTime() <= rm[other]);
            if (m.receiver === me() && !seen && S.chatWith !== other) { inbox[other].unread++; total++; }
        });
        S.inbox = inbox; S.unreadTotal = total;
        await loadProfiles(Object.keys(inbox));
        renderBadges();
        if (S.tab === 'chat') renderContacts();
    }
    function preview(m) {
        if (!m) return 'Sohbet başlat';
        var t = String(m.message || '');
        if (/\[\[W2G:/.test(t)) t = '🎬 Birlikte izleme daveti';
        return (m.sender === me() ? 'Sen: ' : '') + t.slice(0, 60);
    }
    function renderContacts() {
        var box = $('#sv5Contacts'); if (!box) return;
        var qv = (($('#sv5ContactFilter') || {}).value || '').trim().toLowerCase();
        var names = {};
        S.friends.forEach(function (f) { names[f.username] = 1; });
        Object.keys(S.inbox).forEach(function (n) { names[n] = 1; });
        var arr = Object.keys(names).filter(function (n) { return !qv || n.toLowerCase().indexOf(qv) !== -1; }).sort(function (a, b) {
            var ta = S.inbox[a] ? new Date(S.inbox[a].last.created_at).getTime() : 0;
            var tb = S.inbox[b] ? new Date(S.inbox[b].last.created_at).getTime() : 0;
            return tb - ta || a.localeCompare(b);
        });
        if (!arr.length) { box.innerHTML = '<div class="sv5-empty" style="padding:30px 10px"><i class="fa-regular fa-comments"></i>Henüz sohbet yok.<br><br><button class="sv5-btn sm primary" data-act="gofind">Arkadaş bul</button></div>'; return; }
        box.innerHTML = arr.map(function (n) {
            var ib = S.inbox[n];
            return '<div class="sv5-contact' + (S.chatWith === n ? ' active' : '') + (ib && ib.unread ? ' unread' : '') + '" data-act="dm" data-u="' + esc(n) + '">' + av(n, 40, true) +
                '<div class="sv5-contact-info"><b>@' + esc(n) + '<em>' + (ib ? hhmm(ib.last.created_at) : '') + '</em></b><small>' + esc(preview(ib && ib.last)) + '</small></div>' +
                (ib && ib.unread ? '<span class="un">' + ib.unread + '</span>' : '') + '</div>';
        }).join('');
    }
    function openThread(u) {
        if (!u) return;
        S.chatWith = u;
        if (!$('#sv5.open') || !me()) { openHub('chat'); }
        else if (S.tab !== 'chat') switchTab('chat');
        else renderChatShell();
        var ch = $('#sv5-chat'); if (ch) ch.classList.add('thread-open');
        lockShellScroll();
        loadThread(true);
        loadProfiles([u]).then(function () {
            renderContacts();
            if (S.chatWith === u) {
                var avEl = $('#sv5ThreadAv'); if (avEl) avEl.innerHTML = av(u, 40, true);
                var tl = $('#sv5TypeLine'); if (tl && !$('.typing', tl)) tl.innerHTML = statusText(u);
            }
        });
        if (S.threadTimer) clearInterval(S.threadTimer);
        S.threadTimer = setInterval(function () { if ($('#sv5.open') && S.chatWith) loadThread(); }, 7000);
    }
    function renderThread() {
        var th = $('#sv5Thread'); if (!th) return;
        var u = S.chatWith;
        if (!u) {
            th.innerHTML = '<div class="sv5-thread-empty"><i class="fa-regular fa-comments"></i><b style="color:#fff;font-size:15px">Bir sohbet seç</b>Arkadaşlarınla anlık mesajlaş, birlikte izleme daveti gönder.</div>';
            lockShellScroll();
            return;
        }
        th.innerHTML =
            '<div class="sv5-thread-head"><button class="sv5-btn sm icon" data-act="back" style="display:none" id="sv5BackBtn"><i class="fa-solid fa-arrow-left"></i></button>' +
            '<div id="sv5ThreadAv" data-act="profile" data-u="' + esc(u) + '">' + av(u, 40, true) + '</div>' +
            '<div class="who" data-act="profile" data-u="' + esc(u) + '"><b>@' + esc(u) + '</b><span id="sv5TypeLine">' + statusText(u) + '</span></div>' +
            (W.room ? '<button class="sv5-btn green sm" data-act="invitehere"><i class="fa-solid fa-tv"></i> Odaya davet et</button>' : '') + '</div>' +
            '<div class="sv5-thread-body" id="sv5ThreadBody"><div class="sv5-loading"><span class="sv5-spin"></span></div></div>' +
            '<div class="sv5-composerbar"><div class="sv5-emoji-pop" id="sv5Emoji">' + EMOJIS.map(function (e) { return '<button data-act="pickemoji" data-e="' + e + '">' + e + '</button>'; }).join('') + '</div>' +
            '<button class="sv5-btn icon" data-act="emoji" title="Emoji"><i class="fa-regular fa-face-smile"></i></button>' +
            '<input id="sv5Msg" class="sv5-input" placeholder="Mesaj yaz..." autocomplete="off" maxlength="500">' +
            '<button class="sv5-btn primary icon" data-act="send" title="Gönder"><i class="fa-solid fa-paper-plane"></i></button></div>';
        var bb = $('#sv5BackBtn'); if (bb && window.innerWidth <= 760) bb.style.display = '';
        lockShellScroll();
        setTimeout(function () {
            var i = $('#sv5Msg');
            if (i) { try { i.focus({ preventScroll: true }); } catch (_) {} }
            lockShellScroll();
        }, 80);
    }
    function msgHtml(m) {
        var mineMsg = m.sender === me();
        var text = String(m.message || '');
        var inv = text.match(/\[\[W2G:([^|\]]*)\|?([^\]]*)\]\]/);
        var body;
        var cls = 'sv5-msg' + (mineMsg ? ' me' : '');
        if (inv) {
            body = '<div class="sv5-invite"><b><i class="fa-solid fa-tv"></i> Birlikte İzleme Daveti</b><span>Oda: <strong style="color:#fff">' + esc(inv[1]) + '</strong></span>' +
                (mineMsg ? '' : '<button class="sv5-btn green sm" data-act="acceptinvite" data-room="' + esc(inv[1]) + '" data-pw="' + esc(inv[2]) + '"><i class="fa-solid fa-right-to-bracket"></i> Odaya Katıl</button>') + '</div>';
        } else {
            var emojiOnly = /^(\p{Extended_Pictographic}|\uFE0F|\u200D|\s){1,6}$/u.test(text) && text.trim().length <= 12;
            if (emojiOnly) cls += ' emoji';
            body = '<div class="bub">' + esc(text) + '</div>';
        }
        return '<div class="' + cls + '">' + body + '<small>' + hhmm(m.created_at) + (mineMsg ? ' <i class="fa-solid fa-check-double ' + (m.read_at ? 'rd' : '') + '"></i>' : '') + '</small></div>';
    }
    async function loadThread(first) {
        var c = sb(), u = S.chatWith; if (!c || !u || !me()) return;
        var r = await c.from('friend_messages').select('id,sender,receiver,message,created_at,read_at')
            .or('and(sender.eq.' + q(me()) + ',receiver.eq.' + q(u) + '),and(sender.eq.' + q(u) + ',receiver.eq.' + q(me()) + ')')
            .order('created_at', { ascending: false }).limit(150);
        if (u !== S.chatWith) return;
        var body = $('#sv5ThreadBody'); if (!body) return;
        var msgs = (r.data || []).slice().reverse();
        var sig = msgs.length + ':' + (msgs.length ? msgs[msgs.length - 1].id + (msgs[msgs.length - 1].read_at || '') : '');
        if (!first && body.getAttribute('data-sig') === sig) return;
        body.setAttribute('data-sig', sig);
        var near = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
        if (!msgs.length) {
            body.innerHTML = '<div class="sv5-thread-empty"><i class="fa-regular fa-hand"></i>@' + esc(u) + ' ile henüz yazışmadınız.<br>İlk mesajı gönder!</div>';
        } else {
            var lastDay = '', html = '';
            msgs.forEach(function (m) {
                var d = dayLabel(m.created_at);
                if (d !== lastDay) { html += '<div class="sv5-day">' + d + '</div>'; lastDay = d; }
                html += msgHtml(m);
            });
            body.innerHTML = html;
        }
        if (first || near) body.scrollTop = body.scrollHeight;
        lockShellScroll();
        // okundu işaretle
        var unread = msgs.filter(function (m) { return m.receiver === me() && !m.read_at; });
        setRead(u);
        if (S.inbox[u] && S.inbox[u].unread) { S.unreadTotal = Math.max(0, S.unreadTotal - S.inbox[u].unread); S.inbox[u].unread = 0; renderBadges(); renderContacts(); }
        if (unread.length) c.from('friend_messages').update({ read_at: new Date().toISOString() }).eq('receiver', me()).eq('sender', u).is('read_at', null).then(function () {});
    }
    async function sendDm(textOverride, toOverride) {
        var c = sb(), u = toOverride || S.chatWith; if (!c || !u || !me()) return;
        var inp = $('#sv5Msg');
        var text = (textOverride != null ? textOverride : (inp ? inp.value : '')).trim();
        if (!text) return;
        if (!textOverride && inp) inp.value = '';
        var body = $('#sv5ThreadBody');
        if (body && u === S.chatWith) {
            var tmp = document.createElement('div');
            tmp.innerHTML = msgHtml({ sender: me(), receiver: u, message: text, created_at: new Date().toISOString() });
            var empty = $('.sv5-thread-empty', body); if (empty) body.innerHTML = '';
            body.appendChild(tmp.firstChild); body.scrollTop = body.scrollHeight;
        }
        var r = await c.from('friend_messages').insert([{ sender: me(), receiver: u, message: text }]);
        if (r.error) { toast('Mesaj gönderilemedi.'); return; }
        sendSoc('dm', { to: u, from: me(), text: text });
        loadInbox();
    }
    function sendTyping() {
        if (!S.chatWith || Date.now() - S.lastTypingSent < 1800) return;
        S.lastTypingSent = Date.now();
        sendSoc('typing', { to: S.chatWith, from: me() });
    }
    function onTyping(p) {
        if (!p || p.to !== me() || p.from !== S.chatWith) return;
        var el = $('#sv5TypeLine'); if (!el) return;
        el.innerHTML = '<small class="typing">yazıyor...</small>';
        clearTimeout(S.typingTimer);
        S.typingTimer = setTimeout(function () { var e2 = $('#sv5TypeLine'); if (e2 && S.chatWith) e2.innerHTML = statusText(S.chatWith); }, 2600);
    }
    function onDm(p) {
        if (!p || p.to !== me()) return;
        var open = $('#sv5.open') && S.tab === 'chat' && S.chatWith === p.from;
        if (open) { loadThread(); return; }
        loadInbox();
        var t = /\[\[W2G:/.test(p.text || '') ? '🎬 Birlikte izleme daveti gönderdi' : String(p.text || '').slice(0, 60);
        snack('<i class="fa-solid fa-comment-dots" style="color:#c4b5fd"></i> <b>@' + esc(p.from) + '</b>: ' + esc(t), function () { openThread(p.from); }, 6500);
    }
    function toggleEmoji() { var e = $('#sv5Emoji'); if (e) e.classList.toggle('open'); }
    function insertEmoji(e) {
        var inp = $('#sv5Msg'); if (!inp) return;
        inp.value += e;
        try { inp.focus({ preventScroll: true }); } catch (_) {}
        lockShellScroll();
        var p = $('#sv5Emoji'); if (p) p.classList.remove('open');
    }

    /* ───────────── Sağ panel ───────────── */
    function renderSide() {
        var side = $('#sv5Side'); if (!side) return;
        var watching = S.friends.filter(function (f) { return status(f.username) === 'watch'; }).slice(0, 4);
        var online = S.friends.filter(function (f) { return status(f.username) === 'on'; }).slice(0, 5);
        var rooms = W.rooms.slice(0, 3);
        side.innerHTML =
            '<div class="sv5-widget"><h5><i class="fa-solid fa-tv"></i> Canlı Odalar<button data-act="rooms">Tümü</button></h5>' +
            (rooms.length ? rooms.map(function (r) {
                return '<div class="sv5-mini" data-act="sidejoin" data-room="' + esc(r.name) + '">' + av(r.host, 34, false) +
                    '<div class="mi"><b>' + (r.hasPw ? '🔒 ' : '') + esc(r.name) + '</b><small>' + esc(r.animeTitle || 'Anime seçilmedi') + ' · ' + (r.users || 1) + ' kişi</small></div><i class="fa-solid fa-right-to-bracket lk"></i></div>';
            }).join('') : '<div class="sv5-wempty">Şu an aktif oda yok. İlk odayı sen kur!</div>') + '</div>' +
            (me()
                ? '<div class="sv5-widget"><h5><i class="fa-solid fa-circle-play"></i> Şimdi İzleyenler</h5>' +
                  (watching.length ? watching.map(function (f) {
                      var p = profCache[f.username] || {};
                      return '<div class="sv5-mini" data-act="profile" data-u="' + esc(f.username) + '">' + av(f.username, 34, true) + '<div class="mi"><b>@' + esc(f.username) + '</b><small>' + esc(p.current_anime) + '</small></div></div>';
                  }).join('') : '<div class="sv5-wempty">Arkadaşların şu an anime izlemiyor.</div>') + '</div>' +
                  '<div class="sv5-widget"><h5><i class="fa-solid fa-circle" style="color:#34d399"></i> Çevrimiçi Arkadaşlar</h5>' +
                  (online.length ? online.map(function (f) {
                      return '<div class="sv5-mini" data-act="dm" data-u="' + esc(f.username) + '">' + av(f.username, 34, true) + '<div class="mi"><b>@' + esc(f.username) + '</b><small>Mesaj göndermek için dokun</small></div></div>';
                  }).join('') : '<div class="sv5-wempty">Çevrimiçi arkadaş yok.</div>') + '</div>'
                : '<div class="sv5-widget"><h5><i class="fa-solid fa-bolt-lightning"></i> Topluluk Nabzı<button data-act="gopulse">Aç</button></h5>' +
                  '<div class="sv5-wempty">Trend animeleri, haftalık izleme hedefini ve aktif üyeler sıralamasını Nabız sekmesinden inceleyebilirsin.</div></div>');
    }

    /* ============================================================
       BİRLİKTE İZLE  —  Supabase Realtime + DB Kayıt Defteri
       ============================================================ */
    var REG_KEY = '__anitr_w2g_reg_v1__';
    var W = {
        lobby: null, lobbyReady: null, rtRooms: [], dbRooms: [], rooms: [], room: null,
        applying: 0, following: 0, pendingSeek: null, tickTimer: null, hbTimer: null,
        unread: 0, lastEp: '', pwPlain: '', filter: 'all', q: ''
    };
    var REACTS = ['😂', '😭', '🔥', '😱', '❤️', '👏'];

    function mergeRooms() {
        var seen = {}, out = [];
        W.rtRooms.concat(W.dbRooms).forEach(function (r) {
            if (r && r.id && !seen[r.id]) { seen[r.id] = 1; out.push(r); }
        });
        out.sort(function (a, b) { return (b.users || 0) - (a.users || 0) || (b.at || 0) - (a.at || 0); });
        W.rooms = out;
        if ($('#wt5.open')) renderRooms();
        renderBadges();
        if ($('#sv5.open')) { renderSide(); if (S.tab === 'friends' && me()) renderFriends(); }
    }
    async function fetchDbRooms() {
        var c = sb(); if (!c) return;
        try {
            var r = await c.from('comments').select('id,username,content,created_at').eq('ep_key', REG_KEY).order('created_at', { ascending: false }).limit(40);
            var now = Date.now(), fresh = [], staleIds = [];
            (r.data || []).forEach(function (row) {
                try {
                    var obj = JSON.parse(row.content || '{}');
                    var ts = obj.hb || new Date(row.created_at).getTime() || 0;
                    if (obj && obj.id && now - ts < 85000) fresh.push(obj);
                    else if (now - ts > 180000) staleIds.push(row.id);
                } catch (_) {}
            });
            if (staleIds.length) { c.from('comments').delete().in('id', staleIds).then(function () {}); }
            W.dbRooms = fresh;
            mergeRooms();
        } catch (_) {}
    }
    async function syncRoomToDb() {
        var c = sb(), R = W.room;
        if (!c || !R || !R.isHost) return;
        try {
            var payload = Object.assign({}, lobbyMeta(), { hb: Date.now() });
            var uTag = '__room__:' + R.id;
            await c.from('comments').delete().eq('ep_key', REG_KEY).eq('username', uTag);
            await c.from('comments').insert([{ ep_key: REG_KEY, username: uTag, content: JSON.stringify(payload) }]);
        } catch (_) {}
    }
    async function removeRoomFromDb(roomId) {
        var c = sb(); if (!c || !roomId) return;
        try { await c.from('comments').delete().eq('ep_key', REG_KEY).eq('username', '__room__:' + roomId); } catch (_) {}
    }

    function ensureLobby() {
        var c = sb();
        if (!c) return Promise.resolve(null);
        fetchDbRooms();
        if (W.lobbyReady) return W.lobbyReady;
        W.lobby = c.channel('anitr-w2g-lobby', { config: { presence: { key: 'l-' + RID + '-' + (me() || 'guest') } } });
        var sync = function () {
            var st = W.lobby.presenceState(), seen = {}, out = [];
            Object.keys(st).forEach(function (k) {
                st[k].forEach(function (m) {
                    if (m.t === 'room' && m.id && !seen[m.id]) { seen[m.id] = 1; out.push(m); }
                });
            });
            W.rtRooms = out;
            mergeRooms();
        };
        W.lobbyReady = new Promise(function (res) {
            W.lobby.on('presence', { event: 'sync' }, sync).on('presence', { event: 'join' }, sync).on('presence', { event: 'leave' }, sync)
                .subscribe(function (s) { if (s === 'SUBSCRIBED') res(W.lobby); else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') res(null); });
            setTimeout(function () { res(W.lobby); }, 4500);
        });
        return W.lobbyReady;
    }

    function buildLobby() {
        if ($('#wt5')) return;
        var root = document.createElement('div');
        root.id = 'wt5';
        root.className = 'w2g-page';
        root.innerHTML =
            '<div class="wt5-shell" aria-label="Birlikte İzle">' +
              '<header class="wt5-hero">' +
                '<div class="wt5-hero-left">' +
                  '<p class="cat-eyebrow">Birlikte İzle</p>' +
                  '<h1 class="cat-title">İzleme Odaları</h1>' +
                  '<p class="cat-count"><b id="wt5Count">0</b> aktif oda<span class="cat-count-src" id="wt5ViewerTotal">Canlı senkron</span></p>' +
                '</div>' +
                '<div class="wt5-hero-actions">' +
                  '<div class="wt5-join-code"><input id="wt5Code" class="sv5-input" placeholder="Oda adı ile katıl..." maxlength="40"><button class="sv5-btn" data-wt="joincode">Katıl</button></div>' +
                  '<button class="sv5-btn primary" data-wt="toggleform"><i class="fa-solid fa-plus"></i> Yeni Oda Kur</button>' +
                '</div>' +
              '</header>' +
              '<div id="wt5ActiveBar"></div>' +
              '<div class="wt5-body">' +
                '<div class="wt5-form" id="wt5Form">' +
                  '<div class="wt5-form-head">' +
                    '<div><h3>Yeni İzleme Odası</h3><p>Oda ayarlarını belirle; kurduktan sonra istediğin animeyi açabilirsin.</p></div>' +
                    '<div class="wt5-presets">' +
                      '<button type="button" class="sv5-chip" data-wt="preset" data-v="Cuma Maratonu">Cuma Maratonu</button>' +
                      '<button type="button" class="sv5-chip" data-wt="preset" data-v="Gece Seansı">Gece Seansı</button>' +
                      '<button type="button" class="sv5-chip" data-wt="preset" data-v="Sezon Finali">Sezon Finali</button>' +
                    '</div>' +
                  '</div>' +
                  '<div class="wt5-form-grid">' +
                    '<div class="wt5-field"><label>Oda adı</label><input id="wt5Name" class="sv5-input" placeholder="Örn: Cuma Gecesi Maratonu" maxlength="28"></div>' +
                    '<div class="wt5-field"><label>Şifre (isteğe bağlı)</label><input id="wt5Pw" class="sv5-input" type="password" placeholder="Boş bırakırsan herkese açık" maxlength="24"></div>' +
                    '<div class="wt5-field"><label>Oynatma kontrolü</label><div class="wt5-seg" id="wt5Ctl"><button type="button" class="active" data-wt="ctl" data-v="all">Herkes</button><button type="button" data-wt="ctl" data-v="host">Sadece Host</button></div></div>' +
                    '<div class="wt5-field"><label>Başlangıç içeriği</label><div class="wt5-nowplaying" id="wt5Now"></div></div>' +
                  '</div>' +
                  '<div class="wt5-form-actions"><button type="button" class="sv5-btn" data-wt="toggleform">Vazgeç</button><button type="button" class="sv5-btn primary" data-wt="create">Odayı Başlat</button></div>' +
                '</div>' +
                '<div class="wt5-toolbar">' +
                  '<div class="wt5-filters" id="wt5Filters">' +
                    '<button type="button" class="sv5-chip active" data-wt="wfilter" data-f="all">Tümü</button>' +
                    '<button type="button" class="sv5-chip" data-wt="wfilter" data-f="open">Şifresiz</button>' +
                    '<button type="button" class="sv5-chip" data-wt="wfilter" data-f="friends">Arkadaşlarım</button>' +
                  '</div>' +
                  '<div class="wt5-toolbar-right">' +
                    '<div class="wt5-search"><i class="fa-solid fa-magnifying-glass"></i><input id="wt5Search" placeholder="Oda veya anime ara..."></div>' +
                    '<button type="button" class="sv5-btn sm" data-wt="refresh" title="Odaları yenile"><i class="fa-solid fa-rotate-right"></i> Yenile</button>' +
                  '</div>' +
                '</div>' +
                '<div class="wt5-rooms" id="wt5Rooms"></div>' +
                '<div class="wt5-steps">' +
                  '<div class="wt5-step"><span>01</span><div><b>Oda Kur veya Katıl</b><p>Açık odalardan birine gir ya da şifreli/şifresiz kendi odanı oluştur.</p></div></div>' +
                  '<div class="wt5-step"><span>02</span><div><b>Bölümü Başlat</b><p>Katalogdan herhangi bir anime bölümünü açtığında odadaki herkes otomatik yönlendirilir.</p></div></div>' +
                  '<div class="wt5-step"><span>03</span><div><b>Senkron İzle & Sohbet Et</b><p>Duraklatma, oynatma ve ileri sarma işlemleri sağ alttaki canlı oda paneliyle eşzamanlı çalışır.</p></div></div>' +
                '</div>' +
              '</div>' +
            '</div>';
        (document.getElementById('app') || document.body).appendChild(root);
        root.addEventListener('click', onLobbyClick);
        root.addEventListener('input', function (e) {
            if (e.target && e.target.id === 'wt5Search') {
                W.q = e.target.value.trim();
                renderRooms();
            }
        });
        root.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.id === 'wt5Code') joinFromCode();
            else if (e.key === 'Enter' && e.target.id === 'wt5Name') createRoom();
        });
    }
    function nowPlayingInfo() {
        var a = (typeof currentAnime !== 'undefined' && currentAnime && currentAnime.title) ? currentAnime : null;
        return a;
    }
    function paintNow() {
        var el = $('#wt5Now'); if (!el) return;
        var a = nowPlayingInfo();
        el.innerHTML = a ? (a.img ? '<img src="' + esc(a.img) + '" alt="">' : '') + '<div><b style="color:#fff;display:block">' + esc(a.title) + '</b><span>Oda bu animeyle başlayacak</span></div>'
            : '<i class="fa-solid fa-film" style="font-size:16px;color:rgba(255,255,255,.45)"></i><div>Henüz bölüm seçilmedi.<br><span>Odayı kurduktan sonra katalogdan bir bölüm açabilirsin.</span></div>';
    }
    function paintActiveBar() {
        var bar = $('#wt5ActiveBar'); if (!bar) return;
        var R = W.room;
        if (!R) { bar.innerHTML = ''; return; }
        var n = Object.keys(R.members || {}).length || 1;
        var ep = R.ep || curEpisode();
        bar.innerHTML =
            '<div class="wt5-active-banner">' +
              '<div class="wt5-ab-left">' +
                '<span class="wt5-ab-dot"></span>' +
                '<div><b>Aktif Odan: ' + esc(R.name) + '</b>' +
                  '<small>' + (R.isHost ? 'Host sensin' : 'Host: @' + esc(R.host)) + ' · ' + n + ' izleyici · ' +
                  (ep && ep.title ? esc(ep.title + (ep.label ? ' (' + ep.label + ')' : '')) : 'Henüz anime açılmadı') + '</small>' +
                '</div>' +
              '</div>' +
              '<div class="wt5-ab-actions">' +
                (ep && ep.title ? '<button type="button" class="sv5-btn primary sm" data-wt="gowatch"><i class="fa-solid fa-play"></i> Oynatıcıya Dön</button>' : '') +
                '<button type="button" class="sv5-btn sm" data-wt="pickanime"><i class="fa-solid fa-compass"></i> Katalogdan Anime Seç</button>' +
                '<button type="button" class="sv5-btn sm" data-wt="copyroom"><i class="fa-regular fa-copy"></i> Kodu Kopyala</button>' +
                '<button type="button" class="sv5-btn danger sm" data-wt="leaveroom">Odadan Ayrıl</button>' +
              '</div>' +
            '</div>';
    }
    function openLobby(opts) {
        buildLobby();
        showPageView('wt5');
        paintNow();
        paintActiveBar();
        renderRooms();
        ensureLobby().then(function () { renderRooms(); });
        if (me()) { initRealtime(); loadRelations(); }
        if (opts && opts.create) { $('#wt5Form').classList.add('open'); setTimeout(function () { $('#wt5Name').focus(); }, 150); }
    }
    function closeLobby() { var r = $('#wt5'); if (r) r.classList.remove('open'); }

    function renderRooms() {
        var box = $('#wt5Rooms'); if (!box) return;
        var cnt = $('#wt5Count'); if (cnt) cnt.textContent = W.rooms.length;
        var vtot = $('#wt5ViewerTotal');
        if (vtot) {
            var totalU = W.rooms.reduce(function (s, r) { return s + (r.users || 1); }, 0);
            vtot.textContent = W.rooms.length ? (totalU + ' canlı izleyici') : 'Canlı senkron';
        }
        paintActiveBar();
        var friendNames = S.friends.map(function (f) { return f.username; });
        var qv = (W.q || '').toLowerCase();
        var filtered = W.rooms.filter(function (r) {
            if (W.filter === 'open' && r.hasPw) return false;
            if (W.filter === 'friends') {
                var isFr = friendNames.indexOf(r.host) !== -1 || (r.members || []).some(function (m) { return friendNames.indexOf(m) !== -1; });
                if (!isFr) return false;
            }
            if (qv) {
                var hay = ((r.name || '') + ' ' + (r.animeTitle || '') + ' ' + (r.host || '')).toLowerCase();
                if (hay.indexOf(qv) === -1) return false;
            }
            return true;
        });
        if (!filtered.length) {
            box.innerHTML = '<div class="sv5-empty">' +
                '<strong>' + (W.rooms.length ? 'Filtreye uygun oda bulunamadı' : 'Şu an aktif izleme odası yok') + '</strong>' +
                '<span>' + (W.rooms.length ? 'Arama terimini veya filtreyi değiştirmeyi dene.' : 'Yeni bir oda kurarak arkadaşlarını davet edebilir ve eşzamanlı izlemeye başlayabilirsin.') + '</span>' +
                (!W.rooms.length ? '<div style="margin-top:14px"><button type="button" class="sv5-btn primary" data-wt="toggleform"><i class="fa-solid fa-plus"></i> İlk Odayı Kur</button></div>' : '') +
                '</div>';
            return;
        }
        var names = [];
        filtered.forEach(function (r) { names.push(r.host); (r.members || []).forEach(function (m) { names.push(m); }); });
        loadProfiles(names).then(function () { if (box.getAttribute('data-av') !== String(Object.keys(profCache).length)) { box.setAttribute('data-av', String(Object.keys(profCache).length)); paintRooms(box, filtered); } });
        paintRooms(box, filtered);
    }
    function paintRooms(box, list) {
        var rooms = list || W.rooms;
        var friendNames = S.friends.map(function (f) { return f.username; });
        box.innerHTML = rooms.map(function (r, i) {
            var mine = W.room && W.room.id === r.id;
            var fr = friendNames.indexOf(r.host) !== -1 || (r.members || []).some(function (m) { return friendNames.indexOf(m) !== -1; });
            var members = (r.members || []).slice(0, 4);
            return '<article class="wt5-card sv5-rise' + (mine ? ' mine' : fr ? ' friend' : '') + '" style="--i:' + Math.min(i, 8) + '">' +
                '<div class="wt5-cover">' + (r.animeImg ? '<img src="' + esc(r.animeImg) + '" alt="" loading="lazy" onerror="this.remove()">' : '<div class="wt5-cover-ph"><i class="fa-solid fa-tv"></i></div>') +
                '<span class="wt5-live"><i></i> CANLI</span><span class="wt5-viewers"><i class="fa-regular fa-user"></i> ' + (r.users || 1) + '</span>' +
                (r.hasPw ? '<span class="wt5-lock" title="Şifreli oda"><i class="fa-solid fa-lock"></i></span>' : '') +
                (fr && !mine ? '<span class="wt5-fbadge">Arkadaşın odada</span>' : '') +
                '</div>' +
                '<div class="wt5-info"><div class="wt5-info-top"><h4>' + esc(r.name) + '</h4></div>' +
                '<div class="wt5-anime">' + esc(r.animeTitle ? (r.animeTitle + (r.epLabel ? ' · ' + r.epLabel : '')) : 'Anime seçilmesi bekleniyor') + '</div>' +
                '<div class="wt5-foot"><div class="wt5-host">' + av(r.host, 24, false) + '<span>@' + esc(r.host) + '</span></div>' +
                '<div class="wt5-members">' + members.map(function (m) { return av(m, 22, false); }).join('') + '</div>' +
                (mine ? '<button type="button" class="sv5-btn sm" disabled>Odadasın</button>' : '<button type="button" class="sv5-btn primary sm" data-wt="join" data-room="' + esc(r.name) + '">Katıl</button>') + '</div></div>' +
                '</article>';
        }).join('');
    }
    function onLobbyClick(e) {
        var el = e.target.closest('[data-wt]'); if (!el) return;
        var a = el.getAttribute('data-wt');
        if (a === 'close') { if (typeof showHomeView === 'function') showHomeView(); else closeLobby(); }
        else if (a === 'refresh') { fetchDbRooms(); toast('Aktif odalar güncellendi'); }
        else if (a === 'toggleform') {
            var fm = $('#wt5Form');
            if (fm) {
                fm.classList.toggle('open');
                paintNow();
                if (fm.classList.contains('open')) setTimeout(function () { var n = $('#wt5Name'); if (n) n.focus(); }, 100);
            }
        }
        else if (a === 'preset') {
            var inp = $('#wt5Name');
            if (inp) { inp.value = el.getAttribute('data-v') || ''; inp.focus(); }
        }
        else if (a === 'wfilter') {
            W.filter = el.getAttribute('data-f') || 'all';
            $$('#wt5Filters [data-wt="wfilter"]').forEach(function (b) { b.classList.toggle('active', b === el); });
            renderRooms();
        }
        else if (a === 'ctl') { $$('#wt5Ctl button').forEach(function (b) { b.classList.toggle('active', b === el); }); }
        else if (a === 'create') createRoom();
        else if (a === 'join') joinRoomByName(el.getAttribute('data-room'));
        else if (a === 'joincode') joinFromCode();
        else if (a === 'pickanime') { if (typeof showAnimeListView === 'function') showAnimeListView(); }
        else if (a === 'gowatch') { if (typeof showWatchView === 'function') showWatchView(); }
        else if (a === 'copyroom') { if (W.room) { try { navigator.clipboard.writeText(W.room.name); toast('Oda adı kopyalandı: ' + W.room.name); } catch (_) {} } }
        else if (a === 'leaveroom') { leaveRoom(true); renderRooms(); }
    }
    function joinFromCode() { var v = ($('#wt5Code').value || '').trim(); if (!v) { toast('Oda adını yaz.'); return; } joinRoomByName(v); }

    async function getNick() {
        var n = me() || localStorage.getItem('w2gUsername') || '';
        if (n) return n;
        if (typeof Swal !== 'undefined') {
            var r = await Swal.fire({ title: 'Görünen adın', input: 'text', inputPlaceholder: 'Örn: GojoFan', inputAttributes: { maxlength: 20 }, showCancelButton: true, confirmButtonText: 'Devam', cancelButtonText: 'İptal', confirmButtonColor: '#10b981', background: '#12141f', color: '#fff' });
            n = r.isConfirmed ? String(r.value || '').trim() : '';
        } else n = (window.prompt('Görünen adın:') || '').trim();
        if (n) { n = n.slice(0, 20); try { localStorage.setItem('w2gUsername', n); } catch (_) {} }
        return n;
    }
    async function hashPw(name, pw) {
        if (!pw) return '';
        var s = 'anitr-w2g:' + name.toLowerCase() + ':' + pw;
        try {
            if (window.crypto && crypto.subtle) {
                var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
                return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
            }
        } catch (_) {}
        var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return 'x' + (h >>> 0).toString(16);
    }
    function curEpisode() {
        if (typeof currentAnime === 'undefined' || !currentAnime || !currentAnime.title) return null;
        var ep = (typeof currentEpisode !== 'undefined' && currentEpisode) ? currentEpisode : null;
        var sI = typeof currentSIdx === 'number' ? currentSIdx : 0, eI = typeof currentEIdx === 'number' ? currentEIdx : 0;
        return {
            id: currentAnime.id || '', slug: currentAnime.slug || '', isMovie: !!currentAnime.isMovie, title: currentAnime.title,
            synopsis: currentAnime.synopsis || '', img: currentAnime.img || '', sIdx: sI, eIdx: eI,
            source: typeof currentSource !== 'undefined' ? currentSource : '',
            label: currentAnime.isMovie ? 'Film' : ((sI + 1) + '. Sezon ' + ((ep && ep.Number) || (eI + 1)) + '. Bölüm')
        };
    }
    function epKey(p) { return p ? [p.id || p.slug, p.sIdx, p.eIdx].join('_') : ''; }
    function lobbyMeta() {
        var R = W.room, ep = R.ep || curEpisode() || {};
        return {
            t: 'room', id: R.id, name: R.name, host: R.host, hasPw: !!R.pw, pw: R.pw, control: R.control, at: R.createdAt,
            animeTitle: ep.title || '', animeImg: ep.img || '', animeId: ep.id || '', animeSlug: ep.slug || '', isMovie: !!ep.isMovie, epLabel: ep.label || '',
            users: Object.keys(R.members).length || 1, members: Object.keys(R.members).slice(0, 8)
        };
    }
    function pushLobbyMeta() {
        if (!W.room || !W.room.isHost) return;
        if (W.lobby) { try { W.lobby.track(lobbyMeta()); } catch (_) {} }
        syncRoomToDb();
    }

    async function createRoom() {
        var c = sb(); if (!c) { toast('Supabase bağlantısı yok.'); return; }
        if (W.room) { toast('Zaten bir odadasın. Önce ayrıl.'); return; }
        var name = ($('#wt5Name').value || '').trim();
        var id = asciiSlug(name);
        if (name.length < 3 || !id) { toast('Oda adı en az 3 karakter olmalı.'); return; }
        var pwPlain = $('#wt5Pw').value;
        var nick = await getNick(); if (!nick) return;
        await ensureLobby();
        if (W.rooms.some(function (r) { return r.id === id; })) { toast('Bu isimde aktif bir oda zaten var.'); return; }
        var ctl = ($('#wt5Ctl .active') || {}).getAttribute ? $('#wt5Ctl .active').getAttribute('data-v') : 'all';
        var pw = await hashPw(name, pwPlain);
        W.pwPlain = pwPlain || '';
        await enterRoom({ id: id, name: name, host: nick, pw: pw, control: ctl, createdAt: Date.now() }, nick, true);
        var fm = $('#wt5Form'); if (fm) fm.classList.remove('open');
        var hasEp = !!curEpisode();
        toast(hasEp ? 'Oda kuruldu. Arkadaşlarını davet edebilirsin.' : 'Oda hazır. Katalogdan bir bölüm açtığında herkes seninle izler.', 4200);
        if (hasEp) {
            if (typeof showWatchView === 'function') showWatchView();
            announceEpisode(true);
        } else {
            paintActiveBar();
            renderRooms();
        }
    }
    async function joinRoomByName(name, pwTry) {
        if (!name) return;
        if (W.room) { toast('Zaten bir odadasın. Önce ayrıl.'); return; }
        closeHub();
        var lb = await ensureLobby();
        var id = asciiSlug(name);
        var meta = W.rooms.filter(function (r) { return r.id === id; })[0];
        if (!meta) { await new Promise(function (r) { setTimeout(r, 900); }); meta = W.rooms.filter(function (r) { return r.id === id; })[0]; }
        if (!meta) { toast('Bu isimde aktif bir oda bulunamadı.'); if (!$('#wt5.open')) openLobby(); return; }
        if (meta.hasPw) {
            var pw = pwTry;
            if (!pw) {
                if (typeof Swal !== 'undefined') {
                    var r = await Swal.fire({ title: meta.name, text: 'Bu oda şifreli.', input: 'password', inputPlaceholder: 'Oda şifresi', showCancelButton: true, confirmButtonText: 'Katıl', cancelButtonText: 'İptal', confirmButtonColor: '#8b5cf6', background: '#12141f', color: '#fff' });
                    pw = r.isConfirmed ? r.value : null;
                } else pw = window.prompt('Oda şifresi:');
                if (pw == null) return;
            }
            var h = await hashPw(meta.name, pw);
            if (h !== meta.pw) { toast('Şifre yanlış.'); return; }
        }
        var nick = await getNick(); if (!nick) return;
        await enterRoom({ id: meta.id, name: meta.name, host: meta.host, pw: meta.pw, control: meta.control || 'all', createdAt: meta.at }, nick, false);
        toast(meta.name + ' odasına katıldın.');
        if (meta.animeTitle || curEpisode()) {
            if (typeof showWatchView === 'function') showWatchView();
        } else {
            paintActiveBar();
            renderRooms();
        }
    }

    /* — Oda kanalı — */
    async function enterRoom(base, nick, isHost) {
        var c = sb();
        var R = W.room = {
            id: base.id, name: base.name, host: base.host, pw: base.pw, control: base.control, createdAt: base.createdAt,
            nick: nick, isHost: isHost, members: {}, ch: null, joinTs: Date.now(), follow: true, chat: [], ep: null
        };
        W.unread = 0; W.lastEp = '';
        R.ch = c.channel('anitr-w2g-room-' + R.id, { config: { broadcast: { self: false }, presence: { key: nick + '#' + RID } } });
        R.ch.on('presence', { event: 'sync' }, onRoomSync)
            .on('presence', { event: 'join' }, function (p) { (p.newPresences || []).forEach(function (m) { if (m.user && m.user !== R.nick && Date.now() - R.joinTs > 2500) sysMsg(m.user + ' odaya katıldı'); }); })
            .on('presence', { event: 'leave' }, function (p) { (p.leftPresences || []).forEach(function (m) { if (m.user && m.user !== R.nick) sysMsg(m.user + ' ayrıldı'); }); })
            .on('broadcast', { event: 'hello' }, function (m) { onHello(m.payload || {}); })
            .on('broadcast', { event: 'state' }, function (m) { onState(m.payload || {}); })
            .on('broadcast', { event: 'play' }, function (m) { onRemote('play', m.payload || {}); })
            .on('broadcast', { event: 'pause' }, function (m) { onRemote('pause', m.payload || {}); })
            .on('broadcast', { event: 'seek' }, function (m) { onRemote('seek', m.payload || {}); })
            .on('broadcast', { event: 'tick' }, function (m) { onTick(m.payload || {}); })
            .on('broadcast', { event: 'episode' }, function (m) { onEpisode(m.payload || {}); })
            .on('broadcast', { event: 'chat' }, function (m) { onChat(m.payload || {}); })
            .on('broadcast', { event: 'react' }, function (m) { onReact(m.payload || {}); });
        await new Promise(function (res) {
            R.ch.subscribe(function (s) {
                if (s === 'SUBSCRIBED') { R.ch.track({ user: nick, joinedAt: Date.now() }); res(); }
                else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { toast('Oda bağlantısı kurulamadı.'); res(); }
            });
            setTimeout(res, 7000);
        });
        R.members[nick] = { joinedAt: Date.now() };
        buildDock(); paintDock();
        sysMsg(isHost ? 'Oda kuruldu. Kodu paylaş: ' + R.name : 'Odaya bağlandın');
        if (isHost) {
            await ensureLobby();
            pushLobbyMeta();
            if (W.hbTimer) clearInterval(W.hbTimer);
            W.hbTimer = setInterval(function () { if (W.room && W.room.isHost) syncRoomToDb(); }, 25000);
        }
        else sendRoom('hello', { user: nick });
        startTick();
        setW2gButtons(true);
        if (typeof showToast === 'function') { /* noop */ }
    }
    function sendRoom(event, payload) {
        if (!W.room || !W.room.ch) return;
        try { W.room.ch.send({ type: 'broadcast', event: event, payload: payload }); } catch (_) {}
    }
    function onRoomSync() {
        var R = W.room; if (!R) return;
        var st = R.ch.presenceState(), members = {};
        Object.keys(st).forEach(function (k) { st[k].forEach(function (m) { if (m.user) members[m.user] = { joinedAt: m.joinedAt || 0 }; }); });
        R.members = members;
        // host seçimi
        var names = Object.keys(members);
        if (names.length && Date.now() - R.joinTs > 4500 && names.indexOf(R.host) === -1) {
            names.sort(function (a, b) { return members[a].joinedAt - members[b].joinedAt; });
            R.host = names[0];
            R.isHost = R.host === R.nick;
            sysMsg(R.isHost ? 'Artık odanın host\'usun 👑' : '@' + R.host + ' yeni host oldu');
            if (R.isHost) {
                ensureLobby().then(pushLobbyMeta);
                if (W.hbTimer) clearInterval(W.hbTimer);
                W.hbTimer = setInterval(function () { if (W.room && W.room.isHost) syncRoomToDb(); }, 25000);
            }
        }
        if (R.isHost) pushLobbyMeta();
        paintDock();
    }
    function onHello(p) {
        var R = W.room; if (!R || !R.isHost) return;
        var v = vid();
        sendRoom('state', {
            from: R.nick, to: p.user, ep: curEpisode(), t: v ? v.currentTime : 0, paused: v ? v.paused : true,
            chat: R.chat.slice(-30), control: R.control
        });
    }
    function onState(p) {
        var R = W.room; if (!R || R.isHost || p.from !== R.host) return;
        if (p.to && p.to !== R.nick) return;
        if (p.control) R.control = p.control;
        if (p.chat && !R.chat.length) { p.chat.forEach(function (m) { R.chat.push(m); }); renderMsgs(); }
        if (p.ep) { R.ep = p.ep; W.pendingSeek = { t: p.t || 0, paused: !!p.paused }; if (R.follow) followEpisode(p.ep); }
        else if (p.ep == null && vid() && typeof p.t === 'number') applySync(p.t, p.paused);
        paintDock();
    }
    function onRemote(kind, p) {
        var R = W.room; if (!R || p.user === R.nick) return;
        var v = vid(); if (!v) return;
        W.applying = Date.now() + 900;
        try {
            if (typeof p.t === 'number' && Math.abs(v.currentTime - p.t) > 0.9) v.currentTime = p.t;
            if (kind === 'play') { var pr = v.play(); if (pr && pr.catch) pr.catch(function () { toast('▶ Oynatmak için sayfaya bir kez tıkla.'); }); }
            else if (kind === 'pause') v.pause();
        } catch (_) {}
        if (kind !== 'seek') sysMsg('@' + p.user + (kind === 'play' ? ' oynattı ▶' : ' durdurdu ⏸'));
    }
    function applySync(t, paused) {
        var v = vid(); if (!v) return;
        W.applying = Date.now() + 900;
        try {
            if (Math.abs(v.currentTime - t) > 0.9) v.currentTime = t;
            if (paused && !v.paused) v.pause();
            else if (!paused && v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
        } catch (_) {}
    }
    function onTick(p) {
        var R = W.room; if (!R || R.isHost || p.from !== R.host) return;
        var v = vid(); if (!v || v.readyState < 2) return;
        if (R.ep && p.key && epKey(R.ep) !== p.key) return;
        var target = p.t + (p.paused ? 0 : Math.max(0, (Date.now() - p.ts) / 1000));
        if (Math.abs(v.currentTime - target) > 2.6 || v.paused !== !!p.paused) applySync(target, p.paused);
    }
    function startTick() {
        stopTick();
        W.tickTimer = setInterval(function () {
            var R = W.room; if (!R || !R.isHost) return;
            var v = vid(); if (!v || v.readyState < 1) return;
            sendRoom('tick', { from: R.nick, t: v.currentTime, paused: v.paused, ts: Date.now(), key: epKey(curEpisode()) });
        }, 4000);
    }
    function stopTick() { if (W.tickTimer) { clearInterval(W.tickTimer); W.tickTimer = null; } }

    function vid() { return document.querySelector('.video-container-page video'); }
    function mediaEvent(kind) {
        return function (e) {
            var R = W.room;
            if (!R || !e.target || e.target.tagName !== 'VIDEO' || !e.target.closest('.video-container-page')) return;
            if (Date.now() < W.applying) return;
            if (R.control === 'host' && !R.isHost) return;
            var v = e.target;
            sendRoom(kind, { user: R.nick, t: v.currentTime });
            if (kind !== 'seek') sysMsg('Sen ' + (kind === 'play' ? 'oynattın ▶' : 'durdurdun ⏸'));
        };
    }
    document.addEventListener('play', mediaEvent('play'), true);
    document.addEventListener('pause', function (e) { var v = e.target; if (v && v.ended) return; mediaEvent('pause')(e); }, true);
    document.addEventListener('seeked', mediaEvent('seek'), true);
    function onMeta(e) {
        var t = e.target;
        if (!t || t.tagName !== 'VIDEO' || !W.pendingSeek || !t.closest('.video-container-page')) return;
        var ps = W.pendingSeek; W.pendingSeek = null;
        applySync(ps.t, ps.paused);
    }
    document.addEventListener('loadedmetadata', onMeta, true);

    function followEpisode(p) {
        if (!p || !p.title) return;
        var cur = curEpisode();
        if (cur && epKey(cur) === epKey(p)) { if (W.pendingSeek) { var ps = W.pendingSeek; W.pendingSeek = null; applySync(ps.t, ps.paused); } return; }
        W.following = Date.now() + 9000; W.lastEp = epKey(p);
        try {
            if (p.source && typeof VALID_SOURCES !== 'undefined' && VALID_SOURCES.indexOf(p.source) !== -1 && p.source !== currentSource) {
                currentSource = p.source;
                currentSourceKey = currentSource.replace(/\s+/g, '_');
                currentSourceHistoryKey = 'anitr_history_' + currentSourceKey;
                currentSourcePositionsKey = 'anitr_positions_' + currentSourceKey;
            }
        } catch (_) {}
        toast('🎬 ' + p.title + (p.label ? ' · ' + p.label : '') + ' açılıyor...', 3200);
        window._resumeWatchHistory = { id: p.id, slug: p.slug, isMovie: p.isMovie, title: p.title, synopsis: p.synopsis, img: p.img, sIdx: p.sIdx, eIdx: p.eIdx };
        if (typeof quickPlay === 'function') quickPlay(p.id, p.slug, p.isMovie, p.title, p.synopsis, p.img);
    }
    function onEpisode(p) {
        var R = W.room; if (!R || p.user === R.nick) return;
        R.ep = p.ep;
        if (R.isHost) pushLobbyMeta(); // yeni host da güncel meta'yı yaysın
        sysMsg('@' + p.user + ' bölümü değiştirdi: ' + (p.ep.title || '') + ' · ' + (p.ep.label || ''));
        if (R.follow) { W.pendingSeek = { t: 0, paused: false }; followEpisode(p.ep); }
        paintDock();
    }
    function announceEpisode(force) {
        var R = W.room; if (!R) return;
        if (R.control === 'host' && !R.isHost) return;
        var ep = curEpisode(); if (!ep) return;
        var key = epKey(ep);
        if (!force && (key === W.lastEp || Date.now() < W.following)) { return; }
        W.lastEp = key; R.ep = ep;
        sendRoom('episode', { user: R.nick, ep: ep });
        if (R.isHost) pushLobbyMeta();
        paintDock();
    }
    // watchEpisode'u sar: host (veya serbest kontrol) bölüm değiştirince herkese duyur
    (function () {
        var orig = window.watchEpisode;
        if (typeof orig !== 'function') return;
        window.watchEpisode = function () {
            var r = orig.apply(this, arguments);
            if (W.room) setTimeout(function () { announceEpisode(false); }, 1500);
            return r;
        };
    })();

    /* — Sohbet & tepkiler — */
    function sysMsg(text) { pushMsg({ sys: true, text: text, ts: Date.now() }); }
    function pushMsg(m) {
        var R = W.room; if (!R) return;
        R.chat.push(m); if (R.chat.length > 200) R.chat.shift();
        renderMsgs();
        if (!m.sys && m.user !== R.nick && $('#wtDock') && $('#wtDock').classList.contains('min')) {
            W.unread++; $('#wtDock').classList.add('has-unread'); $('#wtdBadge').textContent = W.unread;
        }
    }
    function onChat(p) { var R = W.room; if (!R || p.user === R.nick) return; pushMsg({ user: p.user, text: String(p.text || '').slice(0, 300), ts: p.ts || Date.now() }); }
    function sendRoomChat() {
        var R = W.room, inp = $('#wtdInput'); if (!R || !inp) return;
        var text = inp.value.trim(); if (!text) return;
        inp.value = '';
        var m = { user: R.nick, text: text, ts: Date.now() };
        pushMsg(m);
        sendRoom('chat', m);
    }
    function onReact(p) { var R = W.room; if (!R || p.user === R.nick) return; floatEmoji(p.emoji, p.user); }
    function sendReact(emoji) {
        var R = W.room; if (!R) return;
        floatEmoji(emoji, 'Sen');
        sendRoom('react', { user: R.nick, emoji: emoji });
    }
    function floatEmoji(emoji, who) {
        var host = document.querySelector('.video-container-page');
        var rect = host && !$('#watchView').classList.contains('hidden') ? host.getBoundingClientRect() : { left: window.innerWidth * 0.3, width: window.innerWidth * 0.4, bottom: window.innerHeight - 80 };
        var el = document.createElement('div');
        el.className = 'wt5-float';
        el.innerHTML = esc(emoji) + '<small>' + esc(who) + '</small>';
        el.style.left = (rect.left + 40 + Math.random() * Math.max(60, rect.width - 120)) + 'px';
        el.style.top = Math.max(140, rect.bottom - 90) + 'px';
        el.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 2700);
    }

    /* — Dock — */
    function buildDock() {
        if ($('#wtDock')) return;
        var d = document.createElement('div');
        d.id = 'wtDock';
        d.innerHTML =
            '<div class="wtd-head" data-wt="toggle"><span class="live"></span><div class="wtd-title"><b id="wtdName"></b><small id="wtdSub"></small></div>' +
              '<button class="wtd-hbtn" data-wt="invite" title="Arkadaş davet et"><i class="fa-solid fa-user-plus"></i></button>' +
              '<button class="wtd-hbtn" data-wt="min" title="Küçült"><i class="fa-solid fa-chevron-down" id="wtdMinIc"></i></button>' +
              '<button class="wtd-hbtn leave" data-wt="leave" title="Odadan ayrıl"><i class="fa-solid fa-right-from-bracket"></i></button><span class="wtd-badge" id="wtdBadge">0</span></div>' +
            '<div class="wtd-panel"><div class="wtd-people" id="wtdPeople"></div><div class="wtd-msgs" id="wtdMsgs"></div>' +
              '<div class="wtd-react">' + REACTS.map(function (r) { return '<button data-wt="react" data-e="' + r + '">' + r + '</button>'; }).join('') + '</div>' +
              '<div class="wtd-input"><input id="wtdInput" placeholder="Mesaj yaz..." maxlength="300" autocomplete="off"><button data-wt="send"><i class="fa-solid fa-paper-plane"></i></button></div>' +
              '<div class="wtd-tools"><button data-wt="copy" title="Oda adını kopyala"><i class="fa-regular fa-copy"></i> Kopyala</button>' +
                '<button data-wt="follow" id="wtdFollow" class="on"><i class="fa-solid fa-link"></i> Takip</button>' +
                '<button data-wt="sync"><i class="fa-solid fa-rotate"></i> Eşitle</button></div></div>';
        document.body.appendChild(d);
        d.addEventListener('click', onDockClick);
        d.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'wtdInput') { e.preventDefault(); sendRoomChat(); } });
    }
    function paintDock() {
        var R = W.room, d = $('#wtDock'); if (!R || !d) return;
        d.classList.add('on');
        $('#wtdName').textContent = R.name;
        var n = Object.keys(R.members).length || 1;
        $('#wtdSub').innerHTML = (R.isHost ? '<span class="role">👑 Host</span>' : 'Host: @' + esc(R.host)) + ' · ' + n + ' kişi' + (R.control === 'host' ? ' · kontrol: host' : '');
        var names = Object.keys(R.members).sort(function (a, b) { return (a === R.host ? -1 : b === R.host ? 1 : 0); });
        loadProfiles(names);
        $('#wtdPeople').innerHTML = names.slice(0, 9).map(function (m) {
            return '<span title="' + esc(m) + '">' + av(m, 28, false).replace('class="sv5-avatar"', 'class="sv5-avatar' + (m === R.host ? ' host' : '') + (m === R.nick ? ' me' : '') + '"') + '</span>';
        }).join('') + (names.length > 9 ? '<span class="more">+' + (names.length - 9) + '</span>' : '');
        var f = $('#wtdFollow'); if (f) f.classList.toggle('on', R.follow);
        renderMsgs();
        var ind = $('#w2gIndicator'), disp = $('#w2gRoomIdDisp');
        if (disp) disp.textContent = R.name;
        if (ind) ind.classList.remove('hidden');
    }
    function renderMsgs() {
        var R = W.room, box = $('#wtdMsgs'); if (!R || !box) return;
        var near = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        box.innerHTML = R.chat.slice(-60).map(function (m) {
            if (m.sys) return '<div class="wtd-msg sys">' + esc(m.text) + '</div>';
            return '<div class="wtd-msg' + (m.user === R.nick ? ' me' : '') + '" style="--u:hsl(' + hue(m.user) + ' 80% 76%)"><b>' + esc(m.user) + '</b>' + esc(m.text) + '</div>';
        }).join('');
        if (near) box.scrollTop = box.scrollHeight;
    }
    function onDockClick(e) {
        var el = e.target.closest('[data-wt]'); if (!el) return;
        var a = el.getAttribute('data-wt'), R = W.room, d = $('#wtDock');
        if (a === 'toggle' && e.target.closest('.wtd-hbtn')) return;
        if (a === 'toggle' || a === 'min') {
            d.classList.toggle('min');
            if (!d.classList.contains('min')) { W.unread = 0; d.classList.remove('has-unread'); var b = $('#wtdBadge'); if (b) b.textContent = '0'; setTimeout(function () { var m = $('#wtdMsgs'); if (m) m.scrollTop = m.scrollHeight; }, 30); }
            var ic = $('#wtdMinIc'); if (ic) ic.className = 'fa-solid ' + (d.classList.contains('min') ? 'fa-chevron-up' : 'fa-chevron-down');
        }
        else if (a === 'leave') leaveRoom(true);
        else if (a === 'send') sendRoomChat();
        else if (a === 'react') sendReact(el.getAttribute('data-e'));
        else if (a === 'copy') { try { navigator.clipboard.writeText(R.name); toast('📋 Oda adı kopyalandı: ' + R.name); } catch (_) { toast('Oda adı: ' + R.name); } }
        else if (a === 'follow') { R.follow = !R.follow; paintDock(); toast(R.follow ? '🔗 Host\'u takip ediyorsun' : 'Takip kapalı — bölümü kendin seçersin'); if (R.follow && !R.isHost) sendRoom('hello', { user: R.nick }); }
        else if (a === 'sync') { if (R.isHost) { var v = vid(); if (v) sendRoom('tick', { from: R.nick, t: v.currentTime, paused: v.paused, ts: Date.now(), key: epKey(curEpisode()) }); toast('📡 Herkes seninle eşitlendi'); } else { sendRoom('hello', { user: R.nick }); toast('🔄 Host ile eşitleniyor...'); } }
        else if (a === 'invite') invitePicker();
    }
    async function invitePicker() {
        if (!me()) { toast('Davet için giriş yapmalısın.'); return; }
        await loadRelations();
        await loadProfiles(S.friends.map(function (f) { return f.username; }));
        var list = S.friends.slice().sort(function (a, b) { var w = { watch: 0, on: 1, '': 2 }; return w[status(a.username)] - w[status(b.username)]; });
        if (!list.length) { toast('Henüz arkadaşın yok.'); return; }
        if (typeof Swal === 'undefined') return;
        var html = '<div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto;text-align:left">' + list.map(function (f) {
            return '<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;background:rgba(255,255,255,.04)">' + av(f.username, 34, true) +
                '<div style="flex:1;min-width:0"><b style="font-size:13px">@' + esc(f.username) + '</b></div><button class="sv5-btn green sm" data-inv="' + esc(f.username) + '">Davet et</button></div>';
        }).join('') + '</div>';
        Swal.fire({
            title: 'Arkadaşını davet et', html: html, showConfirmButton: false, showCloseButton: true, background: '#12141f', color: '#fff',
            didOpen: function (pop) {
                pop.addEventListener('click', function (ev) {
                    var b = ev.target.closest('[data-inv]'); if (!b) return;
                    sendRoomInvite(b.getAttribute('data-inv'));
                    b.textContent = 'Gönderildi ✓'; b.setAttribute('disabled', '1');
                });
            }
        });
    }
    async function sendRoomInvite(u) {
        var R = W.room; if (!R) { toast('Önce bir odaya katıl veya oda kur.'); return; }
        await sendDm('🎬 Birlikte izleyelim! [[W2G:' + R.name + '|' + (W.pwPlain || '') + ']]', u);
        toast('📨 @' + u + ' davet edildi');
    }
    async function leaveRoom(manual) {
        var R = W.room; if (!R) return;
        stopTick();
        if (W.hbTimer) { clearInterval(W.hbTimer); W.hbTimer = null; }
        var rid = R.id, wasHost = R.isHost;
        W.room = null; W.pendingSeek = null; W.pwPlain = '';
        var d = $('#wtDock'); if (d) { d.classList.remove('on'); }
        setW2gButtons(false);
        var ind = $('#w2gIndicator'); if (ind) ind.classList.add('hidden');
        try { if (wasHost) { if (W.lobby) await W.lobby.untrack(); await removeRoomFromDb(rid); fetchDbRooms(); } } catch (_) {}
        try { await R.ch.untrack(); } catch (_) {}
        try { sb().removeChannel(R.ch); } catch (_) {}
        if (manual) toast('Odadan ayrıldın.');
        if (S.tab === 'friends' && $('#sv5.open') && me()) renderFriends();
    }
    window.addEventListener('pagehide', function () {
        if (W.room && W.room.isHost) removeRoomFromDb(W.room.id);
    });
    function setW2gButtons(inRoom) {
        ['w2gCreateBtn', 'w2gJoinBtn'].forEach(function (id) { var b = document.getElementById(id); if (b) b.style.display = inRoom ? 'none' : ''; });
    }

    /* ============================================================
       Kaldığın Yerden Devam Et — yön okları
       ============================================================ */
    function cwUpdate() {
        var c = $('#cwContainer');
        if (!c) return;
        var can = c.scrollWidth - c.clientWidth > 6;
        var offL = !can || c.scrollLeft <= 4;
        var offR = !can || c.scrollLeft + c.clientWidth >= c.scrollWidth - 4;
        ['cwArrowLeft', 'cwHeadPrev'].forEach(function (id) { var b = document.getElementById(id); if (b) b.classList.toggle('is-off', offL); });
        ['cwArrowRight', 'cwHeadNext'].forEach(function (id) { var b = document.getElementById(id); if (b) b.classList.toggle('is-off', offR); });
    }
    window.cwScrollRail = function (dir) {
        var c = $('#cwContainer'); if (!c) return;
        var slot = c.querySelector('.cw-slot');
        var w = (slot ? slot.offsetWidth : 312) + 16;
        var perPage = Math.max(1, Math.floor(c.clientWidth / w));
        c.scrollBy({ left: dir * w * Math.max(1, perPage - 1 || 1), behavior: 'smooth' });
        setTimeout(cwUpdate, 420);
    };
    (function initCw() {
        var c = $('#cwContainer'), sec = $('#continueWatching');
        if (!c) return;
        c.addEventListener('scroll', cwUpdate, { passive: true });
        window.addEventListener('resize', cwUpdate);
        if (window.ResizeObserver) new ResizeObserver(cwUpdate).observe(c);
        if (window.MutationObserver) {
            new MutationObserver(function () { requestAnimationFrame(cwUpdate); setTimeout(cwUpdate, 350); }).observe(c, { childList: true });
            if (sec) new MutationObserver(function () { requestAnimationFrame(cwUpdate); setTimeout(cwUpdate, 200); }).observe(sec, { attributes: true, attributeFilter: ['class', 'style'] });
        }
        cwUpdate();
        setTimeout(cwUpdate, 900);
        setTimeout(cwUpdate, 2400);
    })();

    /* ============================================================
       Dış API — eski çağrıları yeni sisteme yönlendir
       ============================================================ */
    window.showFriendsModal = function () { openHub('feed'); };
    window.closeFriendsModal = closeHub;
    window.showSocialView = function () { openHub(S.tab || 'feed'); };
    window.switchSocialTab = function (t) {
        if (t === 'search') t = 'discover';
        if (t === 'messages') t = 'chat';
        if (t === 'stats' || t === 'goal') t = 'pulse';
        if (['feed', 'friends', 'chat', 'discover', 'pulse', 'requests'].indexOf(t) === -1) t = 'feed';
        if ($('#sv5.open')) switchTab(t); else openHub(t);
    };
    window.openIntegratedChat = window.openSocialChat = function (u) { openHub('chat'); setTimeout(function () { openThread(u); }, 60); };
    window.sendFriendRequest = addFriend;
    window.addSocialFriend = addFriend;
    window.closeChatModal = function () {};
    window.loadSocialFriends = loadRelations;
    window.loadSocialFeed = loadFeed;
    window.showOnlineRooms = function () { openLobby(); };
    window.loadOnlineRooms = function () { fetchDbRooms(); renderRooms(); };
    window.openW2GModal = function (type) { openLobby(type === 'create' ? { create: true } : undefined); };
    window.closeW2GModal = closeLobby;
    window.handleW2GAction = function () {};
    window.sendW2GMessage = sendRoomChat;
    window.leaveW2GRoom = function (arg) { if (arg === 'force') return leaveRoom(false); /* sayfa değişimlerinde odadan çıkma */ };
    window.wt5Leave = function () { return leaveRoom(true); };
    window.__sv5 = { S: S, W: W, openHub: openHub, openLobby: openLobby, createRoom: createRoom, cwUpdate: cwUpdate };

    /* ───────────── Başlangıç ───────────── */
    function boot() {
        setTimeout(function () {
            if (!sb()) return;
            initRealtime();
            ensureLobby();
            if (me()) loadRelations().then(loadInbox);
        }, 650);
        setInterval(function () { if (sb() && !$('#sv5.open') && me()) loadInbox(); }, 60000);
        setInterval(function () { if (sb() && ($('#wt5.open') || $('#sv5.open') || W.rooms.length)) fetchDbRooms(); }, 25000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
