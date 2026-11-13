<?php
declare(strict_types=1);

namespace Realponto\Atestado;

function enfileirar(\PDO $db, array $config, array $dados, string $id, string $protocolo, string $recebida): void
{
    $cliente = "SOLICITAÇÃO RECEBIDA COM SUCESSO!\n\nSua solicitação foi registrada no Grupo Realponto.\n\nProtocolo: $protocolo\n\nOs dados enviados serão verificados e encaminhados ao fabricante correspondente.\nVocê receberá atualizações pelo e-mail cadastrado.\n\nO recebimento da solicitação não representa a emissão automática do atestado.\nO documento é emitido e assinado pelo fabricante.\n\nGrupo Realponto";
    $interno = "NOVA SOLICITAÇÃO DE ATESTADO TÉCNICO\n\nProtocolo: $protocolo\nRecebida (UTC): $recebida\nStatus: Recebida\n\nRazão social: {$dados['razao_social']}\nCNPJ: {$dados['cnpj']}\nResponsável: {$dados['responsavel']}\nE-mail: {$dados['email']}\nTelefone: {$dados['telefone']}\n\n";
    foreach (['control-id' => 'Control iD', 'henry' => 'Henry'] as $fabricante => $nome) {
        $itens = array_filter($dados['equipamentos'], static fn($e) => $e['fabricante'] === $fabricante);
        if ($itens) {
            $interno .= "$nome (" . count($itens) . ")\n";
            foreach ($itens as $equipamento) {
                $interno .= "Modelo: {$equipamento['modelo']} | Série: {$equipamento['numero_serie']}\n";
            }
            $interno .= "\n";
        }
    }
    $interno .= "Declaração aceita: " . DECLARACAO_VERSAO . "\nAceite registrado em: $recebida\n\nEncaminhamento ao fabricante: manual, pelo canal oficial.\nAs fotos, quando enviadas, ficam no armazenamento privado; não são anexadas a este e-mail.\nO recebimento não representa emissão nem conclusão do pedido.";
    $query = $db->prepare('INSERT INTO notificacoes (solicitacao_id, destinatario, assunto, corpo) VALUES (?, ?, ?, ?)');
    $query->execute([$id, $dados['email'], 'Realponto: solicitação recebida - ' . $protocolo, $cliente]);
    foreach ($config['recipients'] as $destinatario) {
        $query->execute([$id, $destinatario, 'Novo atestado técnico - ' . $protocolo, $interno]);
    }
}

function notificar(\PDO $db, array $config, ?string $solicitacao = null): array
{
    $query = $db->prepare('SELECT * FROM notificacoes WHERE enviada_em IS NULL AND proxima_tentativa <= ?' . ($solicitacao ? ' AND solicitacao_id = ?' : '') . ' ORDER BY id LIMIT 20');
    $query->execute($solicitacao ? [time(), $solicitacao] : [time()]);
    $enviadas = 0;
    $falhas = 0;
    foreach ($query->fetchAll() as $mensagem) {
        $claim = $db->prepare('UPDATE notificacoes SET tentativas = tentativas + 1, proxima_tentativa = ? WHERE id = ? AND enviada_em IS NULL AND proxima_tentativa <= ?');
        $claim->execute([time() + 300, $mensagem['id'], time()]);
        if ($claim->rowCount() !== 1) {
            continue;
        }
        $assunto = '=?UTF-8?B?' . base64_encode($mensagem['assunto']) . '?=';
        $dominio = parse_url($config['origin'], PHP_URL_HOST);
        $headers = ['From' => 'Grupo Realponto <' . $config['from'] . '>', 'Reply-To' => $config['from'], 'MIME-Version' => '1.0', 'Content-Type' => 'text/plain; charset=UTF-8', 'Content-Transfer-Encoding' => 'base64', 'Message-ID' => '<atestado.' . $mensagem['solicitacao_id'] . '.' . $mensagem['id'] . '@' . $dominio . '>'];
        $corpo = chunk_split(base64_encode($mensagem['corpo']), 76, "\r\n");
        try {
            if ($config['mail_transport'] === 'arquivo' && $config['environment'] === 'local') {
                $raw = "To: {$mensagem['destinatario']}\r\nSubject: $assunto\r\n";
                foreach ($headers as $chave => $valor) {
                    $raw .= "$chave: $valor\r\n";
                }
                $ok = file_put_contents($config['storage'] . '/emails/' . $mensagem['solicitacao_id'] . '-' . $mensagem['id'] . '.eml', $raw . "\r\n" . $corpo, LOCK_EX) !== false;
            } else {
                $ok = @mail($mensagem['destinatario'], $assunto, $corpo, $headers);
            }
        } catch (\Throwable) {
            $ok = false;
        }
        if ($ok) {
            $db->prepare('UPDATE notificacoes SET enviada_em = ? WHERE id = ?')->execute([gmdate('Y-m-d\TH:i:s\Z'), $mensagem['id']]);
            $enviadas++;
        } else {
            $espera = min(86400, 300 * (2 ** min(8, (int)$mensagem['tentativas'])));
            $db->prepare('UPDATE notificacoes SET proxima_tentativa = ? WHERE id = ?')->execute([time() + $espera, $mensagem['id']]);
            $falhas++;
            error_log('Realponto atestado: notificação pendente; executar manutenção da fila.');
        }
    }
    return ['enviadas' => $enviadas, 'falhas' => $falhas];
}
