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
  var isOpen = false;
  var pushedState = false;
  var openedFromHash = false;
  var currentItem = null;

  /* slug → 게시글. 해시(#post-<slug>)로 바로 열기 위한 색인 */
  var articleIndex = {};

  function registerArticles(list) {
    (list || []).forEach(function (it) {
      if (it && it.slug) articleIndex[it.slug] = it;
    });
  }

  /* 게시글 주소는 해시(#)가 아니라 쿼리(?post=)를 쓴다.
     GA4는 해시만 바뀌는 변경을 새 페이지로 보지 않아 글 조회수가 집계되지 않는다. */
  function slugFromUrl() {
    var q = new URLSearchParams(location.search).get("post");
    if (q) return q;
    /* 초기 배포분에서 쓰던 #post- 링크 호환 */
    var m = /^#post-(.+)$/.exec(location.hash || "");
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* 현재 주소에서 post 파라미터만 갈아끼운 경로 */
  function pathWithPost(slug) {
    var u = new URL(location.href);
    if (slug) u.searchParams.set("post", slug);
    else u.searchParams.delete("post");
    u.hash = "";
    return u.pathname + u.search;
  }

  /* 공유용 주소는 항상 세무정보실 기준으로 만든다.
     (홈은 최신 6건만 보여주므로 옛 글 링크가 열리지 않음) */
  function articleUrl(slug) {
    var u = new URL("info.html", location.href);
    u.searchParams.set("post", slug);
    return u.href;
  }

  function openFromHash() {
    var slug = slugFromUrl();
    if (!slug || isOpen || !articleIndex[slug]) return;
    openedFromHash = true;
    openModal(articleIndex[slug], true);
  }

  function ensureModal() {
    if (modal) return modal;
    modal = el("div", "modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "게시글 내용");
    modal.innerHTML =
      '<div class="modal__backdrop" data-close></div>' +
      '<div class="modal__panel" data-modal-panel>' +
      '  <div class="modal__bar" data-modal-bar>' +
      '    <button type="button" class="modal__copy" data-modal-copy hidden>링크 복사</button>' +
      '    <span class="modal__grab" aria-hidden="true"></span>' +
      '    <button type="button" class="modal__close" data-close aria-label="닫기">&times;</button>' +
      "  </div>" +
      '  <div class="modal__meta">' +
      '    <span class="tag" data-modal-tag></span>' +
      '    <span class="article-card__date" data-modal-date></span>' +
      "  </div>" +
      '  <h3 class="modal__title" data-modal-title></h3>' +
      '  <div class="modal__body" data-modal-body></div>' +
      '  <div class="modal__link" data-modal-link hidden>' +
      '    <a class="btn btn--solid btn--sm" data-modal-link-a href="#"></a>' +
      "  </div>" +
      '  <div class="modal__cta">' +
      "    <p>내 상황에 어떻게 적용되는지 궁금하시다면 카카오톡 채널로 편하게 문의해 주세요.</p>" +
      '    <a class="btn btn--kakao btn--sm" href="http://pf.kakao.com/_ddxbxcu/chat" target="_blank" rel="noopener">카톡 상담하기</a>' +
      "  </div>" +
      '  <button type="button" class="modal__done" data-close>닫기</button>' +
      "</div>";
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });

    bindDragToClose(
      modal.querySelector("[data-modal-bar]"),
      modal.querySelector("[data-modal-panel]")
    );
    bindCopyLink(modal.querySelector("[data-modal-copy]"));
    return modal;
  }

  /* 게시글 주소를 클립보드로 — 카카오톡 등으로 바로 공유 */
  function bindCopyLink(btn) {
    btn.addEventListener("click", function () {
      if (!currentItem || !currentItem.slug) return;
      var url = articleUrl(currentItem.slug);

      function done() {
        btn.textContent = "복사됨";
        setTimeout(function () { btn.textContent = "링크 복사"; }, 1600);
      }
      function fallback() {
        var ta = el("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:-1000px;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); } catch (e) { window.prompt("주소를 복사하세요", url); }
        document.body.removeChild(ta);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, fallback);
      } else {
        fallback();
      }
    });
  }

  /* 모바일: 상단 손잡이를 아래로 끌어내리면 닫힘 (바텀시트 관습) */
  function bindDragToClose(bar, panel) {
    var startY = null;
    var dy = 0;

    bar.addEventListener("touchstart", function (e) {
      startY = e.touches[0].clientY;
      dy = 0;
      panel.style.transition = "none";
    }, { passive: true });

    bar.addEventListener("touchmove", function (e) {
      if (startY === null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      panel.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });

    function endDrag() {
      if (startY === null) return;
      var shouldClose = dy > 80;
      panel.style.transition = "";
      panel.style.transform = "";
      startY = null;
      dy = 0;
      if (shouldClose) closeModal();
    }

    bar.addEventListener("touchend", endDrag);
    bar.addEventListener("touchcancel", endDrag);
  }

  var lastFocused = null;

  function openModal(item, skipPush) {
    var m = ensureModal();
    currentItem = item;
    var tag = m.querySelector("[data-modal-tag]");
    tag.textContent = item.category || "공지";
    tag.className = item.category === "세법개정" ? "tag tag--gold" : "tag";
    m.querySelector("[data-modal-date]").textContent = formatDate(item.date);
    m.querySelector("[data-modal-title]").textContent = item.title;
    m.querySelector("[data-modal-body]").textContent = item.body || item.summary || "";

    /* 별도 해설 페이지가 있는 게시글이면 바로가기 버튼 노출 */
    var linkBox = m.querySelector("[data-modal-link]");
    var linkA = m.querySelector("[data-modal-link-a]");
    if (item.link && item.link.url) {
      linkA.setAttribute("href", item.link.url);
      linkA.textContent = item.link.label || "자세히 보기";
      linkBox.hidden = false;
    } else {
      linkBox.hidden = true;
    }

    lastFocused = document.activeElement;
    m.classList.add("is-open");
    document.body.style.overflow = "hidden";
    /* 이전에 읽던 위치가 남지 않도록 항상 맨 위에서 시작 */
    m.querySelector("[data-modal-panel]").scrollTop = 0;
    m.querySelector(".modal__close").focus();

    /* 링크 복사 버튼은 slug가 있는 게시글에서만 */
    var copyBtn = m.querySelector("[data-modal-copy]");
    copyBtn.hidden = !item.slug;
    copyBtn.textContent = "링크 복사";

    /* 주소창에 ?post=<slug>를 남긴다.
       - 이 글만 가리키는 공유 가능한 주소가 생기고
       - 히스토리 항목이 쌓여 뒤로가기가 사이트 이탈 대신 모달만 닫으며
       - GA4가 이를 새 페이지로 인식해 글별 조회수가 집계된다 */
    if (!isOpen) {
      isOpen = true;
      if (!skipPush) {
        try {
          history.pushState({ dhModal: true }, "", item.slug ? pathWithPost(item.slug) : location.href);
          pushedState = true;
        } catch (err) {
          pushedState = false;
        }
      }
    }
  }

  function closeModal(fromPopstate) {
    if (!modal || !modal.classList.contains("is-open")) return;
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    isOpen = false;
    currentItem = null;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    if (fromPopstate) return;

    if (pushedState) {
      /* 사이트 안에서 연 경우 — 쌓아둔 히스토리 항목을 되돌린다.
         (그래야 닫은 뒤 뒤로가기가 '아무 반응 없음'이 되지 않는다) */
      pushedState = false;
      history.back();
    } else if (openedFromHash) {
      /* 공유 링크로 바로 들어온 경우 — 뒤로 가면 사이트를 벗어나므로
         주소에서 post 파라미터만 지운다 */
      openedFromHash = false;
      history.replaceState(null, "", pathWithPost(null));
    }
  }

  window.addEventListener("popstate", function () {
    if (isOpen) {
      pushedState = false;
      closeModal(true);
    }
    /* 앞으로가기 등으로 다시 ?post= 주소가 되면 해당 글을 연다 */
    var slug = slugFromUrl();
    if (slug && articleIndex[slug] && !isOpen) {
      openedFromHash = true;
      openModal(articleIndex[slug], true);
    }
  });

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
    /* 목록에 보이는 개수와 무관하게, 불러온 글은 모두 해시로 열 수 있게 색인 */
    registerArticles(items);
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
          openFromHash();
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
        .then(function (items) { renderArticles(tipsGrid, items); openFromHash(); })
        .catch(function () { renderEmpty(tipsGrid, fileProtocolMessage()); });
    }

    /* 정보실: 세법개정 아카이브 */
    var lawGrid = document.querySelector("[data-render='law-updates']");
    if (lawGrid) {
      fetchJSON("law-updates")
        .then(function (items) { renderArticles(lawGrid, items); openFromHash(); })
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
