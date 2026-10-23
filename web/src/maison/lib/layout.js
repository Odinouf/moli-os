// The tablette's rows, derived from `data/home.json` (`tablette.rows`) and the
// hub's devices: which device commands a row, and every reading its room holds.
//
// Dependency-free on purpose (no Svelte, no hub), like `lib/trv.js`: the row
// component and the node tests load the same code. The room rules
// (`roomKey`, `roomNamed`, `roomOf`) live in `lib/rooms.js`, so a row, the
// Plan and the model agree on what a room is called.
import { roomKey, roomOf } from './rooms.js';
import { powerTone } from './power.js';
import { isValve, witnessOf } from './trv.js';
import { deviceKind, powerKey } from './kinds.js';

export { roomOf };

const point = (d, keys) => keys.find((key) => (d?.points ?? []).some((p) => p.key === key)) ?? null;
const value = (d, key) => (key ? (d?.state?.[key]?.value ?? null) : null);
const has = (d, key, write = false) => (d?.points ?? []).some((p) => p.key === key && (!write || p.access?.write));

/** What a device measures — a sensor in the dashboard's sense. */
const MEASURES = ['temperature', 'temp_current', 'local_temperature', 'humidity', 'humidity_value', 'motion', 'occupancy', 'pir'];
const isSensor = (d) => (d?.points ?? []).some((p) => MEASURES.includes(p.key));

/** What a row shows as an extra state chip: no figure, just its state (the
 *  Star Projector: `switch_led`, `work_mode`, nothing to measure). */
const isStateDevice = (d) => has(d, 'switch_led') || has(d, 'work_mode');
export const displayName = (d) => d?.label?.name ?? d?.native_name ?? d?.id;

const kindOf = deviceKind;

/** The Hue room group a light belongs to, when that group is made of lamps
 *  only: a tap lights the whole room, together. A group that also holds a
 *  sensor (the dressing's) is not one — up, never a mixed bag. */
function roomGroupOf(light, devices, rooms) {
  if (!light || kindOf(light) !== 'light') return null;
  const room = roomKey(roomOf(light, rooms));
  return (
    devices.find(
      (d) =>
        kindOf(d) === 'group' &&
        roomKey(roomOf(d, rooms)) === room &&
        (d.members ?? []).length > 1 &&
        (d.members ?? []).every((id) => kindOf(devices.find((x) => x.id === id)) === 'light'),
    ) ?? null
  );
}

/** The device a row commands: by id, by name (`match`, a regular expression),
 *  or by room. `kind` narrows a name match (the VMC row commands the plug, not
 *  the thermometer that shares its name). A lamp commands its room's Hue group
 *  over itself: a tap lights the whole room. */
function resolve(def, devices, rooms) {
  if (def.id) return devices.find((d) => d.id === def.id) ?? null;
  if (def.match) {
    const re = new RegExp(def.match, 'i');
    const hits = devices.filter((d) => re.test(displayName(d)) && (!def.kind || kindOf(d) === def.kind));
    const pick = (def.group ? hits.find((d) => (d.members ?? []).length > 1) : null) ?? hits[0] ?? null;
    return roomGroupOf(pick, devices, rooms) ?? pick;
  }
  if (def.room) {
    const pool = devices.filter((d) => roomKey(roomOf(d, rooms)) === roomKey(def.room) && (!def.kind || kindOf(d) === def.kind));
    const pick = pool.find((d) => powerKey(d) != null) ?? pool[0] ?? null;
    return roomGroupOf(pick, devices, rooms) ?? pick;
  }
  return null;
}

/** Every reading a room holds, not the first sensor found: a temperature, the
 *  humidity of whoever measures it, and the presence the room reports. A
 *  device that only measures is never drawn for its own sake — the row carries
 *  what its room says. Each chip names its measure and its device: two
 *  thermometers on one row must be tellable apart without tapping. */
function readings(inRoom, t) {
  const out = [];
  const figure = (keys, icon, word, format) => {
    for (const d of inRoom) {
      const key = point(d, keys);
      const v = value(d, key);
      if (typeof v !== 'number') continue;
      const text = format(v);
      const grand = t(word);
      out.push({ key: `${d.id}/${key}`, icon, text, title: `${displayName(d)} · ${grand} ${text}`, label: `${grand} ${text}`, point: `${d.id}/${key}` });
      return;
    }
  };
  figure(['temperature', 'temp_current', 'local_temperature'], 'thermometer', 'maison.point.temperature', (v) => `${v.toFixed(1)}°`);
  figure(['humidity', 'humidity_value'], 'humidity', 'maison.point.humidity', (v) => `${Math.round(v)} %`);
  // Presence: the room's motion sensor is a pastille of its own — the icon
  // alone, warmed when someone is there. A room that watches says so even
  // when it is quiet (a missing chip would read as « nobody watches »). The
  // word is « présence », not the sensor's name: the icon is not its owner.
  const watcher = inRoom.find((d) => point(d, ['motion', 'occupancy', 'pir']));
  const key = watcher ? point(watcher, ['motion', 'occupancy', 'pir']) : null;
  const seen = value(watcher, key);
  if (key) {
    const presence = t('maison.accueil.presence');
    out.push({ key: `presence:${watcher.id}`, icon: 'motion', text: '', tone: seen === true || seen === 'pir' ? 'warm' : '', label: presence, title: presence, point: null });
  }
  return out;
}

/** The valve's witness: what it is doing, in the four states a household
 *  reads at a glance (`witnessOf`, the same one the Chauffage page uses). The
 *  figure shown is the one whose history opens — never the setpoint under a
 *  curve that is not its own. The words and the tooltip are the ones patch
 *  n°8 set: a tablet has no mouse. */
const VANNE_DOT = { heating: 'warm', idle: 'cool', off: 'off', offline: 'alert' };
const VANNE_WORD = { heating: 'vanne_chauffe', idle: 'vanne_repos', off: 'vanne_eteinte', offline: 'vanne_hors_ligne' };

function valveChip(valve, t) {
  if (!valve) return null;
  const w = witnessOf(valve, (_, key) => value(valve, key));
  if (!w) return null;
  const etat = t(`maison.accueil.${VANNE_WORD[w.state]}`);
  const temp = w.setpoint == null ? null : `${w.setpoint.toFixed(1)}°`;
  const measuredKey = point(valve, ['local_temperature', 'temperature']);
  const measured = value(valve, measuredKey);
  // A chip with no mouse must say the state: the figure when the valve heats
  // or waits, the word when it does nothing (off, offline).
  const talking = w.state === 'heating' || w.state === 'idle';
  const shown = talking ? (typeof measured === 'number' ? `${measured.toFixed(1)}°` : (temp ?? etat)) : etat;
  const title = temp ? t('maison.accueil.vanne_titre', { etat, temp }) : t('maison.accueil.vanne_titre_seule', { etat });
  return {
    key: `valve:${valve.id}`,
    icon: 'radiator',
    text: shown,
    dot: VANNE_DOT[w.state],
    title,
    label: title,
    // A valve that does nothing shows a word, not a figure: tapping what is
    // not displayed would open a curve under a label that lies. Only the
    // talking states (heating, waiting) open their own measurement.
    point: talking && typeof measured === 'number' ? `${valve.id}/${measuredKey}` : null,
  };
}

/** The row's wattage, when it watches a clamp of the Linky: `def.power` names
 *  the point (`power_residuel`, `power_appart`). The colour follows the same
 *  rule as the header band (`lib/power.js`), never a second palette. */
function powerChip(def, config, read) {
  if (!def.power) return null;
  const linky = config?.badges?.linky ?? 'linky:linky';
  const w = read(linky, def.power);
  if (w == null || !Number.isFinite(Number(w))) return null;
  return { key: `power:${def.power}`, icon: 'flash', text: `${Math.round(Math.abs(w))} W`, tone: powerTone(w) || 'cool', point: `${linky}/${def.power}` };
}

/** The fan speed a row shows, when the device it commands has one (a Hue room
 *  never does; its lamps might). */
function fanChip(main, list, read) {
  const pool = [main, ...(main.members ?? []).map((id) => list.find((d) => d.id === id) ?? { id })];
  const fan = pool.find((d) => has(d, 'fan_speed'));
  if (!fan) return null;
  const v = read(fan.id, 'fan_speed');
  return typeof v === 'number' ? { key: `fan:${fan.id}`, icon: 'fan', text: `${v} %`, point: `${fan.id}/fan_speed` } : null;
}

/** The rows the tablette draws. Same order, same pairing, same icons as
 *  `tablette.rows`: only the readings of a row change. An entry whose device
 *  is gone is skipped (no phantom row). When nothing can be derived at all
 *  (a hub with no labelled device yet), the configured entries are returned
 *  as they are, so the page still draws. */
export function deriveRows(config, devices, t = (key) => key) {
  const defs = config?.tablette?.rows ?? [];
  const rooms = config?.rooms ?? [];
  const list = devices ?? [];
  const read = (id, key) => value(list.find((d) => d.id === id), key);
  const rows = defs.flatMap((def) => {
    const main = resolve(def, list, rooms);
    if (!main) return [];
    const room = roomOf(main, rooms);
    // The row's room is its device's room: `sensor_room` and `def.room` no
    // longer decide what a row reads.
    const same = (name) => list.filter((d) => roomKey(roomOf(d, rooms)) === roomKey(name));
    // A row reads its device's room. A row whose device measures nothing (the
    // plug that feeds the extractor, a Hue group) reads the room it is named
    // after instead: the VMC + SDB row shows the VMC + SDB thermometer, not an
    // empty line. Nothing is invented — that room's own sensors speak.
    const fallback = def.room ?? def.name ?? null;
    const own = room ? same(room) : [main];
    const inRoom = own.some((d) => isSensor(d) && !isValve(d)) || !fallback ? own : same(fallback);
    const named = def.valve ? list.find((d) => d.id === def.valve && roomKey(roomOf(d, rooms)) === roomKey(room)) ?? null : null;
    const valve = named ?? inRoom.find(isValve) ?? null;
    const sensors = inRoom.filter((d) => isSensor(d) && !isValve(d));
    const states = inRoom.filter((d) => d !== main && isStateDevice(d));
    const subs = [
      valveChip(valve, t),
      fanChip(main, list, read),
      ...readings(sensors, t),
      ...states.map((d) => ({ key: `state:${d.id}`, icon: 'info', text: displayName(d), label: displayName(d), title: displayName(d), point: null })),
      powerChip(def, config, read),
    ].filter(Boolean);
    return [
      {
        key: def.id ?? def.match ?? def.room ?? def.name,
        id: main.id,
        label: def.nkey ? t(def.nkey) : (def.name ?? displayName(main)),
        icon: def.icon ?? 'light',
        level: def.level ?? null,
        toggles: def.toggles !== false,
        pair: def.pair === true,
        subs,
      },
    ];
  });
  // Nothing derived yet (the hub has no device): the configured entries are
  // drawn as they are, but shaped like a row — every one needs its own key,
  // and Svelte refuses two alike.
  return rows.length || list.length
    ? rows
    : defs.map((def, i) => ({
        key: def.id ?? def.match ?? def.room ?? def.name ?? `row-${i}`,
        id: null,
        label: def.nkey ? t(def.nkey) : (def.name ?? def.room ?? ''),
        icon: def.icon ?? 'light',
        level: def.level ?? null,
        toggles: def.toggles !== false,
        pair: def.pair === true,
        subs: [],
      }));
}

export { kindOf };
