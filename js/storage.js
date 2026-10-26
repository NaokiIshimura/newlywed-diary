// localStorage への保存。プライベートモードなどで使えないときは、保存しないだけで遊べるようにする。
import { COUNTRY_KEY } from "./countries.js";

const KEYS = {
  save: "newlywed-diary-save",
  records: "newlywed-diary-records",
  settings: "newlywed-diary-settings",
  country: COUNTRY_KEY,
};

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ---- 途中保存 ----

export const loadSave = () => read(KEYS.save);
export const writeSave = (state) => write(KEYS.save, state);

// ---- エンディング図鑑・称号・実績の記録 ----

// 最高の純資産は通貨がちがうので国ごとに持つ（best は国を分ける前の記録で、日本のもの）
const EMPTY_RECORDS = { plays: 0, bestByCountry: {}, endings: {}, titles: {}, achievements: {} };

export function loadRecords() {
  const { best, ...r } = read(KEYS.records) ?? {};
  const bestByCountry = { ...(typeof best === "number" ? { jp: best } : {}), ...r.bestByCountry };
  return { ...EMPTY_RECORDS, ...r, bestByCountry, endings: { ...r.endings }, titles: { ...r.titles }, achievements: { ...r.achievements } };
}

// 1周分の結果を記録して、今回はじめて手に入れたものを返す
export function recordResult({ country, ending, title, achievements, netWorth }) {
  const r = loadRecords();
  const fresh = {
    ending: !r.endings[ending],
    title: !r.titles[title],
    achievements: achievements.filter((a) => !r.achievements[a]),
  };
  r.plays += 1;
  r.endings[ending] = true;
  r.titles[title] = true;
  for (const a of achievements) r.achievements[a] = true;
  const best = r.bestByCountry[country];
  if (netWorth !== null && (best === undefined || netWorth > best)) r.bestByCountry[country] = netWorth;
  write(KEYS.records, r);
  return fresh;
}

// ---- 設定 ----

const DEFAULT_SETTINGS = { yearSummary: true, speed: 1 };

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings) };
}

export const writeSettings = (settings) => write(KEYS.settings, settings);

export function clearAll() {
  for (const key of Object.values(KEYS)) write(key, null);
}
