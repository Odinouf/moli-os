// The colour of a live power reading. One rule for the whole dashboard: the
// header band and a tablet row must not paint the same wattage two colours.
// Neutral until it climbs — a house that burns 400 W is not « fine », it is
// simply not worth a colour.
const WARM_AT = 1000;
const ALERT_AT = 3000;

/** `''` (neutral), `'warm'` from 1000 W, `'alert'` from 3000 W. A reading
 *  that is not a number earns no colour at all. */
export function powerTone(watts) {
  const w = Number(watts);
  if (watts == null || !Number.isFinite(w)) return '';
  const abs = Math.abs(w);
  if (abs >= ALERT_AT) return 'alert';
  if (abs >= WARM_AT) return 'warm';
  return '';
}
