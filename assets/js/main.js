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
      if (window.innerWidth > 860 && gnb.classList.contains("is-open")) {
        gnb.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- 현재 페이지 내비게이션 표시 ---------- */
  var path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".gnb a[href]").forEach(function (a) {
    var href = a.getAttribute("href").split("#")[0];
    if (href === path) a.setAttribute("aria-current", "page");
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

  /* ---------- 푸터 연도 ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
