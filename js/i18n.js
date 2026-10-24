// 言語の切り替えと文の組み立て。
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
const PROFILE_ROOTS = ["events", "workStyles", "ranks", "titles", "achievements"];

let ui = {};
let profileTexts = {};
let lang = LANGS[0];
let profile = { currency: "JPY", moneyUnit: 10000 };

export const currentLang = () => lang;

// ブラウザの言語から、対応している言語を選ぶ。なければ英語
export function detectLang(saved) {
  const param = new URLSearchParams(location.search).get("lang");
  const candidates = [param, saved, ...(navigator.languages ?? [navigator.language])].filter(Boolean).map((l) => l.toLowerCase());
  for (const c of candidates) {
    if (LANGS.some((l) => l.code === c)) return c;
    if (c.startsWith("zh")) return "zh-tw";
    const base = c.split("-")[0];
    if (LANGS.some((l) => l.code === base)) return base;
  }
  return "en";
}

export async function loadLang(code, profileData, profileId) {
  const [u, p] = await Promise.all([
    fetch(`i18n/${code}.json`).then((r) => r.json()),
    fetch(`data/profiles/${profileId}/${code}.json`).then((r) => r.json()),
  ]);
  ui = u;
  profileTexts = p;
  lang = LANGS.find((l) => l.code === code);
  profile = profileData;
  document.documentElement.lang = lang.locale.split("-")[0] === "zh" ? "zh-Hant-TW" : lang.locale.split("-")[0];
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
