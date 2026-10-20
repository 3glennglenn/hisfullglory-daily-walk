// The night sky of Lamplight (direction B): one small star for every day the reader walked, scattered, never a grid, so a
// day that was skipped leaves no hole. The places are a pure function of the dates, so a star never moves once it is drawn:
// each date is placed by hashing the date itself, and only the 39 days before it can push it aside (a few tries to keep a
// little distance from them). Today's place is an empty ring until today's walk is done. At most 40 stars are drawn, the
// newest 40. Nothing here is stored: the dates are the walk dates the app already keeps (local.completedDates).

export interface Star {
  date: string;
  /** Left edge in percent of the sky's width (4 to 96). */
  x: number;
  /** Top edge in percent of the sky's height (8 to 92). */
  y: number;
  /** Diameter in px: 2 to 4. Today's place ignores it: the CSS draws a 13px ring, or a lit star on the finish screen. */
  size: number;
  /** 0.55 to 0.95 (today's place is drawn at full strength by the CSS). */
  opacity: number;
  isToday: boolean;
  /** False for the empty ring of a day that has not been walked yet. */
  walked: boolean;
}

export const MAX_STARS = 40;
const NEIGHBOURS = 39;
const TRIES = 8;
/** The least distance wanted between two stars, in the sky's own units (about 390 x 118 px). */
const APART = 22;
const SKY_W = 3.9;
const SKY_H = 1.18;

/** FNV-1a over the text: small, stable, the same on every device and in every Node and browser. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const unit = (date: string, salt: string) => (hash(`${date}#${salt}`) % 10007) / 10007;

export function starPositions(walked: readonly string[], today: string): Star[] {
  const dates = [...new Set(walked)].sort();
  const todayWalked = dates.includes(today);
  if (!todayWalked) dates.push(today);
  dates.sort();
  const placed: Star[] = [];
  for (const date of dates) {
    const isToday = date === today;
    const near = placed.slice(-NEIGHBOURS);
    let best = { x: 50, y: 50, gap: -1 };
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const x = 4 + unit(date, `x${attempt}`) * 92;
      const y = 8 + unit(date, `y${attempt}`) * 84;
      const gap = near.reduce((least, star) => Math.min(least, Math.hypot((star.x - x) * SKY_W, (star.y - y) * SKY_H)), Infinity);
      if (gap > best.gap) best = { x, y, gap };
      if (gap >= APART) break;
    }
    placed.push({
      date,
      x: Math.round(best.x * 10) / 10,
      y: Math.round(best.y * 10) / 10,
      size: 2 + Math.floor(unit(date, "size") * 3),
      opacity: Math.round((0.55 + unit(date, "glow") * 0.4) * 100) / 100,
      isToday,
      walked: isToday ? todayWalked : true,
    });
  }
  return placed.slice(-MAX_STARS);
}

/** The line under the sky on Today: it carries the meaning, the sky itself is decoration. No count to beat, no zero. */
export function skyLine(days: number): string {
  if (days <= 0) return "Today's walk lights your first star.";
  if (days === 1) return "1 day walked. It stays.";
  return `${days} days walked. Each one stays.`;
}
