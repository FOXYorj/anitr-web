const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const dbFolder = './.data';
if (!fs.existsSync(dbFolder)) fs.mkdirSync(dbFolder);
const db = new sqlite3.Database(`${dbFolder}/anitr.sqlite`);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        token TEXT UNIQUE,
        avatar TEXT DEFAULT 'https://placehold.co/150x150/1a1a28/8b5cf6?text=U',
        bio TEXT DEFAULT 'Anime izlemeyi seviyorum.',
        current_anime TEXT DEFAULT '',
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        friend_id INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, friend_id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        receiver_id INTEGER,
        message TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const respond = (res, status, message, extra = {}) => res.json({ status, message, ...extra });

app.post('/api', async (req, res) => {
    const action = req.query.action || req.body.action;
    const data = req.body;
    
    try {
        if (action === 'register') {
            const { username, password } = data;
            db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, row) => {
                if (row) return respond(res, 'error', 'Bu kullanıcı adı zaten alınmış.');
                
                const hash = bcrypt.hashSync(password, 8);
                const token = uuidv4().replace(/-/g, '');
                
                db.run(`INSERT INTO users (username, password, token) VALUES (?, ?, ?)`, [username, hash, token], function(err) {
                    if (err) return respond(res, 'error', 'Kayıt başarısız.');
                    respond(res, 'success', 'Kayıt başarılı! Giriş yapabilirsiniz.');
                });
            });
            return;
        }

        if (action === 'login') {
            const { username, password } = data;
            db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
                if (!user || !bcrypt.compareSync(password, user.password)) {
                    return respond(res, 'error', 'Kullanıcı adı veya şifre hatalı.');
                }
                respond(res, 'success', 'Giriş başarılı.', { 
                    user: { id: user.id, username: user.username, token: user.token, avatar: user.avatar, bio: user.bio }
                });
            });
            return;
        }

        const token = req.query.token || req.body.token;
        if (!token) return respond(res, 'error', 'Oturum açmanız veya geçerli bir Key kullanmanız gerekiyor.');

        db.get(`SELECT * FROM users WHERE token = ?`, [token], (err, currentUser) => {
            if (!currentUser) return respond(res, 'error', 'Geçersiz Token/Key.');
            const user_id = currentUser.id;

            if (action === 'heartbeat') {
                const current = data.current_anime || '';
                db.run(`UPDATE users SET last_seen=CURRENT_TIMESTAMP, current_anime=? WHERE id=?`, [current, user_id]);
                return respond(res, 'success', 'Güncellendi');
            }

            if (action === 'profile') {
                const target_id = data.target_id || user_id;
                db.get(`SELECT id, username, avatar, bio, current_anime, last_seen FROM users WHERE id=?`, [target_id], (err, user) => {
                    if (user) respond(res, 'success', 'Profil', { profile: user });
                    else respond(res, 'error', 'Profil bulunamadı');
                });
                return;
            }

            if (action === 'update_profile') {
                db.run(`UPDATE users SET avatar=?, bio=? WHERE id=?`, [data.avatar, data.bio, user_id], () => {
                    respond(res, 'success', 'Profil güncellendi.');
                });
                return;
            }

            if (action === 'search') {
                const q = req.query.q || '';
                db.all(`SELECT id, username, avatar FROM users WHERE username LIKE ? AND id != ? LIMIT 10`, [`%${q}%`, user_id], (err, users) => {
                    respond(res, 'success', 'Sonuçlar', { users: users || [] });
                });
                return;
            }

            if (action === 'add_friend') {
                const target_id = data.target_id;
                db.get(`SELECT id FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)`, 
                    [user_id, target_id, target_id, user_id], (err, existing) => {
                    if (existing) return respond(res, 'error', 'Zaten istek gönderilmiş veya arkadaşsınız.');
                    db.run(`INSERT INTO friends (user_id, friend_id) VALUES (?, ?)`, [user_id, target_id], () => {
                        respond(res, 'success', 'Arkadaşlık isteği gönderildi!');
                    });
                });
                return;
            }

            if (action === 'get_friends') {
                db.all(`SELECT u.id, u.username, u.avatar, u.last_seen, u.current_anime 
                        FROM friends f JOIN users u ON (u.id = f.friend_id OR u.id = f.user_id) 
                        WHERE (f.user_id=? OR f.friend_id=?) AND f.status='accepted' AND u.id != ?`, 
                        [user_id, user_id, user_id], (err, friends) => {
                    
                    db.all(`SELECT f.id as request_id, u.id as user_id, u.username, u.avatar 
                            FROM friends f JOIN users u ON u.id = f.user_id 
                            WHERE f.friend_id=? AND f.status='pending'`, [user_id], (err, requests) => {
                        respond(res, 'success', 'Veriler', { friends: friends || [], requests: requests || [] });
                    });
                });
                return;
            }

            if (action === 'handle_request') {
                const { request_id, status } = data;
                if (status === 'accept') {
                    db.run(`UPDATE friends SET status='accepted' WHERE id=? AND friend_id=?`, [request_id, user_id]);
                    respond(res, 'success', 'Kabul edildi.');
                } else {
                    db.run(`DELETE FROM friends WHERE id=? AND friend_id=?`, [request_id, user_id]);
                    respond(res, 'success', 'Reddedildi.');
                }
                return;
            }

            if (action === 'send_message') {
                db.run(`INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)`, 
                    [user_id, data.receiver_id, data.message], () => {
                    respond(res, 'success', 'Gönderildi');
                });
                return;
            }

            if (action === 'get_messages') {
                const friend_id = req.query.friend_id;
                db.run(`UPDATE messages SET is_read=1 WHERE sender_id=? AND receiver_id=?`, [friend_id, user_id]);
                db.all(`SELECT * FROM messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) ORDER BY created_at ASC LIMIT 50`,
                    [user_id, friend_id, friend_id, user_id], (err, msgs) => {
                    respond(res, 'success', 'Mesajlar', { messages: msgs || [] });
                });
                return;
            }

            respond(res, 'error', 'Geçersiz işlem');
        });
        
    } catch(err) {
        respond(res, 'error', 'Sunucu Hatası: ' + err.message);
    }
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Anitr Social API is running on port ' + listener.address().port);
});
