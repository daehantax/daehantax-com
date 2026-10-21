/* ============================================================
   대한세무법인 — inquiry.js  (게시글 페이지 전용)

   1) 글 하단 「문의 남기기」 폼 → 「체납 자가진단 접수명단」 구글 시트로 접수
      · 시트의 앱스 스크립트가 form: "blog" 를 알아보면 탭 「블로그 문의」 에 쌓입니다.
        (automation/apps-script-blog.gs 를 시트 스크립트에 붙여 넣고 새 버전으로 배포)
      · 아직 붙여 넣기 전이어도 접수는 됩니다 — 탭 「접수명단」 에
        체납세목 칸 = "블로그 문의", 현재상황 칸 = 문의 내용, 판정유형 칸 = 글 제목 으로 들어갑니다.
   2) 영상 글의 썸네일을 누르면 그 자리에서 유튜브 재생기로 바꿉니다.
   ============================================================ */
(function () {
  "use strict";

  // 체납 자가진단(check/index.html)과 같은 시트 웹앱 주소
  var SHEET_URL =
    "https://script.google.com/macros/s/AKfycbzI15I_g4DyBabMwo1xntqq5SKV_mAcPWNGrK9Woa95pPa7NXOZ8VNDr53eaAHmq1fMCQ/exec";

  function track(event, extra) {
    var o = { event: event };
    for (var k in extra || {}) o[k] = extra[k];
    (window.dataLayer = window.dataLayer || []).push(o);
  }

  /* ---------- 문의 폼 ---------- */
  document.querySelectorAll("form[data-inquiry]").forEach(function (form) {
    var err = form.querySelector(".inquiry__err");
    var btn = form.querySelector("button[type=submit]");
    var done = form.parentNode.querySelector(".inquiry__done");
    var started = false;

    function field(n) {
      return form.elements.namedItem(n);
    }

    function show(msg) {
      err.textContent = msg;
      err.hidden = false;
    }

    form.addEventListener("input", function () {
      if (!started) {
        started = true;
        track("blog_inquiry_start", { post_slug: form.dataset.postSlug });
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (field("website").value) return; // 스팸 봇 차단
      var name = field("name").value.trim();
      var digits = field("phone").value.replace(/[^0-9]/g, "");
      var question = field("question").value.trim();
      if (!name) return show("성함을 적어 주세요.");
      if (!/^01[016789][0-9]{7,8}$/.test(digits)) return show("휴대폰 번호를 확인해 주세요.");
      if (!question) return show("문의 내용을 적어 주세요.");
      if (!field("agree").checked) return show("개인정보 수집에 동의해 주세요.");
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = "접수 중…";

      var phone = digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
      var title = form.dataset.postTitle || document.title;
      var url = location.origin + location.pathname;
      var src = new URLSearchParams(location.search).get("src");
      var payload = {
        form: "blog",
        name: name,
        phone: phone,
        question: question,
        post: title,
        category: form.dataset.postCategory || "",
        url: url,
        source: "블로그 " + (form.dataset.postSlug || "") + (src ? " (" + src.slice(0, 30) + ")" : ""),
        // 시트 스크립트가 아직 blog 를 모를 때 「접수명단」 탭 칸에 맞춰 들어가도록
        tax: "블로그 문의",
        amount: "",
        year: "",
        biz: "",
        status: question,
        seized: "",
        result: title
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
          track("blog_inquiry_submit", { post_slug: form.dataset.postSlug });
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = "문의 남기기";
          show("전송에 실패했습니다. 잠시 후 다시 시도하시거나 카톡·전화로 문의해 주세요.");
        });
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
