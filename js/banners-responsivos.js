/*
 * REALPONTO — BANNERS RESPONSIVOS v3 (banners1600)
 * Substitua o arquivo completo e use o CSS v3 correspondente.
 * Não substitui index.html, não reinicializa o carrossel e não muda o tema.
 *
 * Regras de composição pela largura / altura da janela:
 * <= 3/4       : bannersCelular, vertical 1080 x 1920.
 * > 3/4 <= 3/2 : banners1600, quadrado 1600 x 1600.
 * > 3/2        : banners1080 / banners1440, horizontais.
 *
 * A seleção é realizada pelo <picture>. Este script acrescenta/configura as
 * fontes no HTML já existente; depois o navegador responde ao redimensionar.
 * Os limites precisam permanecer iguais no CSS e em conferir-banners.html.
 */
(function () {
  "use strict";

  var MOBILE = "(max-aspect-ratio: 3/4)";
  var COMPACT = "(max-aspect-ratio: 3/2)";
  var records = new WeakMap();

  function composition() {
    if (window.matchMedia(MOBILE).matches) return "vertical";
    return window.matchMedia(COMPACT).matches ? "intermediario" : "horizontal";
  }

  function imageURL(record, folder) {
    return new URL(folder + "/" + record.filename, record.folder).href;
  }

  function clearFallback(record) {
    record.attempted.clear();
    record.warned = false;
    record.img.removeAttribute("data-rp-banner-error");
    record.img.removeAttribute("data-rp-banner-fallback");
    record.img.removeAttribute("data-rp-banner-legacy");
    if (record.slide) record.slide.classList.remove("rp-banner-fallback", "rp-banner-legacy");
    record.sources.forEach(function (source) {
      var media = source.getAttribute("data-rp-native-media");
      if (media) source.media = media;
      else source.removeAttribute("media");
    });
    record.img.removeAttribute("srcset");
    record.img.removeAttribute("sizes");
    if (record.img.src !== record.original.href) record.img.src = record.original.href;
  }

  function prepareSources(img) {
    var picture = img.closest("picture");
    var original = img.getAttribute("data-rp-banner-original");
    if (!picture || !original) return null;
    var url;
    try { url = new URL(original, document.baseURI); }
    catch (_) { return null; }
    var record = {
      img: img,
      picture: picture,
      slide: img.closest(".carousel-slide"),
      original: url,
      filename: url.pathname.split("/").pop(),
      folder: new URL("./", url),
      sources: [],
      attempted: new Set(),
      warned: false,
      lastSource: ""
    };
    records.set(img, record);

    // Mantém o <img>, seu alt, loading, link e posição no carrossel.
    // A ordem é importante: a regra mais específica vem antes da quadrada.
    Array.from(picture.children).forEach(function (child) {
      if (child.tagName === "SOURCE") child.remove();
    });
    var specifications = [
      { media: MOBILE, srcset: imageURL(record, "bannersCelular"), width: 1080, height: 1920 },
      { media: COMPACT, srcset: imageURL(record, "banners1600"), width: 1600, height: 1600 },
      { media: "", srcset: imageURL(record, "banners1080") + " 1920w, " +
          imageURL(record, "banners1440") + " 2560w", sizes: "100vw", width: 1920, height: 1080 }
    ];
    var fragment = document.createDocumentFragment();
    specifications.forEach(function (spec) {
      var source = document.createElement("source");
      source.srcset = spec.srcset;
      source.setAttribute("data-rp-native-media", spec.media);
      if (spec.media) source.media = spec.media;
      if (spec.sizes) source.sizes = spec.sizes;
      source.setAttribute("width", String(spec.width));
      source.setAttribute("height", String(spec.height));
      record.sources.push(source);
      fragment.appendChild(source);
    });
    picture.insertBefore(fragment, img);
    clearFallback(record);
    img.dataset.rpBannerSources = "v3";
    return record;
  }

  // Arquivo ausente: tenta versões disponíveis, sem insistir na mesma URL.
  // Qualquer alternativa é mostrada inteira, mesmo sendo de outra proporção.
  function recoverImage(img) {
    var record = records.get(img);
    if (!record || !img.complete || img.naturalWidth || img.dataset.rpBannerError === "true") return;
    var mode = composition();
    var folders = mode === "vertical" ? ["bannersCelular", "banners1600", "banners1080", "banners1440"] :
      mode === "intermediario" ? ["banners1600", "banners1080", "banners1440", "bannersCelular"] :
      ["banners1080", "banners1440", "banners1600", "bannersCelular"];
    record.attempted.add(img.currentSrc || img.src);
    var candidates = folders.map(function (folder) { return imageURL(record, folder); });
    candidates.push(record.original.href);
    var next = candidates.find(function (candidate) { return !record.attempted.has(candidate); });
    if (!record.warned) {
      console.warn("[RealPonto] Banner não encontrado:", img.currentSrc || img.src,
        "Confira as quatro pastas, a extensão .jpg e as maiúsculas em conferir-banners.html.");
      record.warned = true;
    }
    if (!next) {
      img.dataset.rpBannerError = "true";
      return;
    }
    record.attempted.add(next);
    record.sources.forEach(function (source) { source.media = "not all"; });
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.dataset.rpBannerFallback = "true";
    if (record.slide) record.slide.classList.add("rp-banner-fallback");
    if (next === record.original.href) {
      img.dataset.rpBannerLegacy = "true";
      if (record.slide) record.slide.classList.add("rp-banner-legacy");
    }
    img.src = next;
  }

  function prepareFrame(body, carousel, images) {
    var chrome = [body.querySelector(":scope > .topbar"), body.querySelector(":scope > .header")];
    var floating = Array.from(body.querySelectorAll(".rp-theme-control, .wa-float"));
    var frame = 0;
    var lastMode = composition();
    body.dataset.rpBannerMode = lastMode;

    function size(element) {
      if (!element) return 0;
      var style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return 0;
      return element.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) +
        (parseFloat(style.marginBottom) || 0);
    }

    function refresh() {
      frame = 0;
      var mode = composition();
      if (mode !== lastMode) {
        lastMode = mode;
        body.dataset.rpBannerMode = mode;
        images.forEach(function (img) {
          var record = records.get(img);
          // Uma falha na pasta quadrada não prende a foto ao mudar de formato.
          if (record && (img.dataset.rpBannerFallback || img.dataset.rpBannerError)) clearFallback(record);
        });
      }
      var top = chrome.reduce(function (total, element) { return total + size(element); }, 0);
      var footer = floating.reduce(function (total, element) {
        var height = size(element);
        if (!height) return total;
        return Math.max(total, height + (parseFloat(getComputedStyle(element).bottom) || 0));
      }, 64);
      body.style.setProperty("--rp-banner-safe-top", Math.ceil(top) + "px");
      body.style.setProperty("--rp-banner-safe-bottom", Math.ceil(footer + 48) + "px");
      images.forEach(function (img) {
        var record = records.get(img);
        if (!record || !img.complete) return;
        if (!img.naturalWidth) { recoverImage(img); return; }
        var source = img.currentSrc || img.src;
        if (record.slide && record.lastSource !== source) {
          record.slide.style.setProperty("--rp-banner-backdrop", "url(" + JSON.stringify(source) + ")");
          record.lastSource = source;
        }
      });
    }

    function schedule() { if (!frame) frame = window.requestAnimationFrame(refresh); }
    images.forEach(function (img) { img.addEventListener("load", schedule); });
    // Aguarda a seleção das novas <source> antes de inspecionar o carregamento.
    schedule();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule, { once: true });
    window.addEventListener("pageshow", schedule);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", schedule, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(schedule);
      chrome.concat(floating).forEach(function (element) { if (element) observer.observe(element); });
    }
    [MOBILE, COMPACT].forEach(function (query) {
      var media = window.matchMedia(query);
      if (media.addEventListener) media.addEventListener("change", schedule);
      else if (media.addListener) media.addListener(schedule);
    });
    carousel.dataset.rpSafeFrame = "ready";
  }

  // Só mede o deslocamento se visual-original.js ainda não estiver cuidando dele.
  function prepareOverlap(body) {
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
        var style = getComputedStyle(element);
        if (style.display === "none" || style.position === "absolute" || style.position === "fixed") return sum;
        return sum + element.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) +
          (parseFloat(style.marginBottom) || 0);
      }, 0);
      var value = height.toFixed(3) + "px";
      if (value === previous) return;
      previous = value;
      body.style.setProperty("--rp-opening-overlap", value);
      if (window.RealPontoUI && window.RealPontoUI.refreshMotion) window.RealPontoUI.refreshMotion();
    }
    function schedule() { if (!scheduled) scheduled = window.requestAnimationFrame(measure); }
    measure();
    if ("ResizeObserver" in window) {
      var observer = new ResizeObserver(schedule);
      if (header) observer.observe(header);
      if (topbar) observer.observe(topbar);
    }
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule, { once: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  }

  function start() {
    var body = document.body;
    if (!body || !body.matches("body.home-page[data-rp-responsive-banners]")) return;
    var carousel = body.querySelector("#inicio > .banner-carousel");
    if (!carousel || carousel.dataset.rpBannersReady === "v3") return;
    carousel.dataset.rpBannersReady = "v3";
    body.dataset.rpResponsiveBanners = "v3";
    var images = Array.from(carousel.querySelectorAll(".rp-banner-picture img"));
    // O listener não interfere nas imagens de produtos ou nas demais páginas.
    carousel.addEventListener("error", function (event) { recoverImage(event.target); }, true);
    images.forEach(prepareSources);
    prepareFrame(body, carousel, images);
    prepareOverlap(body);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
