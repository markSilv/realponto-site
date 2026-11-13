<?php
// Roteador exclusivo para prévia/testes em loopback; não publicar.
declare(strict_types=1);

$raiz = dirname(__DIR__);
$caminho = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
$bloqueado = preg_match('~^/(?:\.|atestado(?:/|$)|tests(?:/|$)|documentacao(?:/|$)|scripts(?:/|$)|api/(?!atestado-tecnico\.php$))~i', $caminho);
if ($bloqueado || str_contains($caminho, '..') || str_contains($caminho, '\\') || str_contains($caminho, "\0")) {
    http_response_code(404);
    exit('Não encontrado.');
}
if ($caminho === '/api/atestado-tecnico.php') {
    require $raiz . $caminho;
    return true;
}
if ($caminho === '/') {
    $caminho = '/index.html';
} elseif (preg_match('~^/(?:paginas-relogios/)?[a-z0-9_-]+$~iD', $caminho) && is_file($raiz . $caminho . '.html')) {
    $caminho .= '.html';
}
$arquivo = realpath($raiz . $caminho);
if (!$arquivo || !is_file($arquivo) || !str_starts_with(str_replace('\\','/',$arquivo), str_replace('\\','/',realpath($raiz)) . '/') || str_ends_with(strtolower($arquivo), '.php')) {
    http_response_code(404);
    readfile($raiz . '/404.html');
    return true;
}
$tipos = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css', 'js' => 'text/javascript', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp', 'svg' => 'image/svg+xml', 'ttf' => 'font/ttf', 'xml' => 'application/xml'];
header('Content-Type: ' . ($tipos[strtolower(pathinfo($arquivo, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
if ($_SERVER['REQUEST_METHOD'] !== 'HEAD') {
    readfile($arquivo);
}
return true;
