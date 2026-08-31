<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$backend = 'https://gesstec-api.onrender.com';  // SUA API AQUI

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$input = json_decode(file_get_contents('php://input'), true) ?: $_GET;

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$ch = curl_init($backend . $path);

curl_setopt_array($ch, [
    CURLOPT_POST => strtoupper($_SERVER['REQUEST_METHOD']) === 'POST',
    CURLOPT_POSTFIELDS => json_encode($input),
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'User-Agent: JICS-HostGator'
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_SSL_VERIFYPEER => false
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    http_response_code(502);
    echo json_encode(['sucesso' => false, 'erro' => 'Backend indisponível']);
    exit;
}

http_response_code($httpCode);
echo $response;
?>

