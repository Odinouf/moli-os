// A thermostatic valve's weekly schedule, as ZCL/Zigbee2MQTT states it:
// one text per day, "HH:MM/<deg>" steps separated by spaces, the first one
// anchored at 00:00. This module is pure — no Svelte, no DOM — so the whole
// editor's arithmetic is testable on its own.

/** A day holds at most this many steps (the SONOFF TRVZB's own limit). */
export const MAX_BLOCKS = 6;
/** Minutes snap to this grid (the valve's own resolution). */
export const GRID = 15;
/** Setpoint bounds and step, per the device's reported spec. */
export const MIN_DEG = 4;
export const MAX_DEG = 35;
export const STEP = 0.5;

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const clampDeg = (deg) => {
  const n = Number(deg);
  if (!Number.isFinite(n)) return MIN_DEG;
  return Math.min(MAX_DEG, Math.max(MIN_DEG, Math.round(n / STEP) * STEP));
};

const clampMin = (min) => {
  const n = Number(min);
  if (!Number.isFinite(n)) return 0;
  return Math.min(24 * 60 - GRID, Math.max(0, Math.round(n / GRID) * GRID));
};

/** "HH:MM" of a minute-of-day. */
export function hhmm(min) {
  const m = Math.min(24 * 60 - 1, Math.max(0, Math.round(Number(min) || 0)));
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** A minute-of-day from an "HH:MM" (or "H:MM"), null when unreadable. */
export function minutesOf(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Reads a day's text. Tolerant: a duplicate step, a stray space or a
 *  setpoint out of bounds is normalised, never fatal. Always returns a
 *  well-formed day (sorted, deduplicated, capped, anchored at 00:00). */
export function parseSchedule(text) {
  const found = [];
  for (const part of String(text ?? '').split(/\s+/)) {
    const m = /^(\d{1,2}):(\d{2})\/([\d.]+)$/.exec(part);
    if (!m) continue;
    const min = minutesOf(`${m[1]}:${m[2]}`);
    if (min == null) continue;
    found.push({ min, deg: clampDeg(m[3]) });
  }
  return normalize(found);
}

/** Sorts, drops a duplicate minute (two steps at the same time: the first
 *  stands), snaps to the grid, caps at MAX_BLOCKS and anchors at 00:00. */
export function normalize(blocks) {
  const seen = new Set();
  const sorted = [...(blocks ?? [])]
    .map((b) => ({ min: clampMin(b.min), deg: clampDeg(b.deg) }))
    .sort((a, b) => a.min - b.min)
    .filter((b) => {
      if (seen.has(b.min)) return false;
      seen.add(b.min);
      return true;
    })
    .slice(0, MAX_BLOCKS);
  if (!sorted.length) return [{ min: 0, deg: MIN_DEG }];
  if (sorted[0].min !== 0) sorted.unshift({ min: 0, deg: sorted[0].deg });
  return sorted;
}

/** A day as the valve reads it. */
export function formatSchedule(blocks) {
  return normalize(blocks)
    .map((b) => `${hhmm(b.min)}/${b.deg % 1 ? b.deg.toFixed(1) : b.deg}`)
    .join(' ');
}

/** A day reduced to a single step: what « neutralise » writes so a later
 *  return to `auto` never wakes an old timetable. */
export function neutralize(deg) {
  return [{ min: 0, deg: clampDeg(deg) }];
}

/** True when the day holds a single (constant) step. */
export function isFlat(blocks) {
  const b = normalize(blocks);
  return b.length === 1;
}

/** The day's step whose time is the last one at or before `minutes`. */
export function blockAt(blocks, minutes) {
  const b = normalize(blocks);
  let found = b[0];
  for (const s of b) {
    if (s.min <= minutes) found = s;
    else break;
  }
  return found;
}

/** The next step strictly after `minutes` (a transition to come), or null
 *  when the day ends on the current step. */
export function nextTransition(blocks, minutes) {
  return normalize(blocks).find((b) => b.min > minutes) ?? null;
}

/** Adds a step at `min`, taking the setpoint of the step it lands in.
 *  Refuses a seventh step, an occupied minute or the anchored 00:00. */
export function insertBlock(blocks, min, deg = null) {
  const b = normalize(blocks);
  const at = clampMin(min);
  if (at === 0 || b.some((s) => s.min === at)) return b;
  if (b.length >= MAX_BLOCKS) return b;
  const deg2 = deg == null ? blockAt(b, at).deg : clampDeg(deg);
  return normalize([...b, { min: at, deg: deg2 }]);
}

/** Moves the step at `index` to `min` (the 00:00 one never moves). */
export function moveBlock(blocks, index, min) {
  const b = normalize(blocks);
  if (index <= 0 || index >= b.length) return b;
  const moved = { ...b[index], min: clampMin(min) };
  const others = b.filter((_, i) => i !== index);
  return normalize([...others, moved]);
}

/** Removes the step at `index` (the 00:00 one stays). */
export function removeBlock(blocks, index) {
  const b = normalize(blocks);
  if (index <= 0 || index >= b.length) return b;
  return normalize(b.filter((_, i) => i !== index));
}

/** Sets the setpoint of the step at `index`. */
export function setDegree(blocks, index, deg) {
  const b = normalize(blocks);
  if (index < 0 || index >= b.length) return b;
  return b.map((s, i) => (i === index ? { ...s, deg: clampDeg(deg) } : s));
}

/** Where a new step would land: the middle of the widest room left in the
 *  day, so « + » always adds inside the largest stretch instead of at an
 *  arbitrary hour. Returns a minute-of-day, or null when the day is full or
 *  has no room left on the grid. */
export function roomForNewBlock(blocks) {
  const b = normalize(blocks);
  if (b.length >= MAX_BLOCKS) return null;
  let best = null;
  for (let i = 0; i < b.length; i++) {
    const from = b[i].min;
    const to = i + 1 < b.length ? b[i + 1].min : 24 * 60;
    const width = to - from;
    if (width < 2 * GRID) continue;
    // Two quarters at least, and never at 00:00 (the anchor never moves).
    const mid = Math.round((from + width / 2) / GRID) * GRID;
    const at = Math.max(GRID, Math.min(24 * 60 - GRID, mid));
    if (b.some((s) => s.min === at)) continue;
    if (best == null || width > best.width) best = { at, width };
  }
  return best ? best.at : null;
}

/** Why a day cannot be written, or null when it is fine. */
export function validate(blocks) {
  const b = normalize(blocks);
  if (b.length > MAX_BLOCKS) return 'too_many';
  for (let i = 1; i < b.length; i++) if (b[i].min <= b[i - 1].min) return 'order';
  return null;
}

/** The coldest and warmest setpoints of a week, to scale a colour ramp. */
export function bounds(days) {
  const all = (days ?? []).filter(Boolean).flat().map((b) => b.deg);
  if (!all.length) return { min: MIN_DEG, max: MAX_DEG };
  return { min: Math.min(...all), max: Math.max(...all) };
}

/** How far a setpoint may sit from a named level and still be that level:
 *  the valve rounds to the half degree, so an exact match is too strict. */
const LEVEL_TOL = 0.25;

/** Which named level a setpoint belongs to — « confort », « reduit » or
 *  « custom ». The names come from the household's own config, never from
 *  the valve, which only ever holds `HH:MM/<deg>` steps. */
export function levelOf(deg, confort, reduit) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 'custom';
  if (confort != null && Math.abs(n - Number(confort)) <= LEVEL_TOL) return 'confort';
  if (reduit != null && Math.abs(n - Number(reduit)) <= LEVEL_TOL) return 'reduit';
  return 'custom';
}
