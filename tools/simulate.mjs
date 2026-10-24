// 方針ごとに自動プレイして、定年時の純資産の分布を出す。
//   node tools/simulate.mjs [回数]
import { readFileSync } from "node:fs";
import { defaultSettings, netWorth, playToEnd, rankOf } from "../js/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/jp.json", import.meta.url), "utf8"));
const runs = Number(process.argv[2] ?? 1000);
const settings = defaultSettings(data);

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
console.log(`開始設定: ${settings.age}歳、貯金${settings.savings}万円、年収${settings.income.a}+${settings.income.b}万円、共働き（${runs}回）`);
for (const strategy of ["high", "mid", "low", "random"]) {
  const totals = [];
  const ranks = {};
  let bankrupt = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const state = playToEnd(data, settings, seed, strategy);
    if (state.ended === "bankrupt") {
      bankrupt++;
      ranks["破綻"] = (ranks["破綻"] ?? 0) + 1;
      continue;
    }
    const total = netWorth(state).total;
    totals.push(total);
    const r = rankOf(data, total).rank;
    ranks[r] = (ranks[r] ?? 0) + 1;
  }
  totals.sort((x, y) => x - y);
  const fmt = (v) => (v === undefined ? "-" : Math.round(v).toLocaleString());
  console.log(
    `${strategy.padEnd(6)} 中央値 ${fmt(pct(totals, 0.5))}  10% ${fmt(pct(totals, 0.1))}  90% ${fmt(pct(totals, 0.9))}  破綻 ${bankrupt}  ランク ${JSON.stringify(ranks)}`,
  );
}
