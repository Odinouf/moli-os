import { test } from 'node:test';
import assert from 'node:assert/strict';
import { powerTone } from './power.js';

test('a quiet house has no colour', () => {
  assert.equal(powerTone(0), '');
  assert.equal(powerTone(459), '');
  assert.equal(powerTone(999), '');
});

test('a thousand watts warms the pill', () => {
  assert.equal(powerTone(1000), 'warm');
  assert.equal(powerTone(2999), 'warm');
});

test('three thousand watts raises the alarm', () => {
  assert.equal(powerTone(3000), 'alert');
  assert.equal(powerTone(4200), 'alert');
});

test('the clamp can read negative; the colour follows the magnitude', () => {
  assert.equal(powerTone(-1500), 'warm');
  assert.equal(powerTone(-4200), 'alert');
});

test('a reading that is not a number earns nothing', () => {
  assert.equal(powerTone(null), '');
  assert.equal(powerTone(undefined), '');
  assert.equal(powerTone('—'), '');
  assert.equal(powerTone(Number.NaN), '');
});
