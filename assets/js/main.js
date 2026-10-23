/* ============================================================
   대한세무법인 — main.js
   공용 인터랙션: 모바일 메뉴, 현재 페이지 표시, 스크롤 리빌, 연도
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 모바일 메뉴 토글 ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var gnb = document.querySelector(".gnb");

  if (toggle && gnb) {
    toggle.addEventListener("click", function () {
      var open = gnb.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
    });

    // 메뉴 링크 클릭 시 닫기
    gnb.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        gnb.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    // 데스크톱 리사이즈 시 초기화
    window.addEventListener("resize", function () {
      if (window.innerWidth > 1080 && gnb.classList.contains("is-open")) {
        gnb.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- 현재 페이지 내비게이션 표시 ---------- */
  var path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".gnb a[href]").forEach(function (a) {
    var raw = a.getAttribute("href");
    if (raw.indexOf("#") !== -1) return; // 메인 화면 안의 구역 링크(#company 등)는 표시하지 않는다
    if (raw === path) a.setAttribute("aria-current", "page");
  });

  /* ---------- 스크롤 리빌 ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- 전화 클릭 추적 ----------
     GA4 향상된 측정의 '이탈 클릭'은 http(s) 링크만 집계해서 tel: 은 빠진다.
     전화 상담이 주요 전환이므로 직접 dataLayer 로 올린다.
     (GTM의 "전화 클릭" 트리거 → GA4 phone_click 이벤트로 이어진다)

     문서에 위임해 두면 나중에 추가되는 전화 링크도 따로 손대지 않아도 된다. */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="tel:"]') : null;
    if (!a) return;
    (window.dataLayer = window.dataLayer || []).push({
      event: "phone_click",
      phone_number: (a.getAttribute("href") || "").replace(/^tel:/, ""),
      phone_label: (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100)
    });
  });

  /* ---------- 메인 화면: 영상 위 투명 헤더 → 스크롤하면 흰 헤더 ---------- */
  var overlay = document.querySelector(".site-header--overlay");
  if (overlay) {
    var onScroll = function () {
      overlay.classList.toggle("is-scrolled", window.scrollY > 40 || (gnb && gnb.classList.contains("is-open")));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (toggle) toggle.addEventListener("click", onScroll);
    onScroll();
  }

  /* ---------- 푸터 연도 ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
