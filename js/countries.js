// ゲームの中の国（通貨・物価）。表示の言語とは別の設定で、どの言語のページでも全部の国を選べる。
// 国の数値は data/profiles/<国>.json、文は data/profiles/<国>/<言語>.json、国の名前は i18n/<言語>.json の countries にある。

// 国プロファイルがある国。選ぶ欄にはこの順に並べる
export const COUNTRIES = ["jp", "us"];

// その言語のページで最初に選ばれている国。まだプロファイルのない国は日本にする
const DEFAULT_COUNTRY = { ja: "jp", en: "us", "zh-tw": "tw", ko: "kr", es: "mx" };

// 同じ言語で来る別の国の人は、ブラウザで一番希望している言語の地域でその国から始める
// （2番目以降の言語まで見ると、en-US の次に fil を入れているだけの人までフィリピンから始まってしまう）
const REGION_COUNTRY = { en: { "en-sg": "sg", "en-ph": "ph", fil: "ph", "en-ca": "ca", "en-au": "au" } };

const KEY = "newlywed-diary-country";

export const isCountry = (c) => COUNTRIES.includes(c);

export function defaultCountry(lang) {
  const c = DEFAULT_COUNTRY[lang];
  return isCountry(c) ? c : "jp";
}

// 最初の国：URL のハッシュ（#us など）、前に選んだ国、ブラウザの地域、言語の順
export function initialCountry(lang, { hash = "", saved = loadCountry(), browserLang = "" } = {}) {
  const fromHash = hash.replace(/^#/, "").toLowerCase();
  if (isCountry(fromHash)) return fromHash;
  if (isCountry(saved)) return saved;
  const regions = REGION_COUNTRY[lang] ?? {};
  const first = browserLang.toLowerCase();
  const region = Object.keys(regions).find((r) => first === r || first.startsWith(`${r}-`));
  if (region && isCountry(regions[region])) return regions[region];
  return defaultCountry(lang);
}

export function loadCountry() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveCountry(c) {
  try {
    localStorage.setItem(KEY, c);
  } catch {}
}

export const COUNTRY_KEY = KEY;
