// What a device is, reduced to what needs no hub and no Svelte: the power
// point, the name classifiers and the two bridge shapes. `home.svelte.js`
// (`deviceKind`) and `layout.js` (`kindOf`) read the same rules here, so a
// device cannot be a `tv` for a row and a `sensor` for the Plan.
//
// Dependency-free on purpose: no runes, no hub — `node --test` loads it.

import { VALVE_KEYS } from './trv.js';

const pointHas = (d, key, write = false) =>
  (d?.points ?? []).some((p) => p.key === key && (!write || p.access?.write));

/** The point that switches a device on and off. */
export function powerKey(d) {
  if (!d?.points) return null;
  const writable = d.points.filter((p) => p.access?.write);
  const p =
    writable.find((x) => x.semantic === 'on_off' && x.kind?.type === 'binary') ??
    writable.find((x) => ['on', 'switch_1', 'switch', 'state'].includes(x.key));
  return p?.key ?? null;
}

/** Names that read as a light, and on/off things that never are one. */
export const LIGHTISH =
  /lumi|lamp|light|spot|plafon|applique|ampoule|globe|suspension|bureau|salon|cuisine|couloir|studio|véranda|veranda|entrée|chambre|toilette|combles|meuble|bulb|ceiling|desk|kitchen|hallway|bedroom|attic|fixture|lounge/i;
/** On/off things that are not lights, whatever their bridge calls them. */
export const NOT_LIGHT = /vmc|ventil|pompe|prise|chauffe|\bfan\b|pump|heater|outlet|socket/i;
export const FAN_NAME = /(^|[^a-z])(fan|ventilateur|ventilo)([^a-z]|$)/i;

/** A light fixture (D12): bulbs and the relay that feeds them as one light. */
export const isFixture = (d) => d?.model === 'Luminaire';
/** A Hue room or zone: « toute la pièce », not a lamp. */
export const isGroup = (d) => d?.model === 'room' || d?.model === 'zone';

/** The points that make a climate device a thermostatic valve: it states its
 *  target the ZCL way, not as Home Assistant's `target_temperature`. The
 *  constant lives in `lib/trv.js` (with `isValve`), and is re-exported here so
 *  both readers share one copy. */
export { VALVE_KEYS };

/** What a device is, for choosing how to show it. The one classifier: the
 *  Accueil rows, the Plan pins and the Chauffage page all read it, so a device
 *  cannot be a `tv` here and a `sensor` there. */
export function deviceKind(d) {
  if (!d) return 'unknown';
  if (pointHas(d, 'progress') && pointHas(d, 'nozzle_temperature')) return 'printer';
  if (d.camera) return 'camera';
  if (pointHas(d, 'target_temperature')) return 'climate';
  if (VALVE_KEYS.some((k) => pointHas(d, k))) return 'climate';
  if (
    pointHas(d, 'fan_speed') ||
    pointHas(d, 'fan_control') ||
    pointHas(d, 'fan_direction') ||
    pointHas(d, 'fan_mode') ||
    pointHas(d, 'wind_speed')
  )
    return 'fan';
  if (pointHas(d, 'key', true)) return 'tv';
  if (pointHas(d, 'playing', true) && pointHas(d, 'volume')) return 'speaker';
  if (
    pointHas(d, 'percent_control') ||
    (pointHas(d, 'control', true) &&
      d.points.find((p) => p.key === 'control')?.kind?.values?.includes('open'))
  )
    return 'cover';
  if (powerKey(d)) {
    if (isGroup(d)) return 'group';
    if (isFixture(d)) return 'light';
    const name = d.label?.name ?? d.native_name ?? '';
    if (FAN_NAME.test(name)) return 'fan';
    if (NOT_LIGHT.test(name) || /plug/i.test(d.model ?? '')) return 'plug';
    if (String(d.id).startsWith('hue:') || LIGHTISH.test(name)) return 'light';
    return 'plug';
  }
  return 'sensor';
}

export { pointHas };
