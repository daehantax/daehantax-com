/* ============================================================
   대한세무법인 — inquiry.js  (모든 페이지 공용 「의뢰하기」)

   1) 「의뢰하기」 버튼을 누를 때만 입력 칸이 펼쳐집니다. (평소에는 버튼 하나만 보임)
        <button type="button" class="btn btn--solid" data-ask="기장"
                data-ask-title="기장 의뢰">기장 의뢰하기</button>
      · data-ask        : 분류 — 구글 시트 「블로그 문의」 탭의 '분류' 칸에 들어갑니다
      · data-ask-title  : 시트 '글 제목' 칸 (없으면 "홈페이지 의뢰 · 분류")
      · data-ask-slug   : 게시글이면 글 주소 이름 (유입경로 칸에 기록)
      접수는 「체납 자가진단 접수명단」 시트로 모입니다(form: "blog").
      시트 스크립트에 blogIntake 가 아직 없으면 탭 「접수명단」 으로 들어갑니다.
      (automation/apps-script-blog.gs 참고)
   2) 영상 글의 썸네일을 누르면 그 자리에서 유튜브 재생기로 바꿉니다.

   버튼은 나중에 그려지는 화면(세무정보실 목록 등)에 있어도 동작합니다.
   ============================================================ */
(function () {
  "use strict";

  // 체납 자가진단(check/index.html)과 같은 시트 웹앱 주소
  var SHEET_URL =
    "https://script.google.com/macros/s/AKfycbzI15I_g4DyBabMwo1xntqq5SKV_mAcPWNGrK9Woa95pPa7NXOZ8VNDr53eaAHmq1fMCQ/exec";
  var KAKAO = "http://pf.kakao.com/_ddxbxcu/chat";
  var TEL = "031-783-8877";

  function track(event, extra) {
    var o = { event: event };
    for (var k in extra || {}) o[k] = extra[k];
    (window.dataLayer = window.dataLayer || []).push(o);
  }

  var seq = 0;

  /* ---------- 입력 칸 만들기 ---------- */
  function buildPanel(btn) {
    var id = "ask-panel-" + ++seq;
    var cat = btn.getAttribute("data-ask") || "일반";
    var panel = document.createElement("div");
    panel.className = "ask-panel";
    panel.id = id;
    panel.innerHTML =
      '<form class="inquiry__form" novalidate>' +
      '  <p class="ask-panel__lead">상황을 짧게 남겨 주시면 담당 세무사가 확인하고 연락드립니다.</p>' +
      '  <div class="inquiry__row">' +
      '    <label class="inquiry__field"><span>성함</span>' +
      '      <input type="text" name="name" autocomplete="name" placeholder="홍길동" maxlength="40"></label>' +
      '    <label class="inquiry__field"><span>휴대폰 번호</span>' +
      '      <input type="tel" name="phone" autocomplete="tel" inputmode="numeric" placeholder="010-0000-0000" maxlength="20"></label>' +
      "  </div>" +
      '  <label class="inquiry__field"><span>의뢰 내용</span>' +
      '    <textarea name="question" rows="4" maxlength="450" placeholder="예) 법인 기장 맡기려고 합니다. 직원 5명, 연매출 20억 정도입니다."></textarea></label>' +
      '  <div class="inquiry__hp" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
      '  <label class="inquiry__agree"><input type="checkbox" name="agree">' +
      "    <span>상담 연락을 위해 성함·휴대폰 번호·의뢰 내용을 수집하는 데 동의합니다. 상담 목적으로만 쓰며, 상담 종료 후 1년이 지나면 파기합니다.</span></label>" +
      '  <p class="inquiry__err" role="alert" hidden></p>' +
      '  <div class="ask-panel__actions">' +
      '    <button class="btn btn--solid btn--sm" type="submit">의뢰 접수하기</button>' +
      '    <a class="btn btn--kakao btn--sm" href="' + KAKAO + '" target="_blank" rel="noopener">카톡으로 의뢰하기</a>' +
      '    <a class="btn btn--sm" href="tel:' + TEL + '">전화 ' + TEL + "</a>" +
      "  </div>" +
      "</form>" +
      '<p class="inquiry__done" hidden>의뢰가 접수됐습니다. 영업일 기준 하루 안에 담당 세무사가 연락드립니다. 모르는 번호라도 받아 주세요.</p>';

    var form = panel.querySelector("form");
    bindForm(form, panel.querySelector(".inquiry__done"), {
      category: cat,
      title: btn.getAttribute("data-ask-title") || "홈페이지 의뢰 · " + cat,
      slug: btn.getAttribute("data-ask-slug") || ""
    });
    return panel;
  }

  /* ---------- 펼치기 / 접기 ---------- */
  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-ask]") : null;
    if (!btn) return;
    e.preventDefault();

    var panel = btn.__askPanel;
    if (!panel) {
      panel = buildPanel(btn);
      panel.hidden = true;
      var host = btn.closest("[data-ask-host]");
      if (host) host.appendChild(panel);
      else btn.insertAdjacentElement("afterend", panel);
      btn.__askPanel = panel;
      btn.setAttribute("aria-controls", panel.id);
    }
    var open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.classList.toggle("is-open", open);
    if (open) {
      var first = panel.querySelector("input[name=name]");
      if (first) first.focus({ preventScroll: true });
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      track("ask_open", { ask_category: btn.getAttribute("data-ask") });
    }
  });

  /* ---------- 접수 ---------- */
  function bindForm(form, done, meta) {
    var err = form.querySelector(".inquiry__err");
    var btn = form.querySelector("button[type=submit]");
    var label = btn.textContent;
    var started = false;

    function field(n) { return form.elements.namedItem(n); }
    function show(msg) { err.textContent = msg; err.hidden = false; }

    form.addEventListener("input", function () {
      if (started) return;
      started = true;
      track("ask_start", { ask_category: meta.category });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (field("website").value) return; // 스팸 봇 차단
      var name = field("name").value.trim();
      var digits = field("phone").value.replace(/[^0-9]/g, "");
      var question = field("question").value.trim();
      if (!name) return show("성함을 적어 주세요.");
      if (!/^01[016789][0-9]{7,8}$/.test(digits)) return show("휴대폰 번호를 확인해 주세요.");
      if (!question) return show("의뢰 내용을 적어 주세요.");
      if (!field("agree").checked) return show("개인정보 수집에 동의해 주세요.");
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = "접수 중…";

      var phone = digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
      var src = new URLSearchParams(location.search).get("src");
      var page = location.pathname.split("/").pop() || "index.html";
      var payload = {
        form: "blog",
        name: name,
        phone: phone,
        question: question,
        post: meta.title,
        category: meta.category,
        url: location.origin + location.pathname,
        source: "홈페이지 " + (meta.slug || page) + (src ? " (" + src.slice(0, 30) + ")" : ""),
        // 시트 스크립트가 아직 blog 를 모를 때 「접수명단」 탭 칸에 맞춰 들어가도록
        tax: "홈페이지 의뢰 · " + meta.category,
        amount: "",
        year: "",
        biz: "",
        status: question,
        seized: "",
        result: meta.title
      };

      fetch(SHEET_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      })
        .then(function () {
          form.hidden = true;
          if (done) done.hidden = false;
          track("ask_submit", { ask_category: meta.category });
          track("blog_inquiry_submit", { post_slug: meta.slug || page });
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = label;
          show("전송에 실패했습니다. 잠시 후 다시 시도하시거나 카톡·전화로 의뢰해 주세요.");
        });
    });
  }

  /* 예전 방식(글 하단에 늘 펼쳐진 폼)으로 만든 페이지가 남아 있어도 동작하게 */
  document.querySelectorAll("form[data-inquiry]").forEach(function (form) {
    bindForm(form, form.parentNode.querySelector(".inquiry__done"), {
      category: form.dataset.postCategory || "게시글",
      title: form.dataset.postTitle || document.title,
      slug: form.dataset.postSlug || ""
    });
  });

  /* ---------- 영상: 썸네일 → 재생기 ---------- */
  document.querySelectorAll("[data-youtube]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + a.dataset.youtube + "?autoplay=1&rel=0";
      f.title = a.getAttribute("aria-label") || "유튜브 영상";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      f.allowFullscreen = true;
      a.replaceWith(f);
      track("blog_video_play", { video_id: a.dataset.youtube });
    });
  });
})();
