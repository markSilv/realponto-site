"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const carousel = document.querySelector(".banner-carousel");

  if (!carousel) {
    console.error("Carrossel não encontrado no HTML.");
    return;
  }

  const slides = carousel.querySelectorAll(".carousel-slide");
  const dots = carousel.querySelectorAll(".carousel-dot");
  const previousButton = carousel.querySelector(".carousel-prev");
  const nextButton = carousel.querySelector(".carousel-next");

  if (slides.length === 0) {
    console.error("Nenhum slide foi encontrado.");
    return;
  }

  let currentSlide = 0;
  let automaticTimer;

  function showSlide(index) {
    if (index >= slides.length) {
      currentSlide = 0;
    } else if (index < 0) {
      currentSlide = slides.length - 1;
    } else {
      currentSlide = index;
    }

    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === currentSlide;

      slide.classList.toggle("active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
    });

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === currentSlide);
    });
  }

  function nextSlide() {
    showSlide(currentSlide + 1);
  }

  function previousSlide() {
    showSlide(currentSlide - 1);
  }

  function stopAutomaticCarousel() {
    if (automaticTimer) {
      clearInterval(automaticTimer);
    }
  }

  function startAutomaticCarousel() {
    stopAutomaticCarousel();

    automaticTimer = setInterval(() => {
      nextSlide();
    }, 5000);
  }

  if (nextButton) {
    nextButton.addEventListener("click", (event) => {
      event.preventDefault();
      nextSlide();
      startAutomaticCarousel();
    });
  }

  if (previousButton) {
    previousButton.addEventListener("click", (event) => {
      event.preventDefault();
      previousSlide();
      startAutomaticCarousel();
    });
  }

  dots.forEach((dot, index) => {
    dot.addEventListener("click", () => {
      showSlide(index);
      startAutomaticCarousel();
    });
  });

  carousel.addEventListener("mouseenter", stopAutomaticCarousel);
  carousel.addEventListener("mouseleave", startAutomaticCarousel);

  showSlide(0);
  startAutomaticCarousel();

  console.log("Carrossel iniciado com sucesso.");
});