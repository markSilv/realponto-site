<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/atestado/bootstrap.php';
use function Realponto\Atestado\{configurar,banco,validar,registrar,localizar,notificar,limpar,limitar,cnpjValido};
use Realponto\Atestado\ErroPublico;
use const Realponto\Atestado\{DECLARACAO_VERSAO,DECLARACAO};

$checks = 0;
function conferir(bool $condicao, string $nome): void {
    global $checks;
    $checks++;
    if (!$condicao) throw new RuntimeException('Falhou: ' . $nome);
}
function rejeitar(callable $fn, int $status, ?string $campo = null): void {
    try { $fn(); } catch (ErroPublico $e) {
        conferir($e->status === $status && ($campo === null || isset($e->campos[$campo])), 'rejeição ' . $status . ' ' . $campo);
        return;
    }
    throw new RuntimeException('Deveria rejeitar: ' . $campo);
}
function dados(array $equipamentos = []): array {
    return ['razao_social' => 'Empresa de Teste Ltda', 'cnpj' => '11.222.333/0001-81', 'responsavel' => 'Responsável Teste', 'email' => 'cliente@example.invalid', 'telefone' => '(11) 98765-4321', 'aceite' => '1', 'declaracao_versao' => DECLARACAO_VERSAO, 'equipamentos' => json_encode($equipamentos ?: [['id' => 0, 'fabricante' => 'control-id', 'modelo' => 'iDClass', 'numero_serie' => 'ABC-123']], JSON_THROW_ON_ERROR)];
}

$pasta = sys_get_temp_dir() . '/realponto-atestado-test-' . bin2hex(random_bytes(8));
mkdir($pasta, 0700);
$arquivoConfig = $pasta . '/config.php';
$configTeste = ['storage' => $pasta . '/dados', 'origin' => 'http://127.0.0.1:8081', 'environment' => 'local', 'mail_transport' => 'arquivo', 'secret' => bin2hex(random_bytes(32)), 'from' => 'site@example.invalid', 'recipients' => ['equipe@example.invalid'], 'retention_days' => 30];
file_put_contents($arquivoConfig, '<?php return ' . var_export($configTeste, true) . ';');
putenv('RP_ATESTADO_CONFIG=' . $arquivoConfig);

try {
    $config = configurar();
    $cwdAnterior = getcwd();
    $documentRootAnterior = $_SERVER['DOCUMENT_ROOT'] ?? null;
    $documentRootExistia = array_key_exists('DOCUMENT_ROOT', $_SERVER);
    try {
        // Reproduz o Terminal do cPanel na home, com o storage privado dentro
        // dessa home e o site em outra pasta. cwd nunca é a raiz pública.
        chdir($pasta);
        $_SERVER['DOCUMENT_ROOT'] = '';
        conferir(configurar()['storage'] === realpath($pasta . '/dados'), 'CLI fora do site com DOCUMENT_ROOT vazio');
        unset($_SERVER['DOCUMENT_ROOT']);
        conferir(configurar()['storage'] === realpath($pasta . '/dados'), 'CLI fora do site sem DOCUMENT_ROOT');
        $_SERVER['DOCUMENT_ROOT'] = '   ';
        conferir(configurar()['storage'] === realpath($pasta . '/dados'), 'DOCUMENT_ROOT em branco usa raiz do site');
        // Uma raiz pública real, quando informada pelo servidor, continua
        // protegida, mesmo se for diferente da pasta do código.
        $_SERVER['DOCUMENT_ROOT'] = $pasta;
        try {
            configurar();
            throw new RuntimeException('Armazenamento dentro da raiz pública foi aceito.');
        } catch (RuntimeException $erro) {
            conferir($erro->getMessage() === 'O armazenamento precisa estar fora da raiz pública.', 'bloqueia armazenamento em DOCUMENT_ROOT real');
        }
        $_SERVER['DOCUMENT_ROOT'] = '';
        $configPublica = $configTeste;
        $configPublica['storage'] = dirname(__DIR__);
        file_put_contents($arquivoConfig, '<?php return ' . var_export($configPublica, true) . ';');
        try {
            configurar();
            throw new RuntimeException('Armazenamento dentro do site foi aceito.');
        } catch (RuntimeException $erro) {
            conferir($erro->getMessage() === 'O armazenamento precisa estar fora da raiz pública.', 'bloqueia armazenamento na pasta do site');
        }
    } finally {
        chdir($cwdAnterior);
        if ($documentRootExistia) {
            $_SERVER['DOCUMENT_ROOT'] = $documentRootAnterior;
        } else {
            unset($_SERVER['DOCUMENT_ROOT']);
        }
        file_put_contents($arquivoConfig, '<?php return ' . var_export($configTeste, true) . ';');
    }
    $db = banco($config);
    conferir((int)$db->query('PRAGMA user_version')->fetchColumn() === 1, 'migração v1');
    conferir(cnpjValido('12.ABC.345/01DE-35'), 'CNPJ alfanumérico oficial');
    conferir(!cnpjValido('11.222.333/0001-80'), 'dígito inválido');
    conferir(!cnpjValido('11111111111111'), 'CNPJ repetido');
    foreach (['razao_social','responsavel','email','cnpj','telefone'] as $campo) {
        $post = dados(); $post[$campo] = '';
        rejeitar(fn() => validar($post), 422, $campo);
    }
    $post = dados(); $post['aceite'] = '0'; rejeitar(fn() => validar($post), 422, 'aceite');
    $post = dados(); $post['declaracao_versao'] = 'antiga'; rejeitar(fn() => validar($post), 422, 'aceite');
    $post = dados(); $post['email'] = "a@example.invalid\r\nBcc: b@example.invalid"; rejeitar(fn() => validar($post), 422, 'email');
    $post = dados(); $post['responsavel'] = '<script>alert(1)</script>'; rejeitar(fn() => validar($post), 422, 'responsavel');
    $post = dados(); $post['equipamentos'] = '[]'; rejeitar(fn() => validar($post), 422, 'equipamentos');
    $repetidos = [['id'=>0,'fabricante'=>'control-id','modelo'=>'iDClass','numero_serie'=>'AB-123'], ['id'=>1,'fabricante'=>'henry','modelo'=>'Prisma','numero_serie'=>'ab 123']];
    rejeitar(fn() => validar(dados($repetidos)), 422, 'numero_serie_1');
    $repetidos[1]['id'] = 0; rejeitar(fn() => validar(dados($repetidos)), 422, 'equipamentos');
    $post = dados(); $post['equipamentos'] = '{"id":0}'; rejeitar(fn() => validar($post), 422, 'equipamentos');

    $sessao = hash('sha256', 'sessao-ficticia');
    $primeiro = null;
    foreach (['control-id', 'henry', 'misto', 'varios'] as $caso) {
        $itens = [];
        for ($i = 0; $i < ($caso === 'varios' ? 20 : ($caso === 'misto' ? 2 : 1)); $i++) {
            $itens[] = ['id'=>$i, 'fabricante'=>$caso === 'henry' || ($i % 2 === 1) ? 'henry' : 'control-id', 'modelo'=>'Modelo teste', 'numero_serie'=>'SERIE-' . $i];
        }
        $envio = bin2hex(random_bytes(24));
        $dados = validar(dados($itens));
        $registro = registrar($db, $config, $dados, [], $envio, $sessao);
        conferir((bool)preg_match('/^RP-AT-\d{8}-[A-F0-9]{12}$/D', $registro['protocolo']), 'protocolo ' . $caso);
        $query = $db->prepare('SELECT COUNT(*) FROM equipamentos WHERE solicitacao_id = ?'); $query->execute([$registro['id']]);
        conferir((int)$query->fetchColumn() === count($itens), 'equipamentos ' . $caso);
        $query = $db->prepare('SELECT * FROM aceites WHERE solicitacao_id = ?'); $query->execute([$registro['id']]); $aceite = $query->fetch();
        conferir($aceite['declaracao_texto'] === DECLARACAO && $aceite['declaracao_versao'] === DECLARACAO_VERSAO && $aceite['confirmado_em'] === $registro['recebida_em'], 'aceite íntegro ' . $caso);
        conferir((int)$aceite['retencao_dias'] === 30, 'retenção registrada');
        conferir(registrar($db, $config, $dados, [], $envio, $sessao)['protocolo'] === $registro['protocolo'], 'idempotência ' . $caso);
        conferir(localizar($db, $envio, 'outra-sessao') === null, 'isolamento entre sessões');
        $primeiro ??= $registro;
    }
    conferir((int)$db->query('SELECT COUNT(*) FROM solicitacoes')->fetchColumn() === 4, 'sem duplicação');
    conferir((int)$db->query("SELECT COUNT(*) FROM solicitacoes WHERE status <> 'recebida'")->fetchColumn() === 0, 'nunca concluída automaticamente');
    $query = $db->query('SELECT COUNT(DISTINCT protocolo) FROM solicitacoes'); conferir((int)$query->fetchColumn() === 4, 'protocolos únicos');

    $resultado = notificar($db, $config);
    conferir($resultado === ['enviadas' => 8, 'falhas' => 0], 'cliente e equipe notificados');
    conferir(count(glob($config['storage'] . '/emails/*.eml')) === 8, 'mensagens de teste preservadas');
    $conteudo = file_get_contents(glob($config['storage'] . '/emails/*.eml')[0]);
    conferir(!str_contains($conteudo, 'Content-Disposition: attachment'), 'sem anexos em notificações');
    conferir(notificar($db, $config)['enviadas'] === 0, 'fila não reenvia notificações concluídas');
    // Falha no transporte: o pedido permanece e a fila pode ser retomada.
    $registro = registrar($db, $config, validar(dados()), [], bin2hex(random_bytes(24)), $sessao);
    $configFalha = $config; $configFalha['storage'] = $pasta . '/inexistente';
    $falha = @notificar($db, $configFalha, $registro['id']);
    conferir($falha['falhas'] === 2, 'falha permanece pendente');
    $db->exec('UPDATE notificacoes SET proxima_tentativa = 0 WHERE enviada_em IS NULL');
    conferir(notificar($db, $config, $registro['id'])['enviadas'] === 2, 'retentativa da fila');
    limitar($db, 'teste', 1, 3600); rejeitar(fn() => limitar($db, 'teste', 1, 3600), 429);
    $db->prepare('UPDATE solicitacoes SET excluir_em = ? WHERE id = ?')->execute(['2000-01-01T00:00:00Z', $primeiro['id']]);
    conferir(limpar($db, $config) === 1, 'retenção exclui pedido vencido');
    $query = $db->prepare('SELECT COUNT(*) FROM aceites WHERE solicitacao_id = ?'); $query->execute([$primeiro['id']]);
    conferir((int)$query->fetchColumn() === 0, 'exclusão em cascata do aceite');
    conferir((int)$db->query('SELECT COUNT(*) FROM solicitacoes')->fetchColumn() === 4, 'retenção preserva pedidos vigentes');
    // Nova conexão não recria o banco nem perde registros.
    conferir((int)banco($config)->query('SELECT COUNT(*) FROM solicitacoes')->fetchColumn() === 4, 'migração aditiva preserva dados');
    echo "OK: $checks verificações de validação, persistência, aceite, protocolos, fila, limite e retenção.\n";
} finally {
    unset($db, $query);
    putenv('RP_ATESTADO_CONFIG');
    // Limpeza restrita à pasta temporária única criada por este teste.
    if (!str_starts_with(str_replace('\\','/',realpath($pasta)), rtrim(str_replace('\\','/',realpath(sys_get_temp_dir())), '/') . '/realponto-atestado-test-')) {
        throw new RuntimeException('Pasta temporária fora do destino permitido.');
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($pasta, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
    rmdir($pasta);
}
