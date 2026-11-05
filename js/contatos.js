/* RealPonto: cliques de intenção de contato. Não confirma conversa, chamada ou venda.
 * Nenhum cookie, armazenamento persistente, identificador, texto de mensagem ou envio de rede.
 * dataLayer apenas em memória; configurar uma tag separada para medir em GA4/GTM,
 * respeitando a configuração de consentimento escolhida pelo responsável do site.
 */
(function () {
  'use strict';
  if (window.__rpContatosInstalled) return;
  window.__rpContatosInstalled = true;
  var services = ['assistencia-tecnica','locacao-de-equipamentos','sistemas-em-nuvem','relogio-de-ponto','suporte-tecnico','contato','servicos','index'];
  function locationName(a) {
    if (a.classList.contains('wa-float')) return 'botao_flutuante';
    if (a.closest('header,.topbar')) return 'cabecalho';
    if (a.closest('footer')) return 'rodape';
    if (a.closest('.hero,.internal-hero')) return 'abertura';
    if (a.closest('.cta')) return 'cta_final';
    return 'conteudo';
  }
  document.addEventListener('click', function (event) {
    var element = event.target instanceof Element ? event.target : null;
    var a = element && element.closest('a[href]');
    if (!a) return;
    var url;
    try { url = new URL(a.getAttribute('href'), window.location.href); } catch (_) { return; }
    var channel = url.protocol === 'tel:' ? 'telefone' :
      (url.protocol === 'https:' && ['wa.me','api.whatsapp.com','web.whatsapp.com'].indexOf(url.hostname) >= 0 ? 'whatsapp' : null);
    if (!channel) return;
    var page = document.body.getAttribute('data-rp-pagina') || 'outra';
    var requested = a.getAttribute('data-rp-servico') || page;
    var service = services.indexOf(requested) >= 0 ? requested : 'outro';
    var detail = {event:'rp_contato',canal:channel,servico:service,pagina:page,origem:locationName(a)};
    // Não interromper a navegação nem abrir pop-ups para medir um clique.
    try {
      window.dataLayer = window.dataLayer || [];
      if (typeof window.dataLayer.push === 'function') window.dataLayer.push(detail);
      window.dispatchEvent(new CustomEvent('rp:contato', {detail:detail}));
    } catch (_) { /* Contato continua funcionando se a medição estiver indisponível. */ }
  });
})();
