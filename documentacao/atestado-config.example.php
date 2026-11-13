<?php
// Copiar para FORA de public_html. Não colocar credenciais neste repositório.
return [
    'storage' => __DIR__ . '/dados',
    'origin' => 'https://www.realponto.com.br',
    'secret' => '', // Gerar com: php -r "echo bin2hex(random_bytes(32));"
    'from' => '', // Remetente autorizado no serviço de e-mail da hospedagem.
    'recipients' => [], // Caixas internas autorizadas a receber os dados.
    'retention_days' => 365,
    'environment' => 'production',
    'mail_transport' => 'mail',
];
