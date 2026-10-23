/* RHiD — tour visual RealPonto, versão 2.
   Explicações sobre as capturas, com Próximo/Anterior dentro dos cards.
   Sem autenticação, formulários, armazenamento ou APIs de produto.
   Complementa, mas não substitui, js/script.js. */
(() => {
  'use strict';

  function init() {
    const root = document.querySelector('[data-rhid-demo]');
    const source = document.getElementById('rhid-demo-data');
    if (!root || !source || root.dataset.ready === 'true') return;

    let data;
    try { data = JSON.parse(source.textContent); } catch (_) { return; }
    const panels = Array.from(root.querySelectorAll('[data-rhid-panel]'));
    const tabs = Array.from(root.querySelectorAll('[data-rhid-tab]'));
    if (!Array.isArray(data.scenes) || !Array.isArray(data.steps) || !data.steps.length ||
        panels.length !== data.scenes.length || tabs.length !== panels.length || !panels.length) return;
    if (data.scenes.some(scene => !Array.isArray(scene.features) || !scene.features.length ||
        scene.features.some(item => !Array.isArray(item.rect) || item.rect.length !== 4 ||
          !Array.isArray(item.point) || item.point.length !== 2 ||
          !item.rect.concat(item.point).every(Number.isFinite)))) return;

    const validIndex = (i, length) => Number.isInteger(i) && i >= 0 && i < length;
    if (data.steps.some(step => !validIndex(step.scene, data.scenes.length) ||
        !validIndex(step.feature, data.scenes[step.scene].features.length))) return;

    const banner = root.querySelector('[data-rhid-tour-banner]');
    const tourTitle = root.querySelector('[data-rhid-tour-title]');
    const complete = root.querySelector('[data-rhid-complete]');
    const live = root.querySelector('[data-rhid-status]');
    const progress = Array.from(root.querySelectorAll('[data-rhid-step]'));
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 680px)');
    const screens = panels.map(panel => panel.querySelector('[data-rhid-screen]'));
    const canvases = panels.map(panel => panel.querySelector('.rhid-screen-canvas'));
    const notes = panels.map(panel => Array.from(panel.querySelectorAll('[data-rhid-note]')));
    if (!banner || !tourTitle || !complete || !live ||
        screens.some(screen => !screen) || canvases.some(canvas => !canvas) ||
        notes.some((items, i) => items.length !== data.scenes[i].features.length)) return;

    const state = { scene: 0, feature: 0, step: null, open: true, complete: false };
    const freeRoute = data.scenes.flatMap((scene, i) => scene.features.map((_, j) => ({ scene: i, feature: j })));
    // Lado preferido do card, sempre com ajuste para permanecer dentro da captura.
    const preferredSides = [
      ['bottom', 'left', 'bottom'],
      ['bottom', 'bottom', 'top'],
      ['bottom', 'right', 'left'],
      ['bottom', 'right', 'left']
    ];
    let layoutFrame = 0;
    let pendingFocus = null;

    function currentCard() {
      return state.complete ? complete : (state.open ? notes[state.scene][state.feature] : null);
    }
    function freeIndex() {
      return freeRoute.findIndex(item => item.scene === state.scene && item.feature === state.feature);
    }
    function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }
    function overlap(a, b) {
      return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
             Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    }

    function layout() {
      const screen = screens[state.scene];
      const canvas = canvases[state.scene];
      const card = currentCard();
      if (!screen || screen.clientWidth === 0) return;
      const feature = data.scenes[state.scene].features[state.feature];
      const width = screen.clientWidth;
      const edge = 12;

      if (mobile.matches) {
        // Janela ampliada no celular. A mesma proporção da captura é preservada.
        // O card continua sobre a imagem; não vira um painel abaixo dela.
        const height = screen.clientHeight;
        const image = canvas.querySelector('img');
        const ratio = Number(image.getAttribute('width')) / Number(image.getAttribute('height'));
        const canvasHeight = height * 1.7;
        const canvasWidth = Math.max(width, canvasHeight * ratio);
        canvas.style.width = `${canvasWidth}px`;
        const actualHeight = canvasWidth / ratio;
        const cardHeight = card ? card.offsetHeight : 0;
        const cardY = state.complete ? (height - cardHeight) / 2 : height - cardHeight - edge;
        const focusY = card ? Math.max(80, Math.min(height * .28, (cardY + 44) / 2)) : height / 2;
        const offsetX = clamp(width / 2 - feature.point[0] * canvasWidth / 100, width - canvasWidth, 0);
        const offsetY = clamp(focusY - feature.point[1] * actualHeight / 100, height - actualHeight, 0);
        canvas.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
        if (card) {
          card.style.left = `${Math.max(edge, (width - card.offsetWidth) / 2)}px`;
          card.style.top = `${Math.max(edge, cardY)}px`;
          card.dataset.side = 'none';
        }
        return;
      }

      canvas.style.width = '';
      canvas.style.transform = '';
      if (!card) return;
      const height = screen.clientHeight;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      if (state.complete) {
        card.style.left = `${Math.max(edge, (width - cw) / 2)}px`;
        card.style.top = `${Math.max(edge, (height - ch) / 2)}px`;
        card.dataset.side = 'none';
        return;
      }
      const [l, t, w, h] = feature.rect;
      const rect = { x: l * width / 100, y: t * height / 100, w: w * width / 100, h: h * height / 100 };
      const px = feature.point[0] * width / 100;
      const py = feature.point[1] * height / 100;
      const gap = 16;
      const preferred = (preferredSides[state.scene] || [])[state.feature] || 'bottom';
      const sides = [preferred, ...['bottom', 'right', 'left', 'top'].filter(s => s !== preferred)];
      const candidates = sides.map((side, priority) => {
        let x, y;
        if (side === 'bottom') { x = px - cw / 2; y = rect.y + rect.h + gap; }
        else if (side === 'top') { x = px - cw / 2; y = rect.y - ch - gap; }
        else if (side === 'right') { x = rect.x + rect.w + gap; y = py - ch / 2; }
        else { x = rect.x - cw - gap; y = py - ch / 2; }
        const cx = clamp(x, edge, width - cw - edge);
        const cy = clamp(y, edge, height - ch - edge);
        const box = { x: cx, y: cy, w: cw, h: ch };
        // A prioridade é não cobrir o destaque; depois, manter o card próximo.
        const covered = overlap(box, rect);
        const coveredMarkers = data.scenes[state.scene].features.reduce((total, item) => {
          return total + overlap(box, { x: item.point[0] * width / 100 - 18,
            y: item.point[1] * height / 100 - 18, w: 36, h: 36 });
        }, 0);
        const score = covered * 10 + coveredMarkers * 2 + Math.abs(cx-x) + Math.abs(cy-y) + priority * 5;
        return { x: cx, y: cy, side, score, covered };
      });
      candidates.sort((a, b) => a.score - b.score);
      const chosen = candidates[0];
      card.style.left = `${chosen.x}px`;
      card.style.top = `${chosen.y}px`;
      card.dataset.side = chosen.covered > 0 ? 'none' : chosen.side;
      card.style.setProperty('--arrow-x', `${clamp(px - chosen.x - 5, 20, cw - 30)}px`);
      card.style.setProperty('--arrow-y', `${clamp(py - chosen.y - 5, 20, ch - 30)}px`);
    }

    function requestLayout(focus) {
      if (typeof focus === 'string') pendingFocus = focus;
      if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
      layoutFrame = window.requestAnimationFrame(() => {
        layoutFrame = 0;
        layout();
        const card = currentCard();
        if (card && pendingFocus) {
          const target = pendingFocus === 'next' ? card.querySelector('[data-rhid-card-next]') : card;
          if (target) target.focus({ preventScroll: true });
        }
        pendingFocus = null;
      });
    }

    function render(focus, announce = true) {
      root.dataset.mode = state.complete ? 'complete' : state.step !== null ? 'guided' : 'free';
      panels.forEach((panel, i) => {
        panel.hidden = i !== state.scene;
        panel.setAttribute('role', 'tabpanel');
        notes[i].forEach((note, j) => {
          note.hidden = i !== state.scene || j !== state.feature || !state.open || state.complete;
        });
        panel.querySelectorAll('[data-rhid-feature]').forEach(button => {
          button.setAttribute('aria-pressed', String(i === state.scene && Number(button.dataset.rhidFeature) === state.feature && state.open && !state.complete));
        });
        const highlight = panel.querySelector('.rhid-highlight');
        if (highlight) highlight.hidden = i !== state.scene || !state.open || state.complete;
      });
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === state.scene));
        tab.tabIndex = i === state.scene ? 0 : -1;
      });
      const panel = panels[state.scene];
      const scene = data.scenes[state.scene];
      const feature = scene.features[state.feature];
      panel.querySelector('.rhid-screen-canvas img').loading = 'eager';
      const highlight = panel.querySelector('.rhid-highlight');
      if (highlight) {
        ['left', 'top', 'width', 'height'].forEach((property, i) => {
          highlight.style.setProperty(`--spot-${property}`, `${feature.rect[i]}%`);
        });
      }
      complete.hidden = !state.complete;
      if (state.complete && complete.parentElement !== screens[state.scene]) screens[state.scene].append(complete);
      banner.hidden = state.step === null || state.complete;
      progress.forEach((button, i) => {
        if (i === state.step) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      const card = currentCard();
      if (state.step !== null) tourTitle.textContent = `${state.step + 1} de ${data.steps.length} · ${data.steps[state.step].name}`;
      if (card && !state.complete) {
        const guided = state.step !== null;
        const position = guided ? state.step : freeIndex();
        const length = guided ? data.steps.length : freeRoute.length;
        card.querySelector('[data-rhid-card-label]').textContent = guided ? 'Tour guiado' : scene.label;
        card.querySelector('[data-rhid-card-count]').textContent = guided ? `${state.step + 1} / ${data.steps.length}` : `${state.feature + 1} / ${scene.features.length}`;
        card.querySelector('[data-rhid-card-prev]').disabled = position <= 0;
        const next = card.querySelector('[data-rhid-card-next]');
        next.querySelector('span').textContent = position === length - 1 ? 'Concluir' : 'Próximo';
        next.setAttribute('aria-label', position === length - 1 ? 'Concluir apresentação' : 'Próximo destaque da apresentação');
        card.querySelector('[data-rhid-card-close]').setAttribute('aria-label', guided ? 'Sair do tour e fechar explicação' : 'Fechar explicação');
      }
      if (announce) {
        live.textContent = state.complete ? 'Tour concluído. Você pode explorar novamente ou falar com a RealPonto.' :
          state.open ? `${state.step !== null ? `Etapa ${state.step + 1} de ${data.steps.length}. ` : ''}${scene.label}: ${feature.label}. ${feature.text}` : 'Explicação fechada. Selecione um dos destaques para reabrir.';
      }
      requestLayout(focus);
    }

    function selectFeature(scene, feature, focus) {
      if (!validIndex(scene, panels.length) || !validIndex(feature, data.scenes[scene].features.length)) return;
      state.scene = scene; state.feature = feature; state.step = null; state.open = true; state.complete = false;
      render(focus);
    }
    function applyStep(index, focus) {
      if (!validIndex(index, data.steps.length)) return;
      const step = data.steps[index];
      state.scene = step.scene; state.feature = step.feature;
      state.step = index; state.open = true; state.complete = false;
      render(focus);
    }
    function advance(delta) {
      if (state.complete || !state.open) return;
      if (state.step !== null) {
        const target = state.step + delta;
        if (target === data.steps.length) { finish(); return; }
        if (validIndex(target, data.steps.length)) applyStep(target, 'next');
      } else {
        const target = freeIndex() + delta;
        if (target === freeRoute.length) { finish(); return; }
        if (validIndex(target, freeRoute.length)) selectFeature(freeRoute[target].scene, freeRoute[target].feature, 'next');
      }
    }
    function finish() {
      state.step = null; state.complete = true; state.open = false;
      render('card');
    }
    function closeCard() {
      state.step = null; state.complete = false; state.open = false;
      render();
      const selector = mobile.matches ? '.rhid-feature-pick' : '.rhid-hotspot';
      const trigger = panels[state.scene].querySelector(`${selector}[data-rhid-feature="${state.feature}"]`);
      (trigger || tabs[state.scene]).focus({ preventScroll: true });
    }
    function scrollToDemo() {
      const header = document.querySelector('.header');
      const headerRect = header ? header.getBoundingClientRect() : { bottom: 0 };
      const screen = screens[state.scene];
      // Leva o próprio painel de imagem à área visível, sem rolagens a cada etapa.
      const offset = Math.max(16, Math.min(headerRect.bottom + 16, 180));
      const top = screen.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: motion.matches ? 'instant' : 'smooth' });
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => selectFeature(i, 0));
      tab.addEventListener('keydown', event => {
        let target = i;
        if (event.key === 'ArrowRight') target = (i + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') target = (i - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = tabs.length - 1;
        else return;
        event.preventDefault(); selectFeature(target, 0); tabs[target].focus({ preventScroll: true });
      });
    });
    panels.forEach((panel, i) => {
      panel.querySelectorAll('[data-rhid-feature]').forEach(button => {
        button.addEventListener('click', () => selectFeature(i, Number(button.dataset.rhidFeature)));
      });
      panel.querySelectorAll('[data-rhid-card-next]').forEach(button => button.addEventListener('click', () => advance(1)));
      panel.querySelectorAll('[data-rhid-card-prev]').forEach(button => button.addEventListener('click', () => advance(-1)));
    });
    root.querySelectorAll('[data-rhid-card-close]').forEach(button => button.addEventListener('click', closeCard));
    document.querySelectorAll('[data-rhid-start]').forEach(button => {
      button.addEventListener('click', () => {
        applyStep(0, 'next');
        window.requestAnimationFrame(scrollToDemo);
      });
    });
    document.querySelectorAll('[data-rhid-jump]').forEach(link => {
      link.addEventListener('click', event => {
        const index = Number(link.dataset.rhidJump);
        if (!validIndex(index, panels.length)) return;
        event.preventDefault(); selectFeature(index, 0, 'card');
        window.requestAnimationFrame(scrollToDemo);
      });
    });
    root.querySelector('[data-rhid-exit]').addEventListener('click', () => {
      selectFeature(state.scene, state.feature, 'card');
    });
    progress.forEach(button => button.addEventListener('click', () => applyStep(Number(button.dataset.rhidStep), 'next')));
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && currentCard()) { event.preventDefault(); closeCard(); }
    });

    // Ampliação continua limpa, com a captura completa e sem recortes.
    const dialog = document.getElementById('rhid-zoom-dialog');
    if (dialog) {
      const image = dialog.querySelector('[data-rhid-zoom-img]');
      const title = document.getElementById('rhid-zoom-title');
      const viewport = dialog.querySelector('.rhid-zoom-viewport');
      const actualButton = dialog.querySelector('[data-rhid-actual]');
      const closeButton = dialog.querySelector('[data-rhid-close]');
      let opener = null;
      let savedOverflow = '';
      function originalSize(enabled) {
        viewport.classList.toggle('rhid-original-size', enabled);
        actualButton.setAttribute('aria-pressed', String(enabled));
        actualButton.textContent = enabled ? 'Ajustar à tela' : 'Ver em tamanho original';
        viewport.scrollTo(0, 0);
      }
      panels.forEach((panel, i) => {
        panel.querySelector('[data-rhid-zoom]').addEventListener('click', event => {
          const capture = panel.querySelector('.rhid-screen-canvas img');
          if (typeof dialog.showModal !== 'function') {
            window.open(capture.src, '_blank', 'noopener,noreferrer'); return;
          }
          opener = event.currentTarget; image.src = capture.src; image.alt = capture.alt;
          title.textContent = `RHiD · ${data.scenes[i].label}`;
          originalSize(false);
          savedOverflow = document.documentElement.style.overflow;
          document.documentElement.style.overflow = 'hidden';
          dialog.showModal(); closeButton.focus();
        });
      });
      closeButton.addEventListener('click', () => dialog.close());
      actualButton.addEventListener('click', () => {
        originalSize(actualButton.getAttribute('aria-pressed') !== 'true'); viewport.focus();
      });
      dialog.addEventListener('click', event => {
        const r = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < r.left || event.clientX > r.right ||
            event.clientY < r.top || event.clientY > r.bottom)) dialog.close();
      });
      dialog.addEventListener('close', () => {
        document.documentElement.style.overflow = savedOverflow;
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      });
    }

    // Reposiciona após rotação, redimensionamento, carregamento da imagem ou da fonte.
    window.addEventListener('resize', () => requestLayout(), { passive: true });
    panels.forEach(panel => panel.querySelector('.rhid-screen-canvas img').addEventListener('load', () => requestLayout()));
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => requestLayout());
      screens.forEach(screen => observer.observe(screen));
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestLayout());
    root.dataset.ready = 'true';
    document.body.classList.add('rhid-ready');
    render(null, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
