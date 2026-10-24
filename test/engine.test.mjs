import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STRATEGIES,
  choose,
  createGame,
  defaultSettings,
  downPayment,
  educationCost,
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

// 結婚式・新婚旅行・子どもを望むかを片づけた状態にする
function married(overrides = {}, plan = "never") {
  const state = createGame(data, { ...settings, ...overrides }, 1);
  choose(data, state, { id: "wedding" }, { skip: true });
  choose(data, state, { id: "honeymoon" }, { skip: true });
  choose(data, state, { id: "childPlan" }, { plan });
  return state;
}

// 年を進める。イベントは渡した関数で選ぶ
function advance(state, years, pickChoice) {
  const until = state.year + years;
  let guard = 0;
  while (!state.ended && state.year < until && guard++ < 1000) {
    const ev = nextEvent(data, state);
    if (ev) choose(data, state, ev, pickChoice(ev));
    else endYear(data, state);
  }
}

test("どの方針でも、破綻か定年で最後まで終わる", () => {
  for (const strategy of STRATEGIES) {
    for (let seed = 1; seed <= 30; seed++) {
      const state = playToEnd(data, settings, seed, strategy);
      assert.ok(["retire", "bankrupt"].includes(state.ended), `${strategy} ${seed}`);
      if (state.ended === "retire") assert.equal(state.age, data.retireAge);
    }
  }
});

test("同じシードなら同じ人生になる", () => {
  const a = playToEnd(data, settings, 42, "random");
  const b = playToEnd(data, settings, 42, "random");
  assert.deepEqual(a, b);
});

test("最初は結婚式、新婚旅行、子どもを望むかの順に聞かれる", () => {
  const state = createGame(data, settings, 1);
  assert.equal(nextEvent(data, state).id, "wedding");
  choose(data, state, { id: "wedding" }, { tier: "mid" });
  assert.equal(state.savings, settings.savings - (300 - 180));
  assert.equal(nextEvent(data, state).id, "honeymoon");
  choose(data, state, { id: "honeymoon" }, { tier: "low" });
  assert.equal(nextEvent(data, state).id, "childPlan");
});

test("生涯持たないを選ぶと車も家も子どもも再提案されない", () => {
  const state = married({ age: 30 });
  const asked = new Set();
  advance(state, 100, (ev) => {
    asked.add(ev.id);
    if (ev.id === "car" || ev.id === "house") return { never: true };
    if (ev.id === "jobOffer") return { accept: false };
    if (ev.id === "care") return { mode: "facility" };
    return { tier: "mid" };
  });
  assert.equal(state.car, null);
  assert.equal(state.house, null);
  assert.equal(state.children.length, 0);
  assert.ok(!asked.has("childPlan"));
});

test("買わないと3年後に再提案される", () => {
  const state = married({ age: 30 });
  assert.equal(nextEvent(data, state).id, "house");
  choose(data, state, { id: "house" }, { skip: true });
  assert.equal(state.houseNextAge, 33);
});

test("頭金は20%。貯金が足りなければ貯金の範囲で払い、残りはローンになる", () => {
  const state = married({ age: 30, savings: 1000 });
  assert.equal(downPayment(data, state, 4500), 900);
  state.savings = 300;
  assert.equal(downPayment(data, state, 4500), 300);
  choose(data, state, { id: "house" }, { tier: "mid" });
  assert.equal(state.savings, 0);
  assert.equal(state.loan.balance, 4200);
});

test("子どもが生まれると保育と働き方の見直しが入り、生まれるたびに次を望むか聞き直す", () => {
  const state = married({}, "want");
  const seen = [];
  advance(state, 30, (ev) => {
    seen.push(ev.id);
    if (ev.id === "childPlan") return { plan: state.children.length < 2 ? "want" : "never" };
    if (ev.id === "workStyle") return { workStyle: "parttime" };
    if (ev.id === "university") return { tier: "low", years: 6 };
    if (ev.id === "jobOffer") return { accept: false };
    if (ev.id === "care") return { mode: "facility" };
    if (ev.id === "car" || ev.id === "house") return { never: true };
    return { tier: "mid" };
  });
  assert.equal(state.children.length, 2);
  for (const id of ["childcare", "workStyle", "elementary", "juniorHigh"]) assert.ok(seen.includes(id), id);
  assert.equal(seen.filter((id) => id === "childcare").length, 2);
  assert.ok(seen.filter((id) => id === "childPlan").length >= 2);
});

test("大学は期間を選べ、期間が終わると独立する", () => {
  const state = married();
  state.children.push({ age: 18, choices: {}, independent: false, independentAge: null, boarding: false, allowance: 0, borrowed: 0, scholarship: null });
  choose(data, state, { id: "university", child: 0 }, { tier: "low", years: 6 });
  assert.equal(state.children[0].independentAge, 24);
  assert.equal(educationCost(data, state.children[0]), 100);
  for (let i = 0; i < 6; i++) endYear(data, state);
  assert.equal(state.children[0].independent, true);
  assert.equal(educationCost(data, state.children[0]), 0);
});

test("就職を選ぶと18歳で独立する", () => {
  const state = married();
  state.children.push({ age: 18, choices: {}, independent: false, independentAge: null, boarding: false, allowance: 0, borrowed: 0, scholarship: null });
  choose(data, state, { id: "university", child: 0 }, { skip: true });
  assert.equal(state.children[0].independent, true);
});

test("片働きから戻ると、ブランクの年数に応じて年収が下がる", () => {
  const state = married({ workStyle: "single" });
  state.carNever = true;
  state.houseNever = true;
  state.randomRolledYear = Infinity; // ランダムイベントを止める
  for (let i = 0; i < 5; i++) endYear(data, state);
  state.queue.push({ id: "workStyle", reason: "birth" });
  choose(data, state, { id: "workStyle", reason: "birth" }, { workStyle: "fulltime_both" });
  assert.equal(Math.round(state.baseIncome.b), Math.round(settings.income.b * (1 - 0.04 * 5)));
});

test("住宅ローンは35年で払い終わる", () => {
  const principal = 3600;
  const pay = loanPayment(principal, 0.015, 35);
  let balance = principal;
  for (let i = 0; i < 35; i++) balance = balance * 1.015 - pay;
  assert.ok(Math.abs(balance) < 1e-6);
});

test("貯金がマイナスだと年10%の利息がつく", () => {
  const state = married();
  state.carNever = true;
  state.savings = -500;
  const summary = endYear(data, state);
  assert.equal(summary.items.interest, 50);
});

test("−1,000万円を下回ると家計破綻で終わる", () => {
  const state = married();
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
  const t = data.medianIncomeByAge;
  assert.equal(medianIncome(data, 22), t["22"]);
  assert.equal(medianIncome(data, 27), t["25"] + ((t["30"] - t["25"]) * 2) / 5);
});

test("純資産は貯金＋家・車の評価額−ローン残高", () => {
  const state = playToEnd(data, settings, 3, "mid");
  const nw = netWorth(state);
  assert.equal(nw.total, nw.savings + nw.house + nw.car - nw.loan);
});
