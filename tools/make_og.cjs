#!/usr/bin/env node
// 各言語の OGP 画像（<言語>/og.png、1200×630）を作る。ポータル（nacn-app-portal）のサムネイルにもそのまま使える。
//
// 日記帳の紙（ゲームのシェア画像と同じ作り）に、タイトルと説明、ゲームのイラスト（指輪・赤ちゃん・車・家・角帽）を並べる。
// イラストは js/illust.js、色は css/style.css のライトモードの色。タイトルは言語データの meta.gameName、説明は title.lead。
// フォントは Google Fonts から読む（日本語・英語・スペイン語は M PLUS Rounded 1c、繁體中文と韓国語は Noto Sans）。
//
// 使い方: node tools/make_og.cjs
// Playwright（Chromium）が必要。見つからなければ環境変数 PW に playwright のパスを入れる。
// 画像を作り直したら、build.py の ASSET_VER を新しくして書き出し直す（SNS や CDN の古いキャッシュを使わせないため）。
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(process.env.PW || 'playwright');

const ROOT = path.resolve(__dirname, '..');
const LANGS = ['ja', 'en', 'zh-tw', 'ko', 'es'];
const FONT = {
  default: { css: 'family=M+PLUS+Rounded+1c:wght@500;800', name: 'M PLUS Rounded 1c' },
  'zh-tw': { css: 'family=Noto+Sans+TC:wght@500;800', name: 'Noto Sans TC' },
  ko: { css: 'family=Noto+Sans+KR:wght@500;800', name: 'Noto Sans KR' },
};

(async () => {
  const { illustFor } = await import(pathToFileURL(path.join(ROOT, 'js', 'illust.js')));
  const icons = ['childPlan', 'car', 'house', 'university'].map((id) => `<div class="icon">${illustFor(id)}</div>`).join('');
  const browser = await chromium.launch();
  for (const code of LANGS) {
    const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n', `${code}.json`), 'utf8'));
    const font = FONT[code] || FONT.default;
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(`<!doctype html><html lang="${code}"><head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?${font.css}&display=swap">
      <style>
        :root { --accent: #c8665a; --ink: #3a3129; --muted: #8a7d70; --line: #e6dccd; --il-b: #7fa7c9; --il-c: #f3d9a4; --il-shadow: #ece3d4; }
        body { margin: 0; width: 1200px; height: 630px; background: #faf6ef; font-family: "${font.name}", sans-serif; color: var(--ink); }
        .paper { position: absolute; inset: 40px; border-radius: 28px; overflow: hidden;
          background: repeating-linear-gradient(#fffdf8 0 54px, var(--line) 54px 56px); background-position: 0 -2px; }
        .paper::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 18px; background: var(--accent); }
        .text { position: absolute; left: 80px; top: 70px; width: 620px; }
        h1 { margin: 0 0 28px; font-size: ${code === 'es' ? 64 : 84}px; font-weight: 800; color: var(--accent); line-height: 1.1; letter-spacing: .04em; }
        p { margin: 0; font-size: 29px; font-weight: 500; line-height: 1.6; }
        .rings { position: absolute; right: 60px; top: 20px; width: 440px; }
        .icons { position: absolute; right: 50px; bottom: 36px; display: flex; gap: 6px; }
        .icon { width: 118px; }
        .illust { display: block; width: 100%; height: auto; }
        .il-a { fill: var(--accent); } .il-b { fill: var(--il-b); } .il-c { fill: var(--il-c); } .il-ink { fill: var(--ink); }
        .il-shadow { fill: var(--il-shadow); } .il-line-a { stroke: var(--accent); } .il-line-b { stroke: var(--il-b); } .il-line-ink { stroke: var(--ink); }
      </style></head>
      <body><div class="paper">
        <div class="text"><h1>${L.meta.gameName}</h1><p>${L.title.lead}</p></div>
        <div class="rings">${illustFor('wedding')}</div>
        <div class="icons">${icons}</div>
      </div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    fs.mkdirSync(path.join(ROOT, code), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, code, 'og.png') });
    await page.close();
    console.log(`${code}/og.png を書き出しました`);
  }
  await browser.close();
})();
