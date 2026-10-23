import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValve, valveIn, witnessOf } from './trv.js';
import { roomKey } from './rooms.js';

const valve = (id, room = null, online = null) => ({
  id,
  online,
  label: room ? { room } : {},
  points: [
    { key: 'occupied_heating_setpoint', access: { read: true, write: true } },
    { key: 'system_mode', access: { read: true, write: true } },
    { key: 'running_state', access: { read: true, write: false } },
  ],
});

const sensor = (id, room) => ({ id, label: { room }, points: [{ key: 'temperature', access: { read: true } }] });

const roomOf = (d) => d?.label?.room ?? null;

test('a TRV is recognised by its ZCL target, not by a brand', () => {
  assert.equal(isValve(valve('z2m:a')), true);
  assert.equal(isValve(sensor('z2m:b', 'Alicia')), false);
  assert.equal(isValve(null), false);
});

test('rooms compare without accents or case', () => {
  assert.equal(roomKey('Étage 1'), roomKey('etage 1'));
  assert.equal(roomKey(' Alice '), roomKey('alice'));
});

test('the valve of a row is the one in that room', () => {
  const devices = [sensor('z2m:s', 'Alicia'), valve('z2m:v', 'Parents'), valve('z2m:w', 'Alicia')];
  assert.equal(valveIn(devices, 'Alicia', roomOf).id, 'z2m:w');
  assert.equal(valveIn(devices, 'alicia', roomOf).id, 'z2m:w');
  assert.equal(valveIn(devices, 'Cave', roomOf), null);
  assert.equal(valveIn(devices, null, roomOf), null);
});

test('a heating valve says so, with its setpoint', () => {
  // What a TRVZB really emits: `running_state` is `heat`, never `heating`.
  const read = (_, k) => ({ occupied_heating_setpoint: 18.5, system_mode: 'auto', running_state: 'heat' })[k];
  assert.deepEqual(witnessOf(valve('z2m:v'), read), { state: 'heating', setpoint: 18.5 });
});

test("Home Assistant's spelling of the same state still heats", () => {
  const read = (_, k) => ({ occupied_heating_setpoint: 18.5, system_mode: 'auto', running_state: 'heating' })[k];
  assert.deepEqual(witnessOf(valve('z2m:v'), read), { state: 'heating', setpoint: 18.5 });
});

test('a shut valve says it heats nothing, whatever the room does', () => {
  const read = (_, k) => ({ occupied_heating_setpoint: 16, system_mode: 'off', running_state: 'heating' })[k];
  assert.deepEqual(witnessOf(valve('z2m:v'), read), { state: 'off', setpoint: 16 });
});

test('an idle valve is at rest', () => {
  const read = (_, k) => ({ occupied_heating_setpoint: 18.5, system_mode: 'auto', running_state: 'idle' })[k];
  assert.deepEqual(witnessOf(valve('z2m:v'), read), { state: 'idle', setpoint: 18.5 });
});

test('an offline valve is offline first, even with a stale setpoint', () => {
  const read = (_, k) => ({ occupied_heating_setpoint: 18.5, system_mode: 'auto', running_state: 'heating' })[k];
  assert.equal(witnessOf(valve('z2m:v', null, false), read).state, 'offline');
});

test('a valve that says nothing earns no witness', () => {
  const read = () => null;
  assert.equal(witnessOf(valve('z2m:v'), read), null);
  assert.equal(witnessOf(null, read), null);
});
