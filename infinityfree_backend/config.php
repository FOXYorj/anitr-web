<?php
// InfinityFree MySQL Veritabanı Bilgilerin
$db_host = 'sql206.infinityfree.com'; // InfinityFree panelinde yazar
$db_user = 'if0_43002444';    // InfinityFree panelinde yazar
$db_pass = 't7OLTAviVO';     // InfinityFree vPanel şifren
$db_name = 'if0_43002444_voxy'; // Oluşturduğun veritabanı adı

$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
if ($conn->connect_error) {
    die(json_encode(['status' => 'error', 'message' => 'Veritabanı bağlantı hatası']));
}
$conn->set_charset('utf8mb4');
?>
