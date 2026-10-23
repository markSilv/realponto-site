/*
 * REALPONTO — ABERTURA RESPONSIVA (v2 — CELULAR SEM CORTES)
 * A seleção horizontal/vertical é nativa do <picture>; não depende de JS.
 * Mede a área segura para a arte no retrato e prepara o fundo de apoio.
 * Mantém a compatibilidade da sobreposição e a recuperação de arquivos.
 * Não reinicializa o carrossel nem altera tema, links ou animações.
 */
(function () {
  "use strict";

  var imageSelector = "body.home-page[data-rp-responsive-banners] #inicio > .banner-carousel .rp-banner-picture img";
  var recovery = new WeakMap();

  // Se uma versão estiver faltando, tenta outra disponível sem criar loop.
  // Registra um aviso: a conferência definitiva está em conferir-banners.html.
  function recoverImage(img) {
    if (!img || !img.matches || !img.matches(imageSelector)) return;
    if (img.dataset.rpBannerError === "true") return;
    var original = img.getAttribute("data-rp-banner-original");
    if (!original) return;

    var state = recovery.get(img);
    if (!state) {
      var originalURL = new URL(original, document.baseURI);
      var filename = originalURL.pathname.split("/").pop();
      var folder = new URL("./", originalURL);
      state = {
        attempted: new Set(),
        candidates: [
          new URL("banners1080/" + filename, folder).href,
          new URL("banners1440/" + filename, folder).href,
          originalURL.href
        ]
      };
      recovery.set(img, state);
      console.warn("[RealPonto] Versão de banner ausente ou inválida:", img.currentSrc || img.src,
        "Confira os nomes, extensões e as três pastas em conferir-banners.html.");
    }
    state.attempted.add(img.currentSrc || img.src);
    var next = state.candidates.find(function (url) {
      return !state.attempted.has(url);
    });
    if (!next) {
      img.dataset.rpBannerError = "true";
      return;
    }
    state.attempted.add(next);
    var picture = img.closest("picture");
    picture.querySelectorAll("source").forEach(function (source) {
      source.media = "not all";
    });
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.dataset.rpBannerFallback = "true";
    if (next === new URL(original, document.baseURI).href) {
      img.dataset.rpBannerLegacy = "true";
      var slide = img.closest(".carousel-slide");
      if (slide) slide.classList.add("rp-banner-legacy");
    }
    img.src = next;
  }

  // Captura erros mesmo em imagens que terminam de carregar antes do DOM ready.
  document.addEventListener("error", function (event) {
    recoverImage(event.target);
  }, true);

  // A arte nítida usa contain; o fundo usa a mesma URL, sem outro arquivo.
  // O recurso é reaproveitado pelo cache do navegador e não é um novo banner.
  function preparePortraitFrame(body) {
    var carousel = body.querySelector("#inicio > .banner-carousel");
    if (!carousel || carousel.dataset.rpSafeFrame === "ready") return;
    carousel.dataset.rpSafeFrame = "ready";
    body.dataset.rpResponsiveBanners = "v2";
    var images = Array.from(carousel.querySelectorAll(".rp-banner-picture img"));
    var chrome = [body.querySelector(":scope > .topbar"), body.querySelector(":scope > .header")];
    var floating = Array.from(body.querySelectorAll(".rp-theme-control, .wa-float"));
    var lastSource = new WeakMap();
    var warned = new WeakMap();
    var frame = 0;

    function size(element) {
      if (!element) return 0;
      var style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return 0;
      return element.getBoundingClientRect().height +
        (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
    }

    function refresh() {
      frame = 0;
      var top = chrome.reduce(function (total, element) { return total + size(element); }, 0);
      var footer = floating.reduce(function (total, element) {
        var height = size(element);
        if (!height) return total;
        return Math.max(total, height + (parseFloat(getComputedStyle(element).bottom) || 0));
      }, 64);
      body.style.setProperty("--rp-banner-safe-top", Math.ceil(top) + "px");
      body.style.setProperty("--rp-banner-safe-bottom", Math.ceil(footer + 48) + "px");

      images.forEach(function (img) {
        if (!img.complete || !img.naturalWidth) return;
        var source = img.currentSrc || img.src;
        var slide = img.closest(".carousel-slide");
        if (slide && lastSource.get(img) !== source) {
          // JSON.stringify protege aspas e barras presentes em caminhos locais.
          slide.style.setProperty("--rp-banner-backdrop", "url(" + JSON.stringify(source) + ")");
          lastSource.set(img, source);
        }
        if (window.matchMedia("(orientation: portrait)").matches &&
            img.naturalWidth > img.naturalHeight && warned.get(img) !== source) {
          console.warn("[RealPonto] Em retrato foi carregada uma imagem horizontal:", source,
            "Dimensões:", img.naturalWidth, "x", img.naturalHeight,
            "Confira bannersCelular e conferir-banners.html. A arte não será recortada.");
          warned.set(img, source);
        }
      });
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(refresh);
    }
    images.forEach(function (img) { img.addEventListener("load", schedule); });
    refresh();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule, { once: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", schedule, { passive: true });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(schedule);
      chrome.concat(floating).forEach(function (element) { if (element) observer.observe(element); });
    }
  }

  function start() {
    var body = document.body;
    if (!body || !body.matches("body.home-page[data-rp-responsive-banners]")) return;
    document.querySelectorAll(imageSelector).forEach(function (img) {
      if (img.complete && img.naturalWidth === 0) recoverImage(img);
    });

    preparePortraitFrame(body);

    // O ajuste anterior já cuida disto? Não crie dois observadores.
    if (body.dataset.rpFullscreenBanner === "ready") return;
    body.dataset.rpFullscreenBanner = "ready";
    var topbar = body.querySelector(":scope > .topbar");
    var header = body.querySelector(":scope > .header");
    var scheduled = 0;
    var previous = "";

    function measure() {
      scheduled = 0;
      var height = [topbar, header].reduce(function (sum, element) {
        if (!element) return sum;
        var style = window.getComputedStyle(element);
        if (style.display === "none" || style.position === "absolute" ||
            style.position === "fixed") return sum;
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
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
