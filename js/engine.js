// ゲームロジック。DOM に依存しないので、ブラウザとシミュレーション（tools/simulate.mjs）の両方から使う。
// 金額の単位はすべて万円。

export const SAVE_VERSION = 1;

// ---- 乱数（シード付き。状態に乱数の内部値を持たせるので、途中保存しても同じ人生を再現できる） ----

export function rand(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state, min, max) {
  return min + Math.floor(rand(state) * (max - min + 1));
}

export function newSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

// ---- 開始設定 ----

// 年齢の年収の中央値（額面）。表にない年齢は前後の値から直線で補う
export function medianIncome(data, age) {
  const points = Object.entries(data.medianIncomeByAge)
    .map(([a, v]) => [Number(a), v])
    .sort((x, y) => x[0] - y[0]);
  if (age <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [a1, v1] = points[i];
    if (age <= a1) {
      const [a0, v0] = points[i - 1];
      return v0 + ((v1 - v0) * (age - a0)) / (a1 - a0);
    }
  }
  return points[points.length - 1][1];
}

const round10 = (v) => Math.round(v / 10) * 10;

export function defaultSettings(data) {
  const age = 28;
  const income = round10(medianIncome(data, age));
  return {
    genders: { a: "female", b: "male" },
    age,
    savings: 200,
    income: { a: income, b: income },
    workStyle: "fulltime_both",
  };
}

export function randomSettings(data, seed) {
  const s = { rng: seed >>> 0 };
  const age = randInt(s, data.startAge.min, data.startAge.max);
  const median = medianIncome(data, age);
  const genders = ["female", "male"];
  return {
    genders: { a: genders[randInt(s, 0, 1)], b: genders[randInt(s, 0, 1)] },
    age,
    savings: randInt(s, data.startSavings.min / 10, data.startSavings.max / 10) * 10,
    income: {
      a: round10(median * (0.7 + rand(s) * 0.6)),
      b: round10(median * (0.7 + rand(s) * 0.6)),
    },
    workStyle: Object.keys(data.workStyles)[randInt(s, 0, Object.keys(data.workStyles).length - 1)],
  };
}

export function createGame(data, settings, seed = newSeed()) {
  const state = {
    version: SAVE_VERSION,
    seed,
    rng: seed >>> 0,
    year: 0, // 結婚してからの年数。結婚した年が 0
    startAge: settings.age,
    age: settings.age,
    savings: settings.savings,
    genders: { ...settings.genders },
    baseIncome: { ...settings.income },
    workStyle: settings.workStyle,
    weddingDone: false,
    childPlan: null, // want / not_now / never
    childAskAt: 0,
    children: [],
    car: null,
    carNever: false,
    carNextAt: 0,
    house: null,
    houseNever: false,
    houseNextAge: 0,
    rentMode: "starter", // starter（新婚の賃貸） / family（家族向けの賃貸）
    movedToFamilyRent: false,
    loan: null,
    repairFreeUntil: 0,
    riskRolledYear: -1,
    repairPending: false,
    totals: { wedding: 0, car: 0, house: 0, repair: 0, child: 0, living: 0, housing: 0, interest: 0, income: 0 },
    history: [],
    ended: null, // retire / bankrupt
  };
  const [y0, y1] = data.events.car.firstYear;
  state.carNextAt = randInt(state, y0, y1);
  addHistory(state, "結婚した。");
  return state;
}

function addHistory(state, text) {
  state.history.push({ age: state.age, text });
}

// ---- イベント ----

// 今年まだ処理していないイベントを1つ返す。なければ null（年末へ進む）
export function nextEvent(data, state) {
  if (state.ended) return null;
  if (!state.weddingDone) return { id: "wedding" };

  const askChild =
    state.children.length < data.maxChildren &&
    (state.childPlan === null || (state.childPlan === "not_now" && state.year >= state.childAskAt));
  if (askChild) return { id: "childPlan" };

  if (!state.carNever && state.year >= state.carNextAt) {
    if (!state.car) return { id: "car", replace: false };
    if (state.year - state.car.boughtYear >= state.car.years) return { id: "car", replace: true };
  }

  const [h0, h1] = data.events.house.ageRange;
  if (!state.house && !state.houseNever && state.age >= h0 && state.age <= h1 && state.age >= state.houseNextAge) {
    return { id: "house" };
  }

  if (state.house && state.riskRolledYear !== state.year) {
    state.riskRolledYear = state.year;
    if (state.year >= state.repairFreeUntil && rand(state) < houseOption(data, state).repairChance) {
      state.repairPending = true;
    }
  }
  if (state.repairPending) return { id: "repair" };

  return null;
}

function houseOption(data, state) {
  return data.events.house.options.find((o) => o.tier === state.house.tier);
}

export function carValue(car, year) {
  const owned = Math.min(1, (year - car.boughtYear) / car.years);
  return car.price - (car.price - car.resale) * owned;
}

export function loanPayment(principal, rate, years) {
  if (rate === 0) return principal / years;
  return (principal * rate) / (1 - Math.pow(1 + rate, -years));
}

// 選んだ場合にその場で貯金がいくら増減するか（ボタンの予測値の表示用）
export function immediateCost(data, state, event, choice) {
  const ev = data.events[event.id];
  const resale = event.id === "car" && event.replace ? carValue(state.car, state.year) : 0;
  if (!choice.tier) return -resale;
  const opt = ev.options.find((o) => o.tier === choice.tier);
  switch (event.id) {
    case "wedding":
      return opt.oneTime - opt.gift;
    case "car":
      return opt.oneTime - resale;
    case "house":
      return opt.oneTime * data.events.house.downPaymentRate;
    default:
      return opt.oneTime;
  }
}

// choice は { tier } / { skip: true } / { never: true } / { plan }（子どもを望むか）
export function choose(data, state, event, choice) {
  const ev = data.events[event.id];
  const opt = choice.tier ? ev.options.find((o) => o.tier === choice.tier) : null;
  const cost = event.id === "childPlan" ? 0 : immediateCost(data, state, event, choice);
  state.savings -= cost;

  switch (event.id) {
    case "wedding":
      state.weddingDone = true;
      state.totals.wedding += cost;
      addHistory(state, opt ? opt.diary : ev.skipDiary);
      break;

    case "childPlan":
      state.childPlan = choice.plan;
      if (choice.plan === "not_now") state.childAskAt = state.year + data.reproposeAfter;
      addHistory(
        state,
        { want: "子どもを望むことにした。", not_now: "子どもはもう少し先に考えることにした。", never: "ふたりで生きていくと決めた。" }[choice.plan],
      );
      break;

    case "car": {
      if (event.replace) addHistory(state, `乗っていた車を${Math.round(carValue(state.car, state.year))}万円で手放した。`);
      state.totals.car += cost;
      if (opt) {
        state.car = { tier: opt.tier, price: opt.oneTime, resale: opt.resale, years: opt.years, annual: opt.annual, breakdownChance: opt.breakdownChance, boughtYear: state.year };
        addHistory(state, opt.diary);
      } else {
        state.car = null;
        if (choice.never) {
          state.carNever = true;
          addHistory(state, ev.neverDiary);
        } else {
          state.carNextAt = state.year + data.reproposeAfter;
          addHistory(state, ev.skipDiary);
        }
      }
      break;
    }

    case "house":
      if (opt) {
        const principal = opt.oneTime * (1 - ev.downPaymentRate);
        state.house = { tier: opt.tier, value: opt.oneTime, price: opt.oneTime };
        state.loan = { balance: principal, payment: loanPayment(principal, ev.loanRate, ev.loanYears), rate: ev.loanRate };
        state.totals.house += cost;
        addHistory(state, opt.diary);
      } else {
        state.rentMode = "family";
        if (choice.never) {
          state.houseNever = true;
          addHistory(state, ev.neverDiary);
        } else {
          state.houseNextAge = state.age + data.reproposeAfter;
          if (!state.movedToFamilyRent) addHistory(state, ev.skipDiary);
          else addHistory(state, "今回も家は見送った。");
        }
        state.movedToFamilyRent = true;
      }
      break;

    case "repair":
      state.repairPending = false;
      state.repairFreeUntil = state.year + opt.freeYears;
      state.totals.repair += cost;
      addHistory(state, opt.diary);
      break;
  }
}

// ---- 年末の収支 ----

export function childLivingCost(data, age) {
  if (age >= data.childIndependentAge) return 0;
  const band = data.childLiving.find((b) => age <= b.maxAge);
  return band ? band.annual : 0;
}

export function housingCost(data, state) {
  if (state.house) {
    const a = houseOption(data, state).annual;
    return Object.values(a).reduce((x, y) => x + y, 0);
  }
  return state.rentMode === "family" ? data.familyRent : data.starterRent;
}

export function yearIncome(data, state) {
  const ratio = medianIncome(data, state.age) / medianIncome(data, state.startAge);
  const partnerRate = data.workStyles[state.workStyle].partnerRate;
  const gross = (state.baseIncome.a + state.baseIncome.b * partnerRate) * ratio;
  return gross * data.takeHomeRate;
}

// 1年分の収支を計算して年齢を進める。表示用に内訳を返す
export function endYear(data, state) {
  const notes = [];
  const income = yearIncome(data, state);
  const dependents = state.children.filter((c) => c.age < data.childIndependentAge).length;

  const items = {
    living: data.baseLiving,
    child: state.children.reduce((sum, c) => sum + childLivingCost(data, c.age), 0),
    housing: housingCost(data, state),
    loan: 0,
    car: state.car ? state.car.annual : dependents > 0 ? data.noCarCostWithChildren : 0,
    breakdown: 0,
    interest: state.savings < 0 ? -state.savings * data.cardLoanRate : 0,
  };

  if (state.loan && state.loan.balance > 0) {
    const interest = state.loan.balance * state.loan.rate;
    const pay = Math.min(state.loan.payment, state.loan.balance + interest);
    state.loan.balance = Math.max(0, state.loan.balance + interest - pay);
    items.loan = pay;
    if (state.loan.balance === 0) notes.push("住宅ローンを払い終えた。");
  }

  if (state.car && rand(state) < state.car.breakdownChance) {
    const [c0, c1] = data.events.car.breakdownCost;
    items.breakdown = randInt(state, c0, c1);
    notes.push(`車が故障して、修理に${items.breakdown}万円かかった。`);
  }

  const expense = Object.values(items).reduce((x, y) => x + y, 0);
  state.savings += income - expense;

  state.totals.income += income;
  state.totals.living += items.living;
  state.totals.child += items.child;
  state.totals.housing += items.housing + items.loan;
  state.totals.car += items.car + items.breakdown;
  state.totals.interest += items.interest;

  if (state.house) state.house.value *= 1 - houseOption(data, state).depreciation;

  for (const c of state.children) {
    c.age += 1;
    if (c.age === data.childIndependentAge) notes.push("子どもが独立した。");
  }
  if (state.childPlan === "want" && state.children.length < data.maxChildren && rand(state) < data.childBirthChancePerYear) {
    state.children.push({ age: 0 });
    notes.push("子どもが生まれた。");
  }

  for (const text of notes) addHistory(state, text);
  const closedAge = state.age;
  state.age += 1;
  state.year += 1;

  if (state.savings < data.bankruptLine) {
    state.ended = "bankrupt";
    addHistory(state, "家計が破綻した。");
  } else if (state.age >= data.retireAge) {
    state.ended = "retire";
    addHistory(state, "定年を迎えた。");
  }

  return { age: closedAge, income, items, expense, delta: income - expense, savings: state.savings, notes };
}

// ---- 結果 ----

export function netWorth(state) {
  const house = state.house ? state.house.value : 0;
  const car = state.car ? carValue(state.car, state.year) : 0;
  const loan = state.loan ? state.loan.balance : 0;
  return { savings: state.savings, house, car, loan, total: state.savings + house + car - loan };
}

export function rankOf(data, total) {
  return data.ranks.find((r) => r.min === null || total >= r.min);
}

// 自動プレイ用。毎回同じ方針で選ぶ
export function autoChoice(data, state, event, strategy) {
  if (event.id === "childPlan") return { plan: "want" };
  const tier = strategy === "random" ? ["high", "mid", "low"][randInt(state, 0, 2)] : strategy;
  return { tier };
}

export function playToEnd(data, settings, seed, strategy) {
  const state = createGame(data, settings, seed);
  let guard = 0;
  while (!state.ended && guard++ < 1000) {
    const ev = nextEvent(data, state);
    if (ev) choose(data, state, ev, autoChoice(data, state, ev, strategy));
    else endYear(data, state);
  }
  return state;
}
