"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // Menu mobile
  const menuButton = document.getElementById("menuBtn");
  const navigation = document.getElementById("navLinks");

  if (menuButton && navigation) {
    menuButton.addEventListener("click", () => {
      const menuIsOpen = navigation.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(menuIsOpen));
      menuButton.textContent = menuIsOpen ? "✕" : "☰";
    });

    navigation.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navigation.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.textContent = "☰";
      });
    });
  }

  // Perguntas frequentes
  document.querySelectorAll(".faq button").forEach((button) => {
    button.addEventListener("click", () => {
      const selectedItem = button.closest(".faq");
      const shouldOpen = !selectedItem.classList.contains("open");

      document.querySelectorAll(".faq").forEach((item) => {
        item.classList.remove("open");
        item.querySelector("button span:last-child").textContent = "+";
      });

      if (shouldOpen) {
        selectedItem.classList.add("open");
        button.querySelector("span:last-child").textContent = "−";
      }
    });
  });

  // Ano automático no rodapé
  document.querySelectorAll('#year, .current-year').forEach(el => el.textContent = new Date().getFullYear());

  // Voltar ao topo
  const voltarAoTopo = document.querySelector(".voltar-topo");
  if (voltarAoTopo) {
    voltarAoTopo.addEventListener("click", (event) => {
      event.preventDefault();
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
  }

  // Header scroll
  const header = document.querySelector(".header");
  function atualizarMenuAoRolar() {
    if (!header) return;
    if (window.scrollY > 60) {
      header.classList.add("header-scrolled");
    } else {
      header.classList.remove("header-scrolled");
    }
  }
  window.addEventListener("scroll", atualizarMenuAoRolar);
  window.addEventListener("load", atualizarMenuAoRolar);

  // Submenu dropdown
  const submenuToggle = document.querySelector(".submenu-toggle");
  const navDropdown = document.querySelector(".nav-dropdown");
  if (submenuToggle && navDropdown) {
    submenuToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const aberto = navDropdown.classList.toggle("open");
      submenuToggle.setAttribute("aria-expanded", String(aberto));
    });

    document.addEventListener("click", (event) => {
      if (!navDropdown.contains(event.target)) {
        navDropdown.classList.remove("open");
        submenuToggle.setAttribute("aria-expanded", "false");
      }
    });

    navDropdown.querySelectorAll(".submenu a").forEach((link) => {
      link.addEventListener("click", () => {
        navDropdown.classList.remove("open");
        submenuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // --- Funções do antigo carousel.js ---

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
    if (nextButton) nextButton.addEventListener("click", () => { next(); startAutoPlay(); });
    if (prevButton) prevButton.addEventListener("click", () => { showSlide(currentSlide - 1); startAutoPlay(); });
    if (dots.length > 0) dots.forEach((dot, i) => dot.addEventListener("click", () => { showSlide(i); startAutoPlay(); }));
    carousel.addEventListener("mouseenter", stopAutoPlay);
    carousel.addEventListener("mouseleave", startAutoPlay);
    showSlide(0);
    startAutoPlay();
  }

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
      setTimeout(() => {
        changeSlide();
        setInterval(changeSlide, 3500);
      }, index * 650);
    });
  }

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
    if (prevButton) prevButton.addEventListener("click", () => show(current - 1));
    if (nextButton) nextButton.addEventListener("click", () => show(current + 1));
    if (dots) dots.forEach((d, i) => d.addEventListener("click", () => show(i)));
  }

  // Inicia todos os carrosséis encontrados na página
  initBannerCarousel(".banner-carousel");
  initSimpleFadeCarousel(".seguranca-carousel");
  initSimpleFadeCarousel(".identidade-carousel");
  initProductCarousel(".produto-carousel");
});