// 画面の操作。ゲームの計算は engine.js、文は i18n.js にまかせる。
import {
  SAVE_VERSION,
  SCHOOL_STAGES,
  achievementsOf,
  carValue,
  choose,
  compareWithMid,
  createGame,
  defaultSettings,
  downPayment,
  endYear,
  handoffCarValue,
  handoffCountry,
  handoffSettings,
  immediateCost,
  loanPayment,
  medianIncome,
  netWorth,
  newSeed,
  nextEvent,
  parseHandoff,
  randomSettings,
  rankOf,
  roundMoney,
  titleOf,
} from "./engine.js";
import { COUNTRIES, initialCountry, isCountry, saveCountry } from "./countries.js";
import { LANGS, applyStatic, currentLang, loadLang, money, pageLang, t } from "./i18n.js";
import { illustFor } from "./illust.js";
import { canvasToBlob, drawShareCard } from "./share.js";
import { clearAll, loadRecords, loadSave, loadSettings, recordResult, writeSave, writeSettings } from "./storage.js";

const SPEED_MS = { 1: 900, 2: 400 };

const $ = (sel) => document.querySelector(sel);

let data;
let country; // ゲームの中の国（国プロファイル）。表示の言語とは別
let state = null;
let speed = 1;
let timer = null;
let settings = loadSettings();

// ---- 言語と国 ----

// 国のプロファイル（数値と、このページの言語の文）を読んで、画面の文を入れ直す
async function setCountry(c) {
  const lang = pageLang();
  data = await (await fetch(new URL(`../data/profiles/${c}.json`, import.meta.url))).json();
  country = c;
  await loadLang(lang, data, c);
  applyStatic();
  $("#settings-lang").innerHTML = LANGS.map((l) => `<option value="${l.code}"${l.code === lang ? " selected" : ""}>${l.name}</option>`).join("");
  $("#setup-country").innerHTML = COUNTRIES.map((k) => `<option value="${k}"${k === c ? " selected" : ""}>${t(`countries.${k}`)}</option>`).join("");
  updateSetupLabels();
}

// 言語を変えるときは、その言語のページ（/en/ など）へ移る。選んだ言語は nacn.app の全サイトで同じキー（lang）に覚える
function goToLang(code) {
  try {
    localStorage.setItem("lang", code);
  } catch {}
  location.href = `../${code}/`;
}

// ---- 保存 ----

function save() {
  writeSave(state && !state.ended ? state : null);
}

function load() {
  const saved = loadSave();
  return saved && saved.version === SAVE_VERSION && !saved.ended ? saved : null;
}

// ---- 画面の切り替え ----

function show(id) {
  for (const el of document.querySelectorAll(".screen")) el.hidden = el.id !== id;
  window.scrollTo(0, 0);
}

function showTitle() {
  stop();
  $("#btn-continue").hidden = !load();
  $("#title-illust").innerHTML = illustFor("wedding");
  show("screen-title");
}

for (const b of document.querySelectorAll("[data-back]")) b.addEventListener("click", showTitle);

// ---- 開始設定 ----

const form = $("#setup-form");
let incomeEdited = { a: false, b: false };
let handoff = null; // 一人暮らし日記から引き継いだデータ（URL の ?from=solo&d=）。なければ null

// 金額の入力欄の 1 は、国プロファイルの金額の inputScale 単位（日本は万円のまま、米国は $1,000 で入れる）
const toInput = (v) => v / data.inputScale;
const fromInput = (v) => (Number(v) || 0) * data.inputScale;
// 年収の初期値・ランダムの値（国の刻みにそろえて、入力欄の単位にする）
const incomeInput = (v) => toInput(roundMoney(data, v));

function fillForm(s) {
  form.genderA.value = s.genders.a;
  form.genderB.value = s.genders.b;
  form.age.value = s.age;
  form.savings.value = toInput(s.savings);
  form.incomeA.value = toInput(s.income.a);
  form.incomeB.value = toInput(s.income.b);
  form.workStyle.value = s.workStyle;
  updateMoneyHints();
}

// 入力欄の範囲・刻みと、ラベルの単位を国に合わせる
function updateSetupLabels() {
  const unit = t("local.inputUnit");
  const step = toInput(data.moneyStep);
  const sv = data.startSavings;
  Object.assign(form.age, { min: data.startAge.min, max: data.startAge.max });
  Object.assign(form.savings, { min: toInput(sv.min), max: toInput(sv.max), step });
  for (const name of ["incomeA", "incomeB"]) Object.assign(form[name], { min: 0, max: toInput(data.maxIncome), step });
  $("#age-label").innerHTML = t("setup.age", { min: data.startAge.min, max: data.startAge.max });
  $("#savings-label").innerHTML = t(handoff ? "setup.partnerSavings" : "setup.savings", { unit, min: toInput(sv.min), max: toInput(sv.max) });
  $("#incomeA-label").innerHTML = t("setup.incomeA", { unit });
  $("#incomeB-label").innerHTML = t("setup.incomeB", { unit });
  updateMoneyHints();
}

// 金額の入力欄の下に、表示用の金額を出す（日本語で日本円なら入力欄と同じ「万円」なので出さない）
function updateMoneyHints() {
  for (const out of document.querySelectorAll("[data-money-for]")) {
    out.textContent = currentLang().code === "ja" && data.currency === "JPY" ? "" : `= ${money(fromInput(form[out.dataset.moneyFor].value))}`;
  }
}

function readForm() {
  const clamp = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  const savings = clamp(fromInput(form.savings.value), data.startSavings.min, data.startSavings.max);
  const income = (name) => clamp(fromInput(form[name].value), 0, data.maxIncome);
  // 引き継ぐときは、主人公の性別・年齢・年収は一人暮らし日記のまま。貯金の欄はパートナーの貯金になる
  if (handoff) {
    return handoffSettings(handoff, { gender: form.genderB.value, savings, income: income("incomeB"), workStyle: form.workStyle.value });
  }
  return {
    genders: { a: form.genderA.value, b: form.genderB.value },
    age: clamp(form.age.value, data.startAge.min, data.startAge.max),
    savings,
    income: { a: income("incomeA"), b: income("incomeB") },
    workStyle: form.workStyle.value,
  };
}

function showSetup(from = null) {
  handoff = from;
  incomeEdited = { a: false, b: false };
  fillForm(defaultSettings(data));
  applyHandoff();
  show("screen-setup");
}

// 引き継ぐときは、主人公の欄を一人暮らし日記の値にして変えられないようにし、貯金の欄をパートナーの貯金にする。
// 金額は一人暮らし日記の国の単位なので、国も変えられない
function applyHandoff() {
  const on = !!handoff;
  $("#handoff-note").hidden = !on;
  for (const name of ["genderA", "age", "incomeA", "country"]) form[name].disabled = on;
  for (const key of ["age", "incomeA"]) form.querySelector(`[data-random="${key}"]`).hidden = on;
  updateSetupLabels();
  if (on) {
    form.genderA.value = handoff.gender;
    form.age.value = handoff.age;
    form.incomeA.value = toInput(handoff.income);
    form.incomeB.value = incomeInput(medianIncome(data, handoff.age));
    form.savings.value = toInput(randomSettings(data, newSeed()).savings);
    const car = handoff.car ? t("setup.handoffCar", { value: handoffCarValue(handoff) }) : t("setup.handoffNoCar");
    $("#handoff-detail").innerHTML = `${t("setup.handoffSavings", { savings: handoff.savings })}<br>${car}`;
  }
  updateMoneyHints();
}

// 引き継がずに始める。URL のクエリも消して、再読み込みで戻らないようにする
$("#btn-no-handoff").addEventListener("click", () => {
  history.replaceState(null, "", location.pathname);
  showSetup(null);
});

// 国を変えたら、その国の初期値で入れ直す。選んだ国は覚えて、次に開いたときもその国にする
form.country.addEventListener("change", async () => {
  const c = form.country.value;
  if (!isCountry(c)) return;
  saveCountry(c);
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  await setCountry(c);
  showSetup(null);
});

// 年齢を変えたら、手で変えていない年収をその年齢の中央値にそろえる
form.age.addEventListener("input", () => {
  const median = incomeInput(medianIncome(data, readForm().age));
  if (!incomeEdited.a) form.incomeA.value = median;
  if (!incomeEdited.b) form.incomeB.value = median;
  updateMoneyHints();
});
form.incomeA.addEventListener("input", () => (incomeEdited.a = true));
form.incomeB.addEventListener("input", () => (incomeEdited.b = true));
form.addEventListener("input", updateMoneyHints);

form.addEventListener("click", (e) => {
  const key = e.target.dataset?.random;
  if (!key) return;
  const r = randomSettings(data, newSeed());
  const current = readForm();
  if (key === "age") {
    form.age.value = r.age;
    form.age.dispatchEvent(new Event("input"));
  } else if (key === "savings") form.savings.value = toInput(r.savings);
  else if (key === "incomeA" || key === "incomeB") {
    const median = medianIncome(data, current.age);
    form[key].value = incomeInput(median * (0.7 + Math.random() * 0.6));
    incomeEdited[key === "incomeA" ? "a" : "b"] = true;
  } else if (key === "workStyle") form.workStyle.value = r.workStyle;
  updateMoneyHints();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  startGame(readForm());
});

$("#btn-omakase").addEventListener("click", () => {
  const r = randomSettings(data, newSeed());
  if (!handoff) return startGame(r);
  // 引き継ぐときは、パートナーのぶんだけおまかせにする
  const income = roundMoney(data, medianIncome(data, handoff.age) * (0.7 + Math.random() * 0.6));
  startGame(handoffSettings(handoff, { gender: r.genders.b, savings: r.savings, income, workStyle: r.workStyle }));
});

// ---- メイン ----

function startGame(start) {
  if (start.from === "solo") {
    history.replaceState(null, "", location.pathname);
    handoff = null;
  }
  state = createGame(data, start);
  $("#diary").replaceChildren();
  shown = 0;
  flushDiary();
  addDiary(
    state.age,
    t("main.startLine", { savings: state.savings, income: start.income.a + start.income.b, workStyle: t(`workStyles.${state.workStyle}.fullLabel`) }),
  );
  enterMain();
}

async function continueGame() {
  const saved = load();
  if (!saved) return showTitle();
  // 途中の記録は、その国のプロファイルで続ける（国を分ける前の記録は日本）
  const c = saved.country ?? "jp";
  if (!isCountry(c)) return showTitle();
  if (c !== country) await setCountry(c);
  state = { ...saved, country: c };
  $("#diary").replaceChildren();
  shown = 0;
  flushDiary();
  addDiary(state.age, t("main.resumed"));
  enterMain();
}

function enterMain() {
  show("screen-main");
  renderStatus();
  setSpeed(settings.speed);
}

function addDiary(age, html, moneyHtml) {
  const li = document.createElement("li");
  li.innerHTML = `<span class="age">${t("main.age", { n: age })}</span>${html}${moneyHtml ? ` <span class="money">${moneyHtml}</span>` : ""}`;
  const list = $("#diary");
  list.append(li);
  list.scrollTop = list.scrollHeight;
}

// 日記の出来事（キーと値）を、今の言語の文にする。ボーナスカットの率を持たない古い途中保存は、そのころの率（10%）で書く
const historyText = (h) => t(h.key, h.key === "h.bonusCut" && !h.params ? { pct: 10 } : h.params);

// まだ日記に書いていない出来事を書く
let shown = 0;
function flushDiary() {
  for (const h of state.history.slice(shown)) addDiary(h.age, historyText(h));
  shown = state.history.length;
}

function renderStatus() {
  const s = (k, p) => t(`main.status.${k}`, p);
  const kids = state.children.length
    ? state.children.map((c) => (c.independent ? s("independent") : s("childAge", { n: c.age }))).join(s("listSep"))
    : s("none");
  const car = state.car ? t(`events.car.${state.car.tier}.label`) : s("none");
  const home = state.house ? t(`events.house.${state.house.tier}.label`) : state.rentMode === "family" ? s("familyRent") : s("rent");
  const items = [
    [s("age"), t("main.age", { n: state.age })],
    [s("married"), s("marriedYear", { n: state.year + 1 })],
    [s("savings"), money(state.savings), "savings" + (state.savings < 0 ? " minus" : "")],
    [s("workStyle"), t(`workStyles.${state.workStyle}.label`) + (state.care ? s("caring") : "")],
    [s("children"), kids],
    [s("car"), car],
    [s("home"), home],
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
  flushDiary(); // 選択のないランダムイベントは nextEvent の中で起きる
  if (ev) {
    stop();
    renderStatus();
    openEvent(ev);
    return;
  }
  const r = endYear(data, state);
  if (settings.yearSummary) showYearSummary(r);
  addDiary(r.age, t("main.yearEnd"), t("main.yearEndMoney", { income: r.income, expense: r.expense, delta: r.delta, savings: r.savings }));
  flushDiary();
  renderStatus();
  save();
  if (state.ended) {
    stop();
    setTimeout(showResult, 800);
  }
}

// 年末の収支を数秒だけ表示する
let summaryTimer = null;
function showYearSummary(r) {
  const el = $("#year-summary");
  const rows = Object.entries(r.items)
    .filter(([, v]) => v > 0.5)
    .map(([k, v]) => `<span>${t(`summary.items.${k}`)}</span><span class="num minus">−${money(v)}</span>`)
    .join("");
  el.innerHTML = `
    <div class="ys-head">${t("summary.head", { age: r.age })} ${t("summary.unit", { delta: r.delta })}</div>
    <div class="ys-grid"><span>${t("summary.income")}</span><span class="num plus">+${money(r.income)}</span>${rows}</div>`;
  el.hidden = false;
  clearTimeout(summaryTimer);
  summaryTimer = setTimeout(() => (el.hidden = true), speed === 2 ? 1200 : 2000);
}

// ---- イベント ----

const pct = (rate) => Math.round(rate * 1000) / 10; // 0.015 → 1.5

function childName(i) {
  return state.children.length > 1 ? t("event.childNth", { n: i + 1 }) : t("event.child");
}

function describe(ev) {
  const e = (k, p) => t(`event.${ev.id}.${k}`, p);
  const buy = { yes: t("event.car.yes"), no: t("event.later") };
  switch (ev.id) {
    case "wedding":
    case "honeymoon":
    case "familyTrip":
      return { title: e("title"), text: e("text", { n: state.year }), yes: e("yes"), no: e("no") };
    case "childPlan":
      return { title: e("title"), text: state.children.length ? e("textNext", { n: state.children.length }) : e("textFirst") };
    case "workStyle":
      return { title: e("title"), text: e("text", { why: t(`event.workStyle.why.${ev.reason}`), current: t(`workStyles.${state.workStyle}.fullLabel`) }) };
    case "childcare":
    case "elementary":
    case "juniorHigh":
    case "highSchool":
      return { title: e("title"), text: e("text", { child: childName(ev.child) }) };
    case "university":
      return { title: e("title"), text: e("text", { child: childName(ev.child) }), yes: e("yes"), no: e("no") };
    case "car":
      return ev.replace
        ? { title: e("titleReplace"), text: e("textReplace", { years: state.year - state.car.boughtYear, value: carValue(state.car, state.year) }), ...buy, never: e("never") }
        : { title: e("titleBuy"), text: e("textBuy"), ...buy, never: e("never") };
    case "house":
      return {
        title: e("title"),
        text: e("text", { rent: data.familyRent, down: pct(data.events.house.downPaymentRate), years: data.events.house.loanYears, rate: pct(data.events.house.loanRate) }),
        yes: e("yes"),
        no: t("event.later"),
        never: e("never"),
      };
    case "jobOffer":
      return { title: e("title"), text: e("text", { pct: pct(data.random.events.jobOffer.range) }) };
    case "care":
      return { title: e("title"), text: e("text", { years: ev.years }) };
    default:
      return { title: e("title"), text: e("text") };
  }
}

function optionDetail(ev, opt) {
  switch (ev.id) {
    case "wedding":
      return t("event.wedding.detail", { cost: opt.oneTime, gift: opt.gift, giftName: t("local.weddingGift") });
    case "car":
      return t("event.car.detail", { cost: opt.oneTime, annual: opt.annual, years: opt.years, resale: opt.resale }) + (opt.breakdownChance >= 0.2 ? t("event.car.fragile") : "");
    case "house": {
      const h = data.events.house;
      const down = downPayment(data, state, opt.oneTime);
      const loan = loanPayment(opt.oneTime - down, h.loanRate, h.loanYears);
      const fixed = Object.values(opt.annual).reduce((x, y) => x + y, 0);
      return t("event.house.detail", { cost: opt.oneTime, down, loan, fixed }) + (opt.majorRepair ? t("event.house.manyRepairs") : "");
    }
    case "repair":
      return t("event.repair.detail", { cost: immediateCost(data, state, ev, { tier: opt.tier }), years: opt.freeYears });
    case "childcare":
    case "elementary":
    case "juniorHigh":
    case "highSchool":
    case "university":
      return t("event.schoolDetail", { annual: opt.annual }) + (opt.boarding ? t("event.boarding") : "");
    default:
      return money(opt.oneTime);
  }
}

function predicted(ev, choice) {
  return t("event.predicted", { money: state.savings - immediateCost(data, state, ev, choice) });
}

function button(label, sub, onClick, primary) {
  const b = document.createElement("button");
  b.className = "option" + (primary ? " primary" : "");
  b.innerHTML = `<span>${label}</span>${sub ? `<span class="sub">${sub}</span>` : ""}`;
  b.addEventListener("click", onClick);
  return b;
}

function partnerIncomeText(workStyle) {
  const rate = data.workStyles[workStyle].partnerRate;
  if (rate === 0) return t("event.workStyle.partnerIncomeZero");
  return t("event.workStyle.partnerIncome", { money: state.baseIncome.b * rate * (medianIncome(data, state.age) / medianIncome(data, state.startAge)) });
}

function openEvent(ev) {
  const d = describe(ev);
  $("#year-summary").hidden = true;
  $("#modal-illust").innerHTML = illustFor(ev.id);
  $("#modal-title").textContent = d.title;
  $("#modal-text").innerHTML = d.text;
  const box = $("#modal-options");
  const decide = (choice) => {
    $("#modal").hidden = true;
    choose(data, state, ev, choice);
    flushDiary();
    renderStatus();
    save();
    // 同じ年のイベントは続けて出す。年を進めるのは再生中だけ
    const next = nextEvent(data, state);
    flushDiary();
    if (next) openEvent(next);
    else setSpeed(speed);
  };

  // 大学は、進学先のあとに期間を選ぶ
  const durations = (tier) => {
    box.replaceChildren(
      ...data.events.university.durations.map((y) =>
        button(t("event.university.years", { n: y }), y === 6 ? t("local.years6Note") : "", () => decide({ tier, years: y })),
      ),
      button(t("event.back"), "", tiers),
    );
  };

  const tiers = () => {
    const opts = data.events[ev.id].options.map((o) => {
      const label = t("event.tierOption", { tier: t(`event.tier.${o.tier}`), label: t(`events.${ev.id}.${o.tier}.label`) });
      const sub = SCHOOL_STAGES.includes(ev.id) ? optionDetail(ev, o) : `${optionDetail(ev, o)}<br>${predicted(ev, { tier: o.tier })}`;
      return button(label, sub, () => (ev.id === "university" ? durations(o.tier) : decide({ tier: o.tier })));
    });
    if (d.yes) opts.push(button(t("event.back"), "", firstStep));
    box.replaceChildren(...opts);
  };

  const firstStep = () => {
    const e = (k, p) => t(`event.${ev.id}.${k}`, p);
    switch (ev.id) {
      case "childPlan":
        return box.replaceChildren(
          button(e("want"), "", () => decide({ plan: "want" }), true),
          button(e("notNow"), e("notNowSub"), () => decide({ plan: "not_now" })),
          button(e("never"), e("neverSub"), () => decide({ plan: "never" })),
        );
      case "workStyle":
        return box.replaceChildren(
          ...data.events.workStyle.options.map((o) =>
            button(
              t(`workStyles.${o.workStyle}.fullLabel`) + (o.workStyle === state.workStyle ? e("current") : ""),
              partnerIncomeText(o.workStyle) + (o.workStyle === "single" ? `<br>${e("singleNote")}` : ""),
              () => decide({ workStyle: o.workStyle }),
            ),
          ),
        );
      case "jobOffer":
        return box.replaceChildren(
          button(e("accept"), e("acceptSub", { pct: pct(data.random.events.jobOffer.range) }), () => decide({ accept: true })),
          button(e("decline"), e("declineSub"), () => decide({ accept: false })),
        );
      case "care": {
        const c = data.random.events.care;
        return box.replaceChildren(
          button(e("facility"), e("facilitySub", { annual: c.facilityAnnual }), () => decide({ mode: "facility" })),
          button(e("home"), e("homeSub", { annual: c.homeAnnual }), () => decide({ mode: "home" })),
        );
      }
    }
    if (!d.yes) return tiers();
    const noSub =
      ev.id === "house" ? `${t("event.house.rentSub", { rent: data.familyRent })}<br>${predicted(ev, { skip: true })}`
      : ev.id === "university" ? t("event.university.noSub")
      : predicted(ev, { skip: true });
    const opts = [button(d.yes, "", tiers, true), button(d.no, noSub, () => decide({ skip: true }))];
    if (d.never) opts.push(button(d.never, `${t("event.neverSub")}<br>${predicted(ev, { never: true })}`, () => decide({ never: true })));
    box.replaceChildren(...opts);
  };

  firstStep();
  $("#modal").hidden = false;
}

// ---- リザルト ----

const newBadge = () => `<span class="new">${t("result.new")}</span>`;

function endingOf(nw) {
  const key = state.ended === "bankrupt" ? "bankrupt" : rankOf(data, nw.total).rank;
  return { key, rank: key === "bankrupt" ? "―" : key, ending: t(`ranks.${key}.ending`), comment: t(`ranks.${key}.comment`) };
}

function lifeLines() {
  const r = (k, p) => t(`result.${k}`, p);
  const kids = state.children.length ? r("kids", { n: state.children.length }) : r("noKids");
  const home = state.house ? t(`events.house.${state.house.tier}.label`) : r("rent");
  const car = state.car ? t(`events.car.${state.car.tier}.label`) : r("noCar");
  const sep = t("main.status.listSep");
  const lines = [r(state.ended === "bankrupt" ? "lifeBankrupt" : "lifeRetire", { start: state.startAge, end: state.age }), [kids, home, car].join(sep)];
  if (state.settings.from === "solo") lines.push(r("fromSolo"));
  return lines;
}

function showResult() {
  const nw = netWorth(state);
  const ending = endingOf(nw);
  const title = titleOf(data, state);
  const achieved = achievementsOf(data, state);
  if (!state.recorded) {
    state.fresh = recordResult({ country, ending: ending.key, title, achievements: achieved, netWorth: state.ended === "retire" ? nw.total : null });
    state.recorded = true;
  }
  const fresh = state.fresh;
  const mid = compareWithMid(data, state);
  const tt = state.totals;
  const r = (k, p) => t(`result.${k}`, p);
  const row = (label, v, cls = "") => `<tr class="${cls}"><td>${label}</td><td class="num">${money(v)}</td></tr>`;
  const bankrupt = state.ended === "bankrupt";

  const spending = [
    ["living", tt.living + tt.child],
    ["education", tt.education + tt.scholarship],
    ["housing", tt.housing + tt.house + tt.repair],
    ["car", tt.car],
    ["events", tt.wedding + tt.leisure],
    ["other", tt.care + tt.medical + tt.interest],
  ];
  const maxSpend = Math.max(...spending.map(([, v]) => v), 1);
  const compare = bankrupt ? "" : `<p class="compare">${mid === null ? r("compareBankrupt") : r("compare", { mid, diff: `<strong>${signedMoneyHtml(nw.total - mid)}</strong>` })}</p>`;

  $("#result").innerHTML = `
    <div class="result-head">
      <div class="rank">${ending.rank}</div>
      <p class="ending">${ending.ending}${fresh.ending ? newBadge() : ""}</p>
      <p class="comment">${ending.comment}</p>
      <p class="title-badge"><span class="label">${r("titleLabel")}</span>${t(`titles.${title}.name`)}${fresh.title ? newBadge() : ""}<span class="sub">${t(`titles.${title}.desc`)}</span></p>
      <p class="note">${lifeLines().join("<br>")}</p>
    </div>
    <section>
      <h3>${r(bankrupt ? "netWorthBankrupt" : "netWorthRetire")}</h3>
      <table>
        ${row(r("savings"), nw.savings)}
        ${row(r("houseValue"), nw.house)}
        ${row(r("carValue"), nw.car)}
        ${row(r("loan"), -nw.loan)}
        ${row(r("netWorth"), nw.total, "total")}
      </table>
      ${compare}
    </section>
    <section>
      <h3>${r("spending")}</h3>
      <div class="bars">${spending
        .map(([k, v]) => `<div class="bar"><span class="bar-label">${r(`spendingItems.${k}`)}</span><span class="bar-track"><span class="bar-fill" style="width:${(v / maxSpend) * 100}%"></span></span><span class="num">${money(v)}</span></div>`)
        .join("")}</div>
      <p class="hint">${r("incomeNote", { income: tt.income, extra: tt.extraIncome, allowance: t("local.allowance") })}</p>
    </section>
    <section>
      <h3>${r("achievements")}</h3>
      ${achieved.length
        ? `<ul class="achievements">${achieved
            .map((id) => `<li><strong>${t(`achievements.${id}.name`)}</strong>${fresh.achievements.includes(id) ? newBadge() : ""}<span class="sub">${t(`achievements.${id}.desc`)}</span></li>`)
            .join("")}</ul>`
        : `<p class="hint">${r("noAchievements")}</p>`}
    </section>
    <section>
      <h3>${r("timeline")}</h3>
      <ol class="timeline">${state.history.map((h) => `<li><span class="age">${t("main.age", { n: h.age })}</span>${historyText(h)}</li>`).join("")}</ol>
    </section>`;
  renderShare(nw, ending, title);
  show("screen-result");
  save();
}

function signedMoneyHtml(v) {
  return `<span class="${v >= 0 ? "plus" : "minus"}">${v >= 0 ? "+" : "−"}${money(Math.abs(v))}</span>`;
}

// ---- シェア ----

async function renderShare(nw, ending, title) {
  const canvas = document.createElement("canvas");
  const bankrupt = state.ended === "bankrupt";
  drawShareCard(canvas, {
    gameName: t("meta.gameName"),
    rank: ending.rank,
    ending: ending.ending,
    titleLabel: t("result.titleLabel"),
    title: t(`titles.${title}.name`),
    netWorthLabel: t(bankrupt ? "result.netWorthBankrupt" : "result.netWorthRetire"),
    netWorth: money(nw.total),
    lines: lifeLines(),
    hashtag: t("meta.hashtag"),
  });
  const url = canvas.toDataURL("image/png");
  $("#share-preview").src = url;
  $("#btn-download").href = url;
  const blob = await canvasToBlob(canvas);
  const rank = bankrupt ? t("result.bankruptWord") : t("result.rankWord", { rank: ending.rank });
  const text = `${t("result.shareText", { ending: ending.ending, rank, title: t(`titles.${title}.name`) })} ${t("meta.hashtag")}`;
  const pageUrl = `${location.origin}/${currentLang().code}/`;
  $("#btn-post").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}`;
  const file = blob && new File([blob], "newlywed-diary.png", { type: "image/png" });
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  $("#btn-share").hidden = !canShare;
  $("#btn-share").onclick = () => navigator.share({ files: [file], text }).catch(() => {});
}

// ---- エンディング図鑑 ----

function showGallery() {
  const rec = loadRecords();
  const best = rec.bestByCountry[country] ?? null; // 最高の純資産は、いまの国の記録だけを出す
  const g = (k, p) => t(`gallery.${k}`, p);
  const endings = [...data.ranks.map((x) => x.rank), "bankrupt"];
  const count = (ids, seen) => `${ids.filter((x) => seen[x]).length} / ${ids.length}`;
  const locked = g("locked");
  $("#gallery").innerHTML = `
    <p class="note">${g("plays", { n: rec.plays })}${best !== null ? g("best", { money: best }) : ""}</p>
    <section>
      <h3>${g("endings")} <span class="count">${count(endings, rec.endings)}</span></h3>
      <ul class="cards">${endings
        .map((k) => (rec.endings[k] ? `<li><span class="card-rank">${k === "bankrupt" ? "―" : k}</span>${t(`ranks.${k}.ending`)}</li>` : `<li class="locked"><span class="card-rank">?</span>${locked}</li>`))
        .join("")}</ul>
    </section>
    <section>
      <h3>${g("titles")} <span class="count">${count(data.titles, rec.titles)}</span></h3>
      <ul class="cards">${data.titles
        .map((id) => (rec.titles[id] ? `<li><strong>${t(`titles.${id}.name`)}</strong><span class="sub">${t(`titles.${id}.desc`)}</span></li>` : `<li class="locked">${locked}</li>`))
        .join("")}</ul>
    </section>
    <section>
      <h3>${g("achievements")} <span class="count">${count(data.achievements, rec.achievements)}</span></h3>
      <ul class="achievements">${data.achievements
        .map((id) => `<li class="${rec.achievements[id] ? "" : "locked"}"><strong>${rec.achievements[id] ? t(`achievements.${id}.name`) : locked}</strong><span class="sub">${t(`achievements.${id}.desc`)}</span></li>`)
        .join("")}</ul>
    </section>`;
  show("screen-gallery");
}

// ---- 設定 ----

const settingsForm = $("#settings-form");

function showSettings() {
  settingsForm.yearSummary.checked = settings.yearSummary;
  settingsForm.speed.value = String(settings.speed);
  settingsForm.lang.value = currentLang().code;
  show("screen-settings");
}

settingsForm.addEventListener("change", (e) => {
  if (e.target.name === "lang") return goToLang(e.target.value);
  settings = { ...settings, yearSummary: settingsForm.yearSummary.checked, speed: Number(settingsForm.speed.value) };
  writeSettings(settings);
});

$("#btn-clear").addEventListener("click", () => {
  if (!confirm(t("settings.confirm"))) return;
  clearAll();
  settings = loadSettings();
  showSettings();
});

$("#btn-start").addEventListener("click", () => showSetup());
$("#btn-continue").addEventListener("click", continueGame);
$("#btn-again").addEventListener("click", () => showSetup());
$("#btn-gallery").addEventListener("click", showGallery);
$("#btn-settings").addEventListener("click", showSettings);

// 一人暮らし日記の結果から来たときは、その国で引き継いだ開始設定から始める。まだない国のデータなら引き継がない
const params = new URLSearchParams(location.search);
const soloCountry = handoffCountry(params);
const browserLang = (navigator.languages && navigator.languages[0]) || navigator.language || "";
await setCountry(isCountry(soloCountry) ? soloCountry : initialCountry(pageLang(), { hash: location.hash, browserLang }));
const fromSolo = parseHandoff(data, params);
if (fromSolo) showSetup(fromSolo);
else showTitle();
