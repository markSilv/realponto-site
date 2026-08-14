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
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('#year, .current-year').forEach(el => el.textContent = new Date().getFullYear());
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