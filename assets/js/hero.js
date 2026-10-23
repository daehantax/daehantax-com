/* ============================================================
   대한세무법인 — hero.js  (메인 화면 첫 장면)

   · 문구(.hero-v__line)가 차례로 바뀝니다.
   · assets/video/ 에 올린 영상(assets/data/hero-videos.json)이 있으면
     배경으로 차례로 재생하고, 영상이 바뀔 때 문구도 함께 바뀝니다.
   · 휴대폰 데이터 절약: 페이지가 다 뜬 뒤에야 영상을 받고, 지금 영상만 받습니다.
     '데이터 절약 모드'나 '동작 줄이기' 설정을 켠 기기에서는 영상을 받지 않습니다.
   · 일시정지 버튼으로 언제든 멈출 수 있습니다.
   ============================================================ */
(function () {
  "use strict";

  var hero = document.querySelector("[data-hero]");
  if (!hero) return;

  var lines = Array.prototype.slice.call(hero.querySelectorAll(".hero-v__line"));
  var media = hero.querySelector(".hero-v__media");
  var toggle = hero.querySelector("[data-hero-toggle]");
  var dots = hero.querySelector(".hero-v__dots");
  var LINE_MS = 6500;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var conn = navigator.connection || {};
  var saveData = conn.saveData || /(^|-)2g$/.test(conn.effectiveType || "");

  var idx = 0;
  var paused = reduce;
  var timer = null;
  var videos = [];
  var players = [];
  var vIdx = 0;

  /* ---------- 문구 ---------- */
  lines.forEach(function (l, i) {
    l.classList.toggle("is-active", i === 0);
    l.setAttribute("aria-hidden", i === 0 ? "false" : "true");
    if (dots) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", (i + 1) + "번째 문구 보기");
      b.addEventListener("click", function () { showLine(i); restartTimer(); });
      dots.appendChild(b);
    }
  });
  markDots();

  function markDots() {
    if (!dots) return;
    Array.prototype.forEach.call(dots.children, function (b, i) {
      b.setAttribute("aria-current", i === idx ? "true" : "false");
    });
  }

  function showLine(i) {
    idx = (i + lines.length) % lines.length;
    lines.forEach(function (l, k) {
      l.classList.toggle("is-active", k === idx);
      l.setAttribute("aria-hidden", k === idx ? "false" : "true");
    });
    markDots();
  }

  function restartTimer() {
    clearInterval(timer);
    // 영상이 2개 이상이면 영상이 끝날 때 문구가 바뀌므로 타이머를 쓰지 않는다
    if (paused || videos.length > 1 || lines.length < 2) return;
    timer = setInterval(function () { showLine(idx + 1); }, LINE_MS);
  }

  /* ---------- 일시정지 ---------- */
  function setPaused(p) {
    paused = p;
    if (toggle) {
      toggle.setAttribute("aria-pressed", p ? "true" : "false");
      toggle.setAttribute("aria-label", p ? "다시 재생" : "일시정지");
      toggle.classList.toggle("is-paused", p);
    }
    players.forEach(function (v) {
      if (!v.classList.contains("is-active")) return;
      if (p) v.pause();
      else v.play().catch(function () {});
    });
    restartTimer();
  }
  if (toggle) toggle.addEventListener("click", function () { setPaused(!paused); });
  if (reduce && toggle) setPaused(true);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) clearInterval(timer);
    else restartTimer();
  });

  /* ---------- 영상 ---------- */
  function makePlayer() {
    var v = document.createElement("video");
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    v.setAttribute("aria-hidden", "true");
    v.preload = "auto";
    media.appendChild(v);
    return v;
  }

  function load(v, item) {
    v.src = item.src;
    if (item.poster) v.poster = item.poster;
    v.loop = videos.length === 1;
    v.load();
  }

  function playIndex(i) {
    vIdx = (i + videos.length) % videos.length;
    var cur = players[vIdx % 2 === 0 ? 0 : 1] || players[0];
    var other = players.length > 1 ? (cur === players[0] ? players[1] : players[0]) : null;
    if (cur.getAttribute("src") !== videos[vIdx].src) load(cur, videos[vIdx]);
    var start = function () {
      cur.classList.add("is-active");
      if (other) other.classList.remove("is-active");
      hero.classList.add("has-video");
      if (!paused) cur.play().catch(function () {});
      // 다음 영상을 미리 받아 둔다 (지금 것이 재생된 뒤)
      if (other && videos.length > 1) load(other, videos[(vIdx + 1) % videos.length]);
    };
    if (cur.readyState >= 2) start();
    else cur.addEventListener("loadeddata", start, { once: true });
  }

  function startVideos() {
    if (!media || reduce || saveData) return;
    fetch("assets/data/hero-videos.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : { videos: [] }; })
      .then(function (data) {
        videos = (data && data.videos) || [];
        if (!videos.length) return;
        players = [makePlayer()];
        if (videos.length > 1) {
          players.push(makePlayer());
          players.forEach(function (v) {
            v.addEventListener("ended", function () {
              if (!v.classList.contains("is-active")) return;
              playIndex(vIdx + 1);
              showLine(idx + 1);
            });
          });
        }
        restartTimer();
        playIndex(0);
      })
      .catch(function () {});
  }

  restartTimer();
  if (document.readyState === "complete") startVideos();
  else window.addEventListener("load", startVideos);
})();
