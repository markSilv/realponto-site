/* RealPonto: cliques de intenção de contato. Não confirma conversa, chamada ou venda.
 * Este bloco local não faz envio de rede. A integração opcional GA4 está ao final do arquivo.
 * dataLayer em memória; a integração abaixo exige consentimento antes de carregar o GA4.
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

/* RealPonto Analytics - 2026-11-10-ga4-1
 * A coleta GA4 abaixo é opcional e só carrega após consentimento explícito.
 * O bloco de contatos acima continua sendo somente um evento local em memória.
 * Não instalar outro snippet GA4/GTM em paralelo sem revisar a integração.
 */
(function () {
  'use strict';
  if (window.__rpAnalyticsInstalled) return;
  window.__rpAnalyticsInstalled = true;

  var ID = 'G-T8QCVNHZYC';
  var VERSION = '20261110-ga4-1';
  var STORAGE = 'rp_analytics_consent_v1';
  var TTL = 180 * 24 * 60 * 60 * 1000;
  var DISABLE = 'ga-disable-' + ID;
  var PREFIX = 'rpga';
  var routes = ['index','assistencia-tecnica','locacao-de-equipamentos','sistemas-em-nuvem',
    'relogio-de-ponto','suporte-tecnico','contato','servicos','identidade-visual','modulos',
    'real-power','seguranca-eletronica','sistema-rhid','sistema-secullum','iponto-demo',
    'paginas-relogios/evo-facial','paginas-relogios/idface-max','paginas-relogios/idface',
    'paginas-relogios/relogio-henry-vega','paginas-relogios/relogio-idclass',
    'paginas-relogios/relogio-idclass373','paginas-relogios/relogio-inner-rep',
    'paginas-relogios/relogio-prisma-sf-adv'];
  var route = location.pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/i, '') || 'index';
  var production = ['www.realponto.com.br','realponto.com.br'].indexOf(location.hostname) !== -1;
  var allowed = production && location.protocol === 'https:' && routes.indexOf(route) !== -1;
  var choice = null;
  var expires = 0;
  var configured = false;
  var tagState = 'nao_carregada';
  var panel, settingsButton, closeButton, returnFocus;
  var existingTag = !!document.querySelector('script[src*="googletagmanager.com/gtag/js"],script[src*="googletagmanager.com/gtm.js"]') ||
    (Array.isArray(window.dataLayer) && window.dataLayer.some(function (x) {return x && x[0] === 'config';}));
  var enabled = allowed && !existingTag;

  window.RPAnalytics = {
    status: function () { return {version:VERSION,measurementId:ID,enabled:enabled,
      consent:choice || 'nao_definido',tag:tagState,existingTag:existingTag}; },
    openPreferences: function () { if (enabled && panel) showPanel(true); }
  };
  if (!enabled) {
    if (allowed && existingTag && window.console) console.warn('[RealPonto] Já há uma tag Google. Integração automática pausada para evitar duplicidade.');
    return;
  }

  window[DISABLE] = true;
  window.dataLayer = window.dataLayer || [];
  // Não substitui uma implementação externa; o detector acima bloqueia tags já presentes.
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  function tag() { window.gtag.apply(window, arguments); }
  function consentState(value) {
    return {analytics_storage:value,ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'};
  }
  tag('consent', 'default', consentState('denied'));

  function savedChoice() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (saved && saved.version === 1 && ['granted','denied'].indexOf(saved.analytics) !== -1 &&
          typeof saved.expiresAt === 'number' && saved.expiresAt > Date.now() && saved.expiresAt <= Date.now() + TTL + 60000) return saved;
    } catch (_) { /* Armazenamento bloqueado: nenhuma coleta sem nova escolha. */ }
    return null;
  }
  function cleanOwnCookies() {
    // Somente os cookies com o prefixo exclusivo desta implantação. Não toca loja/RHID.
    try {
      document.cookie.split(';').forEach(function (part) {
        var name = part.trim().split('=')[0];
        if (name.indexOf(PREFIX + '_') !== 0) return;
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax; Secure';
      });
    } catch (_) {}
  }
  function safeLocation() {
    var url = new URL(location.origin + location.pathname);
    var source = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign','utm_id','utm_content','utm_term'].forEach(function (key) {
      var value = source.get(key);
      // Campanhas devem usar rótulos, nunca nomes, e-mails ou telefones de clientes.
      if (value && /^[a-zA-Z0-9_.~-]{1,100}$/.test(value) && !/\d{8,}/.test(value)) url.searchParams.set(key, value);
    });
    return url.href;
  }
  function safeReferrer() {
    try { var url = new URL(document.referrer); return url.origin + '/'; } catch (_) { return ''; }
  }
  function serviceName(value) {
    var list = ['assistencia-tecnica','locacao-de-equipamentos','sistemas-em-nuvem','relogio-de-ponto',
      'suporte-tecnico','contato','servicos','identidade-visual','modulos','real-power','seguranca-eletronica','index'];
    if (list.indexOf(value) !== -1) return value;
    if (route.indexOf('paginas-relogios/') === 0) return 'relogio-de-ponto';
    if (['sistema-rhid','sistema-secullum','iponto-demo'].indexOf(route) !== -1) return 'sistemas-em-nuvem';
    return list.indexOf(route) !== -1 ? route : 'outro';
  }
  function startAnalytics() {
    window[DISABLE] = false;
    tag('consent', 'update', consentState('granted'));
    if (!configured) {
      tag('js', new Date());
      var config = {
        allow_google_signals:false, allow_ad_personalization_signals:false,
        cookie_domain:'none', cookie_prefix:PREFIX, cookie_expires:TTL / 1000,
        cookie_update:false, cookie_flags:'SameSite=Lax;Secure',
        page_location:safeLocation(), page_referrer:safeReferrer(),
        page_title:document.title, content_group:serviceName(route),
        send_page_view:true
      };
      // Depuração é opt-in e temporária por URL; nunca ativa para todos os visitantes.
      if (new URLSearchParams(location.search).get('rp_ga_debug') === '1') config.debug_mode = true;
      tag('config', ID, config);
      configured = true;
    }
    if (tagState === 'nao_carregada' || tagState === 'bloqueada_ou_erro') {
      var old = document.getElementById('rp-ga4-tag');
      if (old) old.remove();
      var script = document.createElement('script');
      script.id = 'rp-ga4-tag';
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
      script.onload = function () { tagState = 'carregada'; };
      script.onerror = function () { tagState = 'bloqueada_ou_erro'; };
      tagState = 'carregando';
      document.head.appendChild(script);
    }
  }
  function applyChoice(value, expiry) {
    choice = value;
    expires = expiry || 0;
    if (value === 'granted') startAnalytics();
    else {
      window[DISABLE] = true;
      if (configured) tag('consent','update',consentState('denied'));
      cleanOwnCookies();
    }
  }
  function choose(value) {
    var until = Date.now() + TTL;
    try { localStorage.setItem(STORAGE,JSON.stringify({version:1,analytics:value,expiresAt:until})); } catch (_) {}
    applyChoice(value, until);
    closePanel();
  }
  function showPanel(focus) {
    returnFocus = document.activeElement;
    panel.hidden = false;
    settingsButton.setAttribute('aria-expanded','true');
    closeButton.textContent = choice ? 'Fechar' : 'Decidir depois';
    if (focus) panel.querySelector('[data-rp-choice="denied"]').focus();
  }
  function closePanel() {
    panel.hidden = true;
    settingsButton.setAttribute('aria-expanded','false');
    if (panel.contains(document.activeElement)) {
      (returnFocus && returnFocus !== document.body && typeof returnFocus.focus === 'function' ? returnFocus : settingsButton).focus({preventScroll:true});
    }
  }
  function buildPanel() {
    var style = document.createElement('style');
    style.id = 'rp-analytics-style';
    style.textContent = [
      '#rp-analytics-panel{position:fixed;z-index:1200;left:max(16px,env(safe-area-inset-left));bottom:90px;width:min(490px,calc(100vw - 32px));box-sizing:border-box;background:#fff;color:#192434;border:1px solid #dce1e8;border-radius:16px;box-shadow:0 10px 42px #0c172a30;padding:20px;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;max-height:calc(100dvh - 120px);overflow:auto;text-align:left}',
      '#rp-analytics-panel[hidden]{display:none!important}',
      '#rp-analytics-panel *{box-sizing:border-box}',
      '#rp-analytics-panel h2{font:700 19px/1.25 system-ui,sans-serif;letter-spacing:0;margin:0 0 10px;color:inherit}',
      '#rp-analytics-panel p{font:inherit;color:inherit;margin:0 0 12px}',
      '#rp-analytics-panel details{margin:0 0 14px;font-size:12px;line-height:1.5}',
      '#rp-analytics-panel summary{cursor:pointer;font-weight:600;text-decoration:underline;text-underline-offset:3px}',
      '#rp-analytics-panel details p{margin:10px 0 0;font:inherit}',
      '#rp-analytics-panel a{color:#184d8a;text-decoration:underline}',
      '#rp-analytics-panel .rp-analytics-actions{display:flex;gap:10px}',
      '#rp-analytics-panel button{appearance:none;font:600 13px/1.3 system-ui,sans-serif;cursor:pointer;text-transform:none;letter-spacing:0;transition:none;min-height:44px;border-radius:8px;padding:10px 12px}',
      '#rp-analytics-panel .rp-analytics-actions button{flex:1;background:#fff;color:#192434;border:1px solid #64748b}',
      '#rp-analytics-panel .rp-analytics-actions button:hover{background:#edf2f7}',
      '#rp-analytics-panel button:focus-visible,#rp-analytics-settings:focus-visible{outline:3px solid #386eae;outline-offset:3px}',
      '#rp-analytics-panel .rp-analytics-close{display:block;margin:8px 0 0 auto;min-height:32px;padding:4px 6px;background:transparent;color:#49586b;border:0;font-size:12px}',
      '#rp-analytics-settings{display:inline-block;appearance:none;background:transparent;border:0;padding:8px 0;font:inherit;color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer;text-align:left}',
      '@media(max-width:480px){#rp-analytics-panel{padding:16px;font-size:13px;bottom:86px}#rp-analytics-panel h2{font-size:17px}#rp-analytics-panel .rp-analytics-actions{gap:8px}#rp-analytics-panel .rp-analytics-actions button{padding:10px 6px;font-size:12px}}',
      '@media(prefers-reduced-motion:reduce){#rp-analytics-panel{scroll-behavior:auto}}'
    ].join('\n');
    document.head.appendChild(style);
    panel = document.createElement('section');
    panel.id = 'rp-analytics-panel';
    panel.hidden = true;
    panel.setAttribute('role','region');
    panel.setAttribute('aria-labelledby','rp-analytics-title');
    panel.innerHTML = '<h2 id="rp-analytics-title">Estatísticas com a sua escolha</h2>' +
      '<p>Podemos usar cookies do Google Analytics para entender as visitas e os cliques em WhatsApp e telefone? São opcionais: você pode continuar navegando sem aceitar.</p>' +
      '<details><summary>Como funciona e como mudar a escolha</summary>' +
      '<p>Com sua autorização, o Google recebe dados de navegação e dispositivo para gerar estatísticas para a RealPonto. Os eventos de contato deste código não enviam a mensagem do WhatsApp nem dados preenchidos em formulários.</p>' +
      '<p>Esta preferência fica salva neste navegador por até 180 dias. Você pode alterá-la pelo botão “Preferências de estatísticas” no rodapé. Ao recusar, esta integração não carrega o Analytics; ao revogar uma autorização, interrompe novas medições e remove seus cookies próprios. Isso não apaga registros já enviados.</p>' +
      '<p>Outros serviços e links externos têm suas próprias práticas. Saiba mais na <a href="https://policies.google.com/privacy?hl=pt-BR" target="_blank" rel="noopener noreferrer">política do Google</a>. Dúvidas: <a href="mailto:sac@realponto.com.br">sac@realponto.com.br</a>.</p></details>' +
      '<div class="rp-analytics-actions"><button type="button" data-rp-choice="denied">Recusar estatísticas</button><button type="button" data-rp-choice="granted">Aceitar estatísticas</button></div>' +
      '<button type="button" class="rp-analytics-close">Decidir depois</button>';
    document.body.appendChild(panel);
    settingsButton = document.createElement('button');
    settingsButton.id = 'rp-analytics-settings';
    settingsButton.type = 'button';
    settingsButton.textContent = 'Preferências de estatísticas';
    settingsButton.setAttribute('aria-controls',panel.id);
    settingsButton.setAttribute('aria-expanded','false');
    var footer = document.querySelector('footer .footer-bottom') || document.querySelector('footer') || document.body;
    footer.appendChild(settingsButton);
    settingsButton.addEventListener('click', function () {showPanel(true);});
    closeButton = panel.querySelector('.rp-analytics-close');
    closeButton.addEventListener('click',closePanel);
    panel.addEventListener('keydown',function (event) {if (event.key === 'Escape') closePanel();});
    panel.querySelectorAll('[data-rp-choice]').forEach(function (button) {
      button.addEventListener('click',function () {choose(button.getAttribute('data-rp-choice'));});
    });
    var saved = savedChoice();
    applyChoice(saved ? saved.analytics : null, saved ? saved.expiresAt : 0);
    if (!choice) showPanel(false);
  }
  window.addEventListener('rp:contato',function (event) {
    if (choice !== 'granted' || window[DISABLE] || !configured) return;
    if (expires && Date.now() >= expires) {applyChoice(null,0);if(panel) showPanel(false);return;}
    var detail = event.detail || {};
    if (['whatsapp','telefone'].indexOf(detail.canal) === -1) return;
    var positions = ['botao_flutuante','cabecalho','rodape','abertura','cta_final','conteudo'];
    // Lista fechada: não repassa href, texto livre, mensagens, e-mail ou telefone.
    tag('event',detail.canal === 'whatsapp' ? 'clique_whatsapp' : 'clique_telefone',{
      send_to:ID,canal:detail.canal,servico:serviceName(detail.servico),pagina:route,
      origem:positions.indexOf(detail.origem) !== -1 ? detail.origem : 'conteudo',
      page_location:safeLocation(),page_referrer:safeReferrer()
    });
  });
  window.addEventListener('storage',function (event) {
    if (event.key !== STORAGE && event.key !== null) return;
    var saved = savedChoice();
    applyChoice(saved ? saved.analytics : null, saved ? saved.expiresAt : 0);
    if (panel) {if (!choice) showPanel(false);else closePanel();}
  });
  window.addEventListener('pageshow',function (event) {
    if (!event.persisted) return;
    var saved = savedChoice();
    applyChoice(saved ? saved.analytics : null, saved ? saved.expiresAt : 0);
    if (!choice && panel) showPanel(false);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',buildPanel,{once:true});
  else buildPanel();
})();
