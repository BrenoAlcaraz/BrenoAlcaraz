import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildBoard } from '../scripts/lib/board.js';
import { MAX_JUMP, generatePath } from '../scripts/lib/path.js';
import { createSampleCalendar } from '../scripts/lib/sample.js';
import { generateSvg } from '../scripts/lib/svg.js';

const END = new Date(Date.UTC(2026, 9, 2));

function assertSmoothRoute(board, path) {
  path.forEach((cell, i) => {
    assert.ok(board.get(cell.x, cell.y), `step ${i} is not a calendar square`);
    if (i === 0) return;
    const prev = path[i - 1];
    assert.notEqual(cell, prev, `step ${i} jumps in place`);
    const jump = Math.hypot(cell.x - prev.x, cell.y - prev.y);
    assert.ok(jump <= MAX_JUMP, `step ${i} jumps ${jump.toFixed(2)} cells`);
  });
}

function calendarFrom(rows) {
  // rows[y][x] = count, or null for a missing day
  const weeks = [];
  for (let x = 0; x < rows[0].length; x++) {
    const contributionDays = [];
    for (let y = 0; y < rows.length; y++) {
      if (rows[y][x] === null) continue;
      contributionDays.push({ date: `2025-01-01`, weekday: y, contributionCount: rows[y][x] });
    }
    weeks.push({ contributionDays });
  }
  return { weeks };
}

const emptyRows = (width) => Array.from({ length: 7 }, () => Array(width).fill(0));

describe('buildBoard', () => {
  it('handles partial first/last weeks and zero-contribution days', () => {
    const board = buildBoard(createSampleCalendar({ endDate: END }));
    assert.equal(board.height, 7);
    assert.ok(board.cells.length < board.width * 7, 'partial weeks should leave missing squares');
    assert.ok(board.cells.some((c) => c.contributionCount === 0));
    for (const cell of board.cells) {
      assert.equal(typeof cell.date, 'string');
      assert.ok(cell.contributionLevel >= 0 && cell.contributionLevel <= 4);
    }
  });

  it('rejects an empty calendar', () => {
    assert.throws(() => buildBoard({ weeks: [] }), /no weeks/);
  });
});

describe('generatePath', () => {
  const board = buildBoard(createSampleCalendar({ endDate: END }));
  const path = generatePath(board);

  it('lands on every contribution square', () => {
    const visited = new Set(path);
    for (const cell of board.cells.filter((c) => c.contributionCount > 0)) {
      assert.ok(visited.has(cell), `missed ${cell.date}`);
    }
  });

  it('never makes a long jump', () => {
    assertSmoothRoute(board, path);
  });

  it('is deterministic for the same data', () => {
    assert.deepEqual(generatePath(board).map((c) => c.key), path.map((c) => c.key));
  });

  it('bridges far-apart contributions with short hops', () => {
    const rows = emptyRows(53);
    rows[1][0] = 5;
    rows[5][52] = 2;
    const sparse = buildBoard(calendarFrom(rows));
    const route = generatePath(sparse);
    assert.equal(route[0], sparse.get(0, 1));
    assert.equal(route.at(-1), sparse.get(52, 5));
    assertSmoothRoute(sparse, route);
  });

  it('still moves when there are no contributions', () => {
    const empty = buildBoard(calendarFrom(emptyRows(53)));
    const route = generatePath(empty);
    assert.ok(route.length > 1);
    assertSmoothRoute(empty, route);
  });

  it('handles a single-square calendar', () => {
    const tiny = buildBoard(calendarFrom([[3]]));
    assert.deepEqual(generatePath(tiny), [tiny.get(0, 0)]);
  });
});

describe('generateSvg', () => {
  const board = buildBoard(createSampleCalendar({ endDate: END }));
  const path = generatePath(board);

  for (const theme of ['dark', 'light']) {
    it(`renders a script-free animated SVG (${theme})`, () => {
      const svg = generateSvg(board, path, { theme });
      assert.match(svg, /^<svg /);
      assert.match(svg, /@keyframes km/);
      assert.match(svg, /@keyframes kh/);
      assert.doesNotMatch(svg, /<script/i);
      assert.doesNotMatch(svg, /stroke-dasharray/, 'no path trail');
      assert.equal((svg.match(/<rect /g) || []).length, board.cells.length + path.length);
    });
  }

  it('gives each jump ~900 ms (700 ms jump + 200 ms pause)', () => {
    const svg = generateSvg(board, path);
    const total = Number(svg.match(/animation:km (\d+)ms/)[1]);
    const perJump = (total - 2700) / (path.length - 1);
    assert.equal(perJump, 900);
  });
});
