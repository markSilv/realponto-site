<?php
declare(strict_types=1);

// Exclusivo para o terminal: nunca publicar dados de diagnóstico via HTTP.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
ini_set('display_errors', '0');

function diagnosticoFalhar(string $codigo, string $orientacao, int $status = 1): never
{
    fwrite(STDERR, "Diagnóstico: $codigo. $orientacao\n");
    exit($status);
}

$comando = $argv[1] ?? '';
$protocolo = $argv[2] ?? '';
if (($comando !== 'fila' && $comando !== 'smtp')
    || ($comando === 'fila' && (count($argv) !== 3 || !preg_match('/^RP-AT-\d{8}-[A-F0-9]{12}$/D', $protocolo)))
    || ($comando === 'smtp' && count($argv) !== 2)) {
    diagnosticoFalhar('parametros_invalidos', 'Uso: php scripts/atestado-diagnostico.php fila PROTOCOLO | smtp', 2);
}

try {
    require_once dirname(__DIR__) . '/atestado/bootstrap.php';
    $config = Realponto\Atestado\configurar();
    if ($comando === 'smtp') {
        if (!function_exists('Realponto\\Atestado\\testarConexaoSmtp')) {
            diagnosticoFalhar('helper_smtp_ausente', 'Atualize os arquivos de backend da mesma versão.');
        }
        $resultado = Realponto\Atestado\testarConexaoSmtp($config);
        $codigo = is_string($resultado['codigo'] ?? null) && preg_match('/^[a-z0-9_.-]{1,60}$/D', $resultado['codigo'])
            ? $resultado['codigo'] : 'resultado_smtp_indisponivel';
        if (($resultado['ok'] ?? false) === true) {
            echo "SMTP: $codigo. Conexão, criptografia e autenticação verificadas; nenhuma mensagem foi enviada.\n";
            exit(0);
        }
        diagnosticoFalhar($codigo, 'A verificação SMTP falhou; confira servidor, porta, criptografia, credenciais e liberação de saída na hospedagem. Nenhuma mensagem foi enviada.');
    }

    $arquivo = $config['storage'] . '/solicitacoes.sqlite';
    if (!is_file($arquivo)) {
        diagnosticoFalhar('banco_ausente', 'O arquivo de solicitações ainda não existe no armazenamento configurado.');
    }
    // Não usar banco(): o diagnóstico não cria tabelas, migra ou altera registros.
    $db = new PDO('sqlite:' . $arquivo, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY,
    ]);
    $db->exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');
    $query = $db->prepare('SELECT id FROM solicitacoes WHERE protocolo = ?');
    $query->execute([$protocolo]);
    $solicitacaoId = $query->fetchColumn();
    if ($solicitacaoId === false) {
        diagnosticoFalhar('protocolo_nao_encontrado', 'Confira o protocolo e se o armazenamento corresponde ao site que recebeu o pedido.', 3);
    }
    $query = $db->prepare('SELECT id, assunto, tentativas, proxima_tentativa, enviada_em FROM notificacoes WHERE solicitacao_id = ? ORDER BY id');
    $query->execute([$solicitacaoId]);
    $notificacoes = $query->fetchAll();
    $agora = time();
    $aceitas = 0;
    $aguardando = 0;
    foreach ($notificacoes as $notificacao) {
        if ($notificacao['enviada_em'] !== null) {
            $aceitas++;
        } elseif ((int)$notificacao['proxima_tentativa'] > $agora) {
            $aguardando++;
        }
    }
    $transporte = in_array($config['mail_transport'], ['smtp','mail','arquivo'], true) ? $config['mail_transport'] : 'desconhecido';
    $lib = dirname(__DIR__) . '/atestado/lib/PHPMailer/src/';
    echo "Protocolo: $protocolo\nTransporte configurado: $transporte\n";
    foreach (['Exception.php','SMTP.php','PHPMailer.php'] as $classe) {
        echo 'PHPMailer ' . $classe . ': ' . (is_file($lib . $classe) ? 'presente' : 'ausente') . "\n";
    }
    $total = count($notificacoes);
    $pendentes = $total - $aceitas;
    $prontas = $pendentes - $aguardando;
    echo "Notificações: total=$total; aceitas_pelo_transporte=$aceitas; pendentes=$pendentes; aguardando_nova_tentativa=$aguardando; prontas_para_tentativa=$prontas\n";
    foreach ($notificacoes as $notificacao) {
        $tipo = str_starts_with($notificacao['assunto'], 'Realponto:') ? 'cliente'
            : (str_starts_with($notificacao['assunto'], 'Novo atestado técnico') ? 'equipe' : 'não identificado');
        $estado = $notificacao['enviada_em'] !== null ? 'aceita_pelo_transporte' : 'pendente';
        echo 'Item ' . (int)$notificacao['id'] . ": tipo=$tipo; estado=$estado; tentativas=" . (int)$notificacao['tentativas'];
        if ($notificacao['enviada_em'] !== null) {
            $data = strtotime($notificacao['enviada_em']);
            echo '; aceita_em_UTC=' . ($data !== false ? gmdate('Y-m-d\TH:i:s\Z', $data) : 'data_indisponivel');
        } else {
            $data = (int)$notificacao['proxima_tentativa'];
            echo '; proxima_tentativa_UTC=' . ($data > 0 ? gmdate('Y-m-d\TH:i:s\Z', $data) : 'assim_que_a_fila_for_executada');
        }
        echo "\n";
    }
    echo "Diagnóstico somente de leitura dos registros; nenhuma mensagem foi enviada ou reenviada. Aceitação pelo transporte não comprova entrega na caixa de entrada.\n";
} catch (Throwable) {
    diagnosticoFalhar('diagnostico_indisponivel', 'Confira a configuração privada, as extensões PHP, as permissões e a versão dos arquivos de backend.');
}
