#!/usr/bin/env node
/* ============================================================
   대한세무법인 — build-posts.js

   assets/data/tax-tips.json · law-updates.json 의 각 게시글을
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
const catAnchor = (a) => (a.category === "세법개정" ? "law" : "tips");
const tagClass = (a) => (a.category === "세법개정" ? "tag tag--gold" : "tag");

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
  const files = ["tax-tips.json", "law-updates.json"];
  const all = [];
  for (const f of files) {
    const items = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
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
  <link rel="canonical" href="${url}">

  <!-- 공유 미리보기 (카카오톡·페이스북·네이버 블로그 등) -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="대한세무법인">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${esc(a.title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${ORIGIN}/assets/img/og-default.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="대한세무법인">
  <meta property="article:published_time" content="${esc(a.date)}">
  <meta property="article:section" content="${esc(a.category || "세무정보")}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(a.title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${ORIGIN}/assets/img/og-default.png">

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
          image: `${ORIGIN}/assets/img/og-default.png`,
          datePublished: a.date,
          dateModified: a.verifiedDate || a.date,
          inLanguage: "ko-KR",
          articleSection: catName(a),
          wordCount: wordCount(a),
          author: { "@id": `${ORIGIN}/#organization` },
          publisher: { "@id": `${ORIGIN}/#organization` },
          isPartOf: { "@id": `${ORIGIN}/#website` },
          ...(Array.isArray(a.source) && a.source.length
            ? { citation: a.source.map((s) => ({ "@type": "CreativeWork", name: s.label, url: s.url })) }
            : {}),
        },
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
        <a href="../about.html">세무법인 소개</a>
        <a href="../services.html">서비스 안내</a>
        <a href="../info.html" aria-current="page">세무정보실</a>
        <a href="https://fund.daehantax.com" target="_blank" rel="noopener">정책자금 조회</a>
        <a class="gnb__cta" href="http://pf.kakao.com/_ddxbxcu/chat" target="_blank" rel="noopener">카톡 상담</a>
      </nav>
      <a class="btn btn--kakao btn--sm header-cta" href="http://pf.kakao.com/_ddxbxcu/chat" target="_blank" rel="noopener">카톡 상담</a>
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
              <li><a href="http://pf.kakao.com/_ddxbxcu" target="_blank" rel="noopener">카카오톡 채널 @대한세무법인</a></li>
            </ul>
          </address>
        </div>
        <div>
          <h3>Menu</h3>
          <ul>
            <li><a href="../index.html">홈</a></li>
            <li><a href="../about.html">세무법인 소개</a></li>
            <li><a href="../services.html">서비스 안내</a></li>
            <li><a href="../info.html">세무정보실</a></li>
          </ul>
        </div>
      </div>
      <div class="site-footer__bottom">
        <p>대한세무법인 · 대표세무사 이석제</p>
        <p>&copy; <span data-year>2026</span> Daehan Tax Corporation. All rights reserved.</p>
      </div>
    </div>
  </footer>

  <!-- ===== 플로팅 카카오 버튼 ===== -->
  <a class="kakao-float" href="http://pf.kakao.com/_ddxbxcu/chat" target="_blank" rel="noopener" aria-label="카카오톡 채널로 상담하기">
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3C6.9 3 2.8 6.2 2.8 10.2c0 2.6 1.7 4.8 4.3 6.1l-1.1 4c-.1.4.3.7.6.5l4.7-3.1c.2 0 .5.1.7.1 5.1 0 9.2-3.2 9.2-7.2S17.1 3 12 3z"/>
    </svg>
    <span>카톡 상담</span>
  </a>

  <script src="../assets/js/main.js"></script>
</body>
</html>
`;

/* ---------- 본문 ---------- */

function bodyHTML(a) {
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

  const verified = a.verifiedDate
    ? `
        <p class="post__verified">이 글의 내용은 ${esc(formatDate(a.verifiedDate))} 기준으로 확인했습니다.${
        a.verificationNote ? " " + esc(a.verificationNote) : ""
      }</p>`
    : a.verificationNote
    ? `\n        <p class="post__verified">${esc(a.verificationNote)}</p>`
    : "";

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
          <time class="post__date" datetime="${esc(a.date)}">${esc(formatDate(a.date))}</time>
        </div>

        <h1 class="post__title">${esc(a.title)}</h1>
${a.summary ? `        <p class="post__summary">${esc(a.summary)}</p>` : ""}

        <div class="post__body">
${paras}
        </div>
${linkBtn}${sources}${verified}

        <div class="post__cta">
          <p>이 내용이 고객님의 사업과 자산에 실제로 어떻게 적용되는지는 상황마다 다릅니다.
            카카오톡 채널로 문의해 주시면 확인해 드립니다.</p>
          <div class="post__cta-actions">
            <a class="btn btn--kakao btn--sm" href="http://pf.kakao.com/_ddxbxcu/chat" target="_blank" rel="noopener">카톡으로 문의하기</a>
            <a class="btn btn--sm" href="tel:031-783-8877">전화 031-783-8877</a>
          </div>
        </div>

${postNavHTML(a, all)}

        <p class="post__back"><a class="link-arrow" href="../info.html#${catAnchor(a)}">세무정보실 목록으로</a></p>

      </div>
    </article>
${relatedHTML(a, all)}
  </main>
${FOOTER}`;
}

/* ---------- sitemap ---------- */

function renderSitemap(all) {
  const newest = all.reduce((m, a) => (a.date > m ? a.date : m), "2026-01-01");
  const rows = [
    { loc: `${ORIGIN}/`, lastmod: newest, changefreq: "weekly", priority: "1.0" },
    { loc: `${ORIGIN}/info.html`, lastmod: newest, changefreq: "weekly", priority: "0.9" },
    { loc: `${ORIGIN}/about.html`, lastmod: STATIC_LASTMOD["about.html"], changefreq: "monthly", priority: "0.8" },
    { loc: `${ORIGIN}/services.html`, lastmod: STATIC_LASTMOD["services.html"], changefreq: "monthly", priority: "0.8" },
    { loc: `${ORIGIN}/tax-reform-2026.html`, lastmod: STATIC_LASTMOD["tax-reform-2026.html"], changefreq: "monthly", priority: "0.7" },
    ...all.map((a) => ({
      loc: `${ORIGIN}/post/${a.slug}.html`,
      lastmod: a.verifiedDate && a.verifiedDate > a.date ? a.verifiedDate : a.date,
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

  const smPath = path.join(ROOT, "sitemap.xml");
  const sm = renderSitemap(all);
  const smPrev = fs.existsSync(smPath) ? fs.readFileSync(smPath, "utf8") : null;
  if (smPrev !== sm) fs.writeFileSync(smPath, sm, "utf8");

  console.log(`게시글 ${all.length}건 → post/*.html (변경 ${written}건)`);
  console.log(`sitemap.xml → URL ${all.length + 5}개${smPrev !== sm ? " (갱신)" : " (변경 없음)"}`);
}

main();
