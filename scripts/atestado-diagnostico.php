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

$etapa = 'carregar_backend';
try {
    require_once dirname(__DIR__) . '/atestado/bootstrap.php';
    $etapa = 'carregar_configuracao';
    $config = Realponto\Atestado\configurar();
    if ($comando === 'smtp') {
        $etapa = 'testar_smtp';
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

    $etapa = 'consultar_fila';
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
} catch (Throwable $erro) {
    // Nunca imprimir mensagens brutas de parser, SMTP ou do arquivo privado:
    // elas podem conter valores de senha. Somente mensagens fixas conhecidas.
    $mensagensSeguras = [
        'Campo secret ausente ou inválido: use uma chave interna de pelo menos 32 caracteres.',
        'Campo from ausente ou inválido: informe o e-mail remetente autorizado.',
        'Campo recipients ausente ou vazio: informe uma lista com pelo menos um e-mail da equipe Realponto.',
        'Campo recipients inválido: cada item da lista deve ser um endereço de e-mail válido.',
        'A configuração deve ficar fora da raiz pública.',
        'Configuração inválida.',
        'Configuração SMTP inválida.',
        'Configure servidor SMTP, porta válida e criptografia tls ou ssl.',
        'Configuração SMTP: campo smtp.host inválido. Informe apenas o nome do servidor, sem protocolo ou porta.',
        'Configuração SMTP: campo smtp.port inválido. Informe um número entre 1 e 65535.',
        'Configuração SMTP: campo smtp.encryption inválido. Use tls para STARTTLS ou ssl para TLS implícito.',
        'Configure o usuário e a senha SMTP em campos separados da chave secret.',
        'A extensão OpenSSL do PHP é necessária para SMTP com SSL/TLS.',
        'PHP 8.2+, PDO_SQLite, Fileinfo e GD são necessários.',
        'Retenção deve ser de 1 a 365 dias.',
        'Origem configurada inválida.',
        'Transporte de e-mail inválido.',
        'Transporte de e-mail não disponível.',
        'O armazenamento deve usar caminho absoluto privado.',
        'Não foi possível preparar o armazenamento.',
        'Não foi possível resolver o caminho privado de armazenamento.',
        'O armazenamento precisa estar fora da raiz pública.',
        'O armazenamento precisa ser gravável pelo usuário do PHP.',
        'Pasta de armazenamento inválida.',
    ];
    if ($erro instanceof RuntimeException && in_array($erro->getMessage(), $mensagensSeguras, true)) {
        diagnosticoFalhar('configuracao_invalida', $erro->getMessage());
    }
    $nomeArquivo = basename($erro->getFile());
    $metadados = 'Etapa=' . $etapa . '; tipo=' . get_class($erro);
    if (in_array($nomeArquivo, ['config.php','bootstrap.php','validacao.php','smtp.php','notificacoes.php'], true)) {
        $metadados .= '; arquivo=' . $nomeArquivo . '; linha=' . $erro->getLine();
    }
    if ($erro instanceof ParseError) {
        diagnosticoFalhar('erro_sintaxe', $metadados . '. Confira vírgulas, aspas e a sintaxe na linha indicada.');
    }
    if ($nomeArquivo === 'config.php' && $erro instanceof Error) {
        diagnosticoFalhar('erro_execucao_config', $metadados . '. Confira os tipos dos campos e se os textos estão entre aspas.');
    }
    diagnosticoFalhar('diagnostico_indisponivel', $metadados . '. Confira a configuração privada, as extensões PHP, as permissões e a versão dos arquivos de backend.');
}
