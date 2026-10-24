// イベントのイラスト。色は CSS の .il-* で決めるので、ダークモードでもそのまま使える。
// viewBox はすべて 0 0 160 100。

const svg = (body) => `<svg class="illust" viewBox="0 0 160 100" aria-hidden="true">${body}</svg>`;

const ground = '<ellipse class="il-shadow" cx="80" cy="90" rx="56" ry="6"/>';

const ILLUST = {
  wedding: svg(`${ground}
    <circle class="il-line-a" cx="66" cy="56" r="22" fill="none" stroke-width="8"/>
    <circle class="il-line-b" cx="94" cy="56" r="22" fill="none" stroke-width="8"/>
    <path class="il-c" d="M60 26 l6 -10 l6 10 l-6 6z"/>
    <circle class="il-a" cx="120" cy="22" r="3"/><circle class="il-a" cx="36" cy="30" r="2"/><circle class="il-b" cx="128" cy="40" r="2"/>`),

  trip: svg(`${ground}
    <rect class="il-a" x="50" y="34" width="60" height="50" rx="8"/>
    <rect class="il-line-b" x="68" y="22" width="24" height="14" rx="4" fill="none" stroke-width="5"/>
    <rect class="il-c" x="50" y="52" width="60" height="6"/>
    <circle class="il-b" cx="62" cy="86" r="4"/><circle class="il-b" cx="98" cy="86" r="4"/>
    <path class="il-b" d="M118 20 l22 -8 l-6 6 l8 6 l-6 0 l-4 6 z"/>`),

  baby: svg(`${ground}
    <circle class="il-c" cx="80" cy="52" r="30"/>
    <circle class="il-ink" cx="70" cy="50" r="3"/><circle class="il-ink" cx="90" cy="50" r="3"/>
    <circle class="il-a" cx="64" cy="60" r="5" opacity=".5"/><circle class="il-a" cx="96" cy="60" r="5" opacity=".5"/>
    <path class="il-line-ink" d="M74 64 q6 5 12 0" fill="none" stroke-width="3" stroke-linecap="round"/>
    <path class="il-line-ink" d="M80 22 q8 -6 6 4" fill="none" stroke-width="3" stroke-linecap="round"/>
    <path class="il-a" d="M126 26 c4 -8 14 -4 10 4 l-10 10 l-10 -10 c-4 -8 6 -12 10 -4z"/>`),

  work: svg(`${ground}
    <rect class="il-b" x="44" y="36" width="72" height="48" rx="8"/>
    <rect class="il-line-ink" x="66" y="24" width="28" height="14" rx="4" fill="none" stroke-width="5"/>
    <rect class="il-a" x="44" y="52" width="72" height="6"/>
    <rect class="il-c" x="74" y="48" width="12" height="14" rx="2"/>`),

  blocks: svg(`${ground}
    <rect class="il-a" x="44" y="56" width="30" height="30" rx="4"/>
    <rect class="il-b" x="80" y="56" width="30" height="30" rx="4"/>
    <rect class="il-c" x="62" y="24" width="30" height="30" rx="4"/>
    <text class="il-ink" x="59" y="78" font-size="18" text-anchor="middle" font-weight="bold">あ</text>
    <text class="il-ink" x="95" y="78" font-size="18" text-anchor="middle" font-weight="bold">い</text>
    <text class="il-ink" x="77" y="46" font-size="18" text-anchor="middle" font-weight="bold">う</text>`),

  randoseru: svg(`${ground}
    <rect class="il-a" x="52" y="22" width="56" height="64" rx="14"/>
    <path class="il-c" d="M52 46 h56 v-10 a14 14 0 0 0 -14 -14 h-28 a14 14 0 0 0 -14 14z" opacity=".35"/>
    <rect class="il-c" x="74" y="54" width="12" height="8" rx="2"/>
    <path class="il-line-b" d="M62 22 v-8 a6 6 0 0 1 6 -6 h24 a6 6 0 0 1 6 6 v8" fill="none" stroke-width="4"/>`),

  books: svg(`${ground}
    <rect class="il-b" x="46" y="66" width="68" height="16" rx="3"/>
    <rect class="il-a" x="52" y="50" width="60" height="16" rx="3"/>
    <rect class="il-c" x="48" y="34" width="62" height="16" rx="3"/>
    <rect class="il-ink" x="56" y="40" width="20" height="3" rx="1.5" opacity=".4"/>
    <path class="il-a" d="M112 18 l4 10 l10 1 l-8 7 l3 10 l-9 -6 l-9 6 l3 -10 l-8 -7 l10 -1z"/>`),

  cap: svg(`${ground}
    <path class="il-ink" d="M80 20 l50 20 l-50 20 l-50 -20z"/>
    <path class="il-b" d="M56 50 v18 c0 8 48 8 48 0 v-18 l-24 10z"/>
    <path class="il-line-a" d="M120 44 v24" stroke-width="3"/>
    <circle class="il-a" cx="120" cy="72" r="5"/>`),

  car: svg(`${ground}
    <path class="il-a" d="M30 70 v-12 c0 -6 4 -10 10 -10 l14 -16 c2 -2 4 -3 7 -3 h38 c3 0 5 1 7 3 l14 16 c6 0 10 4 10 10 v12z"/>
    <path class="il-c" d="M62 34 h14 v14 h-26z M84 34 h14 l12 14 h-26z" opacity=".85"/>
    <circle class="il-ink" cx="56" cy="72" r="11"/><circle class="il-c" cx="56" cy="72" r="4"/>
    <circle class="il-ink" cx="106" cy="72" r="11"/><circle class="il-c" cx="106" cy="72" r="4"/>`),

  house: svg(`${ground}
    <rect class="il-c" x="48" y="46" width="64" height="40"/>
    <path class="il-a" d="M40 50 l40 -32 l40 32 z"/>
    <rect class="il-b" x="72" y="62" width="16" height="24" rx="2"/>
    <rect class="il-b" x="54" y="56" width="12" height="12" rx="2" opacity=".7"/>
    <rect class="il-b" x="94" y="56" width="12" height="12" rx="2" opacity=".7"/>
    <rect class="il-ink" x="98" y="22" width="8" height="16" opacity=".6"/>`),

  repair: svg(`${ground}
    <path class="il-b" d="M60 74 l30 -30 a16 16 0 0 1 20 -20 l-10 10 l4 6 l6 4 l10 -10 a16 16 0 0 1 -20 20 l-30 30 a7 7 0 0 1 -10 -10z"/>
    <path class="il-a" d="M40 30 l4 8 l8 1 l-6 6 l2 8 l-8 -4 l-8 4 l2 -8 l-6 -6 l8 -1z"/>`),

  chart: svg(`${ground}
    <rect class="il-c" x="40" y="22" width="80" height="62" rx="6"/>
    <rect class="il-b" x="52" y="60" width="12" height="16" rx="2"/>
    <rect class="il-b" x="74" y="48" width="12" height="28" rx="2"/>
    <rect class="il-a" x="96" y="34" width="12" height="42" rx="2"/>
    <path class="il-line-ink" d="M50 52 l24 -12 l22 -10" fill="none" stroke-width="3" stroke-linecap="round"/>`),

  care: svg(`${ground}
    <path class="il-a" d="M80 82 l-30 -28 c-12 -12 0 -34 18 -24 l12 8 l12 -8 c18 -10 30 12 18 24z"/>
    <rect class="il-c" x="75" y="38" width="10" height="28" rx="2"/>
    <rect class="il-c" x="66" y="47" width="28" height="10" rx="2"/>`),
};

const EVENT_ILLUST = {
  wedding: "wedding",
  honeymoon: "trip",
  familyTrip: "trip",
  childPlan: "baby",
  workStyle: "work",
  childcare: "blocks",
  elementary: "randoseru",
  juniorHigh: "books",
  highSchool: "books",
  university: "cap",
  car: "car",
  house: "house",
  repair: "repair",
  jobOffer: "chart",
  care: "care",
};

export function illustFor(eventId) {
  return ILLUST[EVENT_ILLUST[eventId]] ?? "";
}
