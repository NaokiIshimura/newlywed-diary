// 翻訳ファイルが日本語版と同じキーと差し込み（{name} や {name:書式}）を持っているかを調べる。
//   node tools/check-i18n.mjs
// 書式（:money など）は言語ごとに変えてよいので、差し込む名前だけを比べる。
import { readFileSync, existsSync } from "node:fs";
import { COUNTRIES } from "../js/countries.js";

const LANGS = ["ja", "en", "zh-tw", "es", "ko"];
// UI の文と、国ごとの文（国の文はどれも、日本の日本語版と同じキーにそろえる）
const FILES = [(l) => `i18n/${l}.json`, ...COUNTRIES.map((c) => (l) => `data/profiles/${c}/${l}.json`)];
const FORMATS = new Set(["money", "num", "signed", "signedMoney", "who"]);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const names = (s) => [...String(s).matchAll(/\{(\w+)(?::(\w+))?\}/g)].map((m) => m[1]).sort().join(",");
const badFormats = (s) => [...String(s).matchAll(/\{(\w+):(\w+)\}/g)].filter((m) => !FORMATS.has(m[2])).map((m) => m[0]);

let errors = 0;
const fail = (msg) => {
  errors++;
  console.log(msg);
};

for (const file of FILES) {
  const base = flatten(JSON.parse(readFileSync(file("ja").replace(/profiles\/\w+\//, "profiles/jp/"), "utf8")));
  for (const lang of LANGS) {
    const path = file(lang);
    if (!existsSync(path)) {
      fail(`${path}: ファイルがない`);
      continue;
    }
    const tr = flatten(JSON.parse(readFileSync(path, "utf8")));
    for (const key of Object.keys(base)) {
      if (!(key in tr)) fail(`${path}: キーがない ${key}`);
      else if (names(base[key]) !== names(tr[key])) fail(`${path}: 差し込みが違う ${key}（ja: ${names(base[key])} / ${lang}: ${names(tr[key])}）`);
    }
    for (const key of Object.keys(tr)) {
      const plural = key.endsWith("_one") && key.slice(0, -4) in base;
      if (!(key in base) && !plural) fail(`${path}: 余分なキー ${key}`);
      for (const b of badFormats(tr[key])) fail(`${path}: 知らない書式 ${b}（${key}）`);
    }
  }
}

console.log(errors ? `${errors} 件の問題` : "問題なし");
process.exit(errors ? 1 : 0);
