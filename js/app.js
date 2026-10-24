// 画面の操作。ゲームの計算は engine.js にまかせる。
import {
  SAVE_VERSION,
  SCHOOL_STAGES,
  carValue,
  choose,
  createGame,
  defaultSettings,
  downPayment,
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
  shown = 0;
  flushDiary();
  addDiary(
    state.age,
    `貯金${man(state.savings)}、年収はふたりで${man(settings.income.a + settings.income.b)}。${data.workStyles[state.workStyle].fullLabel}でスタート。`,
  );
  enterMain();
}

function continueGame() {
  state = load();
  if (!state) return showTitle();
  $("#diary").replaceChildren();
  shown = 0;
  flushDiary();
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

// まだ日記に書いていない出来事を書く
let shown = 0;
function flushDiary() {
  for (const h of state.history.slice(shown)) addDiary(h.age, h.text);
  shown = state.history.length;
}

function renderStatus() {
  const kids = state.children.length ? state.children.map((c) => (c.independent ? "独立" : `${c.age}歳`)).join("・") : "なし";
  const car = state.car ? data.events.car.options.find((o) => o.tier === state.car.tier).label : "なし";
  const home = state.house
    ? data.events.house.options.find((o) => o.tier === state.house.tier).label
    : state.rentMode === "family" ? "賃貸（家族向け）" : "賃貸";
  const items = [
    ["年齢", `${state.age}歳`],
    ["結婚", `${state.year + 1}年目`],
    ["貯金", man(state.savings), "savings" + (state.savings < 0 ? " minus" : "")],
    ["働き方", data.workStyles[state.workStyle].label + (state.care ? "・介護中" : "")],
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
  flushDiary(); // 選択のないランダムイベントは nextEvent の中で起きる
  if (ev) {
    stop();
    renderStatus();
    openEvent(ev);
    return;
  }
  const r = endYear(data, state);
  const cls = r.delta >= 0 ? "plus" : "minus";
  addDiary(
    r.age,
    "年末",
    `収入 ${Math.round(r.income).toLocaleString()}・支出 ${Math.round(r.expense).toLocaleString()}（<span class="${cls}">${signed(r.delta)}</span>）→ ${man(r.savings)}`,
  );
  flushDiary();
  renderStatus();
  save();
  if (state.ended) {
    stop();
    setTimeout(showResult, 800);
  }
}

// ---- イベント ----

const TIER_LABEL = { high: "高い", mid: "普通", low: "安い" };
const LATER = "今は買わない（3年後にまた考える）";

function childName(i) {
  return state.children.length > 1 ? `${i + 1}人目の子ども` : "子ども";
}

function describe(ev) {
  switch (ev.id) {
    case "wedding":
      return { title: "結婚式", text: "結婚式を挙げますか？", yes: "やる", no: "やらない" };
    case "honeymoon":
      return { title: "新婚旅行", text: "新婚旅行に行きますか？", yes: "行く", no: "行かない" };
    case "childPlan":
      return state.children.length
        ? { title: "子ども", text: `子どもは${state.children.length}人。もうひとり望みますか？` }
        : { title: "子ども", text: "子どもを望みますか？望む場合は、毎年一定の確率で生まれます。" };
    case "workStyle": {
      const why = { birth: "子どもが生まれた。", elementary: "末っ子が小学校に入学する。", juniorHigh: "末っ子が中学校に入学する。" }[ev.reason];
      return { title: "働き方の見直し", text: `${why}パートナーの働き方をどうしますか？（今は${data.workStyles[state.workStyle].fullLabel}）` };
    }
    case "childcare":
      return { title: "保育", text: `${childName(ev.child)}の0〜5歳の預け先を決めます。` };
    case "elementary":
      return { title: "小学校", text: `${childName(ev.child)}が小学校に入学します（6年間）。` };
    case "juniorHigh":
      return { title: "中学校", text: `${childName(ev.child)}が中学校に入学します（3年間）。` };
    case "highSchool":
      return { title: "高校", text: `${childName(ev.child)}が高校に進学します（3年間）。` };
    case "university":
      return { title: "大学", text: `${childName(ev.child)}は高校を卒業します。進学しますか？`, yes: "進学する", no: "就職する" };
    case "car":
      return ev.replace
        ? { title: "車の買い替え", text: `車を買って${state.year - state.car.boughtYear}年。今の車を${man(carValue(state.car, state.year))}で手放して、新しい車を買いますか？`, yes: "買う", no: LATER, never: "生涯持たない" }
        : { title: "車の購入", text: "車を買いますか？", yes: "買う", no: LATER, never: "生涯持たない" };
    case "house":
      return { title: "マイホーム", text: `家を買いますか？頭金は20%（貯金が足りなければ貯金の範囲）、残りは35年ローン（金利1.5%）で返します。買わない場合は家族向けの広い賃貸（年${data.familyRent}万円）に住みます。`, yes: "買う", no: LATER, never: "生涯賃貸" };
    case "repair":
      return { title: "家の修繕", text: "家のあちこちが傷んできた。どう直しますか？" };
    case "familyTrip":
      return { title: "家族旅行・記念日", text: `結婚${state.year}年目の記念日。旅行に行きますか？`, yes: "行く", no: "行かない" };
    case "jobOffer":
      return { title: "転職の誘い", text: "主人公に転職の誘いがきた。年収は上がるかもしれないし、下がるかもしれない（±20%）。" };
    case "care":
      return { title: "親の介護", text: `親の介護が必要になった（${ev.years}年の見込み）。どうしますか？` };
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
      const down = downPayment(data, state, opt.oneTime);
      const loan = loanPayment(opt.oneTime - down, h.loanRate, h.loanYears);
      const fixed = Object.values(opt.annual).reduce((x, y) => x + y, 0);
      return `${man(opt.oneTime)}（頭金 ${man(down)}）・ローン 年${Math.round(loan)}万円・固定費 年${fixed}万円${opt.majorRepair ? "・修繕が多い" : ""}`;
    }
    case "repair":
      return `${man(immediateCost(data, state, ev, { tier: opt.tier }))}・次に傷むまで${opt.freeYears}年`;
    case "childcare":
    case "elementary":
    case "juniorHigh":
    case "highSchool":
    case "university":
      return `年${opt.annual}万円${opt.boarding ? "（下宿・生活費こみ）" : ""}`;
    default:
      return man(opt.oneTime);
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

function partnerIncomeText(workStyle) {
  const rate = data.workStyles[workStyle].partnerRate;
  if (rate === 0) return "パートナーの年収 0";
  return `パートナーの年収 約${man(state.baseIncome.b * rate * (medianIncome(data, state.age) / medianIncome(data, state.startAge)))}`;
}

function openEvent(ev) {
  const d = describe(ev);
  $("#modal-title").textContent = d.title;
  $("#modal-text").textContent = d.text;
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
      ...data.events.university.durations.map((y) => button(`${y}年`, y === 6 ? "医学部・薬学部・大学院（修士）など" : "", () => decide({ tier, years: y }))),
      button("戻る", "", tiers),
    );
  };

  const tiers = () => {
    const opts = data.events[ev.id].options.map((o) => {
      const sub = SCHOOL_STAGES.includes(ev.id) ? optionDetail(ev, o) : `${optionDetail(ev, o)}<br>${predicted(ev, { tier: o.tier })}`;
      return button(`${TIER_LABEL[o.tier]}：${o.label}`, sub, () => (ev.id === "university" ? durations(o.tier) : decide({ tier: o.tier })));
    });
    if (d.yes) opts.push(button("戻る", "", firstStep));
    box.replaceChildren(...opts);
  };

  const firstStep = () => {
    switch (ev.id) {
      case "childPlan":
        return box.replaceChildren(
          button("望む", "", () => decide({ plan: "want" }), true),
          button("今は望まない", "3年後にまた考える", () => decide({ plan: "not_now" })),
          button("生涯持たない", "以降は聞かれません", () => decide({ plan: "never" })),
        );
      case "workStyle":
        return box.replaceChildren(
          ...data.events.workStyle.options.map((o) =>
            button(
              data.workStyles[o.workStyle].fullLabel + (o.workStyle === state.workStyle ? "（今のまま）" : ""),
              partnerIncomeText(o.workStyle) + (o.workStyle === "single" ? "<br>復帰するとき、離れていた年数ぶん年収が下がる" : ""),
              () => decide({ workStyle: o.workStyle }),
            ),
          ),
        );
      case "jobOffer":
        return box.replaceChildren(
          button("転職する", "年収が −20%〜+20% のどこかに変わる", () => decide({ accept: true })),
          button("断る", "年収はそのまま", () => decide({ accept: false })),
        );
      case "care": {
        const c = data.random.events.care;
        return box.replaceChildren(
          button("施設に入ってもらう", `年${c.facilityAnnual}万円`, () => decide({ mode: "facility" })),
          button("家で介護する", `年${c.homeAnnual}万円・パートナーは介護のあいだ仕事を離れる`, () => decide({ mode: "home" })),
        );
      }
    }
    if (!d.yes) return tiers();
    const noSub = ev.id === "house" ? `家賃 年${data.familyRent}万円<br>${predicted(ev, { skip: true })}` : ev.id === "university" ? "18歳で独立。仕送りをもらえる確率が上がる" : predicted(ev, { skip: true });
    const opts = [button(d.yes, "", tiers, true), button(d.no, noSub, () => decide({ skip: true }))];
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
        ${row("その他の収入（児童手当・仕送り・臨時収入）", t.extraIncome)}
        ${row("基本生活費", t.living)}
        ${row("子ども生活費", t.child)}
        ${row("教育費（保育〜大学）", t.education)}
        ${row("奨学金の肩代わり", t.scholarship)}
        ${row("住居費（家賃・ローン・固定費・修繕）", t.housing + t.house + t.repair)}
        ${row("車（購入・維持・故障）", t.car)}
        ${row("結婚式", t.wedding)}
        ${row("旅行", t.leisure)}
        ${row("介護", t.care)}
        ${row("医療費", t.medical)}
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
