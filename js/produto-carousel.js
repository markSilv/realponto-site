document.addEventListener("DOMContentLoaded", () => {
  const carrosseis = document.querySelectorAll("[data-produto-carousel]");

  carrosseis.forEach((carousel) => {
    const slides = Array.from(
      carousel.querySelectorAll(".produto-slide")
    );

    const dots = Array.from(
      carousel.querySelectorAll(".produto-dot")
    );

    const botaoAnterior = carousel.querySelector(".produto-prev");
    const botaoProximo = carousel.querySelector(".produto-next");

    if (slides.length === 0) {
      console.warn("Nenhum slide encontrado no carrossel.");
      return;
    }

    let slideAtual = 0;

    function exibirSlide(indice) {
      slideAtual = (indice + slides.length) % slides.length;

      slides.forEach((slide, index) => {
        slide.classList.toggle("active", index === slideAtual);
      });

      dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === slideAtual);
        dot.setAttribute(
          "aria-current",
          index === slideAtual ? "true" : "false"
        );
      });
    }

    botaoAnterior?.addEventListener("click", () => {
      exibirSlide(slideAtual - 1);
    });

    botaoProximo?.addEventListener("click", () => {
      exibirSlide(slideAtual + 1);
    });

    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        exibirSlide(index);
      });
    });

    exibirSlide(0);
  });
});