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

Requisitos: PHP **8.2+**, PDO_SQLite, Fileinfo e GD (JPEG, PNG e WebP), Apache
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
`RP_ATESTADO_RETENTION_DAYS`. Variáveis prevalecem sobre o arquivo externo.

O remetente deve ser uma caixa autorizada na hospedagem, com SPF/DKIM/DMARC
configurados. O transporte usa o `mail()` da hospedagem; não foi encontrado um
serviço prévio para reutilizar. Os destinatários internos são configuráveis
nesse arquivo, sem endereço fixo no backend. Conferir a entrega real antes de
liberar a página ao público. Falhas permanecem na fila para nova tentativa.
Aceitação pelo transporte não comprova entrega na caixa do destinatário.

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

Testes PHP: `php tests/atestado-test.php`. Integração HTTP e regressão:
`python tests/atestado-http-test.py --php CAMINHO_DO_PHP`.
Validação JS: `node tests/atestado-validacao-test.cjs`.
Os testes usam dados fictícios, pastas temporárias privadas e transporte local
em arquivo; não enviam e-mails reais. O teste HTTP inicia seu próprio PHP local.
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
  `atestado/notificacoes.php`, `atestado/schema.sql` e `atestado/.htaccess`.
- `scripts/atestado-manutencao.php`, `documentacao/atestado-config.example.php`,
  este guia, `.gitignore` e quatro arquivos de teste em `tests/`.

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
- Sintaxe PHP/Python, declaração integral idêntica ao anexo, IDs únicos,
  recursos locais, XML do sitemap e lista/ordem de publicação foram conferidos.
- Pacote local: **248 arquivos permitidos**, sem configuração nem dados privados.
- Build: não existe etapa de compilação no projeto estático; as verificações de
  scripts e o empacotamento por lista permitida passaram.

Limitações: a revisão visual em desktop/celular foi interrompida pelo Computer
Use porque a ferramenta não conseguiu confirmar com segurança a URL do Chrome
no Windows. O CSS tem regras para desktop, tablet e celular, mas a aparência e a
interação nesses tamanhos ainda precisam de conferência em navegador. E-mails
foram validados com transporte em arquivo privado, sem envio real. As regras
Apache/HTTPS precisam ser verificadas na hospedagem; o teste HTTP usa roteador
local equivalente para bloquear arquivos privados.

**Publicação não realizada.** Faltam configuração externa com segredo, remetente
e destinatários autorizados; confirmação de PHP/extensões e pasta privada na
HostGator; cron de notificações/limpeza; e validação da entrega real de e-mails.
O comando de verificação sem configuração recusou o funcionamento, como esperado.
Nenhum dado ou banco de produção foi alterado.
