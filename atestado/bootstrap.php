<?php
declare(strict_types=1);

namespace Realponto\Atestado;

require_once __DIR__ . '/validacao.php';
require_once __DIR__ . '/notificacoes.php';
require_once __DIR__ . '/smtp.php';

function dentro(string $caminho, string $raiz): bool
{
    $caminho = strtolower(str_replace('\\', '/', $caminho));
    $raiz = rtrim(strtolower(str_replace('\\', '/', $raiz)), '/');
    return $caminho === $raiz || str_starts_with($caminho, $raiz . '/');
}

function configurar(): array
{
    $raiz = dirname(__DIR__);
    $arquivo = getenv('RP_ATESTADO_CONFIG') ?: dirname($raiz) . '/realponto-atestados/config.php';
    $config = [];
    if (is_file($arquivo)) {
        if (dentro(realpath($arquivo), realpath($raiz))) {
            throw new \RuntimeException('A configuração deve ficar fora da raiz pública.');
        }
        $config = require $arquivo;
        if (!is_array($config)) {
            throw new \RuntimeException('Configuração inválida.');
        }
    }
    foreach (['STORAGE' => 'storage', 'FROM' => 'from', 'SECRET' => 'secret', 'ORIGIN' => 'origin', 'RETENTION_DAYS' => 'retention_days', 'ENV' => 'environment', 'MAIL_TRANSPORT' => 'mail_transport'] as $env => $chave) {
        $valor = getenv('RP_ATESTADO_' . $env);
        if ($valor !== false && $valor !== '') {
            $config[$chave] = $valor;
        }
    }
    if (getenv('RP_ATESTADO_RECIPIENTS')) {
        $config['recipients'] = array_map('trim', explode(',', getenv('RP_ATESTADO_RECIPIENTS')));
    }
    foreach (['HOST' => 'host', 'PORT' => 'port', 'ENCRYPTION' => 'encryption', 'USERNAME' => 'username', 'PASSWORD' => 'password'] as $env => $chave) {
        $valor = getenv('RP_ATESTADO_SMTP_' . $env);
        if ($valor !== false && $valor !== '') {
            if (isset($config['smtp']) && !is_array($config['smtp'])) {
                throw new \RuntimeException('Configuração SMTP inválida.');
            }
            $config['smtp'][$chave] = $valor;
        }
    }
    $config += ['storage' => dirname($raiz) . '/realponto-atestados/dados', 'origin' => 'https://www.realponto.com.br', 'environment' => 'production', 'mail_transport' => 'smtp', 'retention_days' => 365];
    if (PHP_VERSION_ID < 80200 || !extension_loaded('pdo_sqlite') || !extension_loaded('fileinfo') || !extension_loaded('gd')) {
        throw new \RuntimeException('PHP 8.2+, PDO_SQLite, Fileinfo e GD são necessários.');
    }
    if (!is_string($config['secret'] ?? null) || strlen($config['secret']) < 32) {
        throw new \RuntimeException('Campo secret ausente ou inválido: use uma chave interna de pelo menos 32 caracteres.');
    }
    if (!is_string($config['from'] ?? null) || !filter_var($config['from'], FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $config['from'])) {
        throw new \RuntimeException('Campo from ausente ou inválido: informe o e-mail remetente autorizado.');
    }
    if (!is_array($config['recipients'] ?? null) || $config['recipients'] === []) {
        throw new \RuntimeException('Campo recipients ausente ou vazio: informe uma lista com pelo menos um e-mail da equipe Realponto.');
    }
    foreach ($config['recipients'] as $email) {
        if (!is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $email)) {
            throw new \RuntimeException('Campo recipients inválido: cada item da lista deve ser um endereço de e-mail válido.');
        }
    }
    $config['recipients'] = array_values(array_unique($config['recipients']));
    $config['retention_days'] = filter_var($config['retention_days'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 365]]);
    if ($config['retention_days'] === false) {
        throw new \RuntimeException('Retenção deve ser de 1 a 365 dias.');
    }
    $origem = parse_url($config['origin']);
    $local = $config['environment'] === 'local';
    if (!$origem || !isset($origem['scheme'], $origem['host']) || isset($origem['user']) || isset($origem['pass'])
        || isset($origem['query']) || isset($origem['fragment']) || !empty($origem['path'])
        || (!in_array($config['environment'], ['production','local'], true))
        || ($local && (!in_array($origem['host'], ['127.0.0.1','localhost'], true) || $origem['scheme'] !== 'http'))
        || (!$local && $origem['scheme'] !== 'https')) {
        throw new \RuntimeException('Origem configurada inválida.');
    }
    if (!in_array($config['mail_transport'], ['smtp','mail','arquivo'], true) || (!$local && $config['mail_transport'] === 'arquivo')) {
        throw new \RuntimeException('Transporte de e-mail inválido.');
    }
    if ($config['mail_transport'] === 'smtp') {
        $config = validarSmtp($config);
    }
    if ($config['mail_transport'] === 'mail' && !function_exists('mail')) {
        throw new \RuntimeException('Transporte de e-mail não disponível.');
    }
    umask(0077);
    $storage = $config['storage'];
    if (!is_string($storage) || (!str_starts_with($storage, '/') && !preg_match('/^[A-Za-z]:[\\\\\/]/', $storage))) {
        throw new \RuntimeException('O armazenamento deve usar caminho absoluto privado.');
    }
    if (!is_dir($storage) && !mkdir($storage, 0700, true) && !is_dir($storage)) {
        throw new \RuntimeException('Não foi possível preparar o armazenamento.');
    }
    $config['storage'] = realpath($storage);
    // No CLI, DOCUMENT_ROOT costuma ser vazio. realpath('') resolveria a pasta
    // atual do terminal (por exemplo, toda a home da conta), não a raiz do site.
    $documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
    $raizWeb = is_string($documentRoot) && trim($documentRoot) !== '' ? realpath($documentRoot) : false;
    $raizWeb = $raizWeb ?: realpath($raiz);
    if ($config['storage'] === false) {
        throw new \RuntimeException('Não foi possível resolver o caminho privado de armazenamento.');
    }
    if (dentro($config['storage'], realpath($raiz)) || dentro($config['storage'], $raizWeb)) {
        throw new \RuntimeException('O armazenamento precisa estar fora da raiz pública.');
    }
    if (!is_writable($config['storage'])) {
        throw new \RuntimeException('O armazenamento precisa ser gravável pelo usuário do PHP.');
    }
    foreach (['fotos','sessions','emails'] as $pasta) {
        $path = $config['storage'] . '/' . $pasta;
        if ((!is_dir($path) && !mkdir($path, 0700)) || !dentro(realpath($path), $config['storage'])) {
            throw new \RuntimeException('Pasta de armazenamento inválida.');
        }
    }
    return $config;
}

function banco(array $config): \PDO
{
    $db = new \PDO('sqlite:' . $config['storage'] . '/solicitacoes.sqlite', null, null, [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;');
    $versao = (int) $db->query('PRAGMA user_version')->fetchColumn();
    if ($versao > 1) {
        throw new \RuntimeException('Versão de banco mais recente que esta aplicação.');
    }
    if ($versao === 0) {
        $db->beginTransaction();
        try {
            $db->exec(file_get_contents(__DIR__ . '/schema.sql'));
            $db->commit();
        } catch (\Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }
    return $db;
}

function limitar(\PDO $db, string $chave, int $maximo, int $segundos): void
{
    $agora = time();
    $db->exec('BEGIN IMMEDIATE');
    try {
        $query = $db->prepare('SELECT inicio, quantidade FROM limites WHERE chave = ?');
        $query->execute([$chave]);
        $linha = $query->fetch();
        if ($linha && (int)$linha['inicio'] > $agora - $segundos && (int)$linha['quantidade'] >= $maximo) {
            throw new ErroPublico(429, 'Limite de tentativas atingido. Aguarde uma hora antes de tentar novamente.');
        }
        $novo = !$linha || (int)$linha['inicio'] <= $agora - $segundos;
        $query = $db->prepare('INSERT INTO limites(chave, inicio, quantidade) VALUES(?, ?, ?) ON CONFLICT(chave) DO UPDATE SET inicio = excluded.inicio, quantidade = excluded.quantidade');
        $query->execute([$chave, $novo ? $agora : $linha['inicio'], $novo ? 1 : (int)$linha['quantidade'] + 1]);
        $db->exec('COMMIT');
    } catch (\Throwable $e) {
        $db->exec('ROLLBACK');
        throw $e;
    }
}

function receberFoto(array $foto, array $config): string
{
    $falhar = static function (): never { throw new ErroPublico(422, 'Envie uma foto válida em JPG, PNG ou WebP de até 5 MB.'); };
    if (($foto['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_string($foto['tmp_name'] ?? null) || !is_uploaded_file($foto['tmp_name'])) {
        $falhar();
    }
    $tamanho = filesize($foto['tmp_name']);
    if ($tamanho < 1 || $tamanho > MAX_FOTO) {
        $falhar();
    }
    $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($foto['tmp_name']);
    $ext = strtolower(pathinfo(is_string($foto['name'] ?? null) ? $foto['name'] : '', PATHINFO_EXTENSION));
    $extensoes = ['image/jpeg' => ['jpg','jpeg'], 'image/png' => ['png'], 'image/webp' => ['webp']];
    if (!isset($extensoes[$mime]) || !in_array($ext, $extensoes[$mime], true)) {
        $falhar();
    }
    $dimensoes = @getimagesize($foto['tmp_name']);
    if (!$dimensoes || $dimensoes[0] > 6000 || $dimensoes[1] > 6000 || $dimensoes[0] * $dimensoes[1] > 12000000 || ($dimensoes['mime'] ?? '') !== $mime) {
        $falhar();
    }
    $imagem = @imagecreatefromstring(file_get_contents($foto['tmp_name']));
    if ($imagem === false) {
        $falhar();
    }
    $nome = bin2hex(random_bytes(20)) . ($mime === 'image/jpeg' ? '.jpg' : '.png');
    $destino = $config['storage'] . '/fotos/' . $nome;
    try {
        imagealphablending($imagem, false);
        imagesavealpha($imagem, true);
        $ok = $mime === 'image/jpeg' ? imagejpeg($imagem, $destino, 90) : imagepng($imagem, $destino, 6);
        if (!$ok) {
            throw new \RuntimeException('Falha ao gravar imagem.');
        }
    } finally {
        imagedestroy($imagem);
    }
    return $nome;
}

function localizar(\PDO $db, string $envio, string $sessaoHash): ?array
{
    $query = $db->prepare('SELECT id, protocolo, recebida_em FROM solicitacoes WHERE idempotencia = ? AND sessao_hash = ?');
    $query->execute([$envio, $sessaoHash]);
    return $query->fetch() ?: null;
}

function registrar(\PDO $db, array $config, array $dados, array $arquivos, string $envio, string $sessaoHash): array
{
    $existente = localizar($db, $envio, $sessaoHash);
    if ($existente) {
        return $existente;
    }
    $fotos = [];
    $permitidas = array_map(static fn($e) => 'foto_' . $e['id'], $dados['equipamentos']);
    if (array_diff(array_keys($arquivos), $permitidas)) {
        throw new ErroPublico(422, 'Há anexos sem equipamento correspondente.');
    }
    $total = 0;
    foreach ($arquivos as $foto) {
        if (!is_array($foto) || !is_int($foto['error'] ?? null) || is_array($foto['tmp_name'] ?? null)) {
            throw new ErroPublico(422, 'Formato de anexo inválido.');
        }
        if ($foto['error'] !== UPLOAD_ERR_NO_FILE) {
            $total += (int)($foto['size'] ?? 0);
        }
    }
    if ($total > MAX_FOTOS_TOTAL) {
        throw new ErroPublico(413, 'As fotos juntas devem ter no máximo 20 MB.');
    }
    $emTransacao = false;
    try {
        foreach ($dados['equipamentos'] as $equipamento) {
            $chave = 'foto_' . $equipamento['id'];
            if (isset($arquivos[$chave]) && $arquivos[$chave]['error'] !== UPLOAD_ERR_NO_FILE) {
                try {
                    $fotos[$equipamento['id']] = receberFoto($arquivos[$chave], $config);
                } catch (ErroPublico $e) {
                    throw new ErroPublico($e->status, 'Confira a foto do equipamento.', [$chave => $e->getMessage()]);
                }
            }
        }
        $db->beginTransaction();
        $emTransacao = true;
        $id = bin2hex(random_bytes(16));
        $agora = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        $recebida = $agora->format('Y-m-d\TH:i:s\Z');
        $protocolo = 'RP-AT-' . $agora->setTimezone(new \DateTimeZone('America/Sao_Paulo'))->format('Ymd') . '-' . strtoupper(bin2hex(random_bytes(6)));
        $query = $db->prepare('INSERT INTO solicitacoes (id, protocolo, idempotencia, sessao_hash, razao_social, cnpj, responsavel, email, telefone, recebida_em, excluir_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $query->execute([$id, $protocolo, $envio, $sessaoHash, $dados['razao_social'], $dados['cnpj'], $dados['responsavel'], $dados['email'], $dados['telefone'], $recebida, $agora->modify('+' . $config['retention_days'] . ' days')->format('Y-m-d\TH:i:s\Z')]);
        $query = $db->prepare('INSERT INTO equipamentos (solicitacao_id, fabricante, modelo, numero_serie, serie_normalizada, foto) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($dados['equipamentos'] as $equipamento) {
            $query->execute([$id, $equipamento['fabricante'], $equipamento['modelo'], $equipamento['numero_serie'], $equipamento['serie_normalizada'], $fotos[$equipamento['id']] ?? null]);
        }
        $query = $db->prepare('INSERT INTO aceites (solicitacao_id, confirmado_em, declaracao_versao, declaracao_texto, privacidade_versao, retencao_dias) VALUES (?, ?, ?, ?, ?, ?)');
        $query->execute([$id, $recebida, DECLARACAO_VERSAO, DECLARACAO, PRIVACIDADE_VERSAO, $config['retention_days']]);
        enfileirar($db, $config, $dados, $id, $protocolo, $recebida);
        $db->commit();
        return ['id' => $id, 'protocolo' => $protocolo, 'recebida_em' => $recebida];
    } catch (\Throwable $e) {
        if ($emTransacao && $db->inTransaction()) {
            $db->rollBack();
        }
        foreach ($fotos as $foto) {
            @unlink($config['storage'] . '/fotos/' . $foto);
        }
        // Outro worker pode ter recebido a mesma tentativa simultaneamente.
        if ($e instanceof \PDOException && ($existente = localizar($db, $envio, $sessaoHash))) {
            return $existente;
        }
        throw $e;
    }
}

function limpar(\PDO $db, array $config): int
{
    $db->beginTransaction();
    try {
        $agora = gmdate('Y-m-d\TH:i:s\Z');
        $query = $db->prepare('SELECT foto FROM equipamentos WHERE solicitacao_id IN (SELECT id FROM solicitacoes WHERE excluir_em <= ?) AND foto IS NOT NULL');
        $query->execute([$agora]);
        $fotos = $query->fetchAll(\PDO::FETCH_COLUMN);
        $query = $db->prepare('DELETE FROM solicitacoes WHERE excluir_em <= ?');
        $query->execute([$agora]);
        $excluidas = $query->rowCount();
        $db->prepare('DELETE FROM limites WHERE inicio < ?')->execute([time() - 86400]);
        $db->commit();
    } catch (\Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    foreach ($fotos as $foto) {
        if (preg_match('/^[a-f0-9]{40}\.(png|jpg)$/D', $foto)) {
            @unlink($config['storage'] . '/fotos/' . $foto);
        }
    }
    // Recupera órfãos de processos interrompidos; não toca fotos recém-chegadas.
    $referenciadas = array_flip($db->query('SELECT foto FROM equipamentos WHERE foto IS NOT NULL')->fetchAll(\PDO::FETCH_COLUMN));
    foreach (glob($config['storage'] . '/fotos/*') ?: [] as $foto) {
        if (is_file($foto) && !isset($referenciadas[basename($foto)]) && filemtime($foto) < time() - 86400) {
            @unlink($foto);
        }
    }
    foreach (glob($config['storage'] . '/emails/*.eml') ?: [] as $email) {
        if (filemtime($email) < time() - $config['retention_days'] * 86400) {
            @unlink($email);
        }
    }
    return $excluidas;
}
