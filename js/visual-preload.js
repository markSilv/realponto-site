/*
 * REALPONTO — MODO ESCURO NA ABERTURA (v10)
 * Executado antes do CSS em todas as páginas públicas da versão integrada.
 * Cada carregamento começa no escuro, independentemente de uma escolha
 * anterior salva no navegador ou do parâmetro antigo "rp-theme".
 * O seletor Claro/Escuro continua funcionando normalmente na página aberta.
 * Não altera CSS, carrossel, conexões, menus ou animações dos blocos.
 */
(function () {
  "use strict";

  document.documentElement.setAttribute("data-rp-theme", "dark");

  // A barra do navegador acompanha o tema inicial. Preserva a cor original
  // para que visual-original.js possa restaurá-la ao selecionar Claro.
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    if (!themeMeta.hasAttribute("data-rp-light-color")) {
      themeMeta.setAttribute("data-rp-light-color", themeMeta.content || "#071c35");
    }
    themeMeta.content = "#000000";
  }
})();
