/*
 * REALPONTO — PREFERÊNCIA DE TEMA NA ABERTURA (v13)
 * Carregue no <head>, antes dos arquivos CSS, sem async e sem defer.
 * Recupera a escolha salva em realponto:theme:v2; sem escolha, usa escuro.
 * A mesma regra é usada por visual-original.js em todas as páginas.
 * Não altera cards, imagens, carrossel, conexões, menus ou animações.
 */
(function () {
  "use strict";

  var THEME_KEY = "realponto:theme:v2";
  var root = document.documentElement;
  var theme = "dark";

  try {
    var saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") theme = saved;
  } catch (_) {
    // O site continua abrindo mesmo se o navegador bloquear o armazenamento.
  }

  // Apenas na prévia file://: recebe a escolha propagada pelos links locais.
  // No site hospedado, a URL não sobrescreve a preferência salva.
  if (window.location.protocol === "file:") {
    try {
      var previewTheme = new URL(window.location.href).searchParams.get("rp-theme");
      if (previewTheme === "light" || previewTheme === "dark") theme = previewTheme;
    } catch (_) { /* Mantém a preferência ou o padrão. */ }
  }

  root.setAttribute("data-rp-theme", theme);
  root.style.colorScheme = theme;

  // A barra do navegador acompanha o tema. Preserva a cor original do modo claro.
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    if (!themeMeta.hasAttribute("data-rp-light-color")) {
      themeMeta.setAttribute("data-rp-light-color", themeMeta.content || "#071c35");
    }
    themeMeta.content = theme === "dark" ? "#000000" : themeMeta.getAttribute("data-rp-light-color");
  }
})();
