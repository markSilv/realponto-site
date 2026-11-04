/* RealPonto — Splash Jornada 2026 | exclusivo da página inicial */
(() => {
  'use strict';
  // CONTROLE: enabled=false desliga a campanha sem remover arquivos.
  const config = {
    enabled: true,
    delayMs: 500,
    showEveryHours: 0,
    expiresAt: '2026-12-16T00:00:00-03:00',
    campaignId: 'jornada-2026-v1',
    image: 'img/splash/jornada-2026.jpg',
    destination: 'https://jornada.realponto.com.br/'
  };

  function init() {
    if (!config.enabled || Date.now() >= Date.parse(config.expiresAt)) return;

    const storageKey = 'rp-splash:last-shown:' + config.campaignId;
    const repeatMs = config.showEveryHours * 60 * 60 * 1000;
    try {
      const lastShown = Number(window.localStorage.getItem(storageKey));
      if (lastShown > 0 && Date.now() - lastShown < repeatMs) return;
    } catch (_) { /* Navegação privada/armazenamento bloqueado: ainda permite fechar. */ }

    const overlay = document.createElement('div');
    overlay.className = 'rp-splash-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="rp-splash-dialog" role="dialog" aria-modal="true" aria-labelledby="rp-splash-title" aria-describedby="rp-splash-description">
        <h2 class="rp-splash-visually-hidden" id="rp-splash-title">Campanha RealPonto: mudanças na jornada de trabalho</h2>
        <button class="rp-splash-close" type="button" aria-label="Fechar anúncio">&times;</button>
        <a class="rp-splash-banner" href="${config.destination}" aria-label="Conhecer a simulação da nova jornada na RealPonto">
          <img src="${config.image}" alt="Banner RealPonto: mudanças na jornada de trabalho, escala 6x1 para 5x2, jornada de 44 para 42 horas, ajustes até 15 de dezembro de 2026." width="1672" height="941" loading="eager" decoding="async">
        </a>
        <div class="rp-splash-mobile-text" id="rp-splash-description">
          <strong>Mudanças na jornada de trabalho</strong>
          <p>Conheça as opções de ajuste e consulte os valores do serviço. Condições e exceções aplicáveis devem ser verificadas.</p>
        </div>
        <div class="rp-splash-footer">
          <p></p>
          <a class="rp-splash-action" href="${config.destination}">Simular ajustes e consultar valores</a>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const closeButton = overlay.querySelector('.rp-splash-close');
    const focusables = Array.from(overlay.querySelectorAll('button, a[href]'));
    let previousFocus = null;
    let previousOverflow = '';
    let opened = false;

    function onKeydown(event) {
      if (!opened) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab' && focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }

    function close() {
      if (!opened) return;
      opened = false;
      document.removeEventListener('keydown', onKeydown);
      overlay.classList.remove('rp-splash-open');
      overlay.hidden = true;
      document.body.style.overflow = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus({preventScroll: true});
      }
      overlay.remove();
    }

    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });

    window.setTimeout(() => {
      if (!document.body.contains(overlay)) return;
      previousFocus = document.activeElement;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      overlay.hidden = false;
      opened = true;
      document.addEventListener('keydown', onKeydown);
      window.requestAnimationFrame(() => overlay.classList.add('rp-splash-open'));
      closeButton.focus({preventScroll: true});
      try { window.localStorage.setItem(storageKey, String(Date.now())); }
      catch (_) { /* O visitante pode bloquear armazenamento. */ }
    }, config.delayMs);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else {
    init();
  }
})();
