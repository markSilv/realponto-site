# Solicitação pública de atestado técnico

## Diagnóstico e plano

O projeto é um site estático em HTML, CSS e JavaScript, com rotas sem extensão
resolvidas pelo Apache (`.htaccess`). Não há banco, autenticação, painel
administrativo nem serviço de e-mail no checkout. O contato atual usa telefone e
WhatsApp. O GitHub Actions publica uma lista permitida de arquivos por FTPS na
HostGator; o `.htaccess` raiz e as aplicações Jornada/prévia-cliente são separados.
O servidor Python existente é uma prévia estática, sem execução de PHP.

Esta entrega acrescenta, sem substituir páginas existentes:

1. Página `/solicitar-atestado-tecnico`, com o cabeçalho, logo e temas existentes,
   acesso pelo suporte, formulário em três seções e aviso de privacidade próprio.
2. Endpoint PHP e SQLite dedicado, fora da raiz pública, com migração aditiva,
   equipamentos, aceite versionado, protocolo único e notificações em fila.
3. Validação no navegador e servidor, fotos privadas, CSRF, limites de envio e
   idempotência para recuperação de respostas interrompidas.
4. Configuração externa à raiz pública, comandos de manutenção e testes isolados.

A área administrativa, alterações de status, entrega de documentos oficiais e
integrações com fabricantes ficam fora desta etapa, conforme solicitado.
O status inicial é sempre `recebida`. O encaminhamento ao fabricante é manual.

## Hospedagem e configuração

Requisitos: PHP **8.2+**, PDO_SQLite, Fileinfo, GD (JPEG, PNG e WebP) e OpenSSL para SMTP, Apache
com as regras atuais e `AllowOverride` habilitado. Ajustar no cPanel:
`upload_max_filesize=5M`, `post_max_size=32M`, `max_file_uploads=20` e
`memory_limit=256M`. Não há Composer, npm ou build de frontend.

Copiar `atestado-config.example.php` para
`/home1/USUARIO/realponto-atestados/config.php`, fora de `public_html`, preencher
os valores e restringir o arquivo à conta da hospedagem. O caminho padrão é a
pasta `realponto-atestados` ao lado da raiz do site. Um caminho alternativo pode
ser informado em `RP_ATESTADO_CONFIG`. Nunca enviar a configuração ao Git/FTP.

Também são aceitas as variáveis `RP_ATESTADO_STORAGE`, `RP_ATESTADO_FROM`,
`RP_ATESTADO_RECIPIENTS` (separados por vírgula), `RP_ATESTADO_SECRET` (segredo
aleatório de ao menos 32 caracteres), `RP_ATESTADO_ORIGIN` e
`RP_ATESTADO_RETENTION_DAYS`. Para e-mail, também existem
`RP_ATESTADO_MAIL_TRANSPORT`, `RP_ATESTADO_SMTP_HOST`, `RP_ATESTADO_SMTP_PORT`,
`RP_ATESTADO_SMTP_ENCRYPTION`, `RP_ATESTADO_SMTP_USERNAME` e
`RP_ATESTADO_SMTP_PASSWORD`. Variáveis prevalecem sobre o arquivo externo.

O transporte padrão é **SMTP autenticado**, usando PHPMailer 7.2.0. A dependência
oficial está fixada em `atestado/lib/PHPMailer`, com origem/commit em `VERSION.txt`
e licença incluída; não exige instalação de Composer na hospedagem.

No arquivo privado, configurar `mail_transport => 'smtp'` e o bloco `smtp`:

```php
'smtp' => [
    'host' => '',       // Servidor SMTP informado pelo provedor.
    'port' => 465,      // 465 para ssl; 587 para tls, conforme o provedor.
    'encryption' => 'ssl', // ssl: TLS implícito; tls: STARTTLS obrigatório.
    'username' => '',   // Usuário SMTP (normalmente o endereço completo).
    'password' => '',   // Senha da caixa ou senha de aplicativo.
],
```

**`secret` é a chave interna do formulário e não a senha do e-mail.** A senha SMTP
fica exclusivamente em `smtp.password` ou na variável de ambiente correspondente.
Nenhuma credencial vai para HTML, JavaScript, banco, Git ou respostas de erro.

Copiar servidor, porta e criptografia das configurações do provedor. Não deduzir
o hostname pelo domínio do remetente. A validação de certificados TLS fica
habilitada; não há fallback automático para envio sem criptografia ou para
`mail()`. `mail` continua disponível apenas como opção explicitamente configurada
para instalações que já utilizam o serviço nativo da hospedagem. `arquivo` é
exclusivo para testes locais e não envia mensagens reais.

O remetente deve ser uma caixa autorizada no servidor SMTP, com SPF/DKIM/DMARC
configurados conforme o provedor. `from` define esse remetente; `recipients`
define as caixas internas da Realponto, sem endereço fixo no backend. O cliente
recebe no endereço preenchido no formulário. Conferir a entrega real antes de
liberar a página ao público. Falhas permanecem na fila para nova tentativa;
aceitação pelo servidor SMTP não comprova entrega na caixa do destinatário.

### O que significa a disponibilidade do formulário

Ao abrir a página, o JavaScript consulta `api/atestado-tecnico.php` por GET e
aguarda até 15 segundos por uma resposta de sucesso em JSON com os tokens de
segurança e as versões atuais da declaração/privacidade. O servidor verifica os
campos de configuração, as extensões PHP, origem/HTTPS, armazenamento privado,
banco, limites de acesso e sessão. A mensagem “Formulário pronto para envio”
significa que essa preparação foi concluída.

Essa etapa **não conecta nem autentica no servidor SMTP** e não testa entrega.
A conexão SMTP acontece no processamento da fila após o registro de um pedido.
Se ela falhar, o protocolo permanece salvo e a mensagem fica pendente.

Qualquer falha na preparação mostra o aviso genérico de indisponibilidade ao
cliente. Exemplos: `recipients` vazio (é obrigatória ao menos uma caixa interna),
configuração privada ausente na hospedagem, domínio/origem diferente, permissão
de escrita, endpoint ausente ou servidor local sem PHP. A prévia Python/BAT não
executa PHP: preencher os dados SMTP não habilita o formulário nessa prévia.

Executar no servidor, a partir da pasta do site:

```sh
php scripts/atestado-manutencao.php verificar
php scripts/atestado-manutencao.php notificar
php scripts/atestado-manutencao.php limpar
```

Agendar `notificar` a cada cinco minutos e `limpar` diariamente no cron do
cPanel, com o caminho absoluto do PHP e do script. `verificar` valida o ambiente
e aplica a migração aditiva. Os comandos não recriam nem apagam outro banco.

## Dados e proteção

O SQLite `solicitacoes.sqlite` contém `solicitacoes`, `equipamentos`, `aceites`,
`notificacoes` e `limites`. As três primeiras tabelas relacionam a empresa, cada
equipamento e o texto/versão/instante UTC do aceite à solicitação. O protocolo e
a chave de idempotência possuem restrições UNIQUE; a gravação é transacional.
Fotos são decodificadas e regravadas sem metadados em PNG/JPEG, com nomes
aleatórios. Não há rota pública de consulta, download ou busca por protocolo.

O armazenamento deve ficar fora de **todas** as raízes públicas da hospedagem.
O aplicativo verifica a raiz deste site; o operador deve conferir domínios
adicionais, aliases e backups. Pasta `0700` e arquivos `0600` em sistemas Unix.
O Apache também nega HTTP à pasta de código `atestado` por seu `.htaccess`.

Proteções: HTTPS obrigatório em produção, origem exata, sessão exclusiva com
cookie HttpOnly/SameSite/Secure, CSRF, campo armadilha, tempo mínimo de dois
segundos, limites por IP (HMAC com segredo; sem salvar o IP bruto), SQL preparado,
limites de texto/imagem e erros sem informações internas. Proxy headers não são
usados para confiar na origem ou no IP. Exige configuração explícita para uma
prévia local em loopback. Requisições inválidas também consomem limite.

Retenção padrão: 365 dias desde o recebimento; a empresa pode configurar de 1 a
365 dias, refletidos no aviso exibido pelo formulário. O cron exclui banco,
fotos e mensagens associados ao vencer o prazo, e remove arquivos órfãos após
24 horas. Backups e caixas de e-mail têm retenção própria e devem ser tratados
pelo responsável da hospedagem. Revisar a política, a finalidade e a base legal
com o responsável por privacidade. O aceite é registro de ciência e declaração
de responsabilidade; não substitui a definição das bases legais aplicáveis.

## Validação e publicação

Testes PHP: `php tests/atestado-test.php` e `php tests/atestado-smtp-test.php`.
Integração HTTP e regressão:
`python tests/atestado-http-test.py --php CAMINHO_DO_PHP`.
Validação JS: `node tests/atestado-validacao-test.cjs`.
Os testes usam dados fictícios, pastas temporárias privadas, transporte local
em arquivo e uma porta loopback sem servidor para simular falha SMTP; não enviam
e-mails reais. O teste HTTP inicia seu próprio PHP local.
Para prévia interativa completa, usar o roteador local:

```sh
php -S 127.0.0.1:8081 tests/atestado-router.php
```

Essa prévia exige configuração local externa (ver exemplo), com
`environment=local`, `origin=http://127.0.0.1:8081` e `mail_transport=arquivo`.
O servidor Python/BAT anterior continua sendo somente leitura e mostra uma
mensagem de indisponibilidade para o envio, sem simular registro.

O publicador FTPS foi ampliado apenas para as duas páginas novas e uma lista
exata de arquivos de backend, incluindo `atestado/.htaccess`. Os demais arquivos
privados, configurações, testes e dados continuam excluídos. O `.htaccess` raiz
mantém publicação separada. A rota nova já é coberta pela reescrita existente.

Só publicar depois de configurar PHP, armazenamento, remetente, destinatários e
cron no servidor. Sem essas configurações o endpoint retorna indisponibilidade
e não registra pedidos. O fluxo existente do GitHub continua sendo o responsável
pela publicação na HostGator.

CNPJ numérico e alfanumérico são validados pelos dígitos verificadores segundo o
[manual da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf).
Não é feita consulta cadastral à Receita.

## Relatório da implementação — 13/11/2026

Arquivos novos:

- `solicitar-atestado-tecnico.html`, `aviso-de-privacidade-atestados.html`.
- `css/atestado-tecnico.css`, `js/atestado-tecnico.js` e
  `js/atestado-validacao.js`.
- `api/atestado-tecnico.php`, `atestado/bootstrap.php`, `atestado/validacao.php`,
  `atestado/notificacoes.php`, `atestado/smtp.php`, `atestado/schema.sql`,
  `atestado/.htaccess` e a dependência oficial PHPMailer em `atestado/lib/PHPMailer`.
- `scripts/atestado-manutencao.php`, `documentacao/atestado-config.example.php`,
  este guia, `.gitignore` e cinco arquivos de teste em `tests/`.

Arquivos existentes alterados: menus/rodapés das páginas institucionais e de
relógios para incluir o acesso ao formulário; chamada na página de suporte;
`sitemap.xml`; lista permitida/ordem do publicador FTPS; bloqueio das novas pastas
de backend na prévia estática Python. O `.htaccess` raiz foi preservado.

Endereço após publicação: `https://www.realponto.com.br/solicitar-atestado-tecnico`.
Menu público: **Soluções → Atestado técnico**, além da chamada em **Suporte técnico**.
Nenhum menu ou painel administrativo foi criado nesta etapa.

Resultados locais:

- **55 verificações PHP passaram**: validação, fabricante individual/misto,
  até 20 equipamentos, aceite, persistência, protocolo, idempotência,
  notificações, recuperação de falha de e-mail, limite e retenção.
- **12 cenários HTTP passaram**: fluxo completo, CNPJ alfanumérico,
  CSRF/origem/sessão, campos inválidos, spam, métodos, configuração ausente,
  imagens falsas/maiores que o limite, regravação segura de fotos e bloqueio de
  acesso. A regressão HTTP incluiu as **26 páginas HTML** do checkout.
- Validações JavaScript de CNPJ, máscaras, telefone e séries passaram.
- **116 verificações SMTP passaram**: configuração de servidor/porta, SSL/TLS,
  credenciais separadas de `secret`, validação de certificados, MIME UTF-8,
  ausência de segredos nos erros/mensagens, falha SMTP e recuperação da fila.
- Sintaxe PHP/Python, declaração integral idêntica ao anexo, IDs únicos,
  recursos locais, XML do sitemap e lista/ordem de publicação foram conferidos.
- Pacote local: **254 arquivos permitidos**, sem configuração nem dados privados.
- Build: não existe etapa de compilação no projeto estático; as verificações de
  scripts e o empacotamento por lista permitida passaram.

Limitações: a revisão visual em desktop/celular foi interrompida pelo Computer
Use porque a ferramenta não conseguiu confirmar com segurança a URL do Chrome
no Windows. O CSS tem regras para desktop, tablet e celular, mas a aparência e a
interação nesses tamanhos ainda precisam de conferência em navegador. E-mails
foram validados com transporte em arquivo privado, sem envio real. As regras
Apache/HTTPS precisam ser verificadas na hospedagem; o teste HTTP usa roteador
local equivalente para bloquear arquivos privados.

**Publicação não realizada.** A cópia local privada de `config.php` foi criada
com chave interna e campos SMTP. Faltam preenchimento e validação dos dados reais
de servidor, porta, criptografia, usuário e senha SMTP, remetente/destinatários
autorizados e envio da configuração privada à hospedagem; confirmação de PHP/extensões e pasta privada na
HostGator; cron de notificações/limpeza; e validação da entrega real de e-mails.
O comando de verificação sem configuração recusou o funcionamento, como esperado.
Nenhum dado ou banco de produção foi alterado.
