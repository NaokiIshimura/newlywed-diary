// ドット絵の場面（本人・パートナー・家・車）。
// 人物の型と輪郭の色は異世界転生日記（isekai-diary の TPL・hpal）と同じで、一人暮らし日記とも共通。
// 128×72 の canvas に描き、CSS で拡大する（image-rendering: pixelated）。国による違いは出さない。

export const W = 128;
export const H = 72;
export const GY = 56; // 地面の高さ
const OUT = "#1a1028"; // 輪郭

// 16×16 の人物（2頭身）。k 輪郭・h 髪・s 肌・e 目・m 口・c 服・w えり・g 飾り・C 下の服・b 靴
export const TPL = {
  M: [
    "................",
    ".....kkkkkk.....",
    "....khhhhhhk....",
    "...khhhhhhhhk...",
    "...khhhhhhhhk...",
    "...khsshhsshk...",
    "...kssssssssk...",
    "...ksessssesk...",
    "...kssssssssk...",
    "....kssmmssk....",
    "....kccwwcck....",
    "...ksccccccsk...",
    "...ksccggccsk...",
    "....kCCCCCCk....",
    "....kCCkkCCk....",
    "....kbbk.kbbk...",
  ],
  F: [
    "................",
    ".....kkkkkk.....",
    "....khhhhhhk....",
    "...khhhhhhhhk...",
    "..khhhhhhhhhhk..",
    "..khhsshhsshhk..",
    "..khsssssssshk..",
    "..khsesssseshk..",
    "..khsssssssshk..",
    "..khhssmmsshhk..",
    "..khkccwwcckhk..",
    "...ksccccccsk...",
    "...ksccggccsk...",
    "...kCCCCCCCCk...",
    "..kCCCCCCCCCCk..",
    "....kbk..kbk....",
  ],
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.min(255, Math.max(0, Math.round(c * (1 + amt))));
  return "#" + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}

export function hpal(hair, cloth, pants, skin) {
  return { k: OUT, s: skin || "#f6d3b3", h: hair, c: cloth, C: pants || shade(cloth, -0.35), w: "#ffffff", e: OUT, m: "#e07a7a", g: "#ffd166", b: "#6b4226" };
}

function px(c, x, y, w, h, col) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function drawSprite(c, tpl, pal, x, y, flip) {
  const grid = TPL[tpl];
  for (let r = 0; r < 16; r++) {
    for (let i = 0; i < 16; i++) {
      const ch = grid[r][flip ? 15 - i : i];
      if (ch !== "." && pal[ch]) px(c, x + i, y + r, 1, 1, pal[ch]);
    }
  }
}

// 本人とパートナーの見た目。服の色は性別で決め、同じ性別ならパートナーを別の色にする
const CLOTH = { male: "#3a6ad1", female: "#c4473a" };
const CLOTH_PARTNER = { male: "#3a9a6a", female: "#d9853a" };
export function personLook(gender, partner, sameGender) {
  const cloth = partner && sameGender ? CLOTH_PARTNER[gender] : CLOTH[gender];
  return { tpl: gender === "male" ? "M" : "F", pal: hpal(partner ? "#6b4226" : "#2b2633", cloth) };
}

/* ---------- 背景 ---------- */
function hrand(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function sky(c) {
  const cols = ["#7cc4ef", "#99d2f3", "#b9e2f6", "#d6eef8"];
  const h = GY / cols.length;
  cols.forEach((col, i) => px(c, 0, Math.floor(i * h), W, Math.ceil(h) + 1, col));
  for (const [x, y] of [[14, 8], [92, 5]]) {
    px(c, x, y + 2, 16, 3, "#ffffff");
    px(c, x + 3, y, 8, 2, "#ffffff");
  }
}

function ground(c) {
  px(c, 0, GY, W, H - GY, "#79c96a");
  for (let i = 0; i < 26; i++) px(c, Math.floor(hrand(i) * 126), GY + 2 + Math.floor(hrand(i + 50) * 13), 2, 1, "#5aa84f");
  px(c, 0, GY + 9, W, 4, "#b8b0a0"); // 道
  for (let x = 4; x < W; x += 12) px(c, x, GY + 10, 5, 1, "#ffffff");
}

function tree(c, x) {
  const y = GY - 18;
  px(c, x + 3, y + 11, 2, 7, "#6b4226");
  px(c, x + 2, y, 4, 2, "#4f9e4a"); px(c, x + 1, y + 2, 6, 3, "#4f9e4a"); px(c, x, y + 5, 8, 4, "#4f9e4a"); px(c, x + 1, y + 9, 6, 2, "#4f9e4a");
  px(c, x + 5, y + 3, 1, 1, "#2e8b3e"); px(c, x + 2, y + 6, 1, 1, "#2e8b3e"); px(c, x + 6, y + 7, 1, 1, "#2e8b3e");
}

function win(c, x, y, w = 3, h = 3) {
  px(c, x, y, w, h, "#9ad3f3");
  px(c, x, y, w, 1, "#ffffff");
}

// 三角の屋根（下から上へ1段ごとに左右2点ずつ細くする）
function roof(c, x, w, top, col, dark) {
  for (let i = 0; w + 4 - 4 * i > 0; i++) px(c, x - 2 + 2 * i, top - i, w + 4 - 4 * i, 1, i === 0 ? dark : col);
}

/* ---------- 住まい（x はおよそ 4〜52） ---------- */
const HOMES = {
  // 新婚の賃貸：2階建てのアパート
  starter(c) {
    const x = 8, w = 36, h = 24;
    px(c, x, GY - h, w, h, "#e8dcc4");
    px(c, x - 1, GY - h - 2, w + 2, 2, "#8a6a4a");
    px(c, x, GY - 12, w, 1, "#b8a888"); // 2階の通路
    for (let i = 0; i < 3; i++) {
      px(c, x + 3 + i * 11, GY - 21, 4, 6, "#a0704a"); // ドア
      win(c, x + 8 + i * 11, GY - 20);
      px(c, x + 3 + i * 11, GY - 9, 4, 9, "#a0704a");
      win(c, x + 8 + i * 11, GY - 8);
    }
    for (let i = 0; i < 6; i++) px(c, x + w + i, GY - 1 - i * 2, 2, 1, "#8a8a8a"); // 外階段
  },
  // 家族向けの賃貸：中層のマンション
  family(c) {
    const x = 6, w = 40, h = 44;
    px(c, x, GY - h, w, h, "#c8d0dc");
    px(c, x, GY - h, w, 2, "#8a94a8");
    for (let f = 0; f < 5; f++) {
      const y = GY - h + 4 + f * 8;
      for (let i = 0; i < 4; i++) win(c, x + 3 + i * 9, y, 5, 3);
      px(c, x + 1, y + 4, w - 2, 1, "#8a94a8"); // ベランダ
    }
    px(c, x + 16, GY - 6, 8, 6, "#5a6478");
    px(c, x + 17, GY - 5, 6, 5, "#9ad3f3");
  },
  // 高い家：庭付きの大きな2階建て
  high(c) {
    const x = 4, w = 44, h = 26;
    px(c, x, GY - h, w, h, "#fbf6ee");
    px(c, x + 32, GY - h - 9, 4, 8, "#8a5a3a"); // 煙突
    roof(c, x, w, GY - h - 1, "#c4473a", "#8a2a22");
    for (let i = 0; i < 4; i++) win(c, x + 4 + i * 10, GY - 22, 4, 4);
    win(c, x + 4, GY - 11, 4, 4); win(c, x + 14, GY - 11, 4, 4); win(c, x + 34, GY - 11, 6, 4);
    px(c, x + 23, GY - 11, 6, 11, "#8a5a3a");
    px(c, x + 27, GY - 6, 1, 1, "#ffd166");
    for (let i = 0; i < 11; i++) px(c, x + 1 + i * 4, GY - 3, 1, 3, "#ffffff"); // 柵
    px(c, x, GY - 2, w, 1, "#ffffff");
  },
  // 普通の家：こぢんまりした2階建て
  mid(c) {
    const x = 10, w = 32, h = 22;
    px(c, x, GY - h, w, h, "#f2e2b8");
    roof(c, x, w, GY - h - 1, "#3a6ad1", "#22408a");
    win(c, x + 4, GY - 18, 4, 4); win(c, x + 24, GY - 18, 4, 4);
    win(c, x + 4, GY - 9, 4, 4);
    px(c, x + 15, GY - 10, 6, 10, "#a0704a");
    px(c, x + 19, GY - 5, 1, 1, "#ffd166");
  },
  // 安い家：古い平屋（色あせて、ひびがある）
  low(c) {
    const x = 12, w = 30, h = 15;
    px(c, x, GY - h, w, h, "#c8b89a");
    roof(c, x, w, GY - h - 1, "#7a6a5a", "#4a3e34");
    win(c, x + 4, GY - 11, 5, 4);
    px(c, x + 6, GY - 11, 1, 4, "#c8b89a");
    px(c, x + 18, GY - 10, 6, 10, "#7a5a3a");
    px(c, x + 12, GY - 13, 1, 2, "#8a7a62"); px(c, x + 13, GY - 11, 1, 2, "#8a7a62"); // ひび
    px(c, x + 26, GY - 7, 3, 3, "#a89878"); // 継ぎ当て
  },
};

/* ---------- 車（横向き 26×11、x はおよそ 54〜80） ---------- */
function wheel(c, x) {
  px(c, x, GY - 4, 5, 4, OUT);
  px(c, x + 1, GY - 3, 3, 2, "#9aa3b5");
}
const CARS = {
  // 高い車：低くて長い黒のセダン
  high(c, x) {
    px(c, x, GY - 7, 28, 4, "#22263a");
    px(c, x + 6, GY - 11, 14, 4, "#22263a");
    px(c, x + 8, GY - 10, 5, 3, "#9ad3f3"); px(c, x + 14, GY - 10, 5, 3, "#9ad3f3");
    px(c, x + 2, GY - 6, 24, 1, "#c0c8d8"); // めっき
    px(c, x + 26, GY - 7, 2, 1, "#ffd166");
    wheel(c, x + 3); wheel(c, x + 20);
  },
  // 普通の車：赤いコンパクトカー
  mid(c, x) {
    px(c, x + 1, GY - 7, 24, 4, "#d84a3a");
    px(c, x + 4, GY - 12, 15, 5, "#d84a3a");
    px(c, x + 6, GY - 11, 5, 3, "#9ad3f3"); px(c, x + 12, GY - 11, 5, 3, "#9ad3f3");
    px(c, x + 24, GY - 6, 1, 1, "#ffd166");
    wheel(c, x + 3); wheel(c, x + 18);
  },
  // 安い車：色あせた古い箱型（さびがある）
  low(c, x) {
    px(c, x + 1, GY - 7, 22, 4, "#9ab0a0");
    px(c, x + 3, GY - 12, 14, 5, "#9ab0a0");
    px(c, x + 5, GY - 11, 5, 3, "#c8dde0"); px(c, x + 11, GY - 11, 5, 3, "#c8dde0");
    px(c, x + 7, GY - 5, 3, 2, "#a0603a"); px(c, x + 18, GY - 7, 2, 1, "#a0603a"); // さび
    wheel(c, x + 3); wheel(c, x + 16);
  },
};

// opts: { genders: {a, b?}, home: "starter"|"family"|"high"|"mid"|"low", car: null|"high"|"mid"|"low" }
export function drawScene(canvas, opts) {
  const c = canvas.getContext("2d");
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, W, H);
  sky(c);
  tree(c, 116);
  ground(c);
  (HOMES[opts.home] || HOMES.starter)(c);
  if (opts.car && CARS[opts.car]) CARS[opts.car](c, 54);
  // b がなければ1人だけ描く（一人暮らし日記で使う形）
  const { a, b } = opts.genders;
  const pa = personLook(a, false, a === b);
  drawSprite(c, pa.tpl, pa.pal, b ? 86 : 93, GY - 16, false);
  if (b) {
    const pb = personLook(b, true, a === b);
    drawSprite(c, pb.tpl, pb.pal, 100, GY - 16, true);
  }
}

// ゲームの状態から場面を決める
export function sceneOf(state) {
  return {
    genders: state.genders,
    home: state.house ? state.house.tier : state.rentMode === "family" ? "family" : "starter",
    car: state.car ? state.car.tier : null,
  };
}
