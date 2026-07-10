/* ============================================================
   대한세무법인 — data-render.js
   assets/data/*.json 파일을 읽어 카드·리스트·캘린더를 렌더링합니다.
   콘텐츠는 코드 수정 없이 JSON 파일만 편집하면 갱신됩니다.
   ============================================================ */
(function () {
  "use strict";

  var DATA_BASE = "assets/data/";

  /* ---------- 유틸 ---------- */

  function fetchJSON(name) {
    return fetch(DATA_BASE + name + ".json", { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(name + ".json 로드 실패 (" + res.status + ")");
      return res.json();
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(iso) {
    // "2026-07-01" → "2026. 7. 1."
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    return m[1] + ". " + Number(m[2]) + ". " + Number(m[3]) + ".";
  }

  function byDateDesc(a, b) {
    return (b.date || "").localeCompare(a.date || "");
  }

  function renderEmpty(container, message) {
    container.innerHTML = "";
    var box = el("p", "data-empty", message);
    container.appendChild(box);
  }

  function fileProtocolMessage() {
    return location.protocol === "file:"
      ? "콘텐츠를 불러오려면 웹서버 환경에서 열어야 합니다. (브라우저 보안 정책상 로컬 파일 직접 열기에서는 데이터 로드가 제한됩니다.)"
      : "콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  /* ---------- 아티클 모달 ---------- */

  var modal = null;

  function ensureModal() {
    if (modal) return modal;
    modal = el("div", "modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "게시글 내용");
    modal.innerHTML =
      '<div class="modal__backdrop" data-close></div>' +
      '<div class="modal__panel">' +
      '  <button type="button" class="modal__close" data-close aria-label="닫기">&times;</button>' +
      '  <div class="modal__meta">' +
      '    <span class="tag" data-modal-tag></span>' +
      '    <span class="article-card__date" data-modal-date></span>' +
      "  </div>" +
      '  <h3 class="modal__title" data-modal-title></h3>' +
      '  <div class="modal__body" data-modal-body></div>' +
      '  <div class="modal__cta">' +
      "    <p>내 상황에 어떻게 적용되는지 궁금하시다면 카카오톡 채널로 편하게 문의해 주세요.</p>" +
      '    <a class="btn btn--kakao btn--sm" href="http://pf.kakao.com/_ddxbxcu/chat" target="_blank" rel="noopener">카톡 상담하기</a>' +
      "  </div>" +
      "</div>";
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
    return modal;
  }

  var lastFocused = null;

  function openModal(item) {
    var m = ensureModal();
    var tag = m.querySelector("[data-modal-tag]");
    tag.textContent = item.category || "공지";
    tag.className = item.category === "세법개정" ? "tag tag--gold" : "tag";
    m.querySelector("[data-modal-date]").textContent = formatDate(item.date);
    m.querySelector("[data-modal-title]").textContent = item.title;
    m.querySelector("[data-modal-body]").textContent = item.body || item.summary || "";
    lastFocused = document.activeElement;
    m.classList.add("is-open");
    document.body.style.overflow = "hidden";
    m.querySelector(".modal__close").focus();
  }

  function closeModal() {
    if (!modal || !modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* ---------- 아티클 카드 그리드 ---------- */

  function articleCard(item) {
    var card = el("article", "article-card reveal is-visible");
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", item.title + " — 자세히 보기");

    var meta = el("div", "article-card__meta");
    var tag = el("span", item.category === "세법개정" ? "tag tag--gold" : "tag", item.category || "공지");
    meta.appendChild(tag);
    meta.appendChild(el("span", "article-card__date", formatDate(item.date)));

    card.appendChild(meta);
    card.appendChild(el("h3", "article-card__title", item.title));
    if (item.summary) card.appendChild(el("p", "article-card__summary", item.summary));
    card.appendChild(el("span", "article-card__more", "자세히 보기 +"));

    function activate() { openModal(item); }
    card.addEventListener("click", activate);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
    return card;
  }

  function renderArticles(container, items, limit) {
    container.innerHTML = "";
    var list = items.slice().sort(byDateDesc);
    if (limit) list = list.slice(0, limit);
    if (!list.length) return renderEmpty(container, "등록된 게시글이 없습니다.");
    list.forEach(function (item) { container.appendChild(articleCard(item)); });
  }

  /* ---------- 세무일정 캘린더 ---------- */

  function calCard(item) {
    var card = el("div", "cal-card" + (item.month === 0 ? " cal-card--anytime" : ""));
    var dl = el("p", "cal-card__deadline");
    if (item.month === 0) {
      dl.textContent = item.deadline;
    } else {
      var m = /^(\d{1,2})월\s*(\d{1,2})일$/.exec(item.deadline || "");
      if (m) {
        dl.innerHTML =
          '<span>' + m[1] + '</span><span class="unit">월</span> ' +
          '<span>' + m[2] + '</span><span class="unit">일</span><span class="unit">까지</span>';
      } else {
        dl.textContent = item.deadline || "";
      }
    }
    card.appendChild(dl);
    card.appendChild(el("h3", "cal-card__title", item.title));
    if (item.description) card.appendChild(el("p", "cal-card__desc", item.description));
    return card;
  }

  function renderCalendarMonth(container, data, month) {
    container.innerHTML = "";
    var items = data.items.filter(function (it) { return it.month === month; });
    if (!items.length) {
      return renderEmpty(container, month + "월에는 정기 신고 일정이 없습니다. 상시 신고 항목은 아래에서 확인하세요.");
    }
    items.forEach(function (it) { container.appendChild(calCard(it)); });
  }

  /* ---------- 공지사항 리스트 ---------- */

  function renderNotices(container, items) {
    container.innerHTML = "";
    var list = items.slice().sort(byDateDesc);
    if (!list.length) return renderEmpty(container, "등록된 공지사항이 없습니다.");
    list.forEach(function (item, i) {
      var d = el("details", "notice-item");
      if (i === 0) d.setAttribute("open", "");
      var s = el("summary");
      s.appendChild(el("span", "notice-item__title", item.title));
      s.appendChild(el("span", "notice-item__date", formatDate(item.date)));
      d.appendChild(s);
      d.appendChild(el("p", "notice-item__body", item.body || ""));
      container.appendChild(d);
    });
  }

  /* ---------- 페이지별 초기화 ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    /* 홈: 이번달 세무일정 */
    var homeCal = document.querySelector("[data-render='calendar-current']");
    if (homeCal) {
      fetchJSON("tax-calendar")
        .then(function (data) {
          var month = new Date().getMonth() + 1;
          var label = document.querySelector("[data-current-month]");
          if (label) label.textContent = String(month);
          renderCalendarMonth(homeCal, data, month);
          var note = document.querySelector("[data-cal-note]");
          if (note && data.note) note.textContent = data.note.split(" month가")[0];
        })
        .catch(function () { renderEmpty(homeCal, fileProtocolMessage()); });
    }

    /* 홈: 최신 절세정보 + 세법개정 통합 그리드 */
    var homeNews = document.querySelector("[data-render='latest-articles']");
    if (homeNews) {
      Promise.all([fetchJSON("tax-tips"), fetchJSON("law-updates")])
        .then(function (results) {
          renderArticles(homeNews, results[0].concat(results[1]), 6);
        })
        .catch(function () { renderEmpty(homeNews, fileProtocolMessage()); });
    }

    /* 정보실: 전체 캘린더 (월 선택) */
    var infoCal = document.querySelector("[data-render='calendar-full']");
    var monthNav = document.querySelector("[data-render='month-nav']");
    if (infoCal && monthNav) {
      fetchJSON("tax-calendar")
        .then(function (data) {
          var current = new Date().getMonth() + 1;

          for (var m = 1; m <= 12; m++) {
            (function (month) {
              var btn = el("button", null, month + "월");
              btn.setAttribute("type", "button");
              btn.setAttribute("aria-pressed", month === current ? "true" : "false");
              btn.addEventListener("click", function () {
                monthNav.querySelectorAll("button").forEach(function (b) {
                  b.setAttribute("aria-pressed", "false");
                });
                btn.setAttribute("aria-pressed", "true");
                renderCalendarMonth(infoCal, data, month);
              });
              monthNav.appendChild(btn);
            })(m);
          }
          renderCalendarMonth(infoCal, data, current);

          /* 상시 신고 항목 (month === 0) */
          var anytime = document.querySelector("[data-render='calendar-anytime']");
          if (anytime) {
            var items = data.items.filter(function (it) { return it.month === 0; });
            anytime.innerHTML = "";
            items.forEach(function (it) { anytime.appendChild(calCard(it)); });
          }

          var note = document.querySelector("[data-cal-note]");
          if (note && data.note) note.textContent = data.note;
        })
        .catch(function () {
          renderEmpty(infoCal, fileProtocolMessage());
        });
    }

    /* 정보실: 절세정보 아카이브 */
    var tipsGrid = document.querySelector("[data-render='tax-tips']");
    if (tipsGrid) {
      fetchJSON("tax-tips")
        .then(function (items) { renderArticles(tipsGrid, items); })
        .catch(function () { renderEmpty(tipsGrid, fileProtocolMessage()); });
    }

    /* 정보실: 세법개정 아카이브 */
    var lawGrid = document.querySelector("[data-render='law-updates']");
    if (lawGrid) {
      fetchJSON("law-updates")
        .then(function (items) { renderArticles(lawGrid, items); })
        .catch(function () { renderEmpty(lawGrid, fileProtocolMessage()); });
    }

    /* 정보실: 공지사항 */
    var noticeList = document.querySelector("[data-render='notices']");
    if (noticeList) {
      fetchJSON("notices")
        .then(function (items) { renderNotices(noticeList, items); })
        .catch(function () { renderEmpty(noticeList, fileProtocolMessage()); });
    }
  });
})();
