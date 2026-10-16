export interface QuipContext {
  today: string;
  youValue: number;
  invested: number;
  lastTradeDate: string | null;
  /** Each slot's current % minus its target %. */
  driftPts: number[];
  boughtInDrawdown: boolean;
  projection40: number;
  buffettAgeValue: number | null;
  buffettAge: number | null;
  legends: { name: string; value: number }[];
}

export interface Badge {
  id: 'sloth' | 'bullseye' | 'diamond' | 'compound';
  emoji: string;
  label: string;
  earned: boolean;
  hint: string;
}

/** Omaha price of a Cherry Coke, for converting gaps into Buffett's favourite unit. */
export const CHERRY_COKE_EUR = 1.2;
const COKES_PER_DAY = 5; // Buffett's self-reported habit
const BUFFETT_SALARY_USD = 100_000; // unchanged for decades

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const eur = (x: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(x));
const int = (x: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(x));
const cokes = (x: number) => Math.round(Math.abs(x) / CHERRY_COKE_EUR);

export function lazyStreak(today: string, lastTradeDate: string | null): number | null {
  return lastTradeDate ? Math.max(0, Math.round((utc(today) - utc(lastTradeDate)) / DAY)) : null;
}

export function badges(c: QuipContext): Badge[] {
  const lazy = lazyStreak(c.today, c.lastTradeDate) ?? 0;
  return [
    { id: 'sloth', emoji: '🦥', label: 'Sloth Master', earned: lazy >= 180, hint: '180 days without a trade' },
    { id: 'bullseye', emoji: '🎯', label: 'Bullseye', earned: c.driftPts.length > 0 && c.driftPts.every((d) => Math.abs(d) <= 2), hint: 'every slot within 2 points of target' },
    { id: 'diamond', emoji: '💎', label: 'Diamond Hands', earned: c.boughtInDrawdown, hint: 'bought while 10% below the peak' },
    { id: 'compound', emoji: '🧮', label: 'Compound Club', earned: c.projection40 >= 1_000_000, hint: '40-year projection above €1M' },
  ];
}

/** One line under a legend's scoreboard row; `diffVsYou` = legend − you. */
export function scoreboardQuip(name: string, diffVsYou: number): string {
  if (Math.abs(diffVsYou) < 1) return `Dead heat with ${name}. Spooky.`;
  if (diffVsYou > 0) return `${name} leads by ${eur(diffVsYou)}: ${int(cokes(diffVsYou))} Cherry Cokes of bragging rights.`;
  return `You're ${eur(-diffVsYou)} ahead of ${name}. Frame this, then close the tab.`;
}

type Template = (c: QuipContext) => string | null;

const TEMPLATES: Template[] = [
  (c) => {
    const w = c.legends.find((l) => l.name.startsWith('Buffett'));
    if (!w || !c.youValue) return null;
    const diff = w.value - c.youValue;
    return diff > 0
      ? `Warren's 90/10 is ahead by ${eur(diff)}: that's ${int(cokes(diff))} Cherry Cokes he'd drink to celebrate.`
      : `You're beating Warren's own instructions to his heirs by ${eur(-diff)}. Don't tell Omaha.`;
  },
  (c) => {
    const days = lazyStreak(c.today, c.lastTradeDate);
    return days === null ? null : `${int(days)} days without touching the buy button. "The stock market transfers money from the impatient to the patient."`;
  },
  (c) => (c.buffettAgeValue && c.buffettAge ? `At Buffett's age (96) you'd sit on ${eur(c.buffettAgeValue)} in today's euros, ${c.buffettAge} years from now. He'd call it a promising start.` : null),
  (c) => (c.invested > 0 && c.youValue > 0 ? `Your ${eur(c.invested)} of new money is now ${eur(c.youValue)} (${c.youValue >= c.invested ? '+' : ''}${Math.round((c.youValue / c.invested - 1) * 100)}%). Compound interest is clocking in.` : null),
  (c) => (c.projection40 > 0 ? `Stay the course 40 years and you'd have ${eur(c.projection40)}: about ${int(c.projection40 / (BUFFETT_SALARY_USD * 0.9))} years of Buffett's famous $100k salary.` : null),
  (c) => (c.youValue > 0 ? `Your portfolio equals ${int(cokes(c.youValue))} Cherry Cokes. At five a day, that's ${int(cokes(c.youValue) / (COKES_PER_DAY * 365))} years of Buffett fuel.` : null),
  (c) => {
    const best = [...c.legends].sort((a, b) => b.value - a.value)[0];
    return best ? `Best legend so far: ${best.name} at ${eur(best.value)}. Hindsight remains the only perfect fund manager.` : null;
  },
  () => `Buffett's favourite holding period is forever. Yours can be "until the next buy date".`,
  () => 'Checking prices daily does not make them go up. See you on the next buy date.',
  () => 'Doing nothing is a strategy. In fact it is the strategy.',
];

/** 2–4 quips, rotating by day so the page feels alive without changing on every refresh. */
export function quips(c: QuipContext): string[] {
  const lines = TEMPLATES.map((t) => t(c)).filter((x): x is string => !!x);
  const day = Math.floor(utc(c.today) / DAY);
  const count = Math.min(lines.length, 2 + (day % 3));
  const start = (day * 7) % lines.length;
  return Array.from({ length: count }, (_, i) => lines[(start + i) % lines.length]);
}
