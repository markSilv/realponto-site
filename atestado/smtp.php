<?php
declare(strict_types=1);

namespace Realponto\Atestado;

use PHPMailer\PHPMailer\PHPMailer;

function diagnosticarErroSmtp(\Throwable $erro, ?PHPMailer $mailer = null): array
{
    // Respostas brutas podem conter endereços, caminhos ou credenciais. Somente
    // códigos e mensagens fixas deixam esta função; nunca imprimir ErrorInfo.
    $detalhes = $mailer ? $mailer->getSMTPInstance()->getError() : [];
    $errosTls = '';
    if (function_exists('openssl_error_string')) {
        for ($i = 0; $i < 8 && ($erroTls = openssl_error_string()) !== false; $i++) {
            $errosTls .= ' ' . $erroTls;
        }
    }
    $texto = strtolower($erro->getMessage() . ' ' . ($mailer ? $mailer->ErrorInfo : '') . ' ' . ($detalhes['detail'] ?? '') . ' ' . ($detalhes['smtp_code_ex'] ?? '') . $errosTls);
    $smtpCode = (int)($detalhes['smtp_code'] ?? 0);
    $codigo = 'smtp_falha';
    if ($erro instanceof \Error && (str_contains($texto, 'require') || str_contains($texto, 'class'))) {
        $codigo = 'smtp_biblioteca';
    } elseif (preg_match('/certificate|verify failed|crypto|starttls|ssl operation|tls connect|wrong version number|unknown protocol|ssl routines|tls routines/', $texto)) {
        $codigo = 'smtp_tls';
    } elseif ($smtpCode === 535 || preg_match('/authenticat|authentication|credentials|username.*password/', $texto)) {
        $codigo = 'smtp_autenticacao';
    } elseif (preg_match('/getaddrinfo|name or service|no such host|name resolution|network_getaddresses/', $texto)) {
        $codigo = 'smtp_dns';
    } elseif (in_array($smtpCode, [550,551,552,553,554], true)) {
        $codigo = 'smtp_recusado';
    } elseif (in_array($smtpCode, [421,450,451,452], true)) {
        $codigo = 'smtp_temporario';
    } elseif (preg_match('/connect|connection|timed out|timeout|refused|network is unreachable/', $texto)) {
        $codigo = 'smtp_conexao';
    } elseif (str_contains($texto, 'configure') || str_contains($texto, 'configura') || str_contains($texto, 'openssl')) {
        $codigo = 'smtp_configuracao';
    }
    $mensagens = [
        'smtp_biblioteca' => 'Biblioteca PHPMailer ausente ou incompleta na hospedagem.',
        'smtp_tls' => 'A conexão criptografada falhou. Confira servidor, porta, modo SSL/TLS e certificado.',
        'smtp_autenticacao' => 'O servidor recusou a autenticação. Confira usuário, senha e permissão SMTP da conta.',
        'smtp_dns' => 'O nome do servidor SMTP não pôde ser resolvido.',
        'smtp_recusado' => 'O servidor recusou a mensagem, o remetente ou o destinatário.',
        'smtp_temporario' => 'O servidor SMTP informou uma falha temporária ou limite de envio.',
        'smtp_conexao' => 'Não foi possível conectar ao SMTP. Confira servidor, porta e acesso de saída da hospedagem.',
        'smtp_configuracao' => 'A configuração SMTP está incompleta ou não é suportada neste PHP.',
        'smtp_falha' => 'Falha SMTP não classificada. Consulte os registros privados da hospedagem.',
    ];
    return ['ok' => false, 'codigo' => $codigo, 'mensagem' => $mensagens[$codigo]];
}

function testarConexaoSmtp(array $config): array
{
    $mailer = null;
    try {
        if (($config['mail_transport'] ?? '') !== 'smtp') {
            return ['ok' => false, 'codigo' => 'transporte_nao_smtp', 'mensagem' => 'O transporte configurado não é SMTP.'];
        }
        $mailer = criarMailerSmtp($config);
        if (!$mailer->smtpConnect()) {
            throw new \RuntimeException($mailer->ErrorInfo);
        }
        return ['ok' => true, 'codigo' => 'smtp_ok', 'mensagem' => 'Conexão criptografada e autenticação SMTP confirmadas; nenhuma mensagem enviada.'];
    } catch (\Throwable $erro) {
        return diagnosticarErroSmtp($erro, $mailer);
    } finally {
        if ($mailer) {
            $mailer->smtpClose();
        }
    }
}

function validarSmtp(array $config): array
{
    $smtp = $config['smtp'] ?? [];
    if (!is_array($smtp)) {
        throw new \RuntimeException('Configuração SMTP inválida.');
    }
    $host = is_string($smtp['host'] ?? null) ? trim($smtp['host']) : '';
    $porta = filter_var($smtp['port'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    $criptografia = is_string($smtp['encryption'] ?? null) ? strtolower(trim($smtp['encryption'])) : '';
    if ($host === '' || strlen($host) > 253 || (!filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4))) {
        throw new \RuntimeException('Configuração SMTP: campo smtp.host inválido. Informe apenas o nome do servidor, sem protocolo ou porta.');
    }
    if ($porta === false) {
        throw new \RuntimeException('Configuração SMTP: campo smtp.port inválido. Informe um número entre 1 e 65535.');
    }
    if (!in_array($criptografia, ['tls','ssl'], true)) {
        throw new \RuntimeException('Configuração SMTP: campo smtp.encryption inválido. Use tls para STARTTLS ou ssl para TLS implícito.');
    }
    if (!is_string($smtp['username'] ?? null) || trim($smtp['username']) === '' || !is_string($smtp['password'] ?? null) || $smtp['password'] === ''
        || preg_match('/[\x00\r\n]/', $smtp['username'] . $smtp['password'])) {
        throw new \RuntimeException('Configure o usuário e a senha SMTP em campos separados da chave secret.');
    }
    if (!extension_loaded('openssl')) {
        throw new \RuntimeException('A extensão OpenSSL do PHP é necessária para SMTP com SSL/TLS.');
    }
    $config['smtp'] = ['host' => $host, 'port' => $porta, 'encryption' => $criptografia, 'username' => trim($smtp['username']), 'password' => $smtp['password']];
    return $config;
}

function criarMailerSmtp(array $config): PHPMailer
{
    $config = validarSmtp($config);
    require_once __DIR__ . '/lib/PHPMailer/src/Exception.php';
    require_once __DIR__ . '/lib/PHPMailer/src/SMTP.php';
    require_once __DIR__ . '/lib/PHPMailer/src/PHPMailer.php';
    $mailer = new PHPMailer(true);
    $mailer->isSMTP();
    $mailer->Host = $config['smtp']['host'];
    $mailer->Port = $config['smtp']['port'];
    $mailer->SMTPAuth = true;
    $mailer->Username = $config['smtp']['username'];
    $mailer->Password = $config['smtp']['password'];
    $mailer->SMTPSecure = $config['smtp']['encryption'] === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
    $mailer->SMTPAutoTLS = false; // Criptografia explicitamente obrigatória, sem negociação para texto aberto.
    $mailer->SMTPDebug = 0;
    $mailer->Timeout = 10;
    $mailer->getSMTPInstance()->Timelimit = 15;
    $mailer->SMTPOptions = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
    $mailer->CharSet = PHPMailer::CHARSET_UTF8;
    $mailer->Encoding = PHPMailer::ENCODING_BASE64;
    $mailer->XMailer = '';
    return $mailer;
}

function enviarSmtp(array $config, array $mensagem): bool
{
    $mailer = criarMailerSmtp($config);
    $mailer->setFrom($config['from'], 'Grupo Realponto');
    $mailer->addReplyTo($config['from']);
    $mailer->addAddress($mensagem['destinatario']);
    $mailer->Subject = $mensagem['assunto'];
    $mailer->Body = $mensagem['corpo'];
    $dominio = parse_url($config['origin'], PHP_URL_HOST);
    $mailer->MessageID = '<atestado.' . $mensagem['solicitacao_id'] . '.' . $mensagem['id'] . '@' . $dominio . '>';
    return $mailer->send();
}
