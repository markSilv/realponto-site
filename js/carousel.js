"use strict";

document.addEventListener("DOMContentLoaded", () => {
  /**
   * Inicia um carrossel de banner com navegação e autoplay.
   * @param {string} selector - O seletor CSS para o container do carrossel.
   */
  function initBannerCarousel(selector) {
    const carousel = document.querySelector(selector);
    if (!carousel) return;

    const slides = carousel.querySelectorAll(".carousel-slide");
    const dots = carousel.querySelectorAll(".carousel-dot");
    const prevButton = carousel.querySelector(".carousel-prev");
    const nextButton = carousel.querySelector(".carousel-next");

    if (slides.length === 0) return;

    let currentSlide = 0;
    let autoPlayInterval;

    function showSlide(index) {
      currentSlide = (index + slides.length) % slides.length;

      slides.forEach((slide, i) => {
        const isActive = i === currentSlide;
        slide.classList.toggle("active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));
      });

      if (dots.length > 0) {
        dots.forEach((dot, i) => dot.classList.toggle("active", i === currentSlide));
      }
    }

    function next() {
      showSlide(currentSlide + 1);
    }

    function stopAutoPlay() {
      clearInterval(autoPlayInterval);
    }

    function startAutoPlay() {
      stopAutoPlay();
      autoPlayInterval = setInterval(next, 5000);
    }

    if (nextButton) {
      nextButton.addEventListener("click", () => {
        next();
        startAutoPlay();
      });
    }

    if (prevButton) {
      prevButton.addEventListener("click", () => {
        showSlide(currentSlide - 1);
        startAutoPlay();
      });
    }

    if (dots.length > 0) {
      dots.forEach((dot, i) => {
        dot.addEventListener("click", () => {
          showSlide(i);
          startAutoPlay();
        });
      });
    }

    carousel.addEventListener("mouseenter", stopAutoPlay);
    carousel.addEventListener("mouseleave", startAutoPlay);

    showSlide(0);
    startAutoPlay();
  }

  /**
   * Inicia um carrossel simples de fade-in/fade-out para cards.
   * @param {string} selector - O seletor CSS para os containers de carrossel.
   */
  function initSimpleFadeCarousel(selector) {
    document.querySelectorAll(selector).forEach((carousel, index) => {
      const slides = carousel.querySelectorAll(".seguranca-slide, .identidade-slide");
      if (slides.length <= 1) return;

      let current = 0;

      const changeSlide = () => {
        slides[current].classList.remove("active");
        current = (current + 1) % slides.length;
        slides[current].classList.add("active");
      };

      // Adiciona um atraso inicial escalonado para os carrosséis não trocarem todos ao mesmo tempo
      setTimeout(() => {
        changeSlide(); // Troca o primeiro slide
        setInterval(changeSlide, 3500);
      }, index * 650);
    });
  }

  /**
   * Inicia um carrossel para a página de produto com navegação.
   * @param {string} selector - O seletor CSS para o container do carrossel.
   */
  function initProductCarousel(selector) {
    const carousel = document.querySelector(selector);
    if (!carousel) return;

    const slides = carousel.querySelectorAll(".produto-slide");
    const dots = carousel.querySelectorAll(".produto-dot");
    const prevButton = carousel.querySelector(".produto-prev");
    const nextButton = carousel.querySelector(".produto-next");

    if (slides.length <= 1) return;

    let current = 0;

    function show(index) {
        current = (index + slides.length) % slides.length;
        slides.forEach((s, i) => s.classList.toggle("active", i === current));
        dots.forEach((d, i) => d.classList.toggle("active", i === current));
    }

    prevButton.addEventListener("click", () => show(current - 1));
    nextButton.addEventListener("click", () => show(current + 1));
    dots.forEach((d, i) => d.addEventListener("click", () => show(i)));
  }

  // Inicia todos os carrosséis encontrados na página
  initBannerCarousel(".banner-carousel");
  initSimpleFadeCarousel(".seguranca-carousel");
  initSimpleFadeCarousel(".identidade-carousel");
  initProductCarousel(".produto-carousel");
});