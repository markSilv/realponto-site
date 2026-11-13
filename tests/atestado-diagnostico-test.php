<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$raizDiagnostico = dirname(__DIR__);
$scriptDiagnostico = $raizDiagnostico . '/scripts/atestado-diagnostico.php';
$pastaDiagnostico = sys_get_temp_dir() . '/realponto-atestado-diagnostico-test-' . bin2hex(random_bytes(8));
mkdir($pastaDiagnostico, 0700);
mkdir($pastaDiagnostico . '/dados', 0700);
$arquivoConfigDiagnostico = $pastaDiagnostico . '/config.php';
$contagemDiagnostico = 0;
$servidorDiagnostico = null;
$portaSmtpDiagnostico = null;

function conferirDiagnostico(bool $condicao, string $descricao): void
{
    global $contagemDiagnostico;
    $contagemDiagnostico++;
    if (!$condicao) {
        throw new RuntimeException('Falhou diagnóstico: ' . $descricao);
    }
}

function executarDiagnostico(array $argumentos): array
{
    global $raizDiagnostico, $scriptDiagnostico, $arquivoConfigDiagnostico;
    $ambiente = getenv();
    foreach (array_keys($ambiente) as $nome) {
        if (str_starts_with($nome, 'RP_ATESTADO_')) unset($ambiente[$nome]);
    }
    $ambiente['RP_ATESTADO_CONFIG'] = $arquivoConfigDiagnostico;
    $processo = proc_open([PHP_BINARY, $scriptDiagnostico, ...$argumentos], [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']], $pipes, $raizDiagnostico, $ambiente);
    if (!is_resource($processo)) throw new RuntimeException('Não foi possível iniciar o diagnóstico de teste.');
    fclose($pipes[0]);
    $saida = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $erro = stream_get_contents($pipes[2]); fclose($pipes[2]);
    return ['status'=>proc_close($processo), 'saida'=>$saida . $erro];
}

$configDiagnostico = [
    'storage'=>$pastaDiagnostico . '/dados',
    'origin'=>'http://127.0.0.1:8081',
    'environment'=>'local',
    'mail_transport'=>'arquivo',
    'secret'=>'SEGREDO_DIAGNOSTICO_NAO_EXIBIR_1234567890',
    'from'=>'remetente-privado@example.invalid',
    'recipients'=>['equipe-privada@example.invalid'],
    'retention_days'=>30,
];
file_put_contents($arquivoConfigDiagnostico, '<?php return ' . var_export($configDiagnostico, true) . ';');

try {
    foreach ([[],['outro'],['fila'],['fila','qualquer'],['fila','RP-AT-20261113-541797294037','extra'],['smtp','extra']] as $argumentos) {
        $resultado = executarDiagnostico($argumentos);
        conferirDiagnostico($resultado['status'] === 2 && str_contains($resultado['saida'], 'parametros_invalidos'), 'parâmetros inválidos');
    }
    $protocoloDiagnostico = 'RP-AT-20261113-541797294037';
    $resultado = executarDiagnostico(['fila',$protocoloDiagnostico]);
    conferirDiagnostico($resultado['status'] === 1 && str_contains($resultado['saida'], 'banco_ausente'), 'banco inexistente não é criado');
    conferirDiagnostico(!is_file($pastaDiagnostico . '/dados/solicitacoes.sqlite'), 'nenhum SQLite criado pelo diagnóstico');

    $arquivoBancoDiagnostico = $pastaDiagnostico . '/dados/solicitacoes.sqlite';
    $dbDiagnostico = new PDO('sqlite:' . $arquivoBancoDiagnostico);
    $dbDiagnostico->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $dbDiagnostico->exec(file_get_contents($raizDiagnostico . '/atestado/schema.sql'));
    $dbDiagnostico->exec('PRAGMA user_version=99'); // leitura não pode migrar nem alterar a versão.
    $idDiagnostico = 'id-fixture-diagnostico';
    $dbDiagnostico->prepare('INSERT INTO solicitacoes(id,protocolo,idempotencia,sessao_hash,razao_social,cnpj,responsavel,email,telefone,recebida_em,excluir_em) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$idDiagnostico,$protocoloDiagnostico,'idem-fixture','hash-fixture','RAZAO_SOCIAL_NAO_EXIBIR','11222333000181','RESPONSAVEL_NAO_EXIBIR','cliente-privado@example.invalid','11987654321','2026-11-13T00:00:00Z','2030-01-01T00:00:00Z']);
    $inserir = $dbDiagnostico->prepare('INSERT INTO notificacoes(solicitacao_id,destinatario,assunto,corpo,tentativas,proxima_tentativa,enviada_em) VALUES(?,?,?,?,?,?,?)');
    $inserir->execute([$idDiagnostico,'cliente-privado@example.invalid','Realponto: solicitação recebida - ASSUNTO_NAO_EXIBIR','CORPO_NAO_EXIBIR',1,0,'2026-11-13T12:00:00Z']);
    $inserir->execute([$idDiagnostico,'equipe-privada@example.invalid','Novo atestado técnico - ASSUNTO_NAO_EXIBIR','CORPO_NAO_EXIBIR',2,time()+3600,null]);
    $inserir->execute([$idDiagnostico,'equipe-privada@example.invalid','Novo atestado técnico extra - ASSUNTO_NAO_EXIBIR','CORPO_NAO_EXIBIR',0,0,null]);
    unset($inserir, $dbDiagnostico);
    $hashAntes = hash_file('sha256',$arquivoBancoDiagnostico);
    $resultado = executarDiagnostico(['fila',$protocoloDiagnostico]);
    conferirDiagnostico($resultado['status'] === 0, 'fila consultada');
    foreach (['Transporte configurado: arquivo','total=3','aceitas_pelo_transporte=1','pendentes=2','aguardando_nova_tentativa=1','prontas_para_tentativa=1','tipo=cliente','tipo=equipe','tentativas=2','aceita_em_UTC=2026-11-13T12:00:00Z','proxima_tentativa_UTC=','PHPMailer Exception.php: presente','PHPMailer SMTP.php: presente','PHPMailer PHPMailer.php: presente'] as $esperado) {
        conferirDiagnostico(str_contains($resultado['saida'],$esperado),'resumo de estado sem dados pessoais');
    }
    foreach (['RAZAO_SOCIAL_NAO_EXIBIR','RESPONSAVEL_NAO_EXIBIR','ASSUNTO_NAO_EXIBIR','CORPO_NAO_EXIBIR','cliente-privado@example.invalid','equipe-privada@example.invalid','remetente-privado@example.invalid',$configDiagnostico['secret'],'11222333000181','11987654321',$pastaDiagnostico] as $privado) {
        conferirDiagnostico(!str_contains($resultado['saida'],$privado),'dados privados ausentes da saída');
    }
    conferirDiagnostico(hash_file('sha256',$arquivoBancoDiagnostico) === $hashAntes,'consulta não modifica banco, versão nem fila');
    $resultado = executarDiagnostico(['fila','RP-AT-20261113-000000000000']);
    conferirDiagnostico($resultado['status'] === 3 && str_contains($resultado['saida'],'protocolo_nao_encontrado'),'protocolo ausente');

    // Configuração inválida nunca é impressa: só erro controlado.
    file_put_contents($arquivoConfigDiagnostico, '<?php throw new RuntimeException("SEGREDO_NAO_EXIBIR_MESMO_EM_EXCECAO");');
    $resultado = executarDiagnostico(['fila',$protocoloDiagnostico]);
    conferirDiagnostico($resultado['status'] === 1 && str_contains($resultado['saida'],'diagnostico_indisponivel'),'erro seguro de configuração');
    conferirDiagnostico(!str_contains($resultado['saida'],'SEGREDO_NAO_EXIBIR_MESMO_EM_EXCECAO'),'exceção não expõe mensagem privada');

    $configInvalida = $configDiagnostico;
    $configInvalida['recipients'] = [];
    file_put_contents($arquivoConfigDiagnostico, '<?php return ' . var_export($configInvalida, true) . ';');
    $resultado = executarDiagnostico(['smtp']);
    conferirDiagnostico($resultado['status'] === 1 && str_contains($resultado['saida'], 'configuracao_invalida') && str_contains($resultado['saida'], 'Campo recipients'), 'validação informa exatamente o campo ausente');
    conferirDiagnostico(!str_contains($resultado['saida'], $configDiagnostico['secret']), 'mensagem específica não expõe a chave');

    // O parser ou uma constante sem aspas pode incluir um trecho de senha
    // na exceção. A saída deve mostrar apenas tipo/arquivo/linha, sem o token.
    file_put_contents($arquivoConfigDiagnostico, '<?php return ["password"=>"privada" TOKEN_PRIVADO_NAO_EXIBIR];');
    $resultado = executarDiagnostico(['smtp']);
    conferirDiagnostico($resultado['status'] === 1 && str_contains($resultado['saida'], 'erro_sintaxe') && str_contains($resultado['saida'], 'arquivo=config.php; linha='), 'erro de sintaxe mostra localização segura');
    conferirDiagnostico(!str_contains($resultado['saida'], 'TOKEN_PRIVADO_NAO_EXIBIR') && !str_contains($resultado['saida'], $pastaDiagnostico), 'erro de parser não expõe tokens nem caminho privado');
    file_put_contents($arquivoConfigDiagnostico, '<?php return ["encryption"=>CONSTANTE_PRIVADA_NAO_EXIBIR];');
    $resultado = executarDiagnostico(['smtp']);
    conferirDiagnostico($resultado['status'] === 1 && str_contains($resultado['saida'], 'erro_execucao_config'), 'texto sem aspas aponta erro de execução da configuração');
    conferirDiagnostico(!str_contains($resultado['saida'], 'CONSTANTE_PRIVADA_NAO_EXIBIR'), 'constante privada não aparece na saída');

    // Uma porta vinculada sem listen não aceita conexões SMTP nem permite que
    // outro servidor real a ocupe durante esta tentativa.
    $portaSmtpDiagnostico = stream_socket_server('tcp://127.0.0.1:0',$errno,$errstr,STREAM_SERVER_BIND);
    conferirDiagnostico(is_resource($portaSmtpDiagnostico),'porta local reservada');
    $endereco = stream_socket_get_name($portaSmtpDiagnostico,false);
    $configDiagnostico['mail_transport']='smtp';
    $configDiagnostico['smtp']=['host'=>'127.0.0.1','port'=>(int)substr($endereco,strrpos($endereco,':')+1),'encryption'=>'tls','username'=>'usuario-smtp@example.invalid','password'=>'SENHA_SMTP_NAO_EXIBIR'];
    file_put_contents($arquivoConfigDiagnostico,'<?php return ' . var_export($configDiagnostico,true) . ';');
    $resultado = executarDiagnostico(['smtp']);
    conferirDiagnostico($resultado['status'] === 1 && str_contains($resultado['saida'],'Nenhuma mensagem foi enviada.'),'falha de conexão SMTP sem envio');
    conferirDiagnostico(!str_contains($resultado['saida'],$configDiagnostico['smtp']['password']) && !str_contains($resultado['saida'],$configDiagnostico['smtp']['username']),'credenciais SMTP ausentes do diagnóstico');
    conferirDiagnostico(hash_file('sha256',$arquivoBancoDiagnostico) === $hashAntes,'teste SMTP não altera a fila');

    // O próprio script, quando acessado via HTTP, deve parar antes de carregar
    // configuração ou consultar registros.
    $reservaHttp = stream_socket_server('tcp://127.0.0.1:0',$errno,$errstr);
    $enderecoHttp = stream_socket_get_name($reservaHttp,false);
    fclose($reservaHttp);
    $logHttp = $pastaDiagnostico . '/http.log';
    $servidorDiagnostico = proc_open([PHP_BINARY,'-S',$enderecoHttp,'-t',$raizDiagnostico],[0=>['pipe','r'],1=>['file',$logHttp,'a'],2=>['file',$logHttp,'a']],$pipesHttp,$raizDiagnostico);
    if (!is_resource($servidorDiagnostico)) throw new RuntimeException('Não foi possível iniciar HTTP local de teste.');
    fclose($pipesHttp[0]);
    $socketHttp = false;
    for ($tentativa = 0; $tentativa < 100; $tentativa++) {
        $socketHttp = @stream_socket_client('tcp://' . $enderecoHttp,$errno,$errstr,.1);
        if (is_resource($socketHttp)) break;
        usleep(50000);
    }
    conferirDiagnostico(is_resource($socketHttp),'servidor HTTP local pronto');
    fwrite($socketHttp,"GET /scripts/atestado-diagnostico.php HTTP/1.0\r\nHost: $enderecoHttp\r\n\r\n");
    $respostaHttp=stream_get_contents($socketHttp); fclose($socketHttp);
    conferirDiagnostico(str_starts_with($respostaHttp,'HTTP/1.0 404') || str_starts_with($respostaHttp,'HTTP/1.1 404'),'diagnóstico indisponível via HTTP');
    conferirDiagnostico(!str_contains($respostaHttp,$protocoloDiagnostico) && !str_contains($respostaHttp,'Transporte configurado'),'HTTP não revela diagnóstico');
    echo "OK: $contagemDiagnostico verificações de diagnóstico CLI, consulta somente leitura, privacidade, SMTP sem envio e bloqueio HTTP.\n";
} finally {
    if (is_resource($servidorDiagnostico)) { proc_terminate($servidorDiagnostico); proc_close($servidorDiagnostico); }
    if (is_resource($portaSmtpDiagnostico)) fclose($portaSmtpDiagnostico);
    unset($dbDiagnostico,$inserir);
    $resolvido=realpath($pastaDiagnostico);
    $temp=realpath(sys_get_temp_dir());
    if (!$resolvido || !$temp || !str_starts_with(str_replace('\\','/',$resolvido),rtrim(str_replace('\\','/',$temp),'/') . '/realponto-atestado-diagnostico-test-')) {
        throw new RuntimeException('Pasta temporária fora do destino permitido.');
    }
    $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($resolvido,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $item) $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    rmdir($resolvido);
}
