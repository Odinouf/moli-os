import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceKind, powerKey } from './kinds.js';
import { deriveRows } from './layout.js';

const dev = (id, points, extra = {}) => ({
  id,
  points: points.map((p) => (typeof p === 'string' ? { key: p } : p)),
  ...extra,
});

test('a read-only key point does not make a device a tv', () => {
  const d = dev('x:1', [{ key: 'key', access: { read: true } }]);
  assert.equal(deviceKind(d), 'sensor');
  assert.equal(deviceKind(dev('x:2', [{ key: 'key', access: { write: true } }])), 'tv');
});

test('a ZCL valve is a climate device', () => {
  assert.equal(deviceKind(dev('x:3', ['system_mode', 'occupied_heating_setpoint'])), 'climate');
});

test('the row and the plan agree on what a device is', () => {
  const devices = [
    dev('light:salon', [{ key: 'on', access: { write: true } }], { label: { room: 'Salon', name: 'Salon' } }),
    dev('x:led', [{ key: 'key', access: { read: true } }], { label: { room: 'Salon' } }),
  ];
  const [row] = deriveRows({ tablette: { rows: [{ name: 'Salon', match: '^salon$' }] } }, devices);
  assert.equal(row.id, 'light:salon');
  assert.ok(!row.subs.some((s) => s.point?.startsWith('x:led')));
});

test('powerKey needs a writable point', () => {
  assert.equal(powerKey(dev('x:4', [{ key: 'on', access: { read: true } }])), null);
  assert.equal(powerKey(dev('x:5', [{ key: 'on', access: { write: true } }])), 'on');
});
