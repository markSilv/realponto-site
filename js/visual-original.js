/*
 * RealPonto | Visual original, entrada completa por bloco e montagem reversível suave — v4.2 — integração de páginas
 * JavaScript nativo. Não substitui o script original nem interfere no scroll.
 * A rolagem dispara a entrada inteira; não controla a opacidade quadro a quadro.
 * O mesmo bloco só desmonta ao sair pela borda inferior, na rolagem para cima.
 * A API RealPontoUI no final facilita manutenção e testes locais.
 */
(function () {
  "use strict";

  const CONFIG = Object.freeze({
    enterAt: 0.94,          // Inicia junto à borda inferior da janela.
    exitAt: 0.99,           // Só desmonta ao sair por baixo, na subida.
    readyAt: 0.76,          // Rolagem rápida: já mostra pronto na área de leitura.
    enterDuration: 1000,    // 1 segundo no computador; termina mesmo sem continuar rolando.
    mobileDuration: 850,    // Entrada suave no celular (0,85 segundo).
    exitDuration: 550,      // Desmontagem suave na subida (0,55 segundo).
    sideTravel: 176,
    visualSideTravel: 238,
    textSideTravel: 132,
    riseTravel: 136,
    diagonalRise: 62,
    mobileFactor: 0.56,
    settleOvershoot: 9
  });

  const THEME_KEY = "realponto:theme:v2";
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 700px)");
  let requestedMotion = true;
  let printing = false;
  let themeControl;
  let records = [];
  let groups = [];
  let initialPass = true;
  let revealViewport = false;
  let raf = 0;
  let layoutDirty = true;
  let maxScroll = 0;
  let focused = null;
  let lastY = 0;
  let direction = "down";
  let active = false;
  const clamp = value => Math.max(0, Math.min(1, value));

  function setTheme(value, save = true) {
    const theme = value === "dark" ? "dark" : "light";
    root.dataset.rpTheme = theme;
    // Cor da barra do navegador: acompanha o tema sem mudar as animações.
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      if (!themeMeta.hasAttribute("data-rp-light-color")) {
        themeMeta.setAttribute("data-rp-light-color", themeMeta.content || "#071c35");
      }
      themeMeta.content = theme === "dark" ? "#000000" : themeMeta.getAttribute("data-rp-light-color");
    }
    if (save) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* O botão funciona mesmo sem armazenamento. */ }
      if (location.protocol === "file:") {
        try {
          const url = new URL(location.href);
          url.searchParams.set("rp-theme", theme);
          history.replaceState(history.state, "", url.href);
        } catch (_) { /* Alguns navegadores restringem o histórico em arquivos locais. */ }
      }
    }
    if (themeControl) themeControl.querySelectorAll("[data-rp-set-theme]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.rpSetTheme === theme));
    });
  }

  function buildThemeControl() {
    if (document.querySelector(".rp-theme-control")) return;
    themeControl = document.createElement("div");
    themeControl.className = "rp-theme-control";
    themeControl.setAttribute("role", "group");
    themeControl.setAttribute("aria-label", "Cor de fundo do site");
    themeControl.innerHTML = `
      <button class="rp-theme-option" type="button" data-rp-set-theme="light" aria-pressed="true" title="Modo claro: fundo branco original">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.8"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><span>Claro</span>
      </button>
      <button class="rp-theme-option" type="button" data-rp-set-theme="dark" aria-pressed="false" title="Modo escuro: preto, grafite e conexões">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 13.1A8.5 8.5 0 0 1 10.9 3.5a8.5 8.5 0 1 0 9.6 9.6Z"/></svg><span>Escuro</span>
      </button>`;
    themeControl.addEventListener("click", event => {
      const button = event.target.closest("[data-rp-set-theme]");
      if (button) setTheme(button.dataset.rpSetTheme);
    });
    document.body.appendChild(themeControl);
    setTheme(root.dataset.rpTheme, false);
  }

  // Peças independentes: sem envolver/alterar os grids e sem animar os slides.
  const TARGETS = [
    ".hero-copy > .eyebrow", ".hero-copy > h1", ".hero-copy > .lead",
    ".hero-copy > .hero-actions", ".hero-proof > span", ".hero-circle",
    "main .section-head", "main [class*='section-head']",
    ".cards > a", ".cards > article", ".relogios-grid > a",
    ".sistemas-grid > a", ".seguranca-grid > div", ".identidade-grid > div",
    ".feature-visual", ".feature-grid > div:last-child > .eyebrow",
    ".feature-grid > div:last-child > h2", ".feature-grid > div:last-child > .lead",
    ".feature-item", ".feature-grid > div:last-child > .btn",
    ".trust-box", ".reason", ".about-text", ".segment", ".step",
    ".faq-grid > div:first-child", ".faq", ".cta-box > div",
    ".locacao-beneficio", ".locacao-apresentacao-copy", ".locacao-equipamentos-carousel",
    ".locacao-opcionais", ".locacao-atencao-grid > div:first-child",
    ".locacao-atencao-lista > div", ".locacao-comparativo-box",
    ".locacao-escolha-card", ".locacao-processo-linha > article",
    ".locacao-faq-grid > div:first-child", ".locacao-faq-list > details",
    ".modulos-intro-produto", ".modulos-intro-copy", ".modulos-aplicacao-copy",
    ".modulos-aplicacao-media", ".modulos-galeria-item", ".modulos-cenario-card",
    ".modulos-processo-card", ".modulos-faq-intro", ".modulos-faq-list > details",
    ".suporte-intro-box", ".suporte-marcas-titulo", ".suporte-marcas > *",
    ".suporte-servico-imagem", ".suporte-servico-content", ".suporte-etapa", ".suporte-avulso-content",
    ".assistencia-intro-box", ".assistencia-problema", ".assistencia-tipo",
    ".assistencia-marcas-texto", ".assistencia-equipamentos-grid > div:first-child",
    ".assistencia-check-list > div", ".assistencia-etapa", ".assistencia-laboratorio-copy",
    ".assistencia-laboratorio-destaques > div", ".assistencia-faq-list > details",
    ".real-power-visual", ".real-power-copy", ".real-power-benefits-grid > article",
    ".real-power-compat-card", ".real-power-compat-alert", ".real-power-faq-intro",
    ".real-power-faq-list > details", ".real-power-manual-box > div",
    ".internal-page-content > .container > .produto-carousel",
    ".internal-page-content > .container > .fotos-relogios",
    ".internal-page-content > .container > .internal-empty-area",
    ".produto-assistencia-inner > div", ".produto-assistencia-inner > .btn",
    ".rhid-hero-grid > div", ".rhid-section-heading",
    ".rhid-demo", ".sc-demo", ".rhid-demo-disclaimer",
    ".rhid-value-grid > article", ".rhid-support-box > div",
    ".rhid-faq-grid > div", ".rhid-final > .container",
    "footer .footer-grid > div", "footer .footer-bottom"
  ].join(",");

  const KEEP_RISING = [
    ".trust-box", ".cta-box > div", ".locacao-opcionais", ".locacao-comparativo-box",
    ".real-power-compat-alert", ".real-power-manual-box > div",
    ".rhid-demo", ".sc-demo", ".rhid-final > .container",
    ".internal-empty-area", "footer .footer-bottom"
  ].join(",");

  const FORCE_SIDE = [
    ".rhid-hero-grid > div", ".rhid-section-heading", ".rhid-support-box > div",
    ".rhid-faq-grid > div",
    "main .section-head", "main [class*='section-head']", ".feature-visual",
    ".locacao-apresentacao-copy", ".locacao-equipamentos-carousel",
    ".locacao-atencao-grid > div:first-child", ".modulos-intro-produto",
    ".modulos-intro-copy", ".modulos-aplicacao-copy", ".modulos-aplicacao-media",
    ".suporte-servico-imagem", ".suporte-servico-content", ".suporte-avulso-content",
    ".assistencia-marcas-texto", ".assistencia-equipamentos-grid > div:first-child",
    ".assistencia-laboratorio-copy", ".real-power-visual", ".real-power-copy",
    ".faq-grid > div:first-child", ".locacao-faq-grid > div:first-child",
    ".modulos-faq-intro", ".real-power-faq-intro", ".produto-assistencia-inner > div"
  ].join(",");

  // Imagem, título, texto, lista e botão da mesma composição entram juntos.
  // Cartões fora dessas composições são sincronizados apenas por linha.
  const SYNC_GROUPS = [
    ".rhid-hero-grid", ".rhid-support-box",
    ".hero-grid", ".feature-grid", ".trust-grid", ".cta-box",
    ".locacao-apresentacao-grid", ".locacao-atencao-grid",
    ".modulos-intro-grid", ".modulos-aplicacao-grid",
    ".suporte-servico-grid", ".assistencia-equipamentos-grid",
    ".assistencia-laboratorio-grid", ".real-power-grid",
    ".real-power-manual-box", ".produto-assistencia-inner"
  ].join(",");

  function getDocumentPosition(element) {
    let top = 0;
    let left = 0;
    for (let node = element; node; node = node.offsetParent) {
      top += node.offsetTop || 0;
      left += node.offsetLeft || 0;
    }
    return { top, left };
  }

  function getKind(element) {
    const label = element.className || "";
    if (/(visual|imagem|media|carousel|fotos|hero-circle|intro-produto)/.test(label)) return "visual";
    if (/^(H[1-6]|P|SPAN)$/.test(element.tagName) || /(head|copy|content|faq-intro)/.test(label)) return "text";
    return "card";
  }

  function getSectionIndex(element, sectionMap) {
    const section = element.closest("main section, footer");
    return sectionMap.has(section) ? sectionMap.get(section) : 0;
  }

  function chooseDirection(record, viewportWidth) {
    if (record.rowCount > 1) {
      const middle = (record.rowCount - 1) / 2;
      if (record.rowIndex < middle) return -1;
      if (record.rowIndex > middle) return 1;
    }

    const center = record.left + record.width / 2;
    const deadZone = viewportWidth * (mobile.matches ? 0.035 : 0.075);
    if (center < viewportWidth / 2 - deadZone) return -1;
    if (center > viewportWidth / 2 + deadZone) return 1;
    return (record.sectionIndex + record.index) % 2 ? 1 : -1;
  }

  function chooseProfile(record) {
    const element = record.element;

    // Algumas caixas continuam vindo de baixo para manter variedade visual.
    if (element.matches(KEEP_RISING)) return element.matches(".trust-box, .cta-box > div") ? "zoom" : "rise";

    // Imagem e texto de composições em duas colunas entram de lados opostos.
    if (element.matches(FORCE_SIDE) || record.kind === "visual") return "side";

    // Grids se montam das bordas para o centro. O cartão central, quando existe,
    // mantém a entrada vertical para não transformar tudo no mesmo efeito.
    if (record.rowCount > 1) {
      const middle = (record.rowCount - 1) / 2;
      if (Number.isInteger(middle) && record.rowIndex === middle) return "rise";
      return "diagonal";
    }

    // Listas e perguntas alternam esquerda/direita durante a leitura.
    if (element.matches("details, .faq, .reason, .step, .feature-item, .segment, [class*='etapa'], [class*='problema'], [class*='tipo']")) {
      return "side";
    }

    // Textos agrupados recebem deslocamento lateral mais suave.
    if (record.kind === "text") return "soft-side";

    // Nos demais cartões, alterna lateral/vertical para preservar ritmo.
    return (record.index + record.sectionIndex) % 3 === 1 ? "rise" : "diagonal";
  }

  function measure() {
    const height = window.innerHeight;
    const viewportWidth = document.documentElement.clientWidth;
    maxScroll = Math.max(0, document.documentElement.scrollHeight - height);
    const previousGroups = new Map(groups.map(group => [group.key, group]));
    const nextGroups = new Map();

    // Medidas de layout sem incluir as transformações da própria animação.
    records.forEach(record => {
      const position = getDocumentPosition(record.element);
      record.top = position.top;
      record.left = position.left;
      record.height = record.element.offsetHeight;
      record.width = record.element.offsetWidth;
    });

    records.forEach(record => {
      const peers = records
        .filter(peer => peer.element.parentElement === record.element.parentElement && Math.abs(peer.top - record.top) < 20)
        .sort((a, b) => a.left - b.left);

      record.rowCount = peers.length;
      record.rowIndex = Math.max(0, peers.indexOf(record));
      record.from = chooseDirection(record, viewportWidth);
      record.profile = chooseProfile(record);

      const anchor = record.element.closest(SYNC_GROUPS);
      const key = anchor || (peers[0] && peers[0].element) || record.element;
      if (!nextGroups.has(key)) {
        const previous = previousGroups.get(key);
        nextGroups.set(key, {
          key,
          records: [],
          top: anchor ? getDocumentPosition(anchor).top : record.top,
          bottom: 0,
          shown: previous ? previous.shown : null
        });
      }
      const group = nextGroups.get(key);
      group.top = Math.min(group.top, record.top);
      group.bottom = Math.max(group.bottom, record.top + record.height);
      group.records.push(record);
      record.group = group;

      record.element.dataset.rpMotion = record.profile;
      record.element.dataset.rpFrom = record.profile === "rise" || record.profile === "zoom"
        ? "bottom" : (record.from < 0 ? "left" : "right");
    });

    groups = [...nextGroups.values()];
    groups.forEach(group => {
      group.enter = Math.min(group.top - height * CONFIG.enterAt, Math.max(0, maxScroll - 2));
      group.exit = group.top - height * CONFIG.exitAt;
      group.records.forEach(record => {
        record.start = group.enter;
        record.end = group.top - height * CONFIG.readyAt;
      });
    });
    layoutDirty = false;
  }

  function cancel(record) {
    if (!record.animation) return;
    record.animation.onfinish = null;
    record.animation.cancel();
    record.animation = null;
  }

  function restoreInline(record) {
    // Só restauramos as propriedades que esta versão modifica diretamente.
    // Transform/translate/scale/rotate originais continuam livres para hover.
    Object.keys(record.inline).forEach(property => {
      const saved = record.inline[property];
      if (saved.value) record.element.style.setProperty(property, saved.value, saved.priority);
      else record.element.style.removeProperty(property);
    });
  }

  function settle(record, visible) {
    cancel(record);
    restoreInline(record);
    if (!visible) {
      record.element.style.setProperty("opacity", "0");
      record.element.style.setProperty("pointer-events", "none");
    }
    record.state = visible ? "visible" : "hidden";
    record.progress = visible ? 1 : 0;
    record.element.dataset.rpState = record.state;
  }

  function getMotionValues(record) {
    const small = mobile.matches;
    const factor = small ? CONFIG.mobileFactor : 1;
    const sign = record.from || 1;
    let x = 0;
    let y = 0;
    let scale = 0.92;
    let tilt = 0;

    switch (record.profile) {
      case "side":
        x = sign * (record.kind === "visual" ? CONFIG.visualSideTravel : record.kind === "text" ? CONFIG.textSideTravel : CONFIG.sideTravel) * factor;
        y = (record.kind === "visual" ? 24 : 14) * factor;
        scale = record.kind === "visual" ? 0.89 : record.kind === "text" ? 0.975 : 0.94;
        tilt = sign * (small ? 0.7 : 1.7);
        break;
      case "soft-side":
        x = sign * CONFIG.textSideTravel * 0.78 * factor;
        y = 18 * factor;
        scale = 0.985;
        tilt = sign * (small ? 0.25 : 0.65);
        break;
      case "diagonal":
        x = sign * CONFIG.sideTravel * 0.82 * factor;
        y = CONFIG.diagonalRise * factor;
        scale = record.kind === "visual" ? 0.87 : 0.91;
        tilt = sign * (small ? 0.9 : 2.1);
        break;
      case "zoom":
        x = sign * 18 * factor;
        y = CONFIG.riseTravel * 0.42 * factor;
        scale = 0.82;
        tilt = 0;
        break;
      case "rise":
      default:
        x = sign * 14 * factor;
        y = CONFIG.riseTravel * factor;
        scale = record.kind === "text" ? 0.98 : 0.89;
        tilt = sign * (small ? 0.25 : 0.75);
        break;
    }

    const hasSide = Math.abs(x) > Math.abs(y) * 0.9;
    const overshootX = hasSide ? -sign * CONFIG.settleOvershoot * factor : 0;
    const overshootY = hasSide ? -3 * factor : -CONFIG.settleOvershoot * 0.72 * factor;
    const overshootScale = record.kind === "text" ? 1.002 : 1.012;
    const overshootTilt = tilt ? -tilt * 0.12 : 0;

    return { x, y, scale, tilt, overshootX, overshootY, overshootScale, overshootTilt };
  }

  function makeAnimation(record) {
    const values = getMotionValues(record);
    const duration = mobile.matches ? CONFIG.mobileDuration : CONFIG.enterDuration;
    record.duration = duration;
    const animation = record.element.animate([
      {
        offset: 0,
        opacity: 0,
        translate: `${values.x}px ${values.y}px`,
        scale: String(values.scale),
        rotate: `${values.tilt}deg`,
        easing: "cubic-bezier(0.22, 0.61, 0.36, 1)"
      },
      {
        offset: 0.82,
        opacity: record.baseOpacity,
        translate: `${values.overshootX}px ${values.overshootY}px`,
        scale: String(values.overshootScale),
        rotate: `${values.overshootTilt}deg`,
        easing: "ease-out"
      },
      {
        offset: 1,
        opacity: record.baseOpacity,
        translate: "0px 0px",
        scale: "1",
        rotate: "0deg"
      }
    ], { duration, fill: "both", easing: "linear" });
    animation.pause();
    return animation;
  }

  function playTo(record, visible, immediately = false) {
    const finalState = visible ? "visible" : "hidden";
    const runningState = visible ? "entering" : "leaving";
    if (record.state === finalState && !record.animation) return;
    if (immediately) { settle(record, visible); return; }
    if (record.state === runningState && record.animation) return;

    // Uma inversão durante a entrada/saída parte do quadro atual, sem salto.
    if (!record.animation) {
      restoreInline(record);
      record.animation = makeAnimation(record);
      record.animation.currentTime = visible ? 0 : record.duration;
    }
    const animation = record.animation;
    if (visible) restoreInline(record);
    else record.element.style.setProperty("pointer-events", "none");
    record.state = runningState;
    record.element.dataset.rpState = runningState;
    const rate = visible ? 1 : -record.duration / CONFIG.exitDuration;
    if (typeof animation.updatePlaybackRate === "function") animation.updatePlaybackRate(rate);
    else animation.playbackRate = rate;
    animation.onfinish = () => {
      if (record.animation !== animation) return;
      settle(record, record.state === "entering");
    };
    animation.play();
  }

  function groupIsInUse(group) {
    return group.records.some(record =>
      (focused && record.element.contains(focused)) ||
      record.element.matches("details[open], .faq.open") ||
      record.element.querySelector("details[open], .faq.open")
    );
  }

  function frame() {
    raf = 0;
    try {
      if (!active) return;
      if (layoutDirty) measure();
      const y = window.scrollY;
      const height = window.innerHeight;
      const scrollDelta = y - lastY;
      const jumped = Math.abs(scrollDelta) >= height * 0.30;
      if (Math.abs(scrollDelta) > 0.2) direction = scrollDelta >= 0 ? "down" : "up";
      lastY = y;

      groups.forEach(group => {
        const distance = group.top - y;
        const inUse = groupIsInUse(group);
        let immediately = false;

        if (initialPass || group.shown === null) {
          // Carga inicial, link com âncora e restauração do navegador: já legível.
          group.shown = distance < height || inUse;
          immediately = true;
        } else if (inUse || (revealViewport && distance < height)) {
          group.shown = true;
          immediately = true;
        } else if (y >= group.enter) {
          const wasShown = group.shown === true;
          group.shown = true;
          // A rolagem normal não encerra uma entrada que já está em andamento.
          // Só revela imediatamente se pulou o início da entrada ou houve um salto
          // grande de rolagem até a área de leitura (Page Down, âncora, arraste etc.).
          immediately = distance <= height * CONFIG.readyAt && (!wasShown || jumped);
        } else if (direction === "up" && y <= group.exit) {
          group.shown = false;
          immediately = distance > height * 1.15;
        }

        // Sem cascata longa: cada composição termina por inteiro no mesmo instante.
        group.records.forEach(record => playTo(record, Boolean(group.shown), immediately));
      });
      initialPass = false;
      revealViewport = false;
    } catch (error) {
      // Falha segura: nenhum conteúdo permanece invisível se ocorrer um erro.
      active = false;
      records.forEach(record => settle(record, true));
      root.classList.remove("rp-motion-ready");
      console.warn("RealPonto: efeitos desativados para preservar a leitura.", error);
    }
  }

  function schedule(remeasure = false) {
    if (remeasure) layoutDirty = true;
    if (active && !raf) raf = requestAnimationFrame(frame);
  }

  function updateMotion() {
    const supported = typeof Element.prototype.animate === "function" &&
      window.CSS && CSS.supports("translate", "1px 1px") && CSS.supports("scale", "1");
    active = Boolean(supported && requestedMotion && !reduce.matches && !printing);
    root.classList.toggle("rp-motion-ready", active);
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    records.forEach(record => settle(record, true));
    initialPass = true;
    revealViewport = false;
    groups.forEach(group => { group.shown = null; });
    if (active) {
      layoutDirty = true;
      frame();
    }
  }

  function initMotion() {
    const candidates = [...document.querySelectorAll(TARGETS)];
    const unique = candidates.filter(element =>
      !element.closest(".internal-hero, .banner-carousel, dialog") &&
      !candidates.some(other => other !== element && other.contains(element)));

    const sections = [...document.querySelectorAll("main section, footer")];
    const sectionMap = new Map(sections.map((section, index) => [section, index]));

    records = unique.map((element, index) => ({
      element,
      index,
      kind: getKind(element),
      sectionIndex: getSectionIndex(element, sectionMap),
      baseOpacity: Number(getComputedStyle(element).opacity),
      animation: null,
      duration: CONFIG.enterDuration,
      state: "visible",
      inline: Object.fromEntries(["opacity", "pointer-events"].map(property => [property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      }])),
      group: null,
      progress: 1,
      profile: "rise",
      from: index % 2 ? 1 : -1,
      rowCount: 1,
      rowIndex: 0,
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      start: 0,
      end: 1
    }));

    window.addEventListener("scroll", () => schedule(), { passive: true });
    window.addEventListener("resize", () => { revealViewport = true; schedule(true); }, { passive: true });
    window.addEventListener("load", () => schedule(true));
    window.addEventListener("pageshow", () => { revealViewport = true; schedule(true); });
    document.addEventListener("load", event => { if (event.target.tagName === "IMG") schedule(true); }, true);
    document.addEventListener("toggle", () => schedule(true), true);
    document.addEventListener("focusin", event => { focused = event.target; schedule(); });
    document.addEventListener("focusout", () => { focused = null; schedule(); });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(true); });

    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => schedule(true));
      observer.observe(document.body);
      document.querySelectorAll("main > section, footer").forEach(element => observer.observe(element));
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => schedule(true));
    if (reduce.addEventListener) reduce.addEventListener("change", updateMotion);
    else reduce.addListener(updateMotion);
    window.addEventListener("beforeprint", () => { printing = true; updateMotion(); });
    window.addEventListener("afterprint", () => { printing = false; updateMotion(); });
    updateMotion();
  }

  function start() {
    buildThemeControl();
    initMotion();

    // file:// nem sempre compartilha localStorage entre HTMLs. Mantém a escolha
    // na prévia local sem modificar links de downloads, WhatsApp ou sites externos.
    if (location.protocol === "file:") {
      document.addEventListener("click", event => {
        const link = event.target.closest && event.target.closest("a[href]");
        if (!link || link.hasAttribute("download")) return;
        try {
          const url = new URL(link.getAttribute("href"), location.href);
          if (url.protocol === "file:" && /\.html?$/i.test(url.pathname)) {
            url.searchParams.set("rp-theme", root.dataset.rpTheme);
            link.href = url.href;
          }
        } catch (_) {}
      }, true);
    }

    window.addEventListener("storage", event => {
      if (event.key === THEME_KEY) setTheme(event.newValue, false);
    });

    window.RealPontoUI = Object.freeze({
      setTheme,
      getTheme: () => root.dataset.rpTheme,
      setMotion: value => { requestedMotion = value !== false; updateMotion(); },
      refreshMotion: () => schedule(true),
      getMotion: () => ({
        version: "4.2-integracao-demonstracoes",
        engine: "triggered-blocks",
        enabled: active,
        groups: groups.length,
        duration: mobile.matches ? CONFIG.mobileDuration : CONFIG.enterDuration,
        reducedBySystem: reduce.matches,
        direction,
        pieces: records.length,
        profiles: records.reduce((result, record) => {
          result[record.profile] = (result[record.profile] || 0) + 1;
          return result;
        }, {})
      }),
      // Só dados de layout da página; não coleta nem envia dados do visitante.
      inspect: () => records.map(record => ({
        tag: record.element.tagName,
        className: record.element.className,
        progress: record.animation ? clamp(Number(record.animation.currentTime || 0) / record.duration) : record.progress,
        state: record.state,
        groupTop: record.group ? record.group.top : record.top,
        groupSize: record.group ? record.group.records.length : 1,
        profile: record.profile,
        from: record.element.dataset.rpFrom,
        row: `${record.rowIndex + 1}/${record.rowCount}`,
        top: record.top,
        start: record.start,
        end: record.end
      }))
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();


/* REALPONTO — SOBREPOSIÇÃO EXATA DO MENU NA ABERTURA (v5)
   Mede a topbar e o header da home; não muda cores, transparência,
   navegação, carrossel ou comportamento sticky do menu. */
(function () {
  "use strict";

  function prepareFullscreenBanner() {
    var body = document.body;
    if (!body || !body.classList.contains("home-page")) return;
    if (!document.querySelector("#inicio > .banner-carousel")) return;
    if (body.dataset.rpFullscreenBanner === "ready") return;
    body.dataset.rpFullscreenBanner = "ready";

    var header = document.querySelector("body.home-page > .header");
    var topbar = document.querySelector("body.home-page > .topbar");
    var scheduled = 0;
    var previous = "";

    function measure() {
      scheduled = 0;
      var height = [topbar, header].reduce(function (sum, element) {
        if (!element) return sum;
        var style = window.getComputedStyle(element);
        if (style.display === "none" || style.position === "fixed" ||
            style.position === "absolute") return sum;
        return sum + element.getBoundingClientRect().height +
          (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
      }, 0);
      var value = height.toFixed(3) + "px";
      if (value === previous) return;
      previous = value;
      body.style.setProperty("--rp-opening-overlap", value);
      if (window.RealPontoUI && window.RealPontoUI.refreshMotion) {
        window.RealPontoUI.refreshMotion();
      }
    }

    function scheduleMeasure() {
      if (!scheduled) scheduled = window.requestAnimationFrame(measure);
    }

    measure();
    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(scheduleMeasure);
      if (header) observer.observe(header);
      if (topbar) observer.observe(topbar);
    }
    window.addEventListener("resize", scheduleMeasure, { passive: true });
    window.addEventListener("load", scheduleMeasure, { once: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleMeasure);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", prepareFullscreenBanner, { once: true });
  } else {
    prepareFullscreenBanner();
  }
})();

/* =====================================================================
 * REALPONTO — CONEXÕES TECNOLÓGICAS NO FUNDO ESCURO (v8.1 — SEM BOTÃO DE PAUSA)
 * Sem bibliotecas, imagens ou chamadas de rede. Um canvas transparente.
 * Pausa no modo claro, aba oculta, impressão e movimento reduzido.
 * Não interfere em RealPontoUI, carrossel, menu ou animação dos blocos.
 * ===================================================================== */
(function () {
  "use strict";

  function startConnections() {
    if (window.RealPontoConnections || !document.body) return;
    var root = document.documentElement;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    // A pausa manual foi retirada. Não reaproveita a preferência antiga,
    // para que quem havia pausado volte a ver as conexões automaticamente.
    try { localStorage.removeItem("realponto:connections-paused:v1"); } catch (_) {}
    var canvas = document.createElement("canvas");
    canvas.className = "rp-tech-connections";
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("role", "presentation");
    var ctx;
    try { ctx = canvas.getContext("2d", { alpha: true }); } catch (_) { return; }
    if (!ctx) return; // O degradê continua funcionando sem Canvas.
    document.body.appendChild(canvas);

    /* Ajustes do efeito. Independentes da velocidade dos blocos. */
    var OPTIONS = Object.freeze({
      desktopPaths: 10,
      mobilePaths: 5,
      minSeconds: 13,
      maxSeconds: 19,
      desktopFPS: 30,
      mobileFPS: 24,
      maxPixelRatio: 1.5,
      maxPixels: 3000000
    });
    var colors = ["119, 183, 207", "104, 140, 158", "158, 174, 185"];
    var width = 0, height = 0, mobile = false;
    var paths = [], frame = 0, resizeFrame = 0, lastFrame = 0;
    var clock = 0, framesDrawn = 0, running = false, printing = false;
    var seed = 138744;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }
    function smooth(n) { n = clamp(n, 0, 1); return n * n * (3 - 2 * n); }
    function dark() { return root.dataset.rpTheme === "dark"; }
    function color(rgb, alpha) { return "rgba(" + rgb + "," + clamp(alpha, 0, 1).toFixed(3) + ")"; }

    function makePath(index, initial) {
      var count = mobile ? OPTIONS.mobilePaths : OPTIONS.desktopPaths;
      var lane = (index + 0.45 + random() * 0.18) / count;
      var y = clamp(height * lane, 20, height - 20);
      var x = -35 + random() * width * 0.12;
      var travel = width * (0.70 + random() * 0.26);
      var bend = Math.min(width * 0.09, 92, height * 0.10);
      var dy = bend * (random() > 0.5 ? 1 : -1);
      if (y + dy < 20 || y + dy > height - 20) dy *= -1;
      var p = [
        { x: x, y: y },
        { x: x + travel * 0.21, y: y },
        { x: x + travel * 0.21 + Math.abs(dy), y: y + dy },
        { x: x + travel * 0.58, y: y + dy },
        { x: x + travel * 0.58 + Math.abs(dy) * 0.7, y: y + dy * 0.3 },
        { x: x + travel, y: y + dy * 0.3 }
      ];
      // Saídas alternadas da esquerda e da direita, sem todas irem juntas.
      if (index % 2) p = p.map(function (point) { return { x: width - point.x, y: point.y }; });
      var length = 0;
      p.forEach(function (point, i) {
        if (i) length += Math.hypot(point.x - p[i-1].x, point.y - p[i-1].y);
        point.distance = length;
      });
      var duration = OPTIONS.minSeconds + random() * (OPTIONS.maxSeconds - OPTIONS.minSeconds);
      return {
        points: p, length: length, duration: duration,
        birth: initial ? clock - duration * ((index * 0.147 + 0.19) % 0.86) : clock + 1 + random() * 3,
        rgb: colors[index % colors.length],
        trail: Math.min(length * 0.52, mobile ? 180 : 380)
      };
    }

    function pointAt(path, distance) {
      distance = clamp(distance, 0, path.length);
      for (var i = 1; i < path.points.length; i++) {
        var a = path.points[i - 1], b = path.points[i];
        if (distance <= b.distance) {
          var t = (distance - a.distance) / Math.max(0.001, b.distance - a.distance);
          return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
      }
      return path.points[path.points.length - 1];
    }

    function strokeRange(path, start, end, alpha, size) {
      start = Math.max(0, start); end = Math.min(path.length, end);
      if (end <= start || alpha <= 0.001) return;
      ctx.beginPath();
      var a = pointAt(path, start);
      ctx.moveTo(a.x, a.y);
      path.points.forEach(function (p) {
        if (p.distance > start && p.distance < end) ctx.lineTo(p.x, p.y);
      });
      var b = pointAt(path, end);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = color(path.rgb, alpha);
      ctx.lineWidth = size;
      ctx.stroke();
    }

    function drawPath(path, progress, still) {
      var fade = still ? 0.60 : smooth(progress / 0.14) * (1 - smooth((progress - 0.76) / 0.24));
      if (fade < 0.005) return;
      var head = path.length * clamp(progress / 0.84, 0, 1);
      // Traçado já construído; o rastro luminoso percorre o mesmo caminho.
      strokeRange(path, 0, head, 0.16 * fade, 0.8);
      var tail = Math.max(0, head - path.trail);
      for (var i = 0; i < 5; i++) {
        var from = tail + (head - tail) * i / 5;
        var to = tail + (head - tail) * (i + 1) / 5;
        strokeRange(path, from, to, (0.13 + i * 0.105) * fade, 1.05);
      }
      strokeRange(path, head - 48, head, 0.055 * fade, 4);
      var tip = pointAt(path, head);
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color(path.rgb, 0.09 * fade); ctx.fill();
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 1.65, 0, Math.PI * 2);
      ctx.fillStyle = color(path.rgb, 0.86 * fade); ctx.fill();
      // Pequenos terminais, sem cintilação nem flashes abruptos.
      path.points.forEach(function (p, i) {
        if (i % 2 || p.distance > head) return;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
        ctx.strokeStyle = color(path.rgb, 0.27 * fade);
        ctx.lineWidth = 0.9; ctx.stroke();
      });
    }

    function render(still) {
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      paths.forEach(function (path, i) {
        var t = (clock - path.birth) / path.duration;
        if (still && reduced.matches) t = 0.36 + (i % 4) * 0.10;
        if (t > 1) { paths[i] = makePath(i, false); return; }
        if (t < 0) return;
        drawPath(path, t, still && reduced.matches);
      });
      framesDrawn++;
    }

    function fit() {
      var nextWidth = Math.max(1, root.clientWidth);
      var nextHeight = Math.max(1, window.innerHeight);
      var dpr = Math.min(window.devicePixelRatio || 1, OPTIONS.maxPixelRatio,
        Math.sqrt(OPTIONS.maxPixels / (nextWidth * nextHeight)));
      var pixelWidth = Math.round(nextWidth * dpr);
      var pixelHeight = Math.round(nextHeight * dpr);
      if (width === nextWidth && height === nextHeight && canvas.width === pixelWidth && canvas.height === pixelHeight) return;
      width = nextWidth; height = nextHeight; mobile = width <= 700;
      canvas.width = pixelWidth; canvas.height = pixelHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paths = [];
      for (var i = 0; i < (mobile ? OPTIONS.mobilePaths : OPTIONS.desktopPaths); i++) paths.push(makePath(i, true));
    }

    function tick(now) {
      frame = 0;
      if (!running) return;
      var interval = 1000 / (mobile ? OPTIONS.mobileFPS : OPTIONS.desktopFPS);
      if (!lastFrame) lastFrame = now;
      if (now - lastFrame >= interval - 0.5) {
        clock += Math.min((now - lastFrame) / 1000, 0.12);
        lastFrame = now;
        render(false);
      }
      frame = window.requestAnimationFrame(tick);
    }

    function sync() {
      var visible = dark() && !document.hidden && !printing;
      var shouldRun = visible && !reduced.matches;
      if (!shouldRun) {
        running = false;
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0; lastFrame = 0;
      }
      if (visible) {
        fit();
        if (!running) render(true);
      }
      if (shouldRun && !running) {
        running = true; lastFrame = 0;
        frame = window.requestAnimationFrame(tick);
      }
    }

    // Apenas o seletor Claro/Escuro permanece na interface.
    // Mantém as pausas automáticas por acessibilidade e economia de recursos.

    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-rp-theme"] });
    if (reduced.addEventListener) reduced.addEventListener("change", sync);
    else reduced.addListener(sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("resize", function () {
      if (resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(function () {
        resizeFrame = 0;
        if (dark()) { fit(); render(reduced.matches); }
      });
    }, { passive: true });
    window.addEventListener("beforeprint", function () { printing = true; sync(); });
    window.addEventListener("afterprint", function () { printing = false; sync(); });
    window.addEventListener("pagehide", function () { printing = true; sync(); });
    window.addEventListener("pageshow", function () { printing = false; sync(); });

    window.RealPontoConnections = Object.freeze({
      getState: function () {
        return { version: "8.1-conexoes-sem-botao", running: running,
          reducedMotion: reduced.matches, theme: root.dataset.rpTheme,
          paths: paths.length, frames: framesDrawn, width: width, height: height };
      }
    });
    sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startConnections, { once: true });
  else startConnections();
})();
