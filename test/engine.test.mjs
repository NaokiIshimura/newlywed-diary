import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STRATEGIES,
  achievementsOf,
  carValue,
  choose,
  compareWithMid,
  createGame,
  defaultSettings,
  downPayment,
  educationCost,
  endYear,
  handoffCarValue,
  handoffSettings,
  loanPayment,
  medianIncome,
  netWorth,
  nextEvent,
  parseHandoff,
  playToEnd,
  rankOf,
  titleOf,
} from "../js/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/profiles/jp.json", import.meta.url), "utf8"));
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

test("称号は条件の順に調べて、最初に当てはまったものになる", () => {
  const state = married();
  state.choices = { high: 1, mid: 8, low: 1 };
  assert.equal(titleOf(data, state), "steady");
  state.choices = { high: 8, mid: 1, low: 1 };
  assert.equal(titleOf(data, state), "showoff");
  state.choices = { high: 3, mid: 3, low: 3 };
  assert.equal(titleOf(data, state), "lifelongRenter"); // 家なし
  state.house = { tier: "mid", value: 4500, price: 4500, boughtYear: 0 };
  assert.equal(titleOf(data, state), "twoOfUs");
  state.children.push({ age: 20, choices: { childcare: "high", elementary: "high", juniorHigh: "high", highSchool: "high" } });
  assert.equal(titleOf(data, state), "education");
});

test("年の途中で一度でも貯金がマイナスになると「借金ゼロ」にならない", () => {
  const state = married({ age: 60, savings: 100 });
  state.carNever = true;
  state.houseNever = true;
  state.randomRolledYear = Infinity;
  advance(state, 10, () => ({ tier: "high" }));
  assert.equal(state.ended, "retire");
  assert.ok(achievementsOf(data, state).includes("noCardLoan"));

  const poor = married({ age: 60, savings: 100 });
  poor.houseNever = true;
  poor.carNextAt = 0;
  choose(data, poor, { id: "car", replace: false }, { tier: "high" }); // 600万円で貯金がマイナスに
  advance(poor, 10, () => ({ tier: "low" }));
  assert.ok(!achievementsOf(data, poor).includes("noCardLoan"));
});

test("「全部普通」との比較は同じ開始条件・同じシードで計算する", () => {
  const state = playToEnd(data, settings, 5, "low");
  const mid = playToEnd(data, settings, 5, "mid");
  assert.equal(compareWithMid(data, state), mid.ended === "bankrupt" ? null : netWorth(mid).total);
});

test("日記に書く出来事のキーは、すべて日本語の文がある", () => {
  const ui = JSON.parse(readFileSync(new URL("../i18n/ja.json", import.meta.url), "utf8"));
  const profileTexts = JSON.parse(readFileSync(new URL("../data/profiles/jp/ja.json", import.meta.url), "utf8"));
  const lookup = (key) => key.split(".").reduce((o, k) => o?.[k], key.startsWith("events.") ? profileTexts : ui);
  const keys = new Set();
  for (const strategy of STRATEGIES) {
    for (let seed = 1; seed <= 40; seed++) {
      for (const h of playToEnd(data, settings, seed, strategy).history) keys.add(h.key);
    }
  }
  for (const key of keys) assert.equal(typeof lookup(key), "string", key);
  for (const id of data.titles) assert.ok(profileTexts.titles[id]?.name, id);
  for (const id of data.achievements) assert.ok(profileTexts.achievements[id]?.name, id);
});

test("子どもを望むと、その年のうちにかならず生まれる（Issue #7）", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const state = createGame(data, settings, seed);
    choose(data, state, { id: "wedding" }, { skip: true });
    choose(data, state, { id: "honeymoon" }, { skip: true });
    choose(data, state, { id: "childPlan" }, { plan: "want" });
    state.carNever = true;
    state.randomRolledYear = Infinity; // ランダムイベントを止める
    endYear(data, state);
    assert.equal(state.children.length, 1, `seed ${seed}`);
    assert.equal(state.childPlan, null, "生まれたら次を望むか聞き直す");
  }
});

test("家で介護するあいだ、パートナーは時短・パートになり、終わるとブランクなしで元に戻る", () => {
  const state = married({ age: 45 });
  state.carNever = true;
  state.houseNever = true;
  state.randomRolledYear = Infinity;
  const ev = { id: "care", years: 3 };
  state.queue.push(ev);
  choose(data, state, ev, { mode: "home" });
  assert.equal(state.workStyle, "parttime");
  const before = state.baseIncome.b;
  for (let i = 0; i < 3; i++) endYear(data, state);
  assert.equal(state.care, null);
  assert.equal(state.workStyle, "fulltime_both");
  assert.equal(state.baseIncome.b, before, "時短・パートはブランクにならない");
});

// ---- 一人暮らし日記からの引き継ぎ ----

// 一人暮らし日記の handoffData と同じ形のデータを、URL のクエリにする
function soloQuery(d) {
  const b64 = Buffer.from(JSON.stringify(d)).toString("base64url");
  return new URLSearchParams(`from=solo&d=${b64}`);
}
const soloData = {
  v: 1, gender: "female", age: 30, savings: 280, income: 380,
  car: { tier: "mid", price: 150, resale: 30, years: 8, annual: 30, breakdownChance: 0.1, boughtAge: 25 },
  ending: "married_mid",
};

test("一人暮らし日記の引き継ぎデータを読める", () => {
  const h = parseHandoff(data, soloQuery(soloData));
  assert.deepEqual(h, { gender: "female", age: 30, savings: 280, income: 380, car: soloData.car, ending: "married_mid" });
  assert.equal(parseHandoff(data, soloQuery({ ...soloData, car: null })).car, null);
});

test("知らない版・壊れたデータ・範囲の外の値は、引き継がない", () => {
  assert.equal(parseHandoff(data, new URLSearchParams("")), null);
  assert.equal(parseHandoff(data, new URLSearchParams("from=solo&d=not-json")), null);
  assert.equal(parseHandoff(data, soloQuery({ ...soloData, v: 2 })), null);
  assert.equal(parseHandoff(data, soloQuery({ ...soloData, age: 50 })), null);
  assert.equal(parseHandoff(data, soloQuery({ ...soloData, gender: "x" })), null);
  assert.equal(parseHandoff(data, soloQuery({ ...soloData, savings: "100" })), null);
  assert.equal(parseHandoff(data, soloQuery({ ...soloData, car: { ...soloData.car, boughtAge: 31 } })), null);
  assert.equal(parseHandoff(data, soloQuery({ ...soloData, ending: "<script>" })).ending, null);
});

test("引き継いだ貯金がマイナスでも、そのまま持ち込む", () => {
  const h = parseHandoff(data, soloQuery({ ...soloData, savings: -120 }));
  const s = handoffSettings(h, { gender: "male", savings: 50, income: 300, workStyle: "fulltime_both" });
  assert.equal(s.savings, -70);
  assert.equal(createGame(data, s, 1).savings, -70);
});

test("貯金は引き継いだ貯金＋パートナーの貯金で、上限はない", () => {
  const h = parseHandoff(data, soloQuery({ ...soloData, savings: 1500 }));
  const s = handoffSettings(h, { gender: "male", savings: 800, income: 300, workStyle: "parttime" });
  assert.deepEqual(s.genders, { a: "female", b: "male" });
  assert.deepEqual(s.income, { a: 380, b: 300 });
  assert.equal(s.age, 30);
  assert.equal(s.savings, 2300);
});

test("引き継いだ車は最初から持っていて、評価額と買い替えの時期は買った年齢から数える", () => {
  const h = parseHandoff(data, soloQuery(soloData));
  const state = createGame(data, handoffSettings(h, { gender: "male", savings: 0, income: 300, workStyle: "fulltime_both" }), 1);
  assert.equal(state.car.tier, "low"); // 一人暮らし日記の中古車は、新婚日記の「中古車」として表示する
  assert.equal(state.car.boughtYear, -5);
  assert.equal(carValue(state.car, state.year), 150 - 15 * 5);
  assert.equal(handoffCarValue(h), carValue(state.car, 0));
  // 8年で買い替えなので、結婚して3年目に買い替えを聞かれる
  state.year = 3;
  state.weddingDone = true;
  state.honeymoonDone = true;
  state.childPlan = "never";
  assert.deepEqual(nextEvent(data, state), { id: "car", replace: true });
});

test("引き継いだ人生でも、同じ設定で「全部普通」と比べられる", () => {
  const h = parseHandoff(data, soloQuery(soloData));
  const s = handoffSettings(h, { gender: "male", savings: 0, income: 300, workStyle: "fulltime_both" });
  const state = playToEnd(data, s, 7, "low");
  assert.ok(["retire", "bankrupt"].includes(state.ended));
  assert.notEqual(compareWithMid(data, state), undefined);
  assert.ok(state.history.some((x) => x.key === "h.fromSolo"));
});
