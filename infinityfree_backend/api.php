<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') { exit(0); }

require_once 'config.php';

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents('php://input'), true);

function respond($status, $message, $extra = []) {
    echo json_encode(array_merge(['status' => $status, 'message' => $message], $extra));
    exit;
}

// 1. REGISTER
if ($action == 'register') {
    $username = $conn->real_escape_string($data['username']);
    $password = password_hash($data['password'], PASSWORD_DEFAULT);
    
    $check = $conn->query("SELECT id FROM users WHERE username='$username'");
    if($check->num_rows > 0) respond('error', 'Bu kullanıcı adı zaten alınmış.');
    
    if($conn->query("INSERT INTO users (username, password) VALUES ('$username', '$password')")) {
        respond('success', 'Kayıt başarılı! Giriş yapabilirsiniz.');
    } else {
        respond('error', 'Kayıt başarısız.');
    }
}

// 2. LOGIN
if ($action == 'login') {
    $username = $conn->real_escape_string($data['username']);
    $password = $data['password'];
    
    $res = $conn->query("SELECT * FROM users WHERE username='$username'");
    if ($res->num_rows > 0) {
        $user = $res->fetch_assoc();
        if (password_verify($password, $user['password'])) {
            respond('success', 'Giriş başarılı', ['user_id' => $user['id'], 'username' => $user['username']]);
        }
    }
    respond('error', 'Kullanıcı adı veya şifre hatalı.');
}

// Güvenlik: Token Doğrulama
$token = $conn->real_escape_string($_GET['token'] ?? '');
$user_id = 0;
if ($token) {
    $res = $conn->query("SELECT id FROM users WHERE token='$token'");
    if ($res->num_rows > 0) {
        $user_id = $res->fetch_assoc()['id'];
    }
}
if ($user_id === 0 && !in_array($action, ['register', 'login'])) {
    respond('error', 'Oturum açmanız veya geçerli bir Key kullanmanız gerekiyor.');
}

// Heartbeat (Update last seen & current anime)
if ($action == 'heartbeat') {
    $current = $conn->real_escape_string($data['current_anime'] ?? '');
    $conn->query("UPDATE users SET last_seen=NOW(), current_anime='$current' WHERE id=$user_id");
    respond('success', 'Güncellendi');
}

// 3. PROFILE
if ($action == 'profile') {
    $target_id = intval($_GET['target_id'] ?? $user_id);
    $res = $conn->query("SELECT id, username, avatar, bio, current_anime, last_seen FROM users WHERE id=$target_id");
    if($res->num_rows > 0) {
        respond('success', 'Profil', ['profile' => $res->fetch_assoc()]);
    }
    respond('error', 'Profil bulunamadı');
}

// 4. SEARCH USERS
if ($action == 'search') {
    $q = $conn->real_escape_string($_GET['q'] ?? '');
    $res = $conn->query("SELECT id, username, avatar FROM users WHERE username LIKE '%$q%' AND id != $user_id LIMIT 10");
    $users = [];
    while($row = $res->fetch_assoc()) $users[] = $row;
    respond('success', 'Sonuçlar', ['users' => $users]);
}

// 5. SEND FRIEND REQUEST
if ($action == 'add_friend') {
    $target_id = intval($data['target_id']);
    $check = $conn->query("SELECT * FROM friends WHERE (user_id=$user_id AND friend_id=$target_id) OR (user_id=$target_id AND friend_id=$user_id)");
    if ($check->num_rows > 0) respond('error', 'Zaten istek gönderilmiş veya arkadaşsınız.');
    
    $conn->query("INSERT INTO friends (user_id, friend_id, status) VALUES ($user_id, $target_id, 'pending')");
    respond('success', 'Arkadaşlık isteği gönderildi!');
}

// 6. GET FRIENDS & REQUESTS
if ($action == 'get_friends') {
    $f_res = $conn->query("
        SELECT u.id, u.username, u.avatar, u.last_seen, u.current_anime 
        FROM friends f 
        JOIN users u ON (u.id = f.friend_id OR u.id = f.user_id) 
        WHERE (f.user_id=$user_id OR f.friend_id=$user_id) AND f.status='accepted' AND u.id != $user_id
    ");
    $friends = [];
    while($row = $f_res->fetch_assoc()) $friends[] = $row;
    
    $r_res = $conn->query("
        SELECT f.id as request_id, u.id as user_id, u.username, u.avatar 
        FROM friends f 
        JOIN users u ON u.id = f.user_id 
        WHERE f.friend_id=$user_id AND f.status='pending'
    ");
    $requests = [];
    while($row = $r_res->fetch_assoc()) $requests[] = $row;
    
    respond('success', 'Veriler', ['friends' => $friends, 'requests' => $requests]);
}

// 7. HANDLE REQUEST (Accept/Reject)
if ($action == 'handle_request') {
    $req_id = intval($data['request_id']);
    $status = $data['status'] == 'accept' ? 'accepted' : 'rejected';
    
    if ($status == 'accepted') {
        $conn->query("UPDATE friends SET status='accepted' WHERE id=$req_id AND friend_id=$user_id");
        respond('success', 'İstek kabul edildi.');
    } else {
        $conn->query("DELETE FROM friends WHERE id=$req_id AND friend_id=$user_id");
        respond('success', 'İstek reddedildi.');
    }
}

// 8. SEND MESSAGE
if ($action == 'send_message') {
    $receiver_id = intval($data['receiver_id']);
    $msg = $conn->real_escape_string($data['message']);
    
    $conn->query("INSERT INTO messages (sender_id, receiver_id, message) VALUES ($user_id, $receiver_id, '$msg')");
    respond('success', 'Mesaj gönderildi');
}

// 9. GET MESSAGES
if ($action == 'get_messages') {
    $friend_id = intval($_GET['friend_id']);
    
    $conn->query("UPDATE messages SET is_read=1 WHERE sender_id=$friend_id AND receiver_id=$user_id");
    
    $res = $conn->query("
        SELECT * FROM messages 
        WHERE (sender_id=$user_id AND receiver_id=$friend_id) OR (sender_id=$friend_id AND receiver_id=$user_id)
        ORDER BY created_at ASC LIMIT 50
    ");
    $messages = [];
    while($row = $res->fetch_assoc()) $messages[] = $row;
    
    respond('success', 'Mesajlar', ['messages' => $messages]);
}

respond('error', 'Geçersiz işlem');
?>
