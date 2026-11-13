<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once dirname(__DIR__) . '/atestado/bootstrap.php';

try {
    $comando = $argv[1] ?? '';
    if (!in_array($comando, ['verificar','notificar','limpar'], true)) {
        throw new RuntimeException('Uso: php scripts/atestado-manutencao.php verificar|notificar|limpar');
    }
    $config = Realponto\Atestado\configurar();
    $db = Realponto\Atestado\banco($config);
    if ($comando === 'notificar') {
        $resultado = Realponto\Atestado\notificar($db, $config);
        echo "Notificações: {$resultado['enviadas']} aceitas pelo transporte; {$resultado['falhas']} pendentes.\n";
        exit($resultado['falhas'] ? 1 : 0);
    }
    if ($comando === 'limpar') {
        echo Realponto\Atestado\limpar($db, $config) . " solicitações excluídas conforme retenção.\n";
    } else {
        echo "Configuração e armazenamento válidos; migração aditiva aplicada.\n";
    }
} catch (Throwable $e) {
    // Apenas CLI: mensagens de configuração não incluem seus valores.
    fwrite(STDERR, 'Atestado: ' . $e->getMessage() . "\n");
    exit(1);
}
