#!/usr/bin/env node
/* ============================================================
   대한세무법인 — build-hero-videos.js
   assets/video/ 폴더의 영상 목록으로 assets/data/hero-videos.json 을 다시 만든다.
   (.github/workflows/hero-videos.yml 이 영상이 올라올 때마다 자동 실행)
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "assets", "video");
const OUT = path.join(ROOT, "assets", "data", "hero-videos.json");
const VIDEO = /\.(mp4|webm|mov)$/i;
const POSTER = [".jpg", ".jpeg", ".png", ".webp"];

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR) : [];
const videos = files
  .filter((f) => VIDEO.test(f) && !f.startsWith("."))
  .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }))
  .map((f) => {
    const base = f.replace(VIDEO, "");
    const poster = POSTER.map((e) => base + e).find((p) => files.includes(p));
    const type = /\.webm$/i.test(f) ? "video/webm" : "video/mp4";
    return { src: "assets/video/" + f, type, ...(poster ? { poster: "assets/video/" + poster } : {}) };
  });

const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const next = { _설명: prev._설명 || "assets/video/ 폴더를 기준으로 자동 생성됩니다.", videos };
const text = JSON.stringify(next, null, 2) + "\n";
if (!fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== text) fs.writeFileSync(OUT, text, "utf8");
console.log(`메인 영상 ${videos.length}개 → assets/data/hero-videos.json`);
