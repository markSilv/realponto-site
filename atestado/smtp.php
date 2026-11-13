<?php
declare(strict_types=1);

namespace Realponto\Atestado;

use PHPMailer\PHPMailer\PHPMailer;

function validarSmtp(array $config): array
{
    $smtp = $config['smtp'] ?? [];
    if (!is_array($smtp)) {
        throw new \RuntimeException('Configuração SMTP inválida.');
    }
    $host = is_string($smtp['host'] ?? null) ? trim($smtp['host']) : '';
    $porta = filter_var($smtp['port'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    $criptografia = $smtp['encryption'] ?? '';
    if ($host === '' || strlen($host) > 253 || (!filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4))
        || $porta === false || !in_array($criptografia, ['tls','ssl'], true)) {
        throw new \RuntimeException('Configure servidor SMTP, porta válida e criptografia tls ou ssl.');
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
