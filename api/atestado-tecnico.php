<?php
declare(strict_types=1);

use function Realponto\Atestado\{configurar,banco,limitar,validar,registrar,localizar,notificar};
use Realponto\Atestado\ErroPublico;
use const Realponto\Atestado\{DECLARACAO_VERSAO,PRIVACIDADE_VERSAO};

ini_set('display_errors', '0');
require_once dirname(__DIR__) . '/atestado/bootstrap.php';

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

function responder(int $status, array $dados): never
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

try {
    $config = configurar();
    $metodo = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($metodo, ['GET','POST'], true)) {
        header('Allow: GET, POST');
        throw new ErroPublico(405, 'Método não permitido.');
    }
    $origem = parse_url($config['origin']);
    $host = $origem['host'] . (isset($origem['port']) ? ':' . $origem['port'] : '');
    $local = $config['environment'] === 'local' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1','::1'], true);
    if (strtolower($_SERVER['HTTP_HOST'] ?? '') !== strtolower($host) || (!$local && ($_SERVER['HTTPS'] ?? '') !== 'on')) {
        throw new ErroPublico(403, 'Use o endereço seguro do site para enviar a solicitação.');
    }
    if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site'
        || (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] !== $config['origin'])
        || ($metodo === 'POST' && ($_SERVER['HTTP_ORIGIN'] ?? '') !== $config['origin'])) {
        throw new ErroPublico(403, 'Origem da solicitação não permitida. Reabra o formulário no site.');
    }
    $db = banco($config);
    $ipHash = hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? '', $config['secret']);
    limitar($db, ($metodo === 'GET' ? 'form:' : 'envio:') . $ipHash, $metodo === 'GET' ? 60 : 15, 3600);
    session_name('RPATESTADO');
    session_save_path($config['storage'] . '/sessions');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/api/', 'secure' => !$local, 'httponly' => true, 'samesite' => 'Lax']);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '7200');
    if (!session_start()) {
        throw new \RuntimeException('Não foi possível iniciar a sessão.');
    }
    $sessaoHash = hash_hmac('sha256', session_id(), $config['secret']);
    if ($metodo === 'GET') {
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
        // Cada carregamento pode coexistir com outras abas; descarta contextos vencidos.
        $_SESSION['envios'] = array_filter($_SESSION['envios'] ?? [], static fn($envio) => $envio['inicio'] > time() - 7200);
        $_SESSION['envios'] = array_slice($_SESSION['envios'], -4, null, true);
        $envio = bin2hex(random_bytes(24));
        $_SESSION['envios'][$envio] = ['inicio' => time(), 'retencao' => $config['retention_days']];
        $csrf = $_SESSION['csrf'];
        session_write_close();
        responder(200, ['csrf' => $csrf, 'envio' => $envio, 'declaracao_versao' => DECLARACAO_VERSAO, 'privacidade_versao' => PRIVACIDADE_VERSAO, 'retencao_dias' => $config['retention_days']]);
    }
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 24 * 1024 * 1024 || (empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0)) {
        throw new ErroPublico(413, 'Os arquivos excedem o limite. Use fotos de até 5 MB cada e 20 MB no total.');
    }
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data;')) {
        throw new ErroPublico(415, 'Formato de envio não permitido.');
    }
    $csrf = is_string($_POST['csrf'] ?? null) ? $_POST['csrf'] : '';
    $envio = is_string($_POST['envio'] ?? null) ? $_POST['envio'] : '';
    $contexto = $_SESSION['envios'][$envio] ?? null;
    if (!$contexto || !hash_equals($_SESSION['csrf'] ?? '', $csrf) || $csrf === '' || $contexto['inicio'] < time() - 7200) {
        throw new ErroPublico(403, 'Sua sessão expirou. Recarregue a página e tente novamente.');
    }
    session_write_close();
    if ($contexto['inicio'] > time() - 2 || ($_POST['website'] ?? '') !== '') {
        throw new ErroPublico(422, 'Aguarde alguns segundos e confira o formulário antes de enviar.');
    }
    if ($contexto['retencao'] !== $config['retention_days'] || ($_POST['privacidade_versao'] ?? '') !== PRIVACIDADE_VERSAO) {
        throw new ErroPublico(409, 'O aviso de privacidade foi atualizado. Recarregue a página e confira o texto.');
    }
    $existente = localizar($db, $envio, $sessaoHash);
    $registro = $existente ?? registrar($db, $config, validar($_POST), $_FILES, $envio, $sessaoHash);
    // O protocolo já está salvo. Uma falha no transporte nunca transforma o pedido em erro de envio.
    try {
        notificar($db, $config, $registro['id']);
    } catch (\Throwable) {
        error_log('Realponto atestado: fila de notificações precisa de nova tentativa.');
    }
    responder($existente ? 200 : 201, ['protocolo' => $registro['protocolo'], 'recebida_em' => $registro['recebida_em'], 'status' => 'recebida']);
} catch (ErroPublico $e) {
    if ($e->status === 429) {
        header('Retry-After: 3600');
    }
    responder($e->status, ['mensagem' => $e->getMessage(), 'campos' => $e->campos]);
} catch (\Throwable $e) {
    // Sem dados pessoais, caminhos ou segredos na resposta e no log.
    error_log('Realponto atestado: serviço indisponível (' . get_class($e) . '). Verificar configuração e permissões.');
    responder(503, ['mensagem' => 'O formulário está temporariamente indisponível. Tente novamente mais tarde ou fale com o suporte Realponto.']);
}
