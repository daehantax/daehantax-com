/* ============================================================
   대한세무법인 — data-render.js
   assets/data/*.json 파일을 읽어 카드·리스트·캘린더를 렌더링합니다.
   콘텐츠는 코드 수정 없이 JSON 파일만 편집하면 갱신됩니다.

   게시글 본문은 automation/build-posts.js 가 만든 개별 페이지
   (post/<slug>.html)에 있습니다. 여기서는 목록 카드만 그리고,
   카드는 그 페이지로 이동하는 평범한 링크입니다.
   ============================================================ */
(function () {
  "use strict";

  var DATA_BASE = "assets/data/";
  var POST_BASE = "post/";

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
    container.appendChild(el("p", "data-empty", message));
  }

  function fileProtocolMessage() {
    return location.protocol === "file:"
      ? "콘텐츠를 불러오려면 웹서버 환경에서 열어야 합니다. (브라우저 보안 정책상 로컬 파일 직접 열기에서는 데이터 로드가 제한됩니다.)"
      : "콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  /* ---------- 아티클 카드 그리드 ---------- */

  function articleCard(item) {
    /* 진짜 <a> 링크여야 검색엔진이 글 페이지를 따라간다 */
    var card = el("a", "article-card reveal is-visible");
    card.setAttribute("href", POST_BASE + item.slug + ".html");

    if (item.youtubeId) {
      var thumb = el("span", "article-card__thumb");
      var img = el("img");
      img.src = "https://i.ytimg.com/vi/" + item.youtubeId + "/hqdefault.jpg";
      img.alt = "";
      img.loading = "lazy";
      thumb.appendChild(img);
      card.appendChild(thumb);
    }

    var meta = el("div", "article-card__meta");
    meta.appendChild(el("span", item.youtubeId ? "tag tag--video" : item.category === "세법개정" ? "tag tag--gold" : "tag", item.category || "공지"));
    meta.appendChild(el("span", "article-card__date", formatDate(item.date)));

    card.appendChild(meta);
    card.appendChild(el("h3", "article-card__title", item.title));
    if (item.summary) card.appendChild(el("p", "article-card__summary", item.summary));
    card.appendChild(el("span", "article-card__more", "자세히 보기 +"));
    return card;
  }

  function renderArticles(container, items, limit) {
    container.innerHTML = "";
    var list = items.slice().sort(byDateDesc).filter(function (it) { return it && it.slug; });
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

  /* ---------- 세무정보실: 업종별 목록 ----------
     업종은 assets/data/industries.json 의 낱말이 글 제목·태그에 들어 있으면 자동으로 정해진다.
     글에 "industry": ["restaurant"] 처럼 적혀 있으면 그것이 우선한다. 어디에도 안 걸리면 '공통'. */

  var TYPES = [
    { id: "all", name: "전체" },
    { id: "video", name: "영상 해설" },
    { id: "tips", name: "절세정보" },
    { id: "law", name: "세법개정" },
    { id: "support", name: "경영지원" }
  ];

  function typeOf(a) {
    if (a.youtubeId) return "video";
    if (a.category === "세법개정") return "law";
    if (a.category === "경영지원") return "support";
    return "tips";
  }

  function industriesOf(a, inds) {
    if (Array.isArray(a.industry) && a.industry.length) return a.industry;
    var hay = [a.title || ""].concat(a.tags || []).join(" ");
    var hits = inds.filter(function (i) {
      return (i.keywords || []).some(function (k) { return k && hay.indexOf(k) !== -1; });
    }).map(function (i) { return i.id; });
    return hits.length ? hits : ["common"];
  }

  function readState() {
    var h = location.hash.replace(/^#/, "");
    var st = { ind: "all", type: "all" };
    if (h === "video" || h === "tips" || h === "law") { st.type = h; return st; }
    h.split("&").forEach(function (kv) {
      var m = /^(ind|type)=([a-z]+)$/.exec(kv);
      if (m) st[m[1]] = m[2];
    });
    return st;
  }

  function renderArchive(root, inds, items) {
    var nameOf = {};
    inds.forEach(function (i) { nameOf[i.id] = i.name; });
    items = items.filter(function (it) { return it && it.slug; }).sort(byDateDesc);
    items.forEach(function (it) { it.__ind = industriesOf(it, inds); it.__type = typeOf(it); });

    var st = readState();
    if (st.ind !== "all" && !nameOf[st.ind]) st.ind = "all";

    root.innerHTML = "";
    var indRow = el("div", "filter");
    indRow.setAttribute("role", "group");
    indRow.setAttribute("aria-label", "업종 고르기");
    indRow.appendChild(el("span", "filter__label", "업종"));
    var typeRow = el("div", "filter");
    typeRow.setAttribute("role", "group");
    typeRow.setAttribute("aria-label", "글 종류 고르기");
    typeRow.appendChild(el("span", "filter__label", "글 종류"));
    var info = el("p", "archive__info");
    var grid = el("div", "article-grid");
    root.appendChild(indRow);
    root.appendChild(typeRow);
    root.appendChild(info);
    root.appendChild(grid);

    function chip(row, key, id, label, count) {
      var b = el("button", null, label);
      b.type = "button";
      b.dataset.key = key;
      b.dataset.id = id;
      if (count != null) {
        b.appendChild(el("span", "cnt", String(count)));
        if (!count) b.classList.add("is-empty");
      }
      b.addEventListener("click", function () {
        st[key] = id;
        try { history.replaceState(null, "", "#ind=" + st.ind + "&type=" + st.type); } catch (e) {}
        draw();
        (window.dataLayer = window.dataLayer || []).push({ event: "info_filter", filter_key: key, filter_value: id });
      });
      row.appendChild(b);
    }

    chip(indRow, "ind", "all", "전체", items.length);
    inds.forEach(function (i) {
      var n = items.filter(function (it) { return it.__ind.indexOf(i.id) !== -1; }).length;
      chip(indRow, "ind", i.id, i.name, n);
    });
    TYPES.forEach(function (t) { chip(typeRow, "type", t.id, t.name); });

    function draw() {
      root.querySelectorAll(".filter button").forEach(function (b) {
        b.setAttribute("aria-pressed", st[b.dataset.key] === b.dataset.id ? "true" : "false");
      });
      var list = items.filter(function (it) {
        return (st.ind === "all" || it.__ind.indexOf(st.ind) !== -1) && (st.type === "all" || it.__type === st.type);
      });
      var indName = st.ind === "all" ? "전체 업종" : nameOf[st.ind];
      var typeName = TYPES.filter(function (t) { return t.id === st.type; })[0].name;
      info.innerHTML = "";
      var left = el("span");
      left.appendChild(el("strong", null, indName));
      left.appendChild(document.createTextNode(" · " + typeName + " — 글 " + list.length + "건"));
      info.appendChild(left);
      var desc = inds.filter(function (i) { return i.id === st.ind; })[0];
      if (desc && desc.desc) info.appendChild(el("span", null, desc.desc));

      grid.innerHTML = "";
      if (!list.length) {
        var box = el("div", "archive-empty");
        box.setAttribute("data-ask-host", "");
        box.appendChild(el("p", null, indName + " 글은 지금 준비하고 있습니다. 궁금한 내용을 남겨 주시면 담당 세무사가 답을 드리고, 같은 질문이 많으면 글로도 정리해 올리겠습니다."));
        var ask = el("button", "btn btn--solid btn--sm", "이 업종 상담 의뢰하기");
        ask.type = "button";
        ask.setAttribute("data-ask", "세무정보실 · " + indName);
        ask.setAttribute("data-ask-title", "세무정보실 업종 문의 · " + indName);
        box.appendChild(ask);
        grid.appendChild(box);
        return;
      }
      list.forEach(function (it) {
        var card = articleCard(it);
        // 업종 표시 (공통이 아닌 첫 업종)
        var ind = it.__ind.filter(function (x) { return x !== "common"; })[0];
        if (ind && nameOf[ind]) card.querySelector(".article-card__meta").appendChild(el("span", "tag tag--ind", nameOf[ind]));
        grid.appendChild(card);
      });
    }
    draw();

    // 예전 주소(#tips 등)나 업종 주소로 들어오면 목록 위치로 내려 준다
    if (location.hash) setTimeout(function () { root.scrollIntoView({ block: "start" }); }, 50);
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
      Promise.all([fetchJSON("tax-tips"), fetchJSON("law-updates"), fetchJSON("videos").catch(function () { return []; })])
        .then(function (results) { renderArticles(homeNews, results[0].concat(results[1], results[2]), 6); })
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

    /* 정보실: 업종별 목록 (영상 해설 · 절세정보 · 세법개정 · 경영지원 통합) */
    var archive = document.querySelector("[data-render='archive']");
    if (archive) {
      Promise.all([
        fetchJSON("industries"),
        fetchJSON("tax-tips"),
        fetchJSON("law-updates"),
        fetchJSON("videos").catch(function () { return []; })
      ])
        .then(function (r) { renderArchive(archive, r[0].industries || [], r[1].concat(r[2], r[3])); })
        .catch(function () { renderEmpty(archive, fileProtocolMessage()); });
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
