import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  choose,
  createGame,
  defaultSettings,
  endYear,
  loanPayment,
  medianIncome,
  netWorth,
  nextEvent,
  playToEnd,
  rankOf,
} from "../js/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/jp.json", import.meta.url), "utf8"));
const settings = defaultSettings(data);

test("全部普通で定年まで通しで遊べる", () => {
  const state = playToEnd(data, settings, 1, "mid");
  assert.equal(state.ended, "retire");
  assert.equal(state.age, data.retireAge);
  assert.ok(state.car, "車を持っている");
  assert.ok(state.house, "家を持っている");
});

test("同じシードなら同じ人生になる", () => {
  const a = playToEnd(data, settings, 42, "random");
  const b = playToEnd(data, settings, 42, "random");
  assert.deepEqual(a, b);
});

test("最初のイベントは結婚式、次に子どもを望むか", () => {
  const state = createGame(data, settings, 1);
  assert.equal(nextEvent(data, state).id, "wedding");
  choose(data, state, { id: "wedding" }, { tier: "mid" });
  assert.equal(state.savings, settings.savings - (300 - 180));
  assert.equal(nextEvent(data, state).id, "childPlan");
  choose(data, state, { id: "childPlan" }, { plan: "never" });
  assert.equal(nextEvent(data, state), null);
});

test("生涯持たないを選ぶと車も家も子どもも再提案されない", () => {
  const state = createGame(data, { ...settings, age: 30 }, 1);
  choose(data, state, { id: "wedding" }, { skip: true });
  choose(data, state, { id: "childPlan" }, { plan: "never" });
  let guard = 0;
  while (!state.ended && guard++ < 100) {
    const ev = nextEvent(data, state);
    if (ev) {
      assert.ok(["car", "house"].includes(ev.id), ev.id);
      choose(data, state, ev, { never: true });
    } else endYear(data, state);
  }
  assert.equal(state.car, null);
  assert.equal(state.house, null);
  assert.equal(state.children.length, 0);
});

test("買わないと3年後に再提案される", () => {
  const state = createGame(data, { ...settings, age: 30 }, 1);
  choose(data, state, { id: "wedding" }, { skip: true });
  choose(data, state, { id: "childPlan" }, { plan: "never" });
  assert.equal(nextEvent(data, state).id, "house");
  choose(data, state, { id: "house" }, { skip: true });
  assert.equal(state.houseNextAge, 33);
});

test("住宅ローンは35年で払い終わる", () => {
  const principal = 3600;
  const pay = loanPayment(principal, 0.015, 35);
  let balance = principal;
  for (let i = 0; i < 35; i++) balance = balance * 1.015 - pay;
  assert.ok(Math.abs(balance) < 1e-6);
});

test("貯金がマイナスだと年10%の利息がつく", () => {
  const state = createGame(data, settings, 1);
  state.weddingDone = true;
  state.childPlan = "never";
  state.carNever = true;
  state.savings = -500;
  const summary = endYear(data, state);
  assert.equal(summary.items.interest, 50);
});

test("−1,000万円を下回ると家計破綻で終わる", () => {
  const state = createGame(data, settings, 1);
  state.savings = -2000;
  endYear(data, state);
  assert.equal(state.ended, "bankrupt");
});

test("ランクの境目の金額ちょうどは上のランクに入る", () => {
  assert.equal(rankOf(data, 5000).rank, "S");
  assert.equal(rankOf(data, 2000).rank, "B");
  assert.equal(rankOf(data, 1999).rank, "C");
  assert.equal(rankOf(data, 500).rank, "C");
  assert.equal(rankOf(data, -100).rank, "D");
});

test("年収の中央値は表の間を直線で補う", () => {
  assert.equal(medianIncome(data, 22), 260);
  assert.equal(medianIncome(data, 27), 354);
});

test("純資産は貯金＋家・車の評価額−ローン残高", () => {
  const state = playToEnd(data, settings, 3, "mid");
  const nw = netWorth(state);
  assert.equal(nw.total, nw.savings + nw.house + nw.car - nw.loan);
});
