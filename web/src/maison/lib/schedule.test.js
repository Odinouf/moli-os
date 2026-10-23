import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BLOCKS,
  parseSchedule,
  formatSchedule,
  normalize,
  neutralize,
  isFlat,
  blockAt,
  nextTransition,
  insertBlock,
  moveBlock,
  removeBlock,
  setDegree,
  validate,
  hhmm,
  minutesOf,
  bounds,
  levelOf,
  roomForNewBlock,
} from './schedule.js';

const SAMPLE = '00:00/16 07:00/19 10:00/16 10:00/16 17:00/19 23:00/16';

test('round-trips a real TRVZB day', () => {
  const blocks = parseSchedule(SAMPLE);
  assert.deepEqual(
    blocks.map((b) => b.min),
    [0, 420, 600, 1020, 1380],
  );
  assert.equal(formatSchedule(blocks), '00:00/16 07:00/19 10:00/16 17:00/19 23:00/16');
});

test('drops a duplicate step (the zone reported two 10:00/16)', () => {
  const blocks = parseSchedule('00:00/16 07:00/19 10:00/16 10:00/16 17:00/19');
  assert.equal(blocks.length, 4);
  assert.equal(formatSchedule(blocks), '00:00/16 07:00/19 10:00/16 17:00/19');
});

test('tolerates stray spaces and out-of-bounds setpoints', () => {
  const blocks = parseSchedule('  00:00/2   07:00/99  23:00/16 ');
  assert.deepEqual(
    blocks.map((b) => b.deg),
    [4, 35, 16],
  );
});

test('an empty or garbage text still gives a well-formed day', () => {
  for (const bad of ['', '   ', 'nonsense', null, undefined]) {
    assert.deepEqual(parseSchedule(bad), [{ min: 0, deg: 4 }]);
  }
});

test('a day not starting at 00:00 is anchored there', () => {
  const blocks = parseSchedule('08:00/19 12:00/16');
  assert.equal(blocks[0].min, 0);
  assert.equal(blocks[0].deg, 19);
  assert.equal(formatSchedule(blocks), '00:00/19 08:00/19 12:00/16');
});

test('never keeps more than six steps', () => {
  const many = Array.from({ length: 10 }, (_, i) => `${hhmm(i * 60)}/${16 + (i % 3)}`).join(' ');
  assert.equal(parseSchedule(many).length, MAX_BLOCKS);
});

test('snaps minutes to the quarter hour and setpoints to the half degree', () => {
  const blocks = normalize([{ min: 7 + 2, deg: 16.3 }]);
  assert.equal(blocks[0].min, 0); // 7 min snaps down to 0
  assert.equal(blocks[1].min, 15);
  assert.equal(blocks[1].deg, 16.5);
});

test('insertBlock takes the setpoint of the step it lands in', () => {
  const day = parseSchedule('00:00/16 07:00/19 10:00/16');
  const grown = insertBlock(day, 8 * 60);
  assert.equal(grown.length, 4);
  assert.deepEqual(grown[2], { min: 480, deg: 19 });
});

test('insertBlock refuses a seventh step, a taken minute and 00:00', () => {
  const full = parseSchedule('00:00/16 04:00/16 08:00/16 12:00/16 16:00/16 20:00/16');
  assert.equal(full.length, MAX_BLOCKS);
  assert.equal(insertBlock(full, 22 * 60).length, MAX_BLOCKS);
  assert.equal(insertBlock(full, 12 * 60).length, MAX_BLOCKS);
  assert.equal(insertBlock(full, 0).length, MAX_BLOCKS);
});

test('moveBlock never moves the 00:00 anchor', () => {
  const day = parseSchedule('00:00/16 07:00/19 23:00/16');
  assert.deepEqual(moveBlock(day, 0, 300), day);
  const moved = moveBlock(day, 1, 6 * 60 + 5);
  assert.equal(moved[1].min, 360); // 06:05 snaps to 06:00
  assert.equal(moved[1].deg, 19);
});

test('removeBlock keeps the anchor', () => {
  const day = parseSchedule('00:00/16 07:00/19 23:00/16');
  assert.equal(removeBlock(day, 0).length, 3);
  assert.equal(removeBlock(day, 2).length, 2);
});

test('setDegree clamps and does not reorder', () => {
  const day = parseSchedule('00:00/16 07:00/19');
  const warm = setDegree(day, 0, 40);
  assert.equal(warm[0].deg, 35);
  assert.equal(warm[1].deg, 19);
});

test('blockAt and nextTransition read the day around a minute', () => {
  const day = parseSchedule('00:00/16 07:00/19 10:00/16');
  assert.equal(blockAt(day, 8 * 60).deg, 19);
  assert.equal(blockAt(day, 6 * 60).deg, 16);
  assert.equal(nextTransition(day, 8 * 60).min, 600);
  assert.equal(nextTransition(day, 11 * 60), null);
});

test('neutralize flattens a day and isFlat says so', () => {
  const flat = neutralize(18.5);
  assert.ok(isFlat(flat));
  assert.equal(formatSchedule(flat), '00:00/18.5');
  assert.ok(!isFlat(parseSchedule(SAMPLE)));
});

test('validate accepts the anchor and rejects a broken order', () => {
  assert.equal(validate(parseSchedule(SAMPLE)), null);
  assert.equal(validate([{ min: 0, deg: 16 }, { min: 600, deg: 19 }, { min: 300, deg: 16 }]), null);
});

test('minutesOf and hhmm round-trip', () => {
  assert.equal(minutesOf('7:05'), 7 * 60 + 5);
  assert.equal(minutesOf('24:00'), null);
  assert.equal(hhmm(7 * 60 + 5), '07:05');
  assert.equal(hhmm(7 * 60), '07:00');
});

test('bounds spans the whole week', () => {
  const week = [parseSchedule(SAMPLE), neutralize(21)];
  assert.deepEqual(bounds(week), { min: 16, max: 21 });
});

test('levelOf names a step against the household setpoints', () => {
  assert.equal(levelOf(18.5, 18.5, 16), 'confort');
  assert.equal(levelOf(16, 18.5, 16), 'reduit');
  assert.equal(levelOf(20.5, 18.5, 16), 'custom');
  assert.equal(levelOf(12, 18.5, 16), 'custom');
});

test('levelOf tolerates the valve rounding and missing setpoints', () => {
  assert.equal(levelOf(18.5, 18.5, 16), 'confort');
  assert.equal(levelOf(18.51, 18.5, 16), 'confort');
  assert.equal(levelOf(16.2, 18.5, 16), 'reduit');
  assert.equal(levelOf(19, 18.5, 16), 'custom');
  assert.equal(levelOf(16, null, undefined), 'custom');
});

test('roomForNewBlock lands in the widest stretch of the day', () => {
  // 00:00→07:00 (7 h) is wider than 07:00→10:00: the middle of the night.
  const day = parseSchedule('00:00/16 07:00/19 10:00/16 17:00/19 23:00/16');
  assert.equal(roomForNewBlock(day), 3 * 60 + 30);
});

test('roomForNewBlock always finds room before a late last step', () => {
  // The widest gap ends the day: half past noon, not a fallback to morning.
  const late = parseSchedule('00:00/16 23:00/19');
  assert.equal(roomForNewBlock(late), 11 * 60 + 30);
});

test('roomForNewBlock refuses a full day', () => {
  const full = parseSchedule('00:00/16 04:00/16 08:00/16 12:00/16 16:00/16 20:00/16');
  assert.equal(full.length, MAX_BLOCKS);
  assert.equal(roomForNewBlock(full), null);
});
