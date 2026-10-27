// 新婚日記の場面：住まいの外観・車・夫婦をドット絵で描く（部品は pixel.js。一人暮らし日記と共通）
import { GY, W, H, building, drawPerson, ground, personPalette, sideCar, sky, tree } from "./pixel.js";

// 同じ性別の夫婦なら、パートナーの服と髪を別の色にして見分けられるようにする
const PARTNER_LOOK = { male: { hair: "#6b4226", cloth: "#3a9a6a" }, female: { hair: "#2b2633", cloth: "#d9853a" } };

// view: { genders: {a, b}, home: "starter"|"family"|"high"|"mid"|"low", car: tier か null, mood: "high"|"mid"|"low" }
export function drawStage(c, view) {
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, W, H);
  sky(c);
  tree(c, 118);
  ground(c);
  building(c, view.home);
  if (view.car) sideCar(c, view.car, 40, GY + 6);
  const { a, b } = view.genders;
  const mood = view.mood ?? "mid";
  const y = GY - 26;
  drawPerson(c, { sex: a, mood, scale: 2 }, 66, y);
  const pal = a === b ? personPalette(PARTNER_LOOK[b]) : undefined;
  drawPerson(c, { sex: b, mood, pal, scale: 2 }, 88, y, true);
}

// ゲームの状態から場面を決める。表情は貯金がマイナスならしょんぼり
export function stageOf(state, mood) {
  return {
    genders: state.genders,
    home: state.house ? state.house.tier : state.rentMode === "family" ? "family" : "starter",
    car: state.car ? state.car.tier : null,
    mood: mood ?? (state.savings < 0 ? "low" : "mid"),
  };
}
