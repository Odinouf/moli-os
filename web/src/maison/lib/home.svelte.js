// The family dashboard's model: the hub's live state (SSE, shared with the
// Atelier), the home layout (/api/home), and gentle helpers on top.

import { hub, connect, login, decide, refreshSession, onHubEvent } from '../../lib/hub.svelte.js';
import { t, locale } from '../../lib/i18n.svelte.js';
import { roomKey, roomNamed as roomNamedIn, roomOf as roomOfIn } from './rooms.js';
import { powerKey, isFixture, isGroup, pointHas, deviceKind } from './kinds.js';

export { hub, roomKey, powerKey, isFixture, isGroup, deviceKind };

export const home = $state({
  /** @type {any} layout from /api/home ({} = automatic) */
  config: null,
  /** an order the guard held, waiting for « c'est moi » */
  held: null,
  /** the installation, put off for now (a house already in use) */
  setupLater: false,
  /** short messages (« Envoi… », errors) */
  notes: [],
  /** theme preference: 'auto' follows daylight */
  theme: readPref('maison-theme', 'auto'),
  now: Date.now(),
});

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: keep it for this visit */
  }
}

let started = false;
let reloadTimer = null;

async function loadHome() {
  try {
    const res = await fetch('/api/home', { cache: 'no-store' });
    home.config = res.ok ? await res.json() : {};
  } catch {
    home.config = {};
  }
}

function scheduleHomeReload() {
  if (reloadTimer != null) return;
  reloadTimer = setTimeout(async () => {
    reloadTimer = null;
    await loadHome();
  }, 50);
}

/** Starts the live link (once) and loads the layout. */
export async function start() {
  if (started) return;
  started = true;
  connect();
  onHubEvent((event) => {
    if (event.type === 'label_changed' || event.type === 'snapshot') scheduleHomeReload();
  });
  setInterval(() => (home.now = Date.now()), 15_000);
  await loadHome();
}

export function note(text, tone = 'info') {
  const id = Date.now() + Math.random();
  home.notes = [...home.notes, { id, text, tone }];
  setTimeout(() => (home.notes = home.notes.filter((n) => n.id !== id)), 4500);
}

// ---- reading -------------------------------------------------------------------

export const device = (id) => (id ? (hub.devices[id] ?? null) : null);

export function value(id, key) {
  const v = hub.devices[id]?.state?.[key]?.value;
  return v === undefined ? null : v;
}

export function since(id, key) {
  return hub.devices[id]?.state?.[key]?.ts ?? null;
}

// ---- history -------------------------------------------------------------------

/** The key a device really reports, from the names its brand may use:
 *  `readingPoint(id, ['temperature', 'temp_current'])`. A point the device
 *  does not have is never invented. */
export function readingPoint(id, candidates) {
  const d = device(id);
  if (!d) return null;
  return candidates.find((k) => d.points?.some((p) => p.key === k)) ?? null;
}

/** Opens the history of one reading (`hub.chart`, the same state the
 *  Atelier uses). Nothing happens when the device or the point is absent:
 *  a tapped figure must not open an empty sheet. */
export function historyOf(id, key) {
  const d = device(id);
  if (!d || !key) return false;
  if (!d.points?.some((p) => p.key === key)) return false;
  hub.chart = `${id}/${key}`;
  return true;
}

/** Opens the first reading the device really has, among `candidates`. */
export function historyOfAny(id, candidates) {
  const key = readingPoint(id, candidates);
  return key ? historyOf(id, key) : false;
}

// What a sensor says, whatever its brand: Zigbee (`contact` true when
// closed, `water_leak`), Tuya (`doorcontact_state` true when open,
// `watersensor_state` « alarm », `pir` « pir », `battery_state` « low »).

/** true: open, false: closed, null: not a door, no report yet, or a
 *  sensor gone silent (dead battery: its last word stays « open »). */
export function doorOpen(id) {
  if (device(id)?.online === false) return null;
  const c = value(id, 'contact');
  if (typeof c === 'boolean') return !c;
  const tuya = value(id, 'doorcontact_state');
  return typeof tuya === 'boolean' ? tuya : null;
}

export const leak = (id) => value(id, 'water_leak') === true || value(id, 'watersensor_state') === 'alarm';

export const motion = (id) =>
  value(id, 'occupancy') === true || value(id, 'motion') === true || value(id, 'pir') === 'pir';

/** A sensor's battery (not a phone's: it charges). */
export function lowBattery(id) {
  if (device(id)?.points.some((p) => p.key === 'charging')) return false;
  if (value(id, 'battery_low') === true || value(id, 'battery_state') === 'low') return true;
  const pct = value(id, 'battery_percentage') ?? value(id, 'battery');
  return typeof pct === 'number' && pct <= 15;
}

/** Unreachable devices are said so; unknown (no report yet) counts as fine. */
export const reachable = (id) => device(id) != null && device(id).online !== false;

export function nameOf(id, fallback) {
  const d = device(id);
  return fallback || d?.label?.name || d?.native_name || t('commun.appareil');
}

/** Le nom d'un appareil tel qu'on le lit à voix haute : jamais une adresse
 *  Zigbee ni un identifiant technique. `nameOf` reste la vérité du pilote
 *  (l'Atelier en a besoin) ; ici on préfère la pièce, puis « Appareil ». */
export function spokenNameOf(id, fallback) {
  if (fallback) return fallback;
  const d = device(id);
  const named = d?.label?.name || d?.native_name;
  const technical = (s) => !s || /^0x[0-9a-f]{6,}$/i.test(s) || /^[0-9a-f]{12,}$/i.test(s) || !/[a-zà-ÿ]/i.test(s);
  if (named && !technical(named)) return named;
  const room = d ? roomOf(d) : null;
  return room && !technical(room) ? room : t('commun.appareil');
}

/** Les clés de point dont la maison connaît le mot : celles qu'on montre
 *  dans une feuille d'historique, jamais un libellé anglais de pilote. */
const POINT_WORDS = {
  temperature: 'maison.point.temperature',
  temp_current: 'maison.point.temperature',
  local_temperature: 'maison.point.local_temperature',
  humidity: 'maison.point.humidity',
  humidity_value: 'maison.point.humidity',
  pressure: 'maison.point.pressure',
  battery: 'maison.point.battery',
  voltage: 'maison.point.voltage',
  power: 'maison.point.power',
  cur_power: 'maison.point.power',
  power_appart: 'maison.point.power',
  power_residuel: 'maison.point.power',
  occupied_heating_setpoint: 'maison.point.occupied_heating_setpoint',
  setpoint: 'maison.point.setpoint',
};

/** Le libellé d'un point en clair : le mot de la maison s'il existe, sinon
 *  le libellé du pilote, sinon la clé (visible, donc trouvable). */
export function pointLabel(spec, key) {
  const word = POINT_WORDS[key ?? spec?.key];
  if (word) return t(word);
  return spec?.label || key || spec?.key || '';
}

const truthy = (v) => v === true || v === 'ON' || v === 'on' || v === 1;

/** Really on, now. An unreachable device is not (a bulb cut at the wall
 *  switch keeps its last « on » on the bridge); a group (a Hue room) is on
 *  when one of its lamps that answers is (D12). */
export function isOn(id, point = null) {
  const d = device(id);
  if (!d || d.online === false) return false;
  if (!point && isGroup(d) && d.members?.length) return d.members.some((m) => m !== id && isOn(m));
  const key = point ?? powerKey(d);
  return key ? truthy(value(id, key)) : false;
}

/** The fixture a device belongs to (its bulbs, its relay), if any. */
export function fixtureOf(id) {
  for (const d of Object.values(hub.devices)) if (isFixture(d) && d.members?.includes(id)) return d;
  return null;
}

/** A lamp without power: cut at the wall switch (or at its relay). */
export function unpowered(id) {
  const d = device(id);
  if (!d) return false;
  if (isFixture(d)) return value(id, 'powered') === false;
  return d.online === false && ['light', 'group'].includes(deviceKind(d));
}

export function pending(id, point = null) {
  const key = point ?? powerKey(device(id));
  return key ? `${id}/${key}` in hub.pending : false;
}

// ---- rooms ---------------------------------------------------------------------

// `norm` is the dashboard's one room-name comparison (`lib/rooms.js`).
const norm = roomKey;

/** The layout's name for a room called `raw` somewhere (a bridge, the plan):
 *  the rule lives in `lib/rooms.js`, so the rows read the same one. */
export function roomNamed(raw) {
  return roomNamedIn(raw, home.config?.rooms ?? []);
}

export function tempIgnored(roomName) {
  const def = (home.config?.rooms ?? []).find((r) => r.name === roomName);
  return new Set(def?.temperature_ignore ?? []);
}

/** The room a device is in, by the layout's names and aliases. */
export function roomOf(d) {
  return roomOfIn(d, home.config?.rooms ?? []);
}

export const protectedRoom = (name) =>
  (hub.guard?.protected_rooms ?? []).some((p) =>
    [name, ...((home.config?.rooms ?? []).find((r) => r.name === name)?.aliases ?? [])].some(
      (n) => norm(n) === norm(p),
    ),
  );

export function hidden(id) {
  return (home.config?.hidden ?? []).includes(id);
}

/** In its room but never a button (a dishwasher, a car charger): a chip
 *  that says what it draws. `home.json` `quiet`. */
export function quiet(id) {
  return (home.config?.quiet ?? []).includes(id);
}

/** A power strip's outlets, each its own pad: `home.json` `outlets`
 *  `{ "<id>": { "switch_1": "Écran", … } }`, in that order. */
export function outletsOf(id) {
  const names = home.config?.outlets?.[id];
  const d = device(id);
  if (!names || !d) return [];
  return Object.entries(names)
    .filter(([key]) => d.points.some((p) => p.key === key && p.access?.write))
    .map(([key, name]) => ({ key, name }));
}

const has = (d, key, write = false) => d.points.some((p) => p.key === key && (!write || p.access?.write));

/** What a device is, for choosing how to show it. */

// ---- the plan -------------------------------------------------------------------

const PIN_ICON = { light: 'light', group: 'light-group', plug: 'power', fan: 'fan', climate: 'air-conditioner', camera: 'cctv', speaker: 'speaker', tv: 'tv', cover: 'shutter' };

/** The icon a plan pin (or a token on the Plan page) shows for a device. */
export function pinIcon(d) {
  const kind = deviceKind(d);
  // A valve that heats draws a radiator, not a split: both are `climate`,
  // and only the heating one carries a setpoint and a mode.
  if (kind === 'climate' && (pointHas(d, 'system_mode') || pointHas(d, 'occupied_heating_setpoint'))) return 'radiator';
  if (PIN_ICON[kind]) return PIN_ICON[kind];
  if (pointHas(d, 'smoke')) return 'fire';
  if (pointHas(d, 'water_leak') || pointHas(d, 'watersensor_state')) return 'water';
  if (pointHas(d, 'contact') || pointHas(d, 'doorcontact_state')) return 'door';
  if (pointHas(d, 'occupancy') || pointHas(d, 'motion') || pointHas(d, 'pir')) return 'motion';
  if (pointHas(d, 'temperature') || pointHas(d, 'temp_current')) return 'thermometer';
  return 'info';
}

/** A short reading next to a plan pin. A drawn floor keeps it to power
 *  (the temperature would crowd a floor plan that already shows fixtures). */
export function pinReading(d, { drawn = false } = {}) {
  const temp = value(d.id, 'temperature') ?? value(d.id, 'temp_current');
  if (typeof temp === 'number' && deviceKind(d) !== 'climate' && !drawn) return `${num(temp, 1)}°`;
  const p = value(d.id, 'power') ?? value(d.id, 'cur_power');
  if (typeof p === 'number' && p >= 1) return `${num(p)} W`;
  return null;
}

/** The point `pinReading` reads, so the figure on the plan can open it. */
export function pinReadingPoint(d, { drawn = false } = {}) {
  const temp = readingPoint(d.id, ['temperature', 'temp_current']);
  if (temp && deviceKind(d) !== 'climate' && !drawn && typeof value(d.id, temp) === 'number') return temp;
  const p = readingPoint(d.id, ['power', 'cur_power']);
  if (p && typeof value(d.id, p) === 'number') return p;
  return null;
}

/** A device id as the hub knows it: the plan may carry an older spelling
 *  (a case drift after a rename), so the canonical key wins. */
export function canonicalId(id) {
  if (hub.devices[id]) return id;
  const lower = String(id).toLowerCase();
  return Object.keys(hub.devices).find((k) => k.toLowerCase() === lower) ?? id;
}

/** The device a plan id points at, tolerating that case drift. */
export function deviceOf(id) {
  return hub.devices[canonicalId(id)] ?? null;
}

/** Rooms with their devices sorted by kind, the layout's order first. */
export function roomList() {
  const defs = home.config?.rooms ?? [];
  const map = new Map(defs.map((r) => [r.name, []]));
  // A fixture's bulbs and relay show inside it, not beside it.
  const inFixture = new Set(Object.values(hub.devices).filter(isFixture).flatMap((d) => d.members ?? []));
  for (const d of Object.values(hub.devices)) {
    if (hidden(d.id) || inFixture.has(d.id)) continue;
    const room = roomOf(d);
    if (!room) continue;
    if (!map.has(room)) map.set(room, []);
    map.get(room).push(d);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length)
    .map(([name, list]) => {
      const by = (...kinds) => list.filter((d) => kinds.includes(deviceKind(d)));
      return {
        name,
        icon: defs.find((r) => r.name === name)?.icon ?? 'home',
        group: by('group')[0] ?? null,
        lights: by('light'),
        plugs: by('plug').filter((d) => !quiet(d.id)),
        covers: by('cover'),
        climates: by('climate'),
        media: by('tv', 'speaker'),
        sensors: [...by('sensor', 'camera', 'printer'), ...by('plug').filter((d) => quiet(d.id))],
        lit: by('light').filter((d) => isOn(d.id)).length,
      };
    });
}

/** The lamps of a room an ambiance can reach: those that dim, tint or warm,
 *  and the members of its group (a Hue room). */
export function lampsOf(room) {
  const can = (d) => d?.points.some((p) => ['brightness', 'color', 'color_temp'].includes(p.key) && p.access?.write);
  const ids = [];
  const add = (id) => !ids.includes(id) && ids.push(id);
  for (const d of room.lights) {
    // A fixture's bulbs take the look one by one (a colour each).
    if (isFixture(d)) (d.members ?? []).filter((m) => can(device(m))).forEach(add);
    else if (can(d)) add(d.id);
  }
  for (const m of room.group?.members ?? []) add(m);
  return ids;
}

// ---- acting --------------------------------------------------------------------

const headers = { 'content-type': 'application/json', 'x-moli-origin': 'ui' };

/** Sends an order. Held by the guard (protected room, quiet hours): asks
 *  « c'est moi » through the PIN sheet, then approves it. */
export async function act(point, val, label) {
  hub.pending[point] = val;
  try {
    const res = await fetch('/api/command', {
      method: 'POST',
      headers,
      body: JSON.stringify({ point, value: val }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 202) {
      delete hub.pending[point];
      home.held = { id: body.pending, point, reason: body.reason, label };
      return 'held';
    }
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    setTimeout(() => {
      if (hub.pending[point] === val) delete hub.pending[point];
    }, 8000);
    return 'ok';
  } catch (err) {
    delete hub.pending[point];
    note(t('commun.echec', { label: label ?? t('commun.commande'), error: humanError(err.message) }), 'error');
    return 'error';
  }
}

// ---- ambiances -----------------------------------------------------------------

export const looks = $state({ list: null, busy: null });

/** The ambiances Moli knows (`GET /api/ambiances`), fetched once. */
export async function loadAmbiances() {
  if (looks.list) return;
  try {
    const res = await fetch('/api/ambiances');
    if (res.ok) looks.list = await res.json();
  } catch {
    /* next time */
  }
}

/** Several lights at once: `{ ambiance }`, `{ color }` or `{ white }`.
 *  A protected room asks for the code, then tries again as a human. */
export async function setLook(lights, look, label) {
  const key = JSON.stringify(look);
  looks.busy = key;
  try {
    const res = await fetch('/api/ambiance', { method: 'POST', headers, body: JSON.stringify({ lights, ...look }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    if (body.held?.length) {
      home.held = { label, reason: body.held[0].reason, custom: () => setLook(lights, look, label) };
      return 'held';
    }
    if (body.failed?.length) {
      const n = body.failed.length;
      note(t('commun.lampes_pas_suivi', { label, count: n, error: humanError(body.failed[0].error) }), 'error');
    } else if (!body.done?.length) {
      note(t('commun.aucune_lampe', { label }), 'info');
    }
    return 'ok';
  } catch (err) {
    note(t('commun.echec', { label, error: humanError(err.message) }), 'error');
    return 'error';
  } finally {
    if (looks.busy === key) looks.busy = null;
  }
}

function humanError(message) {
  if (/unreachable|injoignable|did not answer|no answer/i.test(message)) return t('commun.appareil_injoignable');
  if (/read-only|lecture seule|cannot be set/i.test(message)) return t('commun.non_pilotable');
  return message;
}

export function toggle(id, label, point = null) {
  const d = device(id);
  const key = point ?? powerKey(d);
  if (!key) return;
  const current = value(id, key);
  const next = typeof current === 'string' ? (truthy(current) ? 'OFF' : 'ON') : !truthy(current);
  return act(`${id}/${key}`, next, label ?? nameOf(id));
}

/** « C'est moi » : opens a human session with the code, then lets the
 *  held order through. Returns an error message or null. */
export async function confirmHeld(pin) {
  const held = home.held;
  if (!held) return null;
  const error = await login(pin);
  if (error) return /verrou|locked/i.test(error) ? t('commun.trop_d_essais') : t('commun.code_incorrect');
  if (held.custom) {
    home.held = null;
    await held.custom();
    return null;
  }
  await decide({ id: held.id, point: held.point }, true);
  held.onApproved?.();
  home.held = null;
  return null;
}

export async function dismissHeld() {
  const held = home.held;
  home.held = null;
  if (held?.custom) held.onCancel?.();
  else if (held) await decide({ id: held.id, point: held.point }, false);
}

export { refreshSession };

// ---- formatting ----------------------------------------------------------------

export function num(v, digits = 0) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export const HOUSE_TZ = 'Europe/Paris';

export function clock(ts) {
  return new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: HOUSE_TZ });
}

/** « Samedi 3 octobre »: only the first letter up. */
export function longDate(ts) {
  const s = new Date(ts).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: HOUSE_TZ });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** When a camera last saw someone (or someone rang), from the history:
 *  the reported value refreshes all the time, the event does not. */
export async function lastSeen(id, keys = ['person', 'doorbell'], hours = 48) {
  const times = await Promise.all(
    keys.map((k) =>
      fetch(`/api/history?point=${encodeURIComponent(`${id}/${k}`)}&hours=${hours}&points=2000`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          const on = (v) => v === true || (typeof v === 'number' && v > 0);
          const hits = (s?.raw ?? []).filter(([, v]) => on(v));
          return hits.length ? hits.at(-1)[0] : null;
        })
        .catch(() => null),
    ),
  );
  const found = times.filter(Boolean);
  return found.length ? Math.max(...found) : null;
}

export function greeting(ts) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: HOUSE_TZ }).format(new Date(ts)));
  if (h < 5) return t('commun.salut.nuit');
  if (h < 12) return t('commun.salut.matin');
  if (h < 18) return t('commun.salut.apres_midi');
  return t('commun.salut.soir');
}

export function relative(ts, now = Date.now()) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t('commun.relatif.instant');
  if (s < 3600) return t('commun.relatif.minutes', { n: Math.round(s / 60) });
  if (s < 86400) return t('commun.relatif.heures', { n: Math.round(s / 3600) });
  return t('commun.relatif.jours', { n: Math.round(s / 86400) });
}

// ---- heating -------------------------------------------------------------------

/** The thermostatic valves the house holds: a valve states its setpoint the
 *  ZCL way (`system_mode` / `occupied_heating_setpoint`), never as a split's
 *  `target_temperature`. Nothing is declared anywhere: the devices say so. */
export function heatingValves() {
  return Object.values(hub.devices ?? {}).filter(
    (d) => !hidden(d.id) && (has(d, 'system_mode') || has(d, 'occupied_heating_setpoint')),
  );
}

/** The setpoint point of a climate device, whatever it is called. */
export const setpointKey = (d) => (has(d, 'target_temperature') ? 'target_temperature' : has(d, 'occupied_heating_setpoint') ? 'occupied_heating_setpoint' : null);
