// ゲームロジック。DOM に依存しないので、ブラウザとシミュレーション（tools/simulate.mjs）の両方から使う。
// 金額の単位はすべて万円。

export const SAVE_VERSION = 3;

export const SCHOOL_STAGES = ["childcare", "elementary", "juniorHigh", "highSchool", "university"];
const STAGE_START_AGE = { childcare: 0, elementary: 6, juniorHigh: 12, highSchool: 15, university: 18 };

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
  const styles = Object.keys(data.workStyles);
  return {
    genders: { a: genders[randInt(s, 0, 1)], b: genders[randInt(s, 0, 1)] },
    age,
    savings: randInt(s, data.startSavings.min / 10, data.startSavings.max / 10) * 10,
    income: {
      a: round10(median * (0.7 + rand(s) * 0.6)),
      b: round10(median * (0.7 + rand(s) * 0.6)),
    },
    workStyle: styles[randInt(s, 0, styles.length - 1)],
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
    blankYears: 0, // パートナーが片働きで仕事を離れている年数
    weddingDone: false,
    honeymoonDone: false,
    childPlan: null, // want / not_now / never
    childAskAt: 0,
    children: [],
    queue: [], // 条件を満たして順番待ちのイベント（働き方の見直し・進学・ランダムイベントの選択）
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
    tripDoneYear: -1,
    randomRolledYear: -1,
    bonusCutYear: -1,
    care: null,
    careCount: 0,
    totals: {
      income: 0, extraIncome: 0, living: 0, child: 0, education: 0, housing: 0, house: 0, repair: 0,
      car: 0, wedding: 0, leisure: 0, care: 0, medical: 0, scholarship: 0, interest: 0,
    },
    choices: { high: 0, mid: 0, low: 0 }, // 称号用に、高い／普通／安いを選んだ回数を数える
    // 実績用の記録
    flags: { minSavings: settings.savings, maxWindfall: 0, homeCare: false, jobUp: false, loanPaidOff: false },
    settings: { ...settings, genders: { ...settings.genders }, income: { ...settings.income } },
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

const pick = (state, [min, max]) => randInt(state, min, max);

// ---- イベント ----

// 今年まだ処理していないイベントを1つ返す。なければ null（年末へ進む）
// ランダムイベントの抽選もここで年に1回行う。選択のないランダムイベントはその場で処理して日記に書く
export function nextEvent(data, state) {
  if (state.ended) return null;
  if (!state.weddingDone) return { id: "wedding" };
  if (!state.honeymoonDone) return { id: "honeymoon" };

  const askChild =
    state.children.length < data.maxChildren &&
    (state.childPlan === null || (state.childPlan === "not_now" && state.year >= state.childAskAt));
  if (askChild) return { id: "childPlan" };

  if (state.queue.length) return state.queue[0];

  if (!state.carNever && state.year >= state.carNextAt) {
    if (!state.car) return { id: "car", replace: false };
    if (state.year - state.car.boughtYear >= state.car.years) return { id: "car", replace: true };
  }

  const [h0, h1] = data.events.house.ageRange;
  if (!state.house && !state.houseNever && state.age >= h0 && state.age <= h1 && state.age >= state.houseNextAge) {
    return { id: "house" };
  }

  if (state.year > 0 && state.year % data.events.familyTrip.every === 0 && state.tripDoneYear !== state.year) {
    return { id: "familyTrip" };
  }

  if (state.randomRolledYear !== state.year) {
    state.randomRolledYear = state.year;
    if (rand(state) < data.random.chancePerYear) {
      const ev = rollRandomEvent(data, state);
      if (ev) {
        state.queue.push(ev);
        return ev;
      }
    }
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

function isWorking(data, state, who) {
  return who === "a" || data.workStyles[state.workStyle].partnerRate > 0;
}

// ランダムイベントを1つ選ぶ。選択のあるものはイベントを返し、ないものはその場で処理して null を返す
function rollRandomEvent(data, state) {
  const defs = data.random.events;
  const eligible = Object.entries(defs).filter(([id, d]) => {
    if (id === "care") return !state.care && state.careCount < d.max && state.age >= d.minAge;
    if (id === "jobOffer" || id === "promotion" || id === "bonusCut") return state.age < 60;
    return true;
  });
  const total = eligible.reduce((s, [, d]) => s + d.weight, 0);
  let r = rand(state) * total;
  const [id, def] = eligible.find(([, d]) => (r -= d.weight) < 0) ?? eligible[eligible.length - 1];

  switch (id) {
    case "promotion": {
      const who = isWorking(data, state, "b") && rand(state) < 0.5 ? "b" : "a";
      state.baseIncome[who] *= 1 + def.rate;
      addHistory(state, `${who === "a" ? "主人公" : "パートナー"}が昇進した。年収が${Math.round(def.rate * 100)}%上がった。`);
      return null;
    }
    case "illness": {
      const cost = pick(state, def.cost);
      state.savings -= cost;
      state.totals.medical += cost;
      state.flags.minSavings = Math.min(state.flags.minSavings, state.savings);
      addHistory(state, `${rand(state) < 0.5 ? "主人公" : "パートナー"}が体調をくずして入院した。医療費は${cost}万円。`);
      return null;
    }
    case "bonusCut":
      state.bonusCutYear = state.year;
      addHistory(state, "会社の業績が悪く、ボーナスが減った。今年の手取りは1割減る。");
      return null;
    case "windfall": {
      const amount = Math.round(def.min + (def.max - def.min) * Math.pow(rand(state), 3));
      state.savings += amount;
      state.totals.extraIncome += amount;
      state.flags.maxWindfall = Math.max(state.flags.maxWindfall, amount);
      addHistory(state, amount >= 200 ? `親戚から相続があった。${amount}万円が入った。` : `宝くじが当たった。${amount}万円！`);
      return null;
    }
    case "jobOffer":
      return { id: "jobOffer" };
    case "care":
      return { id: "care", years: pick(state, def.years) };
  }
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

// 家の頭金。価格の20%を払うが、貯金が足りなければ貯金の範囲で払い、残りはローンにする
export function downPayment(data, state, price) {
  return Math.min(price * data.events.house.downPaymentRate, Math.max(0, state.savings));
}

// 選んだ場合にその場で貯金がいくら減るか（ボタンの予測値の表示用）。毎年かかる費用は含まない
export function immediateCost(data, state, event, choice) {
  const ev = data.events[event.id];
  const resale = event.id === "car" && event.replace ? carValue(state.car, state.year) : 0;
  if (!ev || !ev.options || !choice.tier || SCHOOL_STAGES.includes(event.id) || event.id === "workStyle") return -resale;
  const opt = ev.options.find((o) => o.tier === choice.tier);
  switch (event.id) {
    case "wedding":
      return opt.oneTime - opt.gift;
    case "car":
      return opt.oneTime - resale;
    case "house":
      return downPayment(data, state, opt.oneTime);
    case "repair":
      return opt.oneTime * houseOption(data, state).repairCostRate;
    default:
      return opt.oneTime;
  }
}

// パートナーの働き方を変える。片働きから戻るときは、離れていた年数に応じて年収を下げる
function setWorkStyle(data, state, workStyle) {
  if (state.workStyle === "single" && workStyle !== "single" && state.blankYears > 0) {
    const penalty = Math.min(data.maxBlankPenalty, data.blankPenaltyPerYear * state.blankYears);
    state.baseIncome.b *= 1 - penalty;
    addHistory(state, `パートナーが${state.blankYears}年ぶりに仕事に戻った。年収はブランクのぶん${Math.round(penalty * 100)}%下がった。`);
    state.blankYears = 0;
  }
  state.workStyle = workStyle;
}

function queueOnce(state, event) {
  const same = (e) => e.id === event.id && e.child === event.child;
  if (!state.queue.some(same)) state.queue.push(event);
}

// choice は { tier } / { skip: true } / { never: true } / { plan } / { workStyle } / { accept } / { mode } / 大学は { tier, years }
export function choose(data, state, event, choice) {
  const head = state.queue[0];
  if (head && head.id === event.id && head.child === event.child) state.queue.shift();

  const ev = data.events[event.id];
  const opt = choice.tier && ev?.options ? ev.options.find((o) => o.tier === choice.tier) : null;
  if (opt) state.choices[opt.tier] += 1;
  const cost = immediateCost(data, state, event, choice);
  state.savings -= cost;
  state.flags.minSavings = Math.min(state.flags.minSavings, state.savings);

  switch (event.id) {
    case "wedding":
      state.weddingDone = true;
      state.totals.wedding += cost;
      addHistory(state, opt ? opt.diary : ev.skipDiary);
      break;

    case "honeymoon":
    case "familyTrip":
      if (event.id === "honeymoon") state.honeymoonDone = true;
      else state.tripDoneYear = state.year;
      state.totals.leisure += cost;
      addHistory(state, opt ? opt.diary : ev.skipDiary);
      break;

    case "childPlan":
      state.childPlan = choice.plan;
      if (choice.plan === "not_now") state.childAskAt = state.year + data.reproposeAfter;
      addHistory(
        state,
        state.children.length
          ? { want: "もうひとり子どもを望むことにした。", not_now: "次の子どもは、もう少し先に考えることにした。", never: "子どもはこれで最後にすると決めた。" }[choice.plan]
          : { want: "子どもを望むことにした。", not_now: "子どもはもう少し先に考えることにした。", never: "ふたりで生きていくと決めた。" }[choice.plan],
      );
      break;

    case "workStyle": {
      const o = ev.options.find((x) => x.workStyle === choice.workStyle);
      state.choices[o.tier] += 1;
      if (choice.workStyle !== state.workStyle) {
        setWorkStyle(data, state, choice.workStyle);
        addHistory(state, o.diary);
      } else addHistory(state, "働き方は今のままにした。");
      break;
    }

    case "childcare":
    case "elementary":
    case "juniorHigh":
    case "highSchool":
    case "university": {
      const child = state.children[event.child];
      if (event.id === "university") {
        const years = choice.years ?? ev.durations[0];
        if (opt) {
          child.choices.university = opt.tier;
          child.boarding = !!opt.boarding;
          child.independentAge = STAGE_START_AGE.university + years;
          addHistory(state, `${opt.diary}（${years}年）`);
        } else {
          child.choices.university = "none";
          child.independentAge = STAGE_START_AGE.university;
          addHistory(state, ev.skipDiary);
          independence(data, state, child);
        }
      } else {
        child.choices[event.id] = opt.tier;
        addHistory(state, opt.diary);
      }
      break;
    }

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
        const principal = opt.oneTime - cost;
        state.house = { tier: opt.tier, value: opt.oneTime, price: opt.oneTime, boughtYear: state.year };
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
          addHistory(state, state.movedToFamilyRent ? "今回も家は見送った。" : ev.skipDiary);
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

    case "jobOffer": {
      if (choice.accept) {
        const range = data.random.events.jobOffer.range;
        const change = (rand(state) * 2 - 1) * range;
        state.baseIncome.a *= 1 + change;
        if (change > 0) state.flags.jobUp = true;
        addHistory(state, `転職した。年収は${change >= 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}%になった。`);
      } else addHistory(state, "転職の誘いは断った。");
      break;
    }

    case "care": {
      const def = data.random.events.care;
      state.careCount += 1;
      const home = choice.mode === "home";
      if (home) state.flags.homeCare = true;
      state.care = { mode: choice.mode, annual: home ? def.homeAnnual : def.facilityAnnual, untilYear: state.year + event.years, prevWorkStyle: state.workStyle };
      if (home && state.workStyle !== "single") {
        state.workStyle = "single";
        addHistory(state, `親の介護が始まった。パートナーが仕事を離れて、家で介護することにした（${event.years}年の見込み）。`);
      } else if (home) {
        addHistory(state, `親の介護が始まった。家で介護することにした（${event.years}年の見込み）。`);
      } else {
        addHistory(state, `親の介護が始まった。施設に入ってもらうことにした（${event.years}年の見込み）。`);
      }
      break;
    }
  }
}

// ---- 年末の収支 ----

export function childLivingCost(data, child) {
  if (child.independent) return 0;
  if (child.age >= STAGE_START_AGE.university) return child.boarding ? 0 : data.universityLiving;
  const band = data.childLiving.find((b) => child.age <= b.maxAge);
  return band ? band.annual : 0;
}

// 夫婦の基本生活費。結婚してから毎年少しずつ上がる（暮らしの水準が上がっていく）
export function baseLiving(data, state) {
  return data.baseLiving * Math.pow(1 + data.livingGrowthPerYear, state.year);
}

// 児童手当（高校生まで）
export function childAllowance(data, child) {
  const band = data.childAllowance.find((b) => child.age <= b.maxAge);
  return band ? band.annual : 0;
}

export function educationCost(data, child) {
  if (child.independent) return 0;
  for (const stage of SCHOOL_STAGES) {
    const def = data.events[stage];
    const from = def.stage.fromAge;
    const to = stage === "university" ? (child.independentAge ?? from) - 1 : def.stage.toAge;
    if (child.age >= from && child.age <= to) {
      const opt = def.options.find((o) => o.tier === child.choices[stage]);
      return opt ? opt.annual : 0;
    }
  }
  return 0;
}

export function housingCost(data, state) {
  if (state.house) {
    const a = houseOption(data, state).annual;
    return Object.values(a).reduce((x, y) => x + y, 0);
  }
  return state.rentMode === "family" ? data.familyRent : data.starterRent;
}

export function workIncome(data, state) {
  const ratio = medianIncome(data, state.age) / medianIncome(data, state.startAge);
  const partnerRate = data.workStyles[state.workStyle].partnerRate;
  const gross = (state.baseIncome.a + state.baseIncome.b * partnerRate) * ratio;
  const cut = state.bonusCutYear === state.year ? 1 - data.random.events.bonusCut.rate : 1;
  return gross * data.takeHomeRate * cut;
}

// 教育にかけた度合い（保育から大学まで、高い=2・普通=1・安い=0 の合計）
export function educationPoints(data, child) {
  const points = data.independence.points;
  return SCHOOL_STAGES.reduce((sum, s) => sum + (points[child.choices[s]] ?? 0), 0);
}

// 子どもが独立したときに、仕送りと奨学金の肩代わりを決める。教育にかけたほど仕送りが多く、肩代わりは少ない
// 奨学金は、大学の学費を家計で払いきれなかった年に子どもが借りたぶん（child.borrowed）
function independence(data, state, child) {
  child.independent = true;
  const p = educationPoints(data, child);
  const noUniversity = child.choices.university === "none";
  const a = data.independence.allowance;
  if (rand(state) < a.baseChance + a.chancePerPoint * p + (noUniversity ? a.noUniversityBonus : 0)) {
    child.allowance = Math.round(a.baseAmount + a.amountPerPoint * p);
  }
  const s = data.independence.scholarship;
  if (child.borrowed > 0 && rand(state) < s.baseChance + s.chancePerPoint * p) {
    child.scholarship = { annual: child.borrowed / s.years, untilYear: state.year + s.years };
    addHistory(state, `子どもの奨学金${Math.round(child.borrowed)}万円を、親が肩代わりして返すことになった。`);
  }
}

// 1年分の収支を計算して年齢を進める。表示用に内訳を返す
export function endYear(data, state) {
  const notes = [];
  const income = workIncome(data, state);
  const allowance = state.children.reduce((s, c) => s + (c.allowance ?? 0) + childAllowance(data, c), 0);
  const dependents = state.children.filter((c) => !c.independent).length;

  const items = {
    living: baseLiving(data, state),
    child: state.children.reduce((sum, c) => sum + childLivingCost(data, c), 0),
    education: state.children.reduce((sum, c) => sum + educationCost(data, c), 0),
    housing: housingCost(data, state),
    loan: 0,
    car: state.car ? state.car.annual : dependents > 0 ? data.noCarCostWithChildren : 0,
    breakdown: 0,
    care: state.care ? state.care.annual : 0,
    scholarship: state.children.reduce((s, c) => s + (c.scholarship && state.year < c.scholarship.untilYear ? c.scholarship.annual : 0), 0),
    interest: state.savings < 0 ? -state.savings * data.cardLoanRate : 0,
  };

  if (state.loan && state.loan.balance > 0) {
    const interest = state.loan.balance * state.loan.rate;
    const pay = Math.min(state.loan.payment, state.loan.balance + interest);
    state.loan.balance = state.loan.balance + interest - pay;
    items.loan = pay;
    if (state.loan.balance < 0.01) {
      state.loan.balance = 0;
      state.flags.loanPaidOff = true;
      notes.push("住宅ローンを払い終えた。");
    }
  }

  if (state.car && rand(state) < state.car.breakdownChance) {
    items.breakdown = pick(state, data.events.car.breakdownCost);
    notes.push(`車が故障して、修理に${items.breakdown}万円かかった。`);
  }

  // 家計で払いきれない年は、大学生の子どもが学費の一部を奨学金で借りる
  let shortfall = Object.values(items).reduce((x, y) => x + y, 0) - income - allowance - Math.max(0, state.savings);
  for (const c of state.children) {
    if (shortfall <= 0) break;
    if (c.independent || c.age < STAGE_START_AGE.university) continue;
    const borrow = Math.min(shortfall, educationCost(data, c) * data.independence.scholarship.maxShare);
    if (borrow <= 0) continue;
    if (!c.borrowed) notes.push("学費が苦しく、子どもが奨学金を借りた。");
    c.borrowed = (c.borrowed ?? 0) + borrow;
    items.education -= borrow;
    shortfall -= borrow;
  }

  const expense = Object.values(items).reduce((x, y) => x + y, 0);
  state.savings += income + allowance - expense;
  state.flags.minSavings = Math.min(state.flags.minSavings, state.savings);

  const t = state.totals;
  t.income += income;
  t.extraIncome += allowance;
  t.living += items.living;
  t.child += items.child;
  t.education += items.education;
  t.housing += items.housing + items.loan;
  t.car += items.car + items.breakdown;
  t.care += items.care;
  t.scholarship += items.scholarship;
  t.interest += items.interest;

  if (state.house) state.house.value *= 1 - houseOption(data, state).depreciation;
  if (state.workStyle === "single") state.blankYears += 1;

  for (const text of notes) addHistory(state, text);
  const closedAge = state.age;
  state.age += 1;
  state.year += 1;

  // ここから翌年の出来事
  const major = state.house && houseOption(data, state).majorRepair;
  if (major && state.year - state.house.boughtYear === major.afterYears) {
    state.savings -= major.cost;
    state.flags.minSavings = Math.min(state.flags.minSavings, state.savings);
    state.totals.repair += major.cost;
    addHistory(state, major.diary);
  }

  if (state.care && state.year >= state.care.untilYear) {
    const { prevWorkStyle, mode } = state.care;
    state.care = null;
    addHistory(state, "親を見送った。介護の日々が終わった。");
    if (mode === "home" && prevWorkStyle !== "single") setWorkStyle(data, state, prevWorkStyle);
  }

  const youngestBefore = Math.min(...state.children.map((c) => c.age));
  for (const [i, c] of state.children.entries()) {
    c.age += 1;
    const stage = SCHOOL_STAGES.find((s) => s !== "childcare" && STAGE_START_AGE[s] === c.age);
    if (stage && !c.independent) queueOnce(state, { id: stage, child: i });
    if (!c.independent && c.independentAge === c.age) {
      independence(data, state, c);
      addHistory(state, "子どもが独立した。");
    }
  }
  const youngest = Math.min(...state.children.map((c) => c.age));
  if (state.children.length && youngest !== youngestBefore && (youngest === 6 || youngest === 12) && !state.care) {
    queueOnce(state, { id: "workStyle", reason: youngest === 6 ? "elementary" : "juniorHigh" });
  }

  if (state.childPlan === "want" && state.children.length < data.maxChildren && rand(state) < data.childBirthChancePerYear) {
    state.children.push({ age: 0, choices: {}, independent: false, independentAge: null, boarding: false, allowance: 0, borrowed: 0, scholarship: null });
    addHistory(state, state.children.length === 1 ? "子どもが生まれた。" : `${state.children.length}人目の子どもが生まれた。`);
    queueOnce(state, { id: "childcare", child: state.children.length - 1 });
    if (!state.care) queueOnce(state, { id: "workStyle", reason: "birth" });
    if (state.children.length < data.maxChildren) state.childPlan = null; // 生まれるたびに、次を望むか聞き直す
  }

  if (state.savings < data.bankruptLine) {
    state.ended = "bankrupt";
    addHistory(state, "家計が破綻した。");
  } else if (state.age >= data.retireAge) {
    state.ended = "retire";
    state.queue = [];
    addHistory(state, "定年を迎えた。");
  }

  return { age: closedAge, income: income + allowance, items, expense, delta: income + allowance - expense, savings: state.savings };
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

// ---- 称号と実績 ----

const TIERS = ["high", "mid", "low"];

// 子どもの学校（保育〜高校）がすべて指定の段階か
function allSchools(state, tier) {
  return state.children.length > 0 && state.children.every((c) => ["childcare", "elementary", "juniorHigh", "highSchool"].every((s) => c.choices[s] === tier));
}

function tierShare(state, tier) {
  const total = TIERS.reduce((s, t) => s + state.choices[t], 0);
  return total ? state.choices[tier] / total : 0;
}

// 称号の条件。data.titles の順に調べて、最初に当てはまったものにする
const TITLE_RULES = {
  education: (s) => allSchools(s, "high"),
  showoff: (s) => tierShare(s, "high") >= 0.7,
  frugal: (s) => tierShare(s, "low") >= 0.7,
  steady: (s) => tierShare(s, "mid") >= 0.7,
  bigFamily: (s) => s.children.length >= 3,
  lifelongRenter: (s) => !s.house,
  carFree: (s) => s.carNever,
  twoOfUs: (s) => s.children.length === 0,
  balanced: () => true,
};

export function titleOf(data, state) {
  return data.titles.find((t) => TITLE_RULES[t.id]?.(state));
}

// 実績の条件。定年まで行った人生だけで判定するものは retire を見る
const ACHIEVEMENT_RULES = {
  rankS: (s, nw, data) => s.ended === "retire" && rankOf(data, nw.total).rank === "S",
  bankrupt: (s) => s.ended === "bankrupt",
  threePrivate: (s) => s.children.length === 3 && s.children.every((c) => ["elementary", "juniorHigh", "highSchool"].every((st) => c.choices[st] === "high")),
  lifelongRenter: (s) => s.ended === "retire" && s.houseNever,
  loanPaidOff: (s) => s.flags.loanPaidOff,
  noCardLoan: (s) => s.ended === "retire" && s.flags.minSavings >= 0,
  carFree: (s) => s.ended === "retire" && s.carNever,
  threeKids: (s) => s.children.length === 3,
  bigWindfall: (s) => s.flags.maxWindfall >= 300,
  homeCare: (s) => s.flags.homeCare,
  jobUp: (s) => s.flags.jobUp,
  allowance: (s) => s.children.some((c) => c.allowance > 0),
};

export function achievementsOf(data, state) {
  const nw = netWorth(state);
  return data.achievements.filter((a) => ACHIEVEMENT_RULES[a.id]?.(state, nw, data)).map((a) => a.id);
}

// 同じ開始条件・同じシードで「全部普通」を選んだ場合の純資産（破綻なら null）
export function compareWithMid(data, state) {
  const mid = playToEnd(data, state.settings, state.seed, "mid");
  return mid.ended === "bankrupt" ? null : netWorth(mid).total;
}

// ---- 自動プレイ（バランス確認用） ----

// 方針
//   high / mid / low: 毎回その段階を選ぶ。働き方は high ならフルタイムを続け、mid と low は
//                     出産時に時短・パート、末っ子の小学校入学でフルタイムに戻る
//   random: 毎回ランダム
//   smart: 共働き（フルタイム）を続け、ほかは普通（要所だけ「高い」を選ぶ例）
// 子どもはどの方針でも2人まで望む。車は買うと貯金がマイナスになるとき、家は頭金20%を払えないときだけ見送って、再提案を待つ
export const STRATEGIES = ["high", "mid", "low", "random", "smart"];

export function autoChoice(data, state, event, strategy) {
  const tiers = ["high", "mid", "low"];
  const tier =
    strategy === "random" ? tiers[randInt(state, 0, 2)]
    : strategy === "smart" ? "mid"
    : strategy;
  switch (event.id) {
    case "childPlan":
      return { plan: state.children.length < 2 ? "want" : "never" };
    case "workStyle": {
      if (strategy === "smart" || tier === "high" || event.reason !== "birth") return { workStyle: "fulltime_both" };
      return { workStyle: "parttime" };
    }
    case "university":
      return { tier, years: 4 };
    case "jobOffer":
      return { accept: strategy === "high" || (strategy === "random" && rand(state) < 0.5) };
    case "care":
      return { mode: tier === "low" ? "home" : "facility" };
    case "car":
    case "house":
      if (event.id === "house") {
        const price = data.events.house.options.find((o) => o.tier === tier).oneTime;
        return state.savings >= price * data.events.house.downPaymentRate ? { tier } : { skip: true };
      }
      return state.savings - immediateCost(data, state, event, { tier }) < 0 ? { skip: true } : { tier };
    default:
      return { tier };
  }
}

export function playToEnd(data, settings, seed, strategy) {
  const state = createGame(data, settings, seed);
  let guard = 0;
  while (!state.ended && guard++ < 2000) {
    const ev = nextEvent(data, state);
    if (ev) choose(data, state, ev, autoChoice(data, state, ev, strategy));
    else endYear(data, state);
  }
  return state;
}
