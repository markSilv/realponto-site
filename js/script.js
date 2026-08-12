"use strict";

// Menu mobile
const menuButton = document.getElementById("menuBtn");
const navigation = document.getElementById("navLinks");

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
document.getElementById("year").textContent = new Date().getFullYear();

// Carrossel
const carousel = {
  inner: document.querySelector(".carousel-inner"),
  items: document.querySelectorAll(".carousel-item"),
  indicators: document.querySelectorAll(".indicator"),
  prevBtn: document.querySelector(".carousel-control.prev"),
  nextBtn: document.querySelector(".carousel-control.next"),
  currentIndex: 0,
  interval: null,

  init() {
    if (!this.inner) return;

    this.prevBtn.addEventListener("click", () => this.prev());
    this.nextBtn.addEventListener("click", () => this.next());

    this.indicators.forEach((indicator, index) => {
      indicator.addEventListener("click", () => this.goTo(index));
    });

    this.startAutoPlay();

    // Pausar ao passar o mouse
    const carouselContainer = document.querySelector(".carousel");
    carouselContainer.addEventListener("mouseenter", () => this.stopAutoPlay());
    carouselContainer.addEventListener("mouseleave", () => this.startAutoPlay());
  },

  update() {
    this.inner.style.transform = `translateX(-${this.currentIndex * 100}%)`;
    
    this.indicators.forEach((ind, i) => {
      ind.classList.toggle("active", i === this.currentIndex);
    });
    
    this.items.forEach((item, i) => {
      item.classList.toggle("active", i === this.currentIndex);
    });
  },

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.items.length;
    this.update();
  },

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
    this.update();
  },

  goTo(index) {
    this.currentIndex = index;
    this.update();
  },

  startAutoPlay() {
    this.stopAutoPlay();
    this.interval = setInterval(() => this.next(), 5000);
  },

  stopAutoPlay() {
    if (this.interval) clearInterval(this.interval);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  carousel.init();
});

const voltarAoTopo = document.querySelector(".voltar-topo");

if (voltarAoTopo) {
  voltarAoTopo.addEventListener("click", (event) => {
    event.preventDefault();

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "smooth"
    });
  });
}

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

/* ========================================
   CARROSSEL AUTOMÁTICO - SEGURANÇA
======================================== */

document.querySelectorAll(".seguranca-carousel").forEach((carousel) => {

  const slides = carousel.querySelectorAll(".seguranca-slide");

  if (slides.length <= 1) return;

  let atual = 0;

  setInterval(() => {

    slides[atual].classList.remove("active");

    atual++;

    if (atual >= slides.length) {
      atual = 0;
    }

    slides[atual].classList.add("active");

  }, 3500);

});

/* ========================================
   CARROSSEL AUTOMÁTICO - IDENTIDADE VISUAL
======================================== */

document.querySelectorAll(".identidade-carousel").forEach((carousel, index) => {

  const slides = carousel.querySelectorAll(".identidade-slide");

  if (slides.length <= 1) return;

  let atual = 0;

  const trocarSlide = () => {

    slides[atual].classList.remove("active");

    atual++;

    if (atual >= slides.length) {
      atual = 0;
    }

    slides[atual].classList.add("active");

  };


  /* Faz cada card começar em um momento diferente */
  setTimeout(() => {

    trocarSlide();

    setInterval(trocarSlide, 3500);

  }, index * 650);

});