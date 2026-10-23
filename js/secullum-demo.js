/* Secullum RH — demonstração visual RealPonto, versão 3.
 * Seis capturas, oito etapas guiadas e dezoito destaques livres.
 * As configurações ficam em #secullum-demo-data, no HTML.
 * Sem login, chamadas à API do produto, cookies ou gravação de dados.
 * Este arquivo não altera o tour RHiD nem o JavaScript geral do site.
 */
(() => {
  'use strict';

  function initSecullum() {
    const byId = id => document.getElementById(id);
    const root = byId('sc-demo');
    const source = byId('secullum-demo-data');
    if (!root || !source || root.dataset.ready === 'true') return;

    let data;
    try { data = JSON.parse(source.textContent); } catch (_) { return; }
    const scenes = data.scenes;
    const steps = data.steps;
    const valid = (index, length) => Number.isInteger(index) && index >= 0 && index < length;
    if (!Array.isArray(scenes) || !scenes.length || !Array.isArray(steps) || !steps.length) return;
    if (scenes.some(scene => !Array.isArray(scene.features) || scene.features.length !== 3 ||
        !Number.isFinite(scene.width) || !Number.isFinite(scene.height) || scene.height <= 0 ||
        scene.features.some(feature => !Array.isArray(feature.point) || feature.point.length !== 2 ||
          !Array.isArray(feature.rect) || feature.rect.length !== 4 ||
          !feature.point.concat(feature.rect).every(Number.isFinite)))) return;
    if (steps.some(step => !valid(step.scene, scenes.length) || !valid(step.feature, scenes[step.scene].features.length))) return;

    const tabs = [...root.querySelectorAll('[data-sc-tab]')];
    if (tabs.length !== scenes.length) return;
    const features = [...root.querySelectorAll('[data-sc-feature]')];
    const pins = [...root.querySelectorAll('.sc-pin')];
    const panel = byId('sc-panel');
    const screen = byId('sc-screen');
    const canvas = byId('sc-canvas');
    const image = byId('sc-image');
    const highlight = byId('sc-highlight');
    const card = byId('sc-card');
    const cardTitle = byId('sc-card-title');
    const cardText = byId('sc-card-text');
    const cardLabel = byId('sc-card-label');
    const cardCount = byId('sc-card-count');
    const prev = byId('sc-prev');
    const next = byId('sc-next');
    const tourbar = byId('sc-tourbar');
    const progress = byId('sc-progress');
    const status = byId('sc-status');
    const error = byId('sc-image-error');
    const mobile = matchMedia('(max-width:900px)');
    const reduced = matchMedia('(prefers-reduced-motion:reduce)');
    const path = 'img/secullum-demo/';
    const flat = scenes.flatMap((scene, si) => scene.features.map((_, fi) => ({ scene: si, feature: fi })));
    const contact = 'https://wa.me/551141262929?text=' + encodeURIComponent(
      'Olá, conheci o Secullum RH na demonstração do site da RealPonto e gostaria de conversar sobre o sistema para minha empresa.'
    );
    document.querySelectorAll('[data-sc-contact]').forEach(anchor => { anchor.href = contact; });

    const state = { scene: 0, feature: 0, step: null, completed: false, open: true };
    let frame = 0;
    let fallbackUsed = false;
    const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
    const activeScene = () => scenes[state.scene];
    const activeFeature = () => activeScene().features[state.feature];
    const flatIndex = () => flat.findIndex(item => item.scene === state.scene && item.feature === state.feature);
    const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

    function queueLayout() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    }

    function layout() {
      const w = screen.clientWidth;
      if (!w) return;
      const ratio = activeScene().width / activeScene().height;
      screen.style.setProperty('--sc-ratio', String(ratio));
      if (!state.open) {
        canvas.style.width = '100%';
        canvas.style.transform = 'none';
        return;
      }
      const h = screen.clientHeight;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const f = activeFeature();
      if (mobile.matches) {
        // A captura continua ocupando todo o painel, inclusive atrás do cartão.
        // A região ativa é trazida para a área livre acima da explicação.
        const bw = Math.max(w * 2.5, h * ratio * 1.35);
        const bh = bw / ratio;
        const visible = Math.max(150, h - ch - 32);
        const x = clamp(w / 2 - bw * f.point[0] / 100, w - bw, 0);
        const y = clamp(visible / 2 - bh * f.point[1] / 100, h - bh, 0);
        canvas.style.width = `${bw}px`;
        canvas.style.transform = `translate(${x}px,${y}px)`;
        card.style.left = `${(w - cw) / 2}px`;
        card.style.top = `${state.completed ? Math.max(12, (h - ch) / 2) : Math.max(12, h - ch - 12)}px`;
        return;
      }
      canvas.style.width = '100%';
      canvas.style.transform = 'none';
      if (state.completed) {
        card.style.left = `${(w - cw) / 2}px`;
        card.style.top = `${Math.max(12, (h - ch) / 2)}px`;
        return;
      }
      const r = f.rect;
      const box = { x: w * r[0] / 100, y: h * r[1] / 100, w: w * r[2] / 100, h: h * r[3] / 100 };
      const px = w * f.point[0] / 100;
      const py = h * f.point[1] / 100;
      const locations = [
        [box.x + box.w + 16, py - ch / 2], [box.x - cw - 16, py - ch / 2],
        [px - cw / 2, box.y + box.h + 16], [px - cw / 2, box.y - ch - 16],
        [w - cw - 12, h - ch - 12], [12, h - ch - 12], [w - cw - 12, 12], [12, 12]
      ];
      // Também considera a área inteira, evitando cobrir os demais marcadores.
      for (let column = 0; column <= 8; column += 1) {
        for (let row = 0; row <= 6; row += 1) {
          locations.push([12 + Math.max(0, w - cw - 24) * column / 8,
            12 + Math.max(0, h - ch - 24) * row / 6]);
        }
      }
      const options = locations.map(([x, y]) => {
        const boxCandidate = { x: clamp(x, 12, w - cw - 12), y: clamp(y, 12, h - ch - 12), w: cw, h: ch };
        const coveredPins = pins.reduce((score, _, i) => {
          const point = activeScene().features[i].point;
          return score + overlap(boxCandidate, { x: w * point[0] / 100 - 18, y: h * point[1] / 100 - 18, w: 36, h: 36 });
        }, 0);
        return { ...boxCandidate, score: overlap(boxCandidate, box) * 20 + coveredPins * 100000 +
          Math.hypot(boxCandidate.x + cw / 2 - px, boxCandidate.y + ch / 2 - py) };
      }).sort((a, b) => a.score - b.score);
      card.style.left = `${options[0].x}px`;
      card.style.top = `${options[0].y}px`;
    }

    function requestCapture() {
      const scene = activeScene();
      const src = path + scene.image;
      image.width = scene.width;
      image.height = scene.height;
      screen.style.setProperty('--sc-ratio', String(scene.width / scene.height));
      image.alt = scene.alt;
      if (image.getAttribute('src') !== src) {
        fallbackUsed = false;
        error.hidden = true;
        screen.setAttribute('aria-busy', 'true');
        image.src = src;
      }
    }

    function render(announce = true) {
      const scene = activeScene();
      const f = activeFeature();
      requestCapture();
      byId('sc-scene-title').textContent = scene.title;
      byId('sc-scene-intro').textContent = scene.intro;
      panel.setAttribute('aria-labelledby', `sc-tab-${state.scene}`);
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === state.scene));
        tab.tabIndex = i === state.scene ? 0 : -1;
      });
      features.forEach(button => {
        const i = Number(button.dataset.scFeature);
        button.setAttribute('aria-label', `Mostrar destaque ${i + 1}: ${scene.features[i].title}`);
        button.setAttribute('aria-controls', 'sc-card');
        button.setAttribute('aria-pressed', String(!state.completed && state.open && i === state.feature));
      });
      pins.forEach((pin, i) => {
        pin.style.left = `${scene.features[i].point[0]}%`;
        pin.style.top = `${scene.features[i].point[1]}%`;
        pin.hidden = state.completed;
      });
      ['left', 'top', 'width', 'height'].forEach((property, i) => { highlight.style[property] = `${f.rect[i]}%`; });
      highlight.hidden = !state.open || state.completed;
      card.hidden = !state.open;
      screen.dataset.cardOpen = String(state.open);
      byId('sc-complete-contact').hidden = !state.completed;
      tourbar.hidden = state.step === null || state.completed;
      [...progress.children].forEach((button, i) => {
        if (i === state.step && !state.completed) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      if (state.completed) {
        cardLabel.textContent = 'Percurso concluído';
        cardCount.textContent = '';
        cardTitle.textContent = 'Você conheceu as telas!';
        cardText.textContent = 'Converse com a RealPonto para avaliar o Secullum RH para a rotina da sua empresa.';
        prev.hidden = true;
        next.textContent = 'Rever tour ↻';
        next.setAttribute('aria-label', 'Reiniciar tour guiado');
      } else {
        prev.hidden = false;
        cardTitle.textContent = f.title;
        cardText.textContent = f.text;
        const guided = state.step !== null;
        const position = guided ? state.step : flatIndex();
        const length = guided ? steps.length : flat.length;
        cardLabel.textContent = guided ? 'Tour guiado' : scene.label;
        cardCount.textContent = guided ? `${state.step + 1} / ${steps.length}` : `${state.feature + 1} / ${scene.features.length}`;
        cardCount.setAttribute('aria-label', guided ? `Etapa ${position + 1} de ${length}` : `Destaque ${state.feature + 1} de ${scene.features.length} nesta tela`);
        prev.disabled = position === 0;
        next.textContent = position === length - 1 ? 'Concluir ✓' : 'Próximo →';
        next.setAttribute('aria-label', position === length - 1 ? 'Concluir apresentação' : 'Próximo destaque da apresentação');
        if (guided) byId('sc-tour-title').textContent = `${state.step + 1} de ${steps.length} · ${steps[state.step].title}`;
      }
      byId('sc-card-close').setAttribute('aria-label', state.step !== null ? 'Sair do tour e fechar explicação' : 'Fechar explicação');
      if (announce) {
        status.textContent = state.completed ? 'Tour concluído. Explore novamente ou fale com a RealPonto.' : state.open ?
          `${state.step !== null ? `Etapa ${state.step + 1} de ${steps.length}. ` : ''}${scene.label}. ${cardTitle.textContent}. ${cardText.textContent}` :
          `${scene.label}. Explicação fechada. Selecione um destaque para reabrir.`;
      }
      queueLayout();
    }

    function select(scene, feature, step = null) {
      if (!valid(scene, scenes.length) || !valid(feature, scenes[scene].features.length)) return;
      Object.assign(state, { scene, feature, step, completed: false, open: true });
      render();
    }
    function goToStep(index) {
      if (valid(index, steps.length)) select(steps[index].scene, steps[index].feature, index);
    }
    function scrollDemo() {
      // Alinha a imagem — não o cabeçalho do componente — na área de leitura.
      const header = document.querySelector('.header');
      const offset = (header ? header.getBoundingClientRect().height : 0) + 16;
      const top = screen.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: reduced.matches ? 'instant' : 'smooth' });
    }
    function start() {
      goToStep(0);
      requestAnimationFrame(scrollDemo);
      next.focus({ preventScroll: true });
    }
    function finish() {
      Object.assign(state, { completed: true, open: true, step: null });
      render();
      next.focus({ preventScroll: true });
    }
    function advance(delta) {
      if (state.completed) { if (delta > 0) start(); return; }
      if (state.step !== null) {
        const index = state.step + delta;
        if (index === steps.length) finish();
        else goToStep(index);
      } else {
        const index = flatIndex() + delta;
        if (index === flat.length) finish();
        else if (valid(index, flat.length)) select(flat[index].scene, flat[index].feature);
      }
    }
    function closeNote() {
      Object.assign(state, { open: false, completed: false, step: null });
      render();
      const selector = mobile.matches ? '.sc-pick' : '.sc-pin';
      root.querySelector(`${selector}[data-sc-feature="${state.feature}"]`)?.focus({ preventScroll: true });
    }

    steps.forEach((step, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(i + 1);
      button.setAttribute('aria-label', `Etapa ${i + 1}: ${step.title}`);
      button.addEventListener('click', () => goToStep(i));
      progress.appendChild(button);
    });
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i, 0));
      tab.addEventListener('keydown', event => {
        let target;
        if (event.key === 'ArrowRight') target = (i + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') target = (i - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = tabs.length - 1;
        else return;
        event.preventDefault();
        select(target, 0);
        tabs[target].focus({ preventScroll: true });
      });
    });
    features.forEach(button => button.addEventListener('click', () => select(state.scene, Number(button.dataset.scFeature))));
    prev.addEventListener('click', () => advance(-1));
    next.addEventListener('click', () => advance(1));
    byId('sc-card-close').addEventListener('click', closeNote);
    byId('sc-exit').addEventListener('click', () => { state.step = null; state.completed = false; render(); });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.open) { event.preventDefault(); closeNote(); }
    });
    document.querySelectorAll('[data-sc-start]').forEach(button => button.addEventListener('click', start));
    document.querySelectorAll('[data-sc-jump]').forEach(anchor => anchor.addEventListener('click', event => {
      const index = Number(anchor.dataset.scJump);
      if (!valid(index, scenes.length)) return;
      event.preventDefault();
      select(index, 0);
      requestAnimationFrame(scrollDemo);
      next.focus({ preventScroll: true });
    }));
    image.addEventListener('load', () => {
      screen.setAttribute('aria-busy', 'false');
      error.hidden = true;
      queueLayout();
    });
    image.addEventListener('error', () => {
      if (!fallbackUsed && activeScene().fallback) {
        fallbackUsed = true;
        image.src = path + activeScene().fallback;
        return;
      }
      screen.setAttribute('aria-busy', 'false');
      error.hidden = false;
      status.textContent = 'Não foi possível abrir a captura. Use o botão Tentar novamente.';
    });
    byId('sc-image-retry').addEventListener('click', () => {
      error.hidden = true;
      fallbackUsed = false;
      screen.setAttribute('aria-busy', 'true');
      image.src = path + activeScene().image;
    });

    // Ampliação com diálogo nativo, tamanho original e restituição de foco.
    const dialog = byId('sc-dialog');
    const dialogImage = byId('sc-dialog-image');
    const view = byId('sc-dialog-view');
    const original = byId('sc-original');
    const dialogClose = byId('sc-dialog-close');
    let oldOverflow = '';
    let opener = null;
    function setOriginal(enabled) {
      view.classList.toggle('sc-original', enabled);
      original.setAttribute('aria-pressed', String(enabled));
      original.textContent = enabled ? 'Ajustar à tela' : 'Tamanho original';
      view.scrollTo(0, 0);
    }
    byId('sc-zoom').addEventListener('click', event => {
      if (typeof dialog.showModal !== 'function') {
        window.open(image.src, '_blank', 'noopener,noreferrer');
        return;
      }
      opener = event.currentTarget;
      dialogImage.src = image.src;
      dialogImage.alt = image.alt;
      dialogImage.width = activeScene().width;
      dialogImage.height = activeScene().height;
      byId('sc-dialog-title').textContent = `Secullum RH — ${activeScene().label}`;
      setOriginal(false);
      oldOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      dialog.showModal();
      dialogClose.focus();
    });
    original.addEventListener('click', () => { setOriginal(original.getAttribute('aria-pressed') !== 'true'); view.focus(); });
    dialogClose.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.documentElement.style.overflow = oldOverflow;
      opener?.focus({ preventScroll: true });
    });

    window.addEventListener('resize', queueLayout, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(queueLayout);
      observer.observe(screen);
      observer.observe(card);
    }
    if (document.fonts?.ready) document.fonts.ready.then(queueLayout);
    root.dataset.ready = 'true';
    document.body.classList.add('rhid-ready', 'sc-ready');
    render(false);
    // Precarrega somente as capturas da demonstração; nenhum recurso externo.
    scenes.slice(1).forEach(scene => { const preload = new Image(); preload.src = path + scene.image; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSecullum, { once: true });
  else initSecullum();
})();
