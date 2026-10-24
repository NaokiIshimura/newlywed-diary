// 画面の操作。ゲームの計算は engine.js にまかせる。
import {
  SAVE_VERSION,
  carValue,
  choose,
  createGame,
  defaultSettings,
  endYear,
  immediateCost,
  loanPayment,
  medianIncome,
  netWorth,
  newSeed,
  nextEvent,
  randomSettings,
  rankOf,
} from "./engine.js";

const SAVE_KEY = "newlywed-diary-save";
const SPEED_MS = { 1: 900, 2: 400 };

const $ = (sel) => document.querySelector(sel);
const man = (v) => `${(Math.round(v) || 0).toLocaleString()}万円`;
const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString()}`;

const WORK_LABEL = { fulltime_both: "共働き", parttime: "時短・パート", single: "片働き" };

let data;
let state = null;
let speed = 1;
let timer = null;

// ---- 保存 ----

function save() {
  try {
    if (state && !state.ended) localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    else localStorage.removeItem(SAVE_KEY);
  } catch {}
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    return saved && saved.version === SAVE_VERSION && !saved.ended ? saved : null;
  } catch {
    return null;
  }
}

// ---- 画面の切り替え ----

function show(id) {
  for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== id;
}

function showTitle() {
  stop();
  $("#btn-continue").hidden = !load();
  show("screen-title");
}

// ---- 開始設定 ----

const form = $("#setup-form");
let incomeEdited = { a: false, b: false };

function fillForm(s) {
  form.genderA.value = s.genders.a;
  form.genderB.value = s.genders.b;
  form.age.value = s.age;
  form.savings.value = s.savings;
  form.incomeA.value = s.income.a;
  form.incomeB.value = s.income.b;
  form.workStyle.value = s.workStyle;
}

function readForm() {
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  return {
    genders: { a: form.genderA.value, b: form.genderB.value },
    age: clamp(form.age.value, data.startAge.min, data.startAge.max),
    savings: clamp(form.savings.value, data.startSavings.min, data.startSavings.max),
    income: { a: clamp(form.incomeA.value, 0, 3000), b: clamp(form.incomeB.value, 0, 3000) },
    workStyle: form.workStyle.value,
  };
}

function showSetup() {
  incomeEdited = { a: false, b: false };
  fillForm(defaultSettings(data));
  show("screen-setup");
}

// 年齢を変えたら、手で変えていない年収をその年齢の中央値にそろえる
form.age.addEventListener("input", () => {
  const median = Math.round(medianIncome(data, readForm().age) / 10) * 10;
  if (!incomeEdited.a) form.incomeA.value = median;
  if (!incomeEdited.b) form.incomeB.value = median;
});
form.incomeA.addEventListener("input", () => (incomeEdited.a = true));
form.incomeB.addEventListener("input", () => (incomeEdited.b = true));

form.addEventListener("click", (e) => {
  const key = e.target.dataset?.random;
  if (!key) return;
  const r = randomSettings(data, newSeed());
  const current = readForm();
  if (key === "age") {
    form.age.value = r.age;
    form.age.dispatchEvent(new Event("input"));
  } else if (key === "savings") form.savings.value = r.savings;
  else if (key === "incomeA" || key === "incomeB") {
    const median = medianIncome(data, current.age);
    form[key].value = Math.round((median * (0.7 + Math.random() * 0.6)) / 10) * 10;
    incomeEdited[key === "incomeA" ? "a" : "b"] = true;
  } else if (key === "workStyle") form.workStyle.value = r.workStyle;
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  startGame(readForm());
});

$("#btn-omakase").addEventListener("click", () => startGame(randomSettings(data, newSeed())));
$("#btn-setup-back").addEventListener("click", showTitle);

// ---- メイン ----

function startGame(settings) {
  state = createGame(data, settings);
  $("#diary").replaceChildren();
  for (const h of state.history) addDiary(h.age, h.text);
  addDiary(
    state.age,
    `貯金${man(state.savings)}、年収はふたりで${man(settings.income.a + settings.income.b)}。${WORK_LABEL[state.workStyle]}でスタート。`,
  );
  enterMain();
}

function continueGame() {
  state = load();
  if (!state) return showTitle();
  $("#diary").replaceChildren();
  for (const h of state.history) addDiary(h.age, h.text);
  addDiary(state.age, "続きから再開した。");
  enterMain();
}

function enterMain() {
  show("screen-main");
  renderStatus();
  setSpeed(1);
}

function addDiary(age, text, money) {
  const li = document.createElement("li");
  const a = document.createElement("span");
  a.className = "age";
  a.textContent = `${age}歳`;
  li.append(a, text);
  if (money) {
    const m = document.createElement("span");
    m.className = "money";
    m.innerHTML = money;
    li.append(" ", m);
  }
  const list = $("#diary");
  list.append(li);
  list.scrollTop = list.scrollHeight;
}

function renderStatus() {
  const kids = state.children.length ? state.children.map((c) => `${c.age}歳`).join("・") : "なし";
  const car = state.car ? data.events.car.options.find((o) => o.tier === state.car.tier).label : "なし";
  const home = state.house
    ? data.events.house.options.find((o) => o.tier === state.house.tier).label
    : state.rentMode === "family" ? "賃貸（家族向け）" : "賃貸";
  const items = [
    ["年齢", `${state.age}歳`],
    ["結婚", `${state.year + 1}年目`],
    ["貯金", man(state.savings), "savings" + (state.savings < 0 ? " minus" : "")],
    ["働き方", WORK_LABEL[state.workStyle]],
    ["子ども", kids],
    ["車", car],
    ["住まい", home],
  ];
  $("#status").replaceChildren(
    ...items.map(([label, value, cls]) => {
      const div = document.createElement("div");
      div.className = cls ?? "";
      div.innerHTML = `<span class="label">${label}</span><span class="value">${value}</span>`;
      return div;
    }),
  );
}

function setSpeed(s) {
  speed = s;
  for (const b of document.querySelectorAll("[data-speed]")) b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === s));
  stop();
  if (s > 0 && $("#modal").hidden && state && !state.ended) timer = setInterval(tick, SPEED_MS[s]);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

document.querySelector(".controls").addEventListener("click", (e) => {
  const s = e.target.dataset?.speed;
  if (s !== undefined) setSpeed(Number(s));
});

function tick() {
  const ev = nextEvent(data, state);
  if (ev) {
    stop();
    openEvent(ev);
    return;
  }
  const before = state.history.length;
  const r = endYear(data, state);
  for (const h of state.history.slice(before)) addDiary(h.age, h.text);
  const cls = r.delta >= 0 ? "plus" : "minus";
  addDiary(
    r.age,
    "年末",
    `収入 ${Math.round(r.income).toLocaleString()}・支出 ${Math.round(r.expense).toLocaleString()}（<span class="${cls}">${signed(r.delta)}</span>）`,
  );
  addDiary(r.age, `貯金は${man(r.savings)}になった。`
  );
  renderStatus();
  save();
  if (state.ended) {
    stop();
    setTimeout(showResult, 800);
  }
}

// ---- イベント ----

function describe(ev) {
  switch (ev.id) {
    case "wedding":
      return { title: "結婚式", text: "結婚式を挙げますか？", yes: "やる", no: "やらない" };
    case "childPlan":
      return { title: "子ども", text: "子どもを望みますか？望む場合は、毎年一定の確率で生まれます。" };
    case "car":
      return ev.replace
        ? { title: "車の買い替え", text: `車を買って${state.year - state.car.boughtYear}年。今の車を${man(carValue(state.car, state.year))}で手放して、新しい車を買いますか？`, yes: "買う", no: "今は買わない（3年後にまた考える）", never: "生涯持たない" }
        : { title: "車の購入", text: "車を買いますか？", yes: "買う", no: "今は買わない（3年後にまた考える）", never: "生涯持たない" };
    case "house":
      return { title: "マイホーム", text: "家を買いますか？頭金20%を払い、残りは35年ローン（金利1.5%）で返します。買わない場合は家族向けの広い賃貸（年150万円）に住みます。", yes: "買う", no: "今は買わない（3年後にまた考える）", never: "生涯賃貸" };
    case "repair":
      return { title: "家の修繕", text: "家のあちこちが傷んできた。どう直しますか？" };
  }
}

function optionDetail(ev, opt) {
  switch (ev.id) {
    case "wedding":
      return `${man(opt.oneTime)}（ご祝儀 +${man(opt.gift)}）`;
    case "car":
      return `${man(opt.oneTime)}・維持費 年${opt.annual}万円・${opt.years}年後に${man(opt.resale)}で売却${opt.breakdownChance >= 0.2 ? "・故障しやすい" : ""}`;
    case "house": {
      const h = data.events.house;
      const loan = loanPayment(opt.oneTime * (1 - h.downPaymentRate), h.loanRate, h.loanYears);
      const fixed = Object.values(opt.annual).reduce((x, y) => x + y, 0);
      return `${man(opt.oneTime)}（頭金 ${man(opt.oneTime * h.downPaymentRate)}）・ローン 年${Math.round(loan)}万円・固定費 年${fixed}万円`;
    }
    case "repair":
      return `${man(opt.oneTime)}・次に傷むまで${opt.freeYears}年`;
  }
}

function predicted(ev, choice) {
  return `→ 貯金 ${man(state.savings - immediateCost(data, state, ev, choice))}`;
}

function button(label, sub, onClick, primary) {
  const b = document.createElement("button");
  b.className = "option" + (primary ? " primary" : "");
  b.innerHTML = `<span>${label}</span>${sub ? `<span class="sub">${sub}</span>` : ""}`;
  b.addEventListener("click", onClick);
  return b;
}

function openEvent(ev) {
  const d = describe(ev);
  $("#modal-title").textContent = d.title;
  $("#modal-text").textContent = d.text;
  const box = $("#modal-options");
  const decide = (choice) => {
    $("#modal").hidden = true;
    const before = state.history.length;
    choose(data, state, ev, choice);
    for (const h of state.history.slice(before)) addDiary(h.age, h.text);
    renderStatus();
    save();
    // 同じ年のイベントは続けて出す。年を進めるのは再生中だけ
    const next = nextEvent(data, state);
    if (next) openEvent(next);
    else setSpeed(speed);
  };

  const tiers = () => {
    const tierLabel = { high: "高い", mid: "普通", low: "安い" };
    const opts = data.events[ev.id].options.map((o) =>
      button(`${tierLabel[o.tier]}：${o.label}`, `${optionDetail(ev, o)}<br>${predicted(ev, { tier: o.tier })}`, () => decide({ tier: o.tier })),
    );
    if (d.yes) opts.push(button("戻る", "", firstStep));
    box.replaceChildren(...opts);
  };

  const firstStep = () => {
    if (ev.id === "childPlan") {
      box.replaceChildren(
        button("望む", "", () => decide({ plan: "want" }), true),
        button("今は望まない", "3年後にまた考える", () => decide({ plan: "not_now" })),
        button("生涯持たない", "以降は聞かれません", () => decide({ plan: "never" })),
      );
      return;
    }
    if (!d.yes) return tiers();
    const rent = ev.id === "house" ? `家賃 年${data.familyRent}万円` : "";
    const opts = [
      button(d.yes, "", tiers, true),
      button(d.no, [rent, predicted(ev, { skip: true })].filter(Boolean).join("<br>"), () => decide({ skip: true })),
    ];
    if (d.never) opts.push(button(d.never, `以降は提案されません<br>${predicted(ev, { never: true })}`, () => decide({ never: true })));
    box.replaceChildren(...opts);
  };

  firstStep();
  $("#modal").hidden = false;
}

// ---- リザルト ----

function showResult() {
  const nw = netWorth(state);
  const bankrupt = state.ended === "bankrupt";
  const rank = bankrupt ? { rank: "―", ending: "家計破綻エンド" } : rankOf(data, nw.total);
  const t = state.totals;
  const row = (label, v, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="num">${man(v)}</td></tr>`;
  const kidsLine = state.children.length ? `子ども${state.children.length}人` : "子どもなし";
  $("#result").innerHTML = `
    <div class="rank">${rank.rank}</div>
    <p class="ending">${rank.ending}</p>
    <p class="note">${state.startAge}歳で結婚 → ${state.age}歳${bankrupt ? "で破綻" : "で定年"}・${kidsLine}</p>
    <section>
      <h3>${bankrupt ? "破綻時" : "定年時"}の純資産</h3>
      <table>
        ${row("貯金", nw.savings)}
        ${row("家の評価額", nw.house)}
        ${row("車の評価額", nw.car)}
        ${row("ローン残高", -nw.loan)}
        ${row("純資産", nw.total, "total")}
      </table>
    </section>
    <section>
      <h3>生涯の収支</h3>
      <table>
        ${row("手取り収入", t.income)}
        ${row("基本生活費", t.living)}
        ${row("子ども生活費", t.child)}
        ${row("住居費（家賃・ローン・固定費）", t.housing + t.house + t.repair)}
        ${row("車（購入・維持・故障）", t.car)}
        ${row("結婚式", t.wedding)}
        ${row("カードローンの利息", t.interest)}
      </table>
    </section>
    <section>
      <h3>人生年表</h3>
      <ol class="timeline">${state.history.map((h) => `<li>${h.age}歳　${h.text}</li>`).join("")}</ol>
    </section>`;
  show("screen-result");
  save();
}

$("#btn-start").addEventListener("click", showSetup);
$("#btn-continue").addEventListener("click", continueGame);
$("#btn-again").addEventListener("click", showSetup);
$("#btn-result-title").addEventListener("click", showTitle);

data = await (await fetch("data/jp.json")).json();
showTitle();
