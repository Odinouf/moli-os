import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveRows } from './layout.js';

const sensor = (id, room, points, state = {}) => ({ id, label: { room }, points: points.map((key) => ({ key })), state });
const light = (id, room, name) => ({ id, label: { room, name }, points: [{ key: 'on', access: { write: true } }] });
const valve = (id, room, state = {}) => ({ id, label: { room }, points: [{ key: 'system_mode' }, { key: 'occupied_heating_setpoint' }, { key: 'local_temperature' }, { key: 'running_state' }], state });
const config = (rows) => ({ tablette: { rows } });

const base = [light('light:salon', 'Salon', 'Salon'), sensor('sensor:temp', 'Salon', ['temperature'], { temperature: { value: 20.1 } }), sensor('sensor:motion', 'Salon', ['motion'], { motion: { value: true } })];

test('one room aggregates all sensors', () => {
  const [row] = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), base);
  assert.deepEqual(row.subs.map((s) => s.icon), ['thermometer', 'motion']);
});

test('valve follows resolved device room, not row valve hint', () => {
  const devices = [light('light:alicia', 'Alicia', 'Alicia'), valve('valve:alicia', 'Alicia', { occupied_heating_setpoint: { value: 18.5 }, system_mode: { value: 'auto' } }), valve('valve:salon', 'Salon', { occupied_heating_setpoint: { value: 16 }, system_mode: { value: 'heat' } })];
  const [row] = deriveRows(config([{ name: 'Alicia', match: '^alicia$', valve: 'valve:salon' }]), devices);
  assert.equal(row.subs.find((s) => s.icon === 'radiator').point, null);
  assert.equal(row.subs.find((s) => s.icon === 'radiator').text, '18.5°');
});

test('local_temperature is rendered and points to its history', () => {
  const devices = [light('light:salon', 'Salon', 'Salon'), valve('valve:salon', 'Salon', { occupied_heating_setpoint: { value: 16 }, system_mode: { value: 'heat' }, local_temperature: { value: 22.6 } })];
  const [row] = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), devices);
  assert.equal(row.subs.find((s) => s.icon === 'radiator').point, 'valve:salon/local_temperature');
  assert.equal(row.subs.find((s) => s.icon === 'radiator').text, '22.6°');
});

test('label room wins over native room and sensor_room is ignored', () => {
  const devices = [
    { ...light('light:parents', 'Parents', 'Bandeau chambre'), native_room: 'Chambre' },
    sensor('sensor:parents', 'Parents', ['temperature'], { temperature: { value: 19.6 } }),
    sensor('sensor:chambre', 'Chambre', ['temperature'], { temperature: { value: 11.1 } }),
  ];
  const [row] = deriveRows(config([{ name: 'Parents', match: 'bandeau chambre', sensor_room: 'Chambre' }]), devices);
  assert.deepEqual(row.subs.map((s) => s.text), ['19.6°']);
});

test('a room that watches shows its motion chip, warmed when someone is there', () => {
  const idle = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), [...base.filter((d) => d.id !== 'sensor:motion'), sensor('sensor:m', 'Salon', ['motion'], { motion: { value: false } })]);
  assert.deepEqual(idle[0].subs.filter((s) => s.icon === 'motion').map((s) => s.tone), ['']);
  const lit = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), [...base.filter((d) => d.id !== 'sensor:motion'), sensor('sensor:m', 'Salon', ['motion'], { motion: { value: true } })]);
  assert.deepEqual(lit[0].subs.filter((s) => s.icon === 'motion').map((s) => s.tone), ['warm']);
});

test('missing resolved device is skipped', () => {
  assert.deepEqual(deriveRows(config([{ name: 'Absent', match: '^nope$' }]), base), []);
});

test('empty derivation falls back to tablette rows, shaped for the component', () => {
  const rows = [{ name: 'Legacy', id: 'missing', icon: 'light' }];
  const [row] = deriveRows(config(rows), []);
  assert.equal(row.key, 'missing');
  assert.equal(row.label, 'Legacy');
  assert.equal(row.icon, 'light');
  assert.deepEqual(row.subs, []);
});

 test('star device is an extra state chip, not a reading', () => {
  const devices = [light('light:alicia', 'Alicia', 'Bandeau Alicia'), { id: 'star:alicia', label: { room: 'Alicia', name: 'Star Alicia' }, points: [{ key: 'switch_led' }], state: { switch_led: { value: true } } }];
  const [row] = deriveRows(config([{ name: 'Alicia', match: 'bandeau alicia' }]), devices);
  assert.equal(row.subs.some((s) => s.text === 'Star Alicia'), true);
});

 test('a lamp commands its room group, not itself', () => {
  const devices = [
    light('hue:bandeau', 'Parents', 'Bandeau chambre'),
    light('hue:parents-lamp', 'Parents', 'Chambre parents'),
    { id: 'hue:group', label: { room: 'Parents', name: 'Chambre' }, model: 'room', members: ['hue:bandeau', 'hue:parents-lamp'], points: [{ key: 'on', access: { write: true } }] },
  ];
  const [row] = deriveRows(config([{ name: 'Parents', match: '^bandeau chambre$' }]), devices);
  assert.equal(row.id, 'hue:group');
});

 test('a group that holds a sensor is not a lamp group', () => {
  const devices = [
    light('hue:ext', 'Dressing', 'Extension couloir'),
    sensor('hue:cap', 'Dressing', ['temperature'], { temperature: { value: 18 } }),
    { id: 'hue:group', label: { room: 'Dressing', name: 'Dressing' }, model: 'room', members: ['hue:ext', 'hue:cap'], points: [{ key: 'on', access: { write: true } }] },
  ];
  const [row] = deriveRows(config([{ name: 'Couloir', match: 'couloir' }]), devices);
  assert.equal(row.id, 'hue:ext');
});

test('the valve witness says what the valve is doing, not just its colour', () => {
  const mk = (state) => [light('light:salon', 'Salon', 'Salon'), valve('valve:salon', 'Salon', { occupied_heating_setpoint: { value: 18.5 }, system_mode: { value: 'heat' }, running_state: { value: state }, local_temperature: { value: 21 } })];
  const cat = {
    'maison.accueil.vanne_titre': 'Vanne : {etat} · consigne {temp}',
    'maison.accueil.vanne_titre_seule': 'Vanne : {etat}',
    'maison.accueil.vanne_chauffe': 'chauffe',
    'maison.accueil.vanne_repos': 'au repos',
    'maison.accueil.vanne_eteinte': 'éteinte',
    'maison.accueil.vanne_hors_ligne': 'hors ligne',
  };
  const tt = (key, vars) => {
    let s = cat[key] ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) s = s.replace(`{${k}}`, v);
    return s;
  };
  const heating = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), mk('heat'), tt)[0].subs.find((s) => s.icon === 'radiator');
  const idle = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), mk('idle'), tt)[0].subs.find((s) => s.icon === 'radiator');
  assert.notEqual(heating.dot, idle.dot);
  assert.equal(heating.dot, 'warm');
  assert.equal(idle.dot, 'cool');
  assert.match(heating.title, /18\.5/);
  assert.ok(heating.label);
});

test('an off valve states the word, because a tablet has no tooltip', () => {
  const devices = [light('light:salon', 'Salon', 'Salon'), valve('valve:salon', 'Salon', { occupied_heating_setpoint: { value: 16 }, system_mode: { value: 'off' }, local_temperature: { value: 19 } })];
  const chip = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), devices, (k) => k)[0].subs.find((s) => s.icon === 'radiator');
  assert.equal(chip.dot, 'off');
  assert.equal(chip.text, 'maison.accueil.vanne_eteinte');
  assert.equal(chip.point, null);
});

test('two thermometers on one row can be told apart', () => {
  const devices = [
    light('light:salon', 'Salon', 'Salon'),
    sensor('sensor:poele', 'Salon', ['temperature'], { temperature: { value: 27.7 } }),
    valve('valve:salon', 'Salon', { occupied_heating_setpoint: { value: 18.5 }, system_mode: { value: 'heat' }, local_temperature: { value: 22.6 } }),
  ];
  const subs = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), devices, (k) => k)[0].subs;
  const temps = subs.filter((s) => s.icon === 'thermometer');
  assert.equal(temps.length, 1);
  assert.match(temps[0].title, /sensor:poele|Capteur|salon/i);
  const presence = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), [...devices, sensor('sensor:m', 'Salon', ['motion'], { motion: { value: false } })], (k) => k)[0].subs.find((s) => s.icon === 'motion');
  assert.equal(presence.label, 'maison.accueil.presence');
});

 test('multiple rows keep configured order and pair flags', () => {
  const rows = deriveRows(config([{ name: 'Salon', match: '^salon$', pair: true }, { name: 'Alicia', match: '^alicia$', pair: true }]), base.concat(light('light:alicia', 'Alicia', 'Alicia')));
  assert.deepEqual(rows.map((r) => [r.label, r.pair]), [['Salon', true], ['Alicia', true]]);
});

test('every chip on a row has its own key, so Svelte never sees two alike', () => {
  const devices = [
    light('light:salon', 'Salon', 'Salon'),
    sensor('sensor:a', 'Salon', ['temperature', 'humidity'], { temperature: { value: 20 }, humidity: { value: 55 } }),
    sensor('sensor:b', 'Salon', ['temperature'], { temperature: { value: 20 } }),
    sensor('sensor:m', 'Salon', ['motion'], { motion: { value: true } }),
    valve('valve:salon', 'Salon', { occupied_heating_setpoint: { value: 18.5 }, system_mode: { value: 'heat' }, local_temperature: { value: 22.6 } }),
  ];
  const subs = deriveRows(config([{ name: 'Salon', match: '^salon$' }]), devices, (k) => k)[0].subs;
  const keys = subs.map((s) => s.key);
  assert.equal(keys.filter(Boolean).length, keys.length);
  assert.equal(new Set(keys).size, keys.length);
});

test('an empty hub still draws the configured rows, each with its own key', () => {
  const rows = deriveRows(config([{ name: 'Salon', match: '^salon$' }, { name: 'Chambre', room: 'Chambre' }]), []);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.key), ['^salon$', 'Chambre']);
  assert.ok(rows.every((r) => r.subs.length === 0));
});

test('a room alias names the same room as the layout does', () => {
  const cfg = { ...config([{ name: 'Cave', match: '^cave$' }]), rooms: [{ name: 'Cave à Vins', aliases: ['Cave'] }] };
  const devices = [light('light:cave', 'Cave', 'Cave'), sensor('sensor:cave', 'Cave à Vins', ['temperature'], { temperature: { value: 12.4 } })];
  const [row] = deriveRows(cfg, devices);
  assert.deepEqual(row.subs.map((s) => s.text), ['12.4°']);
});

test('a row label made of an i18n key is translated', () => {
  const [row] = deriveRows(config([{ nkey: 'salon.titre', match: '^salon$' }]), base, (k) => (k === 'salon.titre' ? 'Le salon' : k));
  assert.equal(row.label, 'Le salon');
});
