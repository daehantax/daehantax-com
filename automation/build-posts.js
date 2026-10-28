#!/usr/bin/env node
/* ============================================================
   대한세무법인 — build-posts.js

   assets/data/tax-tips.json · law-updates.json · videos.json 의 각 게시글을
   검색엔진이 읽을 수 있는 개별 HTML 페이지(post/<slug>.html)로 생성하고,
   sitemap.xml 을 다시 만듭니다.

     node automation/build-posts.js

   JSON만 고치면 되던 기존 방식은 그대로입니다. 이 스크립트는
   .github/workflows/build-posts.yml 에서 자동 실행되므로, 평소에는
   직접 돌릴 필요가 없습니다. (로컬에서 결과를 미리 보고 싶을 때만 실행)
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "assets", "data");
const OUT_DIR = path.join(ROOT, "post");
const ORIGIN = "https://daehantax.com";
const GTM_ID = "GTM-KJGBSJLR";

/* about·services 처럼 좀처럼 바뀌지 않는 페이지는 lastmod 를 고정해 둔다.
   (매번 빌드 날짜로 바꾸면 sitemap 이 의미 없이 계속 변경된다) */
const STATIC_LASTMOD = {
  "about.html": "2026-08-12",
  "services.html": "2026-08-12",
  "tax-reform-2026.html": "2026-08-12",
  "relief.html": "2026-10-23",
};

/* ---------- 유틸 ---------- */

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/* meta description·og:description 은 155자쯤에서 문장 단위로 자른다 */
function clip(text, max = 155) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다. "), cut.lastIndexOf("니다"));
  return (stop > max * 0.6 ? cut.slice(0, stop + 2) : cut).trim().replace(/[,·\s]+$/, "") + "…";
}

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.` : iso || "";
}

/* 게시글 본문의 상대 링크는 post/ 하위에서 한 단계 올라가야 한다 */
const rebase = (url) => (/^(https?:)?\/\/|^mailto:|^tel:|^#/.test(url) ? url : "../" + url);

const catName = (a) => a.category || "공지";
const catAnchor = (a) => (a.youtubeId ? "video" : a.category === "세법개정" ? "law" : "tips");
const tagClass = (a) => (a.youtubeId ? "tag tag--video" : a.category === "세법개정" ? "tag tag--gold" : "tag");

/* 영상 글의 글쓴이 — 검색엔진·AI 가 "누가 쓴 전문 글인지" 판단하는 근거 (E-E-A-T) */
const AUTHOR = {
  "@type": "Person",
  name: "이석제",
  jobTitle: "세무사",
  description: "대한세무법인 대표세무사 · 유튜브 「당신의 세무사」 운영",
  worksFor: { "@id": `${ORIGIN}/#organization` },
  url: `${ORIGIN}/about.html`,
};

/* 영상 글(videos.json — YT 오토메이션이 대표님 승인 후 올림)은 유튜브 썸네일을 대표 이미지로 쓴다 */
const ogImage = (a) =>
  a.youtubeId ? `https://i.ytimg.com/vi/${a.youtubeId}/hqdefault.jpg` : `${ORIGIN}/assets/img/og-default.png`;

/* 대략적인 낱말 수 — Article.wordCount 용 */
const wordCount = (a) => String(a.body || a.summary || "").trim().split(/\s+/).filter(Boolean).length;

/* 관련 글 3건.
   예전에는 같은 카테고리의 '최신 3건'을 늘 골랐는데, 그러면 오래된 글은
   어느 페이지에서도 링크되지 않아 글끼리 연결이 끊긴다(28건 중 17건이 고립됐었다).
   지금은 자기 위치를 기준으로 앞뒤 이웃을 번갈아 골라 링크를 고르게 퍼뜨린다. */
function relatedPicks(a, all) {
  const same = all.filter((x) => x.category === a.category);
  const idx = same.findIndex((x) => x.slug === a.slug);
  const picks = [];

  for (let d = 1; picks.length < 3 && d <= same.length; d++) {
    if (same[idx + d]) picks.push(same[idx + d]);
    if (picks.length < 3 && same[idx - d]) picks.push(same[idx - d]);
  }
  /* 같은 카테고리로 못 채우면 다른 카테고리 최신글로 보충 */
  for (const x of all) {
    if (picks.length >= 3) break;
    if (x.slug !== a.slug && !picks.includes(x)) picks.push(x);
  }
  return picks.slice(0, 3);
}

/* ---------- 데이터 ---------- */

function loadArticles() {
  const files = ["tax-tips.json", "law-updates.json", "videos.json"];
  const all = [];
  for (const f of files) {
    const p = path.join(DATA, f);
    if (!fs.existsSync(p)) continue; // videos.json 은 첫 영상 글이 올라오기 전엔 없을 수 있다
    const items = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!Array.isArray(items)) throw new Error(`${f} 이 배열이 아닙니다.`);
    all.push(...items);
  }

  const seen = new Map();
  for (const a of all) {
    if (!a.slug) throw new Error(`slug 없는 게시글: "${a.title}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) throw new Error(`slug 형식 오류: "${a.slug}" (소문자 ASCII + 하이픈만)`);
    if (seen.has(a.slug)) throw new Error(`slug 중복: "${a.slug}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || "")) throw new Error(`date 형식 오류(${a.slug}): "${a.date}"`);
    seen.set(a.slug, a);
  }
  return all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/* ---------- 조각 ---------- */

const head = (a) => {
  const url = `${ORIGIN}/post/${a.slug}.html`;
  const desc = clip(a.summary || a.body);
  const title = `${a.title} — 대한세무법인`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${GTM_ID}');</script>
  <!-- End Google Tag Manager -->
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="canonical" href="${url}">${Array.isArray(a.tags) && a.tags.length ? `
  <meta name="keywords" content="${esc(a.tags.join(", "))}">` : ""}${a.youtubeId ? `
  <meta name="author" content="이석제 세무사 (대한세무법인)">` : ""}

  <!-- 공유 미리보기 (카카오톡·페이스북·네이버 블로그 등) -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="대한세무법인">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(a.title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${ogImage(a)}">
  <meta property="og:image:width" content="${a.youtubeId ? 480 : 1200}">
  <meta property="og:image:height" content="${a.youtubeId ? 360 : 630}">
  <meta property="og:image:alt" content="대한세무법인">
  <meta property="article:published_time" content="${esc(a.date)}">
  <meta property="article:section" content="${esc(a.category || "세무정보")}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(a.title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${ogImage(a)}">

  <link rel="alternate" type="application/rss+xml" title="대한세무법인 세무정보" href="../rss.xml">
  <link rel="icon" type="image/png" href="../favicon.png">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="../assets/css/style.css">

  <!-- 구조화 데이터 — 기사(Article) + 이동경로 -->
  <script type="application/ld+json">
${JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          "@id": `${url}#article`,
          headline: a.title,
          description: clip(a.summary || a.body, 300),
          url,
          mainEntityOfPage: url,
          image: ogImage(a),
          datePublished: a.date,
          dateModified: a.updated || a.verifiedDate || a.date,
          inLanguage: "ko-KR",
          articleSection: catName(a),
          wordCount: wordCount(a),
          author: a.youtubeId ? AUTHOR : { "@id": `${ORIGIN}/#organization` },
          ...(Array.isArray(a.tags) && a.tags.length ? { keywords: a.tags.join(", ") } : {}),
          publisher: { "@id": `${ORIGIN}/#organization` },
          isPartOf: { "@id": `${ORIGIN}/#website` },
          ...(Array.isArray(a.source) && a.source.length
            ? { citation: a.source.map((s) => ({ "@type": "CreativeWork", name: s.label, url: s.url })) }
            : {}),
        },
        ...(a.youtubeId
          ? [
              {
                "@type": "VideoObject",
                "@id": `${url}#video`,
                name: a.title,
                description: clip(a.summary || a.body, 300),
                thumbnailUrl: `https://i.ytimg.com/vi/${a.youtubeId}/hqdefault.jpg`,
                uploadDate: a.date,
                embedUrl: `https://www.youtube.com/embed/${a.youtubeId}`,
                contentUrl: `https://www.youtube.com/watch?v=${a.youtubeId}`,
                publisher: { "@id": `${ORIGIN}/#organization` },
              },
            ]
          : []),
        ...(faqPairs(a).length
          ? [
              {
                "@type": "FAQPage",
                "@id": `${url}#faq`,
                mainEntity: faqPairs(a).map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ]
          : []),
        /* 화면에 보이는 이동경로와 항목·순서가 정확히 일치해야 한다.
           (예전에는 화면엔 카테고리를, 구조화 데이터엔 글 제목을 넣어 어긋나 있었다) */
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "홈", item: `${ORIGIN}/` },
            { "@type": "ListItem", position: 2, name: "세무정보실", item: `${ORIGIN}/info.html` },
            { "@type": "ListItem", position: 3, name: catName(a), item: `${ORIGIN}/info.html#${catAnchor(a)}` },
          ],
        },
      ],
    },
    null,
    2
  )
    .split("\n")
    .map((l) => "  " + l)
    .join("\n")}
  </script>
</head>`;
};

const HEADER = `<body>
  <!-- Google Tag Manager (noscript) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <!-- End Google Tag Manager (noscript) -->
  <a class="skip-link" href="#main">본문 바로가기</a>

  <!-- ===== 헤더 ===== -->
  <header class="site-header">
    <div class="container container--wide site-header__inner">
      <a class="brand" href="../index.html">
        <img src="../assets/img/logo/logo-mark-crop.png" alt="대한세무법인 로고">
        <span class="brand__name">대한세무법인</span>
      </a>
      <nav class="gnb" id="gnb" aria-label="주 메뉴">
        <a href="../index.html">홈</a>
        <a href="../index.html#company">회사 지원</a>
        <a href="../index.html#property">재산 세금</a>
        <a href="../relief.html">체납 해결</a>
        <a href="../info.html" aria-current="page">세무정보실</a>
        <a href="../about.html">세무법인 소개</a>
      </nav>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="gnb" aria-label="메뉴 열기">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>
`;

const FOOTER = `
  <!-- ===== 푸터 ===== -->
  <footer class="site-footer">
    <div class="container container--wide">
      <div class="site-footer__top">
        <div class="site-footer__brand">
          <img src="../assets/img/logo/logo-white-crop.png" alt="대한세무법인 심볼">
          <p>대한세무법인은 수임 고객에게 꼭 필요한 세무일정과 절세정보를 가장 빠르게 전하는 세무 파트너입니다.</p>
        </div>
        <div>
          <h3>Contact</h3>
          <address>
            <ul>
              <li>경기도 성남시 분당구 성남대로 912, 515호<br>(야탑동, BYC빌딩)</li>
              <li><a href="tel:031-783-8877">대표전화 031-783-8877</a></li>
              <li><a href="mailto:tax@taxdh.net">tax@taxdh.net</a></li>
            </ul>
          </address>
        </div>
        <div>
          <h3>Menu</h3>
          <ul>
            <li><a href="../index.html">홈</a></li>
            <li><a href="../index.html#company">회사 지원</a></li>
            <li><a href="../index.html#property">재산 세금</a></li>
            <li><a href="../relief.html">체납 해결</a></li>
            <li><a href="../info.html">세무정보실</a></li>
            <li><a href="../about.html">세무법인 소개</a></li>
            <li><a href="../services.html">서비스 안내</a></li>
          </ul>
        </div>
      </div>
      <div class="site-footer__bottom">
        <p>대한세무법인 · 대표세무사 이석제</p>
        <p>&copy; <span data-year>2026</span> Daehan Tax Corporation. All rights reserved.</p>
      </div>
    </div>
  </footer>


  <script src="../assets/js/main.js"></script>
  <script src="../assets/js/inquiry.js"></script>
</body>
</html>
`;

/* ---------- 본문 ---------- */

/* 영상 글 본문은 간단한 마크다운으로 받는다:
   "## 소제목", "### 작은 제목", "- 목록", "**굵게**", 빈 줄로 문단 구분 */
function inlineMD(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
function markdownHTML(md) {
  const out = [];
  const lines = String(md || "").split("\n");
  let para = [], list = [], olist = [], quote = [], table = [];
  let h2n = 0;
  const cells = (l) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const flushP = () => { if (para.length) out.push(`          <p>${para.map(inlineMD).join("<br>")}</p>`); para = []; };
  const flushL = () => {
    if (list.length) out.push(`          <ul>\n${list.map((l) => `            <li>${inlineMD(l)}</li>`).join("\n")}\n          </ul>`);
    if (olist.length) out.push(`          <ol>\n${olist.map((l) => `            <li>${inlineMD(l)}</li>`).join("\n")}\n          </ol>`);
    list = []; olist = [];
  };
  /* "> " 줄 = 한눈에 보기 상자. 첫 줄이 "**제목**" 이면 상자 제목으로 쓴다 */
  const flushQ = () => {
    if (!quote.length) return;
    let title = "";
    const m = /^\*\*(.+?)\*\*$/.exec(quote[0]);
    if (m) { title = m[1]; quote = quote.slice(1); }
    const items = quote.filter((q) => /^[-*·]\s+/.test(q)).map((q) => q.replace(/^[-*·]\s+/, ""));
    const rest = quote.filter((q) => !/^[-*·]\s+/.test(q));
    out.push(`          <aside class="post-box">${title ? `\n            <p class="post-box__title">${inlineMD(title)}</p>` : ""}${
      rest.length ? `\n            <p>${rest.map(inlineMD).join("<br>")}</p>` : ""}${
      items.length ? `\n            <ul>\n${items.map((t) => `              <li>${inlineMD(t)}</li>`).join("\n")}\n            </ul>` : ""}
          </aside>`);
    quote = [];
  };
  /* "| 가 | 나 |" 표. 둘째 줄 "|---|---|" 는 구분선. 표 바로 위 "**표 제목**" 은 caption 으로 */
  const flushT = () => {
    if (!table.length) return;
    const rows = table.filter((l) => !/^\|?\s*:?-{2,}/.test(l)).map(cells);
    const [head, ...body] = rows;
    let caption = "";
    const prev = out[out.length - 1] || "";
    const cm = /^\s*<p><strong>([^<]+)<\/strong><\/p>$/.exec(prev);
    if (cm) { caption = cm[1]; out.pop(); }
    out.push(`          <div class="post-table" role="region" aria-label="${caption || "표"}" tabindex="0">
            <table>${caption ? `\n              <caption>${caption}</caption>` : ""}
              <thead><tr>${head.map((c) => `<th scope="col">${inlineMD(c)}</th>`).join("")}</tr></thead>
              <tbody>
${body.map((r) => `                <tr>${r.map((c, k) => (k === 0 && head.length > 2 ? `<th scope="row">${inlineMD(c)}</th>` : `<td>${inlineMD(c)}</td>`)).join("")}</tr>`).join("\n")}
              </tbody>
            </table>
          </div>`);
    table = [];
  };
  const flushAll = () => { flushP(); flushL(); flushQ(); flushT(); };

  for (const raw of lines) {
    const l = raw.trim();
    let m;
    if (!l) { flushAll(); continue; }
    if (l.startsWith("|")) { flushP(); flushL(); flushQ(); table.push(l); continue; }
    if (table.length) flushT();
    if ((m = /^>\s?(.*)$/.exec(l))) { flushP(); flushL(); if (m[1]) quote.push(m[1]); continue; }
    if (quote.length) flushQ();
    if ((m = /^(#{2,3})\s+(.+)$/.exec(l))) {
      flushP(); flushL();
      const lv = m[1].length;
      out.push(lv === 2 ? `          <h2 id="s${++h2n}">${inlineMD(m[2])}</h2>` : `          <h3>${inlineMD(m[2])}</h3>`);
    } else if ((m = /^[-*·]\s+(.+)$/.exec(l))) {
      flushP(); if (olist.length) flushL(); list.push(m[1]);
    } else if ((m = /^\d+[.)]\s+(.+)$/.exec(l))) {
      flushP(); if (list.length) flushL(); olist.push(m[1]);
    } else {
      flushL(); para.push(l);
    }
  }
  flushAll();
  return out.join("\n");
}

/* 영상 글의 "## 소제목" 목록 → 목차 (4개 이상일 때) */
function tocHTML(a) {
  if (!a.youtubeId) return "";
  const hs = [];
  let n = 0;
  for (const l of String(a.body || "").split("\n")) {
    const m = /^##\s+(.+)$/.exec(l.trim());
    if (m) hs.push({ id: `s${++n}`, t: m[1].replace(/\*\*/g, "") });
  }
  if (hs.length < 4) return "";
  return `
        <nav class="post-toc" aria-label="목차">
          <p class="post-toc__title">목차</p>
          <ol>
${hs.map((h) => `            <li><a href="#${h.id}">${esc(h.t)}</a></li>`).join("\n")}
          </ol>
        </nav>`;
}

/* "## 자주 묻는 질문" 아래 "### 질문" + 답 문단 → FAQPage 구조화 데이터 (구글·AI 답변이 그대로 인용하기 좋다) */
function faqPairs(a) {
  if (!a.youtubeId) return [];
  const lines = String(a.body || "").split("\n");
  const pairs = [];
  let inFaq = false, q = null, ans = [];
  const push = () => { if (q && ans.length) pairs.push({ q, a: ans.join(" ").replace(/\*\*/g, "").trim() }); q = null; ans = []; };
  for (const raw of lines) {
    const l = raw.trim();
    if (/^##\s+/.test(l)) { push(); inFaq = /자주\s*묻는|FAQ|궁금/.test(l); continue; }
    if (!inFaq) continue;
    const m = /^###\s+(.+)$/.exec(l);
    if (m) { push(); q = m[1].replace(/^Q[.:]\s*/, "").replace(/\*\*/g, ""); continue; }
    if (q && l) ans.push(l.replace(/^[-*·]\s+/, "").replace(/^A[.:]\s*/, ""));
  }
  push();
  return pairs;
}

/* 유튜브 영상 — 클릭 전엔 썸네일만 보여 주어 페이지가 가볍다 (assets/js/inquiry.js 가 재생기로 바꿈) */
function videoHTML(a) {
  if (!a.youtubeId) return "";
  const id = esc(a.youtubeId);
  return `
        <div class="post__video">
          <a class="post__video-link" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener"
             data-youtube="${id}" aria-label="영상 재생: ${esc(a.title)}">
            <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy">
            <span class="post__video-play" aria-hidden="true"></span>
          </a>
        </div>
        <p class="post__video-note">영상 내용을 글로 옮겼습니다. 영상이 편하신 분은 위에서 바로 보실 수 있습니다.</p>`;
}

function bodyHTML(a) {
  if (a.youtubeId) {
    return { paras: markdownHTML(a.body || a.summary), linkBtn: "", sources: "", verified: "" };
  }
  const paras = String(a.body || a.summary || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `          <p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  const linkBtn =
    a.link && a.link.url
      ? `
        <p class="post__cta-link">
          <a class="btn btn--solid btn--sm" href="${esc(rebase(a.link.url))}">${esc(a.link.label || "자세히 보기")}</a>
        </p>`
      : "";

  const sources =
    Array.isArray(a.source) && a.source.length
      ? `
        <section class="post__sources" aria-labelledby="src-heading">
          <h2 id="src-heading">출처</h2>
          <ul>
${a.source
            .map((s) => `            <li><a href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${esc(s.label)}</a></li>`)
            .join("\n")}
          </ul>
        </section>`
      : "";

  // verifiedDate/verificationNote는 화면에는 표시하지 않고 데이터로만 보관한다
  // (dateModified/lastmod 계산에는 계속 쓰인다). 필요해지면 아래에서 복원.
  const verified = "";

  return { paras, linkBtn, sources, verified };
}

/* 날짜순 바로 앞뒤 글로 가는 링크.
   관련 글만으로는 이어지지 않는 글이 생길 수 있어, 28건 전체가 하나의 사슬로
   연결되도록 보장한다 — 크롤러가 목록 페이지를 거치지 않고도 모든 글에 닿는다. */
function postNavHTML(a, all) {
  const i = all.findIndex((x) => x.slug === a.slug);
  const newer = all[i - 1]; // all은 최신순이므로 앞이 더 새 글
  const older = all[i + 1];
  if (!newer && !older) return "";

  const item = (p, label, mod) =>
    p
      ? `          <a class="post-nav__item post-nav__item--${mod}" href="${esc(p.slug)}.html" rel="${mod === "prev" ? "prev" : "next"}">
            <span class="post-nav__label">${label}</span>
            <span class="post-nav__title">${esc(p.title)}</span>
          </a>`
      : `          <span class="post-nav__item post-nav__item--${mod} is-empty" aria-hidden="true"></span>`;

  return `
        <nav class="post-nav" aria-label="이전·다음 글">
${item(older, "이전 글", "prev")}
${item(newer, "다음 글", "next")}
        </nav>`;
}

function relatedHTML(a, all) {
  const picks = relatedPicks(a, all);
  if (!picks.length) return "";
  return `
    <!-- ===== 함께 보면 좋은 글 ===== -->
    <section class="section section--off section--line-top" aria-labelledby="related-heading">
      <div class="container container--wide">
        <div class="section-head">
          <div>
            <p class="eyebrow eyebrow--num"><span class="num">＋</span> Related</p>
            <h2 class="headline" id="related-heading">함께 보면 좋은 글</h2>
          </div>
          <div class="section-head__side">
            <a class="link-arrow" href="../info.html#tips">세무정보실 전체 보기</a>
          </div>
        </div>
        <div class="article-grid">
${picks
    .map(
      (p) => `          <a class="article-card" href="${esc(p.slug)}.html">
            <div class="article-card__meta">
              <span class="${tagClass(p)}">${esc(catName(p))}</span>
              <span class="article-card__date">${esc(formatDate(p.date))}</span>
            </div>
            <h3 class="article-card__title">${esc(p.title)}</h3>
            <p class="article-card__summary">${esc(clip(p.summary, 110))}</p>
            <span class="article-card__more">자세히 보기 +</span>
          </a>`
    )
    .join("\n")}
        </div>
      </div>
    </section>
`;
}

/* 글 하단 의뢰 — 버튼을 누르면 입력 칸이 펼쳐지고, 「체납 자가진단 접수명단」 구글 시트로 모인다
   (assets/js/inquiry.js 가 입력 칸을 만든다) */
function inquiryHTML(a) {
  return `        <section class="post__cta inquiry" aria-labelledby="inq-heading">
          <h2 class="inquiry__title" id="inq-heading">이 글에 대해 궁금하신 점이 있으신가요?</h2>
          <p>이 내용이 고객님의 사업과 자산에 실제로 어떻게 적용되는지는 상황마다 다릅니다.
            상황을 남겨 주시면 담당 세무사가 확인한 뒤 연락드립니다.</p>
          <div class="post__cta-actions" data-ask-host>
            <button class="btn btn--solid btn--sm" type="button" data-ask="${esc(catName(a))}"
                    data-ask-title="${esc(a.title)}" data-ask-slug="${esc(a.slug)}">의뢰하기</button>
            <a class="btn btn--sm" href="tel:031-783-8877">전화 031-783-8877</a>
          </div>
        </section>`;
}

function renderPost(a, all) {
  const { paras, linkBtn, sources, verified } = bodyHTML(a);
  return `${head(a)}
${HEADER}
  <main id="main">

    <article class="post">
      <div class="container">

        <nav class="breadcrumb" aria-label="현재 위치">
          <a href="../index.html">홈</a>
          <span aria-hidden="true">›</span>
          <a href="../info.html">세무정보실</a>
          <span aria-hidden="true">›</span>
          <a href="../info.html#${catAnchor(a)}">${esc(catName(a))}</a>
        </nav>

        <div class="post__meta">
          <span class="${tagClass(a)}">${esc(catName(a))}</span>
          <time class="post__date" datetime="${esc(a.date)}">${esc(formatDate(a.date))}</time>${a.youtubeId ? `
          <span class="post__byline">글 · 이석제 세무사 (대한세무법인 대표)</span>` : ""}
        </div>

        <h1 class="post__title">${esc(a.title)}</h1>
${a.summary ? `        <p class="post__summary">${esc(a.summary)}</p>` : ""}
${videoHTML(a)}${tocHTML(a)}

        <div class="post__body">
${paras}
        </div>
${linkBtn}${sources}${verified}

${inquiryHTML(a)}

${postNavHTML(a, all)}

        <p class="post__back"><a class="link-arrow" href="../info.html#${catAnchor(a)}">세무정보실 목록으로</a></p>

      </div>
    </article>
${relatedHTML(a, all)}
  </main>
${FOOTER}`;
}

/* ---------- RSS ---------- */

/* 네이버 서치어드바이저는 RSS를 새 글 발견 경로로 쓴다.
   피드에 담는 최대 글 수 — 글이 계속 쌓여도 피드가 무한정 커지지 않게 한다. */
const RSS_MAX_ITEMS = 30;

const RFC822_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RFC822_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* "2026-07-01" → "Wed, 01 Jul 2026 09:00:00 +0900"
   JSON에는 시각이 없으므로 매일 09:00 KST로 고정한다. 현재 시각을 쓰면
   빌드할 때마다 파일이 바뀌어 Action이 의미 없는 커밋을 남긴다. */
function rfc822(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dow = RFC822_DAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow}, ${String(d).padStart(2, "0")} ${RFC822_MON[m - 1]} ${y} 09:00:00 +0900`;
}

function renderRSS(all) {
  const items = all.slice(0, RSS_MAX_ITEMS);
  const newest = items.length ? items[0].date : "2026-01-01";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- 이 파일은 automation/build-posts.js 가 생성합니다. 직접 수정하지 마세요. -->
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>대한세무법인 세무정보</title>
    <link>${ORIGIN}/info.html</link>
    <description>대한세무법인이 전하는 절세정보와 세법개정 소식.</description>
    <language>ko</language>
    <lastBuildDate>${rfc822(newest)}</lastBuildDate>
    <atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>
${items
    .map((a) => {
      const url = `${ORIGIN}/post/${a.slug}.html`;
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${esc(clip(a.summary || a.body, 300))}</description>
      <category>${esc(catName(a))}</category>
      <pubDate>${rfc822(a.date)}</pubDate>
    </item>`;
    })
    .join("\n")}
  </channel>
</rss>
`;
}

/* ---------- sitemap ---------- */

function renderSitemap(all) {
  const newest = all.reduce((m, a) => (a.date > m ? a.date : m), "2026-01-01");
  const rows = [
    { loc: `${ORIGIN}/`, lastmod: newest, changefreq: "weekly", priority: "1.0" },
    { loc: `${ORIGIN}/info.html`, lastmod: newest, changefreq: "weekly", priority: "0.9" },
    { loc: `${ORIGIN}/about.html`, lastmod: STATIC_LASTMOD["about.html"], changefreq: "monthly", priority: "0.8" },
    { loc: `${ORIGIN}/services.html`, lastmod: STATIC_LASTMOD["services.html"], changefreq: "monthly", priority: "0.8" },
    { loc: `${ORIGIN}/relief.html`, lastmod: STATIC_LASTMOD["relief.html"], changefreq: "monthly", priority: "0.9" },
    { loc: `${ORIGIN}/tax-reform-2026.html`, lastmod: STATIC_LASTMOD["tax-reform-2026.html"], changefreq: "monthly", priority: "0.7" },
    ...all.map((a) => ({
      loc: `${ORIGIN}/post/${a.slug}.html`,
      lastmod: [a.date, a.verifiedDate, a.updated].filter(Boolean).sort().pop(),
      changefreq: "yearly",
      priority: "0.6",
    })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- 이 파일은 automation/build-posts.js 가 생성합니다. 직접 수정하지 마세요. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows
    .map(
      (r) => `  <url>
    <loc>${r.loc}</loc>
    <lastmod>${r.lastmod}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
    )
    .join("\n")}
</urlset>
`;
}

/* ---------- 실행 ---------- */

function main() {
  const all = loadArticles();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  /* JSON에서 사라진 글의 잔여 페이지 정리 (slug는 영구지만 방어적으로) */
  const wanted = new Set(all.map((a) => a.slug + ".html"));
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith(".html") && !wanted.has(f)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
      console.log("  삭제:", "post/" + f);
    }
  }

  let written = 0;
  for (const a of all) {
    const file = path.join(OUT_DIR, a.slug + ".html");
    const html = renderPost(a, all);
    const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (prev !== html) {
      fs.writeFileSync(file, html, "utf8");
      written++;
    }
  }

  /* 내용이 같으면 다시 쓰지 않는다 — Action이 의미 없는 커밋을 남기지 않도록 */
  function writeIfChanged(name, next) {
    const p = path.join(ROOT, name);
    const prev = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
    if (prev !== next) fs.writeFileSync(p, next, "utf8");
    return prev !== next;
  }

  const smChanged = writeIfChanged("sitemap.xml", renderSitemap(all));
  const rssChanged = writeIfChanged("rss.xml", renderRSS(all));

  console.log(`게시글 ${all.length}건 → post/*.html (변경 ${written}건)`);
  console.log(`sitemap.xml → URL ${all.length + 6}개${smChanged ? " (갱신)" : " (변경 없음)"}`);
  console.log(`rss.xml → 최근 ${Math.min(all.length, RSS_MAX_ITEMS)}건${rssChanged ? " (갱신)" : " (변경 없음)"}`);
}

main();
