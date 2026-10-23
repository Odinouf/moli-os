import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLean } from './lean.js';

test('a generous device animates', () => {
  assert.equal(isLean({ deviceMemory: 8, hardwareConcurrency: 8, reducedMotion: false }), false);
});

test('a gigabyte of memory is the floor, whatever the cores', () => {
  assert.equal(isLean({ deviceMemory: 1, hardwareConcurrency: 8, reducedMotion: false }), true);
  assert.equal(isLean({ deviceMemory: 1, hardwareConcurrency: 4, reducedMotion: false }), true);
});

test('two gigabytes and four cores is also a small device', () => {
  assert.equal(isLean({ deviceMemory: 2, hardwareConcurrency: 4, reducedMotion: false }), true);
});

test('four gigabytes, even on four cores, is roomy', () => {
  assert.equal(isLean({ deviceMemory: 4, hardwareConcurrency: 4, reducedMotion: false }), false);
  assert.equal(isLean({ deviceMemory: 2, hardwareConcurrency: 8, reducedMotion: false }), false);
});

test('plenty of memory on any number of cores animates (a 4-core laptop is fine)', () => {
  assert.equal(isLean({ deviceMemory: 8, hardwareConcurrency: 4, reducedMotion: false }), false);
  assert.equal(isLean({ deviceMemory: 16, hardwareConcurrency: 2, reducedMotion: false }), false);
});

test('reduced motion wins over anything the device says', () => {
  assert.equal(isLean({ deviceMemory: 16, hardwareConcurrency: 16, reducedMotion: true }), true);
  assert.equal(isLean({ deviceMemory: 16, hardwareConcurrency: 16, reducedMotion: false }), false);
});

test('what the browser does not say is not held against it', () => {
  assert.equal(isLean({ deviceMemory: undefined, hardwareConcurrency: undefined, reducedMotion: false }), false);
  assert.equal(isLean({ deviceMemory: undefined, hardwareConcurrency: 4, reducedMotion: false }), false);
  assert.equal(isLean({ deviceMemory: 2, hardwareConcurrency: undefined, reducedMotion: false }), false);
});
