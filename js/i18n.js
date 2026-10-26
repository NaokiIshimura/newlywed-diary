// 文の組み立て。ページの言語は書き出したフォルダ（/ja/・/en/ など）で決まっていて、<html data-lang> に入っている。
// UI の文は i18n/<言語>.json、国プロファイルの文（イベントの選択肢・日記・称号・実績・ランク）は
// data/profiles/<国>/<言語>.json にある。どちらも同じ t() で引く。

export const LANGS = [
  { code: "ja", name: "日本語", locale: "ja-JP" },
  { code: "en", name: "English", locale: "en-US" },
  { code: "zh-tw", name: "繁體中文", locale: "zh-TW" },
  { code: "es", name: "Español", locale: "es-419" },
  { code: "ko", name: "한국어", locale: "ko-KR" },
];

// 国プロファイルの文が入っているキーの先頭
const PROFILE_ROOTS = ["units", "events", "workStyles", "ranks", "titles", "achievements"];

let ui = {};
let profileTexts = {};
let lang = LANGS[0];
let profile = { currency: "JPY", moneyUnit: 10000 };

export const currentLang = () => lang;

// このページの言語（build.py が <html data-lang> に入れる）
export function pageLang() {
  const code = document.documentElement.dataset.lang;
  return LANGS.some((l) => l.code === code) ? code : "ja";
}

// 文のファイルは、このスクリプト（js/）から見た場所で読む（ページは /ja/ などのフォルダにある）
const fromRoot = (path) => new URL(`../${path}`, import.meta.url);

// profileLang は国プロファイルの文の言語。その国の文がこの言語にないときは、国の言語の文を使う
export async function loadLang(code, profileData, profileId, profileLang = code) {
  const [u, p] = await Promise.all([
    fetch(fromRoot(`i18n/${code}.json`)).then((r) => r.json()),
    fetch(fromRoot(`data/profiles/${profileId}/${profileLang}.json`)).then((r) => r.json()),
  ]);
  ui = u;
  profileTexts = p;
  lang = LANGS.find((l) => l.code === code);
  profile = profileData;
}

function lookup(key) {
  const root = PROFILE_ROOTS.includes(key.split(".")[0]) ? profileTexts : ui;
  return key.split(".").reduce((o, k) => (o == null ? o : o[k]), root);
}

export function has(key) {
  return typeof lookup(key) === "string";
}

// 金額（プロファイルの単位。日本は万円）を表示用の文字列にする
export function money(v) {
  const n = Math.round(v) || 0;
  if (lang.code === "ja" && profile.currency === "JPY") return `${n.toLocaleString("ja-JP")}万円`;
  return new Intl.NumberFormat(lang.locale, {
    style: "currency",
    currency: profile.currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n * profile.moneyUnit);
}

export function num(v) {
  return (Math.round(v) || 0).toLocaleString(lang.locale);
}

const signClass = (v) => (v >= 0 ? "plus" : "minus");

// {name} や {name:money} の差し込み。書式は money / num / signed / signedMoney / who
const FORMATS = {
  money: (v) => money(v),
  num: (v) => num(v),
  signed: (v) => `<span class="${signClass(v)}">${v >= 0 ? "+" : "−"}${num(Math.abs(v))}</span>`,
  signedMoney: (v) => `<span class="${signClass(v)}">${v >= 0 ? "+" : "−"}${money(Math.abs(v))}</span>`,
  who: (v) => t(`who.${v}`),
};

// 翻訳した文を返す。値に n があって、キーに "_one" の付いた文があれば n が 1 のときはそちらを使う
export function t(key, params = {}) {
  let text = params.n === 1 && has(`${key}_one`) ? lookup(`${key}_one`) : lookup(key);
  if (typeof text !== "string") {
    console.warn(`missing text: ${lang.code} ${key}`);
    return key;
  }
  return text.replace(/\{(\w+)(?::(\w+))?\}/g, (_, name, format) => {
    const v = params[name];
    if (v === undefined) return "";
    return format && FORMATS[format] ? FORMATS[format](v) : String(v);
  });
}

// HTML の data-i18n="キー" を持つ要素に文を入れる（data-i18n-attr="属性名" なら属性に入れる）
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    const attr = el.dataset.i18nAttr;
    const params = el.dataset.i18nParams ? JSON.parse(el.dataset.i18nParams) : {};
    const text = t(el.dataset.i18n, params);
    if (attr) el.setAttribute(attr, text);
    else el.innerHTML = text;
  }
}
