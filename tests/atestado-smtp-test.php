<?php
declare(strict_types=1);

// Teste isolado: não lê o config.php real nem se conecta a servidores externos.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once dirname(__DIR__) . '/atestado/bootstrap.php';

use function Realponto\Atestado\{validarSmtp,criarMailerSmtp,banco,validar,registrar,notificar,estadoNotificacoes,diagnosticarErroSmtp};
use const Realponto\Atestado\DECLARACAO_VERSAO;
use PHPMailer\PHPMailer\PHPMailer;

$verificacoesSmtp = 0;
function conferirSmtp(bool $condicao, string $descricao): void
{
    global $verificacoesSmtp;
    $verificacoesSmtp++;
    if (!$condicao) {
        throw new RuntimeException('Falhou o teste SMTP: ' . $descricao);
    }
}

function rejeitarSmtp(array $config): void
{
    try {
        validarSmtp($config);
    } catch (RuntimeException $erro) {
        conferirSmtp($erro->getMessage() !== '', 'erro de configuração compreensível');
        foreach (['smtp.example.invalid', 'usuario@example.invalid', 'senha-ficticia-smtp', str_repeat('S', 64)] as $privado) {
            conferirSmtp(!str_contains($erro->getMessage(), $privado), 'erro não divulga dados de configuração');
        }
        return;
    }
    throw new RuntimeException('Falhou o teste SMTP: configuração inválida foi aceita.');
}

$pastaSmtp = sys_get_temp_dir() . '/realponto-atestado-smtp-test-' . bin2hex(random_bytes(8));
mkdir($pastaSmtp, 0700);
mkdir($pastaSmtp . '/dados', 0700);
mkdir($pastaSmtp . '/dados/emails', 0700);
$configSmtp = [
    'storage' => $pastaSmtp . '/dados',
    'origin' => 'http://127.0.0.1:8081',
    'secret' => str_repeat('S', 64),
    'from' => 'site@example.invalid',
    'recipients' => ['equipe@example.invalid'],
    'environment' => 'local',
    'mail_transport' => 'smtp',
    'retention_days' => 30,
    'smtp' => ['host' => 'smtp.example.invalid', 'port' => 587, 'encryption' => 'tls', 'username' => 'usuario@example.invalid', 'password' => 'senha-ficticia-smtp'],
];
$portaReservadaSmtp = null;
$dbSmtp = null;

try {
    conferirSmtp(extension_loaded('openssl'), 'OpenSSL disponível');
    $normalizado = validarSmtp($configSmtp);
    conferirSmtp($normalizado['smtp']['port'] === 587 && $normalizado['smtp']['encryption'] === 'tls', 'configuração STARTTLS');
    conferirSmtp($normalizado['secret'] === $configSmtp['secret'], 'chave do formulário preservada');
    $ssl = $configSmtp;
    $ssl['smtp']['encryption'] = 'ssl';
    $ssl['smtp']['port'] = '465';
    conferirSmtp(validarSmtp($ssl)['smtp']['port'] === 465, 'porta SMTPS normalizada para inteiro');
    $espacos = $configSmtp;
    $espacos['smtp']['host'] = ' smtp.example.invalid ';
    $espacos['smtp']['username'] = ' usuario@example.invalid ';
    $espacos['smtp']['password'] = ' senha-ficticia-smtp ';
    $espacos = validarSmtp($espacos);
    conferirSmtp($espacos['smtp']['host'] === 'smtp.example.invalid' && $espacos['smtp']['username'] === 'usuario@example.invalid', 'host e usuário normalizados');
    conferirSmtp($espacos['smtp']['password'] === ' senha-ficticia-smtp ', 'senha preservada exatamente');
    foreach ([' TLS ' => 'tls', 'SsL' => 'ssl'] as $entrada => $esperado) {
        $normalizar = $configSmtp; $normalizar['smtp']['encryption'] = $entrada;
        conferirSmtp(validarSmtp($normalizar)['smtp']['encryption'] === $esperado, 'criptografia normalizada sem alterar a senha');
    }

    foreach (['smtp://smtp.example.invalid', 'smtp.example.invalid;outro.example.invalid', "smtp.example.invalid\r\nHost: outro", ''] as $host) {
        $invalido = $configSmtp; $invalido['smtp']['host'] = $host;
        rejeitarSmtp($invalido);
    }
    foreach ([0, 65536, '587extra'] as $port) {
        $invalido = $configSmtp; $invalido['smtp']['port'] = $port;
        rejeitarSmtp($invalido);
    }
    foreach (['', 'none', 'starttls', 'tsl', null, []] as $encryption) {
        $invalido = $configSmtp; $invalido['smtp']['encryption'] = $encryption;
        rejeitarSmtp($invalido);
    }
    foreach (['username', 'password'] as $campo) {
        $invalido = $configSmtp; $invalido['smtp'][$campo] = '';
        rejeitarSmtp($invalido);
        $invalido['smtp'][$campo] = "valor\r\ninjetado";
        rejeitarSmtp($invalido);
    }
    $invalido = $configSmtp; unset($invalido['smtp']['password']);
    rejeitarSmtp($invalido); // secret preenchido não substitui a senha SMTP.
    $invalido = $configSmtp; $invalido['smtp'] = 'formato inválido';
    rejeitarSmtp($invalido);

    foreach ([$configSmtp, $ssl] as $modo) {
        $mailerSmtp = criarMailerSmtp($modo);
        conferirSmtp($mailerSmtp instanceof PHPMailer && $mailerSmtp->Mailer === 'smtp', 'biblioteca e transporte SMTP');
        conferirSmtp($mailerSmtp->SMTPAuth === true && $mailerSmtp->SMTPAutoTLS === false && $mailerSmtp->SMTPDebug === 0, 'autenticação explícita, criptografia obrigatória e debug desativado');
        conferirSmtp($mailerSmtp->Timeout === 10 && $mailerSmtp->getSMTPInstance()->Timelimit === 15, 'limites de espera');
        conferirSmtp($mailerSmtp->Host === 'smtp.example.invalid' && $mailerSmtp->Port === (int)$modo['smtp']['port'], 'servidor e porta configurados');
        conferirSmtp($mailerSmtp->SMTPSecure === $modo['smtp']['encryption'], 'modo TLS ou SSL configurado');
        conferirSmtp($mailerSmtp->Username === $modo['smtp']['username'] && $mailerSmtp->Password === $modo['smtp']['password'], 'credenciais SMTP separadas do secret');
        conferirSmtp(($mailerSmtp->SMTPOptions['ssl']['verify_peer'] ?? false) === true && ($mailerSmtp->SMTPOptions['ssl']['verify_peer_name'] ?? false) === true && ($mailerSmtp->SMTPOptions['ssl']['allow_self_signed'] ?? true) === false, 'certificado e nome do servidor verificados');
        conferirSmtp(strcasecmp($mailerSmtp->CharSet, 'UTF-8') === 0 && $mailerSmtp->Encoding === 'base64', 'mensagem UTF-8 e base64');
    }

    // preSend prepara o MIME em memória e não abre conexão SMTP.
    $mailerSmtp = criarMailerSmtp($configSmtp);
    $mailerSmtp->setFrom($configSmtp['from'], 'Grupo Realponto');
    $mailerSmtp->addReplyTo($configSmtp['from']);
    $mailerSmtp->addAddress('cliente@example.invalid');
    $mailerSmtp->Subject = 'Solicitação de atestado — confirmação';
    $corpoSmtp = 'Solicitação recebida: razão social, número de série e declaração conferidos.';
    $mailerSmtp->Body = $corpoSmtp;
    conferirSmtp($mailerSmtp->preSend(), 'preparação MIME sem rede');
    $mimeSmtp = $mailerSmtp->getSentMIMEMessage();
    conferirSmtp((bool)preg_match('/Content-Type: text\/plain; charset=UTF-8/i', $mimeSmtp), 'conteúdo textual em UTF-8');
    conferirSmtp(str_contains(strtolower($mimeSmtp), 'content-transfer-encoding: base64'), 'codificação do conteúdo');
    $partesSmtp = preg_split('/\r?\n\r?\n/', $mimeSmtp, 2);
    conferirSmtp(count($partesSmtp) === 2 && rtrim((string)base64_decode($partesSmtp[1], true), "\r\n") === $corpoSmtp, 'acentos preservados sem dupla codificação');
    conferirSmtp(!str_contains($mimeSmtp, $configSmtp['smtp']['password']) && !str_contains($mimeSmtp, $configSmtp['secret']), 'segredos ausentes da mensagem');

    // A classificação reconhece a categoria, mas devolve somente códigos e
    // mensagens fixas, nunca o texto bruto recebido do servidor/biblioteca.
    $marcadoresPrivadosSmtp = ['smtp.example.invalid', 'usuario@example.invalid', 'senha-ficticia-smtp', 'DADO_PRIVADO_NAO_EXIBIR'];
    $privadoSmtp = implode(' ', $marcadoresPrivadosSmtp);
    foreach ([
        [new Error('Class inexistente ' . $privadoSmtp), 'smtp_biblioteca'],
        [new RuntimeException('certificate verify failed ' . $privadoSmtp), 'smtp_tls'],
        [new RuntimeException('Authentication failed ' . $privadoSmtp), 'smtp_autenticacao'],
        [new RuntimeException('getaddrinfo failed ' . $privadoSmtp), 'smtp_dns'],
        [new RuntimeException('Connection refused ' . $privadoSmtp), 'smtp_conexao'],
        [new RuntimeException('Configure SMTP ' . $privadoSmtp), 'smtp_configuracao'],
        [new RuntimeException('Falha sem classificação ' . $privadoSmtp), 'smtp_falha'],
    ] as [$erroClassificadoSmtp, $codigoEsperadoSmtp]) {
        $diagnosticoSmtp = diagnosticarErroSmtp($erroClassificadoSmtp);
        conferirSmtp($diagnosticoSmtp['ok'] === false && $diagnosticoSmtp['codigo'] === $codigoEsperadoSmtp, 'classifica erro SMTP com código seguro');
        foreach ($marcadoresPrivadosSmtp as $marcadorSmtp) {
            conferirSmtp(!str_contains(json_encode($diagnosticoSmtp, JSON_THROW_ON_ERROR), $marcadorSmtp), 'classificação não divulga detalhes privados');
        }
    }
    foreach ([550 => 'smtp_recusado', 421 => 'smtp_temporario', 535 => 'smtp_autenticacao'] as $codigoServidorSmtp => $codigoEsperadoSmtp) {
        $mailerClassificacaoSmtp = criarMailerSmtp($configSmtp);
        $mailerClassificacaoSmtp->ErrorInfo = $privadoSmtp;
        $smtpClassificacaoSmtp = new class($codigoServidorSmtp, $privadoSmtp) extends \PHPMailer\PHPMailer\SMTP {
            public function __construct(private int $codigoTeste, private string $privadoTeste) {}
            public function getError() {
                return ['error' => $this->privadoTeste, 'detail' => $this->privadoTeste, 'smtp_code' => (string)$this->codigoTeste, 'smtp_code_ex' => ''];
            }
        };
        $mailerClassificacaoSmtp->setSMTPInstance($smtpClassificacaoSmtp);
        $diagnosticoSmtp = diagnosticarErroSmtp(new RuntimeException($privadoSmtp), $mailerClassificacaoSmtp);
        conferirSmtp($diagnosticoSmtp['codigo'] === $codigoEsperadoSmtp, 'classifica código numérico do servidor SMTP');
        foreach ($marcadoresPrivadosSmtp as $marcadorSmtp) {
            conferirSmtp(!str_contains(json_encode($diagnosticoSmtp, JSON_THROW_ON_ERROR), $marcadorSmtp), 'código numérico não expõe resposta bruta');
        }
    }

    // Reserva uma porta local SEM escutar: a conexão é recusada e nenhum
    // servidor de e-mail real pode ocupar essa porta durante a tentativa.
    $portaReservadaSmtp = stream_socket_server('tcp://127.0.0.1:0', $erroPorta, $textoPorta, STREAM_SERVER_BIND);
    conferirSmtp(is_resource($portaReservadaSmtp), 'porta loopback reservada para simular falha');
    $enderecoSmtp = stream_socket_get_name($portaReservadaSmtp, false);
    $portaFechadaSmtp = (int)substr($enderecoSmtp, strrpos($enderecoSmtp, ':') + 1);
    $configFalhaSmtp = $configSmtp;
    $configFalhaSmtp['smtp']['host'] = '127.0.0.1';
    $configFalhaSmtp['smtp']['port'] = $portaFechadaSmtp;
    $configFalhaSmtp = validarSmtp($configFalhaSmtp);
    $dbSmtp = banco($configFalhaSmtp);
    conferirSmtp(estadoNotificacoes($dbSmtp, 'pedido-inexistente') === ['estado' => 'pendente', 'total' => 0, 'aceitas' => 0, 'pendentes' => 0], 'fila vazia não afirma envio de e-mail');
    $dadosSmtp = validar(['razao_social' => 'Empresa de Teste SMTP Ltda', 'cnpj' => '11.222.333/0001-81', 'responsavel' => 'Responsável Fictício', 'email' => 'cliente@example.invalid', 'telefone' => '(11) 98765-4321', 'aceite' => '1', 'declaracao_versao' => DECLARACAO_VERSAO, 'equipamentos' => json_encode([['id' => 0, 'fabricante' => 'control-id', 'modelo' => 'Modelo teste', 'numero_serie' => 'SMTP-TESTE-1']], JSON_THROW_ON_ERROR)]);
    $registroSmtp = registrar($dbSmtp, $configFalhaSmtp, $dadosSmtp, [], bin2hex(random_bytes(24)), hash('sha256', 'sessao-teste-smtp'));
    conferirSmtp(estadoNotificacoes($dbSmtp, $registroSmtp['id']) === ['estado' => 'pendente', 'total' => 2, 'aceitas' => 0, 'pendentes' => 2], 'pedido registrado informa confirmação por e-mail pendente');
    $resultadoFalhaSmtp = notificar($dbSmtp, $configFalhaSmtp, $registroSmtp['id']);
    conferirSmtp($resultadoFalhaSmtp === ['enviadas' => 0, 'falhas' => 2], 'falha SMTP mantém as duas notificações pendentes');
    conferirSmtp((int)$dbSmtp->query('SELECT COUNT(*) FROM solicitacoes')->fetchColumn() === 1, 'falha de e-mail preserva o pedido');
    conferirSmtp((int)$dbSmtp->query('SELECT COUNT(*) FROM notificacoes WHERE enviada_em IS NULL AND tentativas = 1 AND proxima_tentativa > 0')->fetchColumn() === 2, 'retentativa agendada');
    conferirSmtp(count(glob($configSmtp['storage'] . '/emails/*.eml') ?: []) === 0, 'SMTP não simula envio gravando arquivo');
    $estadoAposFalhaSmtp = estadoNotificacoes($dbSmtp, $registroSmtp['id']);
    conferirSmtp($estadoAposFalhaSmtp === ['estado' => 'pendente', 'total' => 2, 'aceitas' => 0, 'pendentes' => 2], 'falha SMTP não se torna confirmação de e-mail enviado');
    conferirSmtp(!str_contains(json_encode($estadoAposFalhaSmtp, JSON_THROW_ON_ERROR), 'cliente@example.invalid') && !str_contains(json_encode($estadoAposFalhaSmtp, JSON_THROW_ON_ERROR), 'equipe@example.invalid'), 'estado agregado não divulga destinatários');
    $primeiraNotificacaoSmtp = (int)$dbSmtp->query('SELECT MIN(id) FROM notificacoes')->fetchColumn();
    $dbSmtp->prepare('UPDATE notificacoes SET enviada_em = ? WHERE id = ?')->execute(['2026-11-13T12:00:00Z', $primeiraNotificacaoSmtp]);
    conferirSmtp(estadoNotificacoes($dbSmtp, $registroSmtp['id']) === ['estado' => 'pendente', 'total' => 2, 'aceitas' => 1, 'pendentes' => 1], 'aceitação parcial mantém aviso de pendência');
    $dbSmtp->prepare('UPDATE notificacoes SET enviada_em = NULL WHERE id = ?')->execute([$primeiraNotificacaoSmtp]);
    $configRecuperacaoSmtp = $configSmtp;
    $configRecuperacaoSmtp['mail_transport'] = 'arquivo';
    $dbSmtp->exec('UPDATE notificacoes SET proxima_tentativa = 0 WHERE enviada_em IS NULL');
    conferirSmtp(notificar($dbSmtp, $configRecuperacaoSmtp, $registroSmtp['id']) === ['enviadas' => 2, 'falhas' => 0], 'fila recuperada com transporte local em arquivo');
    conferirSmtp((int)$dbSmtp->query('SELECT COUNT(*) FROM notificacoes WHERE enviada_em IS NOT NULL AND tentativas = 2')->fetchColumn() === 2, 'tentativas e sucesso registrados');
    conferirSmtp(count(glob($configSmtp['storage'] . '/emails/*.eml') ?: []) === 2, 'cliente e equipe receberam arquivos privados de teste');
    conferirSmtp(estadoNotificacoes($dbSmtp, $registroSmtp['id']) === ['estado' => 'aceitas_pelo_transporte', 'total' => 2, 'aceitas' => 2, 'pendentes' => 0], 'recuperação confirma somente aceitação pelo transporte');
    conferirSmtp(notificar($dbSmtp, $configRecuperacaoSmtp, $registroSmtp['id']) === ['enviadas' => 0, 'falhas' => 0], 'mensagens concluídas não são repetidas');

    echo "OK: $verificacoesSmtp verificações de configuração, SSL/TLS, MIME, falha SMTP e recuperação de fila; sem envio externo.\n";
} finally {
    if (is_resource($portaReservadaSmtp)) {
        fclose($portaReservadaSmtp);
    }
    unset($dbSmtp, $mailerSmtp);
    // Remoção limitada à pasta temporária única criada por este teste.
    $pastaResolvidaSmtp = realpath($pastaSmtp);
    $tempResolvidoSmtp = realpath(sys_get_temp_dir());
    if (!$pastaResolvidaSmtp || !$tempResolvidoSmtp || !str_starts_with(str_replace('\\', '/', $pastaResolvidaSmtp), rtrim(str_replace('\\', '/', $tempResolvidoSmtp), '/') . '/realponto-atestado-smtp-test-')) {
        throw new RuntimeException('Pasta de teste SMTP fora do destino temporário permitido.');
    }
    $iteratorSmtp = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($pastaResolvidaSmtp, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($iteratorSmtp as $itemSmtp) {
        $itemSmtp->isDir() ? rmdir($itemSmtp->getPathname()) : unlink($itemSmtp->getPathname());
    }
    rmdir($pastaResolvidaSmtp);
}
