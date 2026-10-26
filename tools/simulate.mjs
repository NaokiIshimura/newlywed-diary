// 方針ごとに自動プレイして、定年時の純資産の分布を出す。
//   node tools/simulate.mjs [回数] [国（jp・us など。初期値は jp）]
// 中央値などは破綻した回も含めて数える（破綻は一番下として扱う）
import { readFileSync } from "node:fs";
import { STRATEGIES, defaultSettings, netWorth, playToEnd, rankOf } from "../js/engine.js";

const runs = Number(process.argv[2] ?? 1000);
const country = process.argv[3] ?? "jp";
const data = JSON.parse(readFileSync(new URL(`../data/profiles/${country}.json`, import.meta.url), "utf8"));
const settings = defaultSettings(data);

const fmt = (v) => (v === -Infinity ? "破綻" : Math.round(v).toLocaleString());
// 金額は国プロファイルの単位（日本は万円、米国は $100）
console.log(`${country} 開始設定: ${settings.age}歳、貯金${settings.savings}、年収${settings.income.a}+${settings.income.b}（単位 ${data.moneyUnit} ${data.currency}）、共働き（${runs}回）`);
for (const strategy of STRATEGIES) {
  const totals = [];
  const ranks = {};
  for (let seed = 1; seed <= runs; seed++) {
    const state = playToEnd(data, settings, seed, strategy);
    const bankrupt = state.ended === "bankrupt";
    const total = bankrupt ? -Infinity : netWorth(state).total;
    totals.push(total);
    const r = bankrupt ? "破綻" : rankOf(data, total).rank;
    ranks[r] = (ranks[r] ?? 0) + 1;
  }
  totals.sort((x, y) => x - y);
  const at = (p) => totals[Math.min(totals.length - 1, Math.floor(totals.length * p))];
  const order = ["S", "A", "B", "C", "D", "破綻"].filter((r) => ranks[r]).map((r) => `${r}:${Math.round((ranks[r] / runs) * 100)}%`);
  console.log(`${strategy.padEnd(6)} 中央値 ${fmt(at(0.5))}  10% ${fmt(at(0.1))}  90% ${fmt(at(0.9))}  ${order.join(" ")}`);
}
