<?php
// Copiar para FORA de public_html. Não colocar credenciais neste repositório.
return [
    'storage' => __DIR__ . '/dados',
    'origin' => 'https://www.realponto.com.br',
    'secret' => '', // Chave interna aleatória de 32+ caracteres. Não é a senha do e-mail.
    'from' => '', // Remetente autorizado no serviço de e-mail da hospedagem.
    'recipients' => [], // Caixas internas autorizadas a receber os dados.
    'retention_days' => 365,
    'environment' => 'production',
    'mail_transport' => 'smtp',
    'smtp' => [
        'host' => '', // Servidor SMTP informado pelo provedor, sem https:// ou ssl://.
        'port' => 465, // 465 para ssl; 587 para tls, conforme o provedor.
        'encryption' => 'ssl', // ssl = TLS implícito; tls = STARTTLS obrigatório.
        'username' => '', // Usuário SMTP, normalmente o endereço completo do e-mail.
        'password' => '', // Senha da conta ou senha de aplicativo, conforme o provedor.
    ],
];
