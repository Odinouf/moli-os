import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toNum,
  seriesData,
  scaleFor,
  stepPath,
  bandPath,
  ticksFor,
  xTicksFor,
  statsFor,
} from './history.js';

const PAD = { l: 40, r: 10, t: 10, b: 24 };
const SIZE = { w: 560, h: 180 };

const numericSeries = (raw, from = 0, to = 1000) => ({ from, to, raw, buckets: [], before: null, total: raw.length });

test('toNum renders booleans as 0/1 and rejects anything else', () => {
  assert.equal(toNum(true), 1);
  assert.equal(toNum(false), 0);
  assert.equal(toNum(20.5), 20.5);
  assert.equal(toNum('open'), null);
  assert.equal(toNum(null), null);
  assert.equal(toNum(NaN), null);
});

test('seriesData maps raw points and drops undrawable values', () => {
  const data = seriesData(numericSeries([[0, 20], [10, 'open'], [20, 21]]));
  assert.deepEqual(data, [
    [0, 20, 20, 20],
    [20, 21, 21, 21],
  ]);
});

test('seriesData maps buckets with their min and max', () => {
  const series = { from: 0, to: 100, total: 6, before: null, raw: [], buckets: [{ ts: 0, avg: 0.5, min: 0, max: 1, count: 6 }] };
  assert.deepEqual(seriesData(series), [[0, 0.5, 0, 1]]);
});

test('seriesData prepends the value held at the window opening', () => {
  const series = { ...numericSeries([[100, 21]]), before: [0, 20] };
  assert.deepEqual(seriesData(series), [
    [0, 20, 20, 20],
    [100, 21, 21, 21],
  ]);
});

test('scaleFor maps the window onto the padded box', () => {
  const series = numericSeries([], 0, 1000);
  const data = [
    [0, 20, 20, 20],
    [1000, 22, 22, 22],
  ];
  const scale = scaleFor(series, data, PAD, SIZE);
  assert.equal(Math.round(scale.x(0)), PAD.l);
  assert.equal(Math.round(scale.x(1000)), SIZE.w - PAD.r);
  assert.ok(scale.y(20) > scale.y(22), 'a higher value sits higher');
});

test('scaleFor keeps a binary on 0..1 whatever the padding', () => {
  const series = numericSeries([], 0, 1000);
  const data = [
    [0, 0, 0, 0],
    [1000, 1, 1, 1],
  ];
  const scale = scaleFor(series, data, PAD, SIZE, true);
  assert.equal(scale.y0, 0);
  assert.equal(scale.y1, 1);
  assert.equal(Math.round(scale.y(1)), PAD.t);
  assert.equal(Math.round(scale.y(0)), SIZE.h - PAD.b);
});

test('scaleFor survives an empty series and a flat line', () => {
  assert.equal(scaleFor(numericSeries([]), [], PAD, SIZE), null);
  const flat = scaleFor(numericSeries([]), [[0, 5, 5, 5]], PAD, SIZE);
  assert.ok(Number.isFinite(flat.y(5)));
});

test('stepPath draws a step and holds the last value to now', () => {
  const series = numericSeries([], 0, 1000);
  const data = [
    [0, 0, 0, 0],
    [500, 1, 1, 1],
  ];
  const scale = scaleFor(series, data, PAD, SIZE, true);
  const d = stepPath(scale, data, 1000);
  assert.ok(d.startsWith('M'));
  assert.ok(d.includes('H'));
  assert.ok(d.includes('V'));
  assert.ok(d.endsWith(`H${scale.x(1000)}`));
  assert.equal(stepPath(null, data, 1000), '');
});

test('bandPath wraps min/max, and stays empty without buckets', () => {
  const series = numericSeries([], 0, 1000);
  const data = [
    [0, 0.5, 0, 1],
    [500, 0.5, 0.2, 0.8],
  ];
  const scale = scaleFor(series, data, PAD, SIZE);
  assert.ok(bandPath(scale, data, true).endsWith('Z'));
  assert.equal(bandPath(scale, data, false), '');
});

test('ticksFor gives two graduations for a binary, five otherwise', () => {
  const series = numericSeries([], 0, 1000);
  const data = [[0, 0, 0, 0]];
  const scale = scaleFor(series, data, PAD, SIZE);
  assert.deepEqual(ticksFor(scale, true), [0, 1]);
  assert.equal(ticksFor(scale, false).length, 5);
  assert.deepEqual(ticksFor(null), []);
});

test('xTicksFor spreads the graduations over the window', () => {
  const ticks = xTicksFor(numericSeries([], 1000, 2000));
  assert.equal(ticks.length, 5);
  assert.equal(ticks[0], 1000);
  assert.equal(ticks.at(-1), 2000);
  assert.deepEqual(xTicksFor(null), []);
});

test('statsFor reports the last value, the min and the max', () => {
  const stats = statsFor([
    [0, 20, 19, 21],
    [10, 22, 21, 23],
  ]);
  assert.deepEqual(stats, { last: 22, min: 19, max: 23 });
  assert.equal(statsFor([]), null);
});
