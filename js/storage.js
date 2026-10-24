// localStorage への保存。プライベートモードなどで使えないときは、保存しないだけで遊べるようにする。

const KEYS = {
  save: "newlywed-diary-save",
  records: "newlywed-diary-records",
  settings: "newlywed-diary-settings",
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

const EMPTY_RECORDS = { plays: 0, best: null, endings: {}, titles: {}, achievements: {} };

export function loadRecords() {
  const r = read(KEYS.records);
  return { ...EMPTY_RECORDS, ...r, endings: { ...r?.endings }, titles: { ...r?.titles }, achievements: { ...r?.achievements } };
}

// 1周分の結果を記録して、今回はじめて手に入れたものを返す
export function recordResult({ ending, title, achievements, netWorth }) {
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
  if (netWorth !== null && (r.best === null || netWorth > r.best)) r.best = netWorth;
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
