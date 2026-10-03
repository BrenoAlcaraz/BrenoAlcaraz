import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildBoard, hashBoard } from '../scripts/lib/board.js';
import { generateKnightPath, getKnightMoves, isValidKnightMove, validatePath } from '../scripts/lib/knight.js';
import { createSampleCalendar } from '../scripts/lib/sample.js';
import { generateSvg } from '../scripts/lib/svg.js';

function assertLegalTour(board, path) {
  const seen = new Set();
  path.forEach((cell, i) => {
    assert.ok(cell.x >= 0 && cell.x < board.width, `x out of bounds at step ${i}`);
    assert.ok(cell.y >= 0 && cell.y < board.height, `y out of bounds at step ${i}`);
    assert.ok(board.get(cell.x, cell.y), `step ${i} is not a calendar square`);
    assert.ok(!seen.has(cell.key), `square repeated at step ${i}`);
    seen.add(cell.key);
    if (i > 0) assert.ok(isValidKnightMove(path[i - 1], cell), `illegal move at step ${i}`);
  });
}

function calendarFrom(rows) {
  // rows[y][x] = count, or null for a missing day
  const width = rows[0].length;
  const weeks = [];
  for (let x = 0; x < width; x++) {
    const contributionDays = [];
    for (let y = 0; y < rows.length; y++) {
      const count = rows[y][x];
      if (count === null) continue;
      contributionDays.push({ date: `2025-01-${String(x * 7 + y + 1).padStart(2, '0')}`, weekday: y, contributionCount: count });
    }
    weeks.push({ contributionDays });
  }
  return { weeks };
}

describe('isValidKnightMove', () => {
  it('accepts all eight knight moves', () => {
    const from = { x: 5, y: 3 };
    for (const [dx, dy] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
      assert.equal(isValidKnightMove(from, { x: 5 + dx, y: 3 + dy }), true, `(${dx},${dy})`);
    }
  });

  it('rejects everything else', () => {
    const from = { x: 5, y: 3 };
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2], [2, 0], [0, 2], [3, 1], [1, 3], [3, 0], [-2, -2]]) {
      assert.equal(isValidKnightMove(from, { x: 5 + dx, y: 3 + dy }), false, `(${dx},${dy})`);
    }
  });
});

describe('buildBoard', () => {
  it('handles partial first/last weeks and zero-contribution days', () => {
    const board = buildBoard(createSampleCalendar({ endDate: new Date(Date.UTC(2026, 9, 2)) }));
    assert.equal(board.height, 7);
    assert.ok(board.cells.length < board.width * 7, 'partial weeks should leave missing squares');
    assert.ok(board.cells.some((c) => c.contributionCount === 0));
    for (const cell of board.cells) {
      assert.equal(typeof cell.date, 'string');
      assert.ok(cell.contributionLevel >= 0 && cell.contributionLevel <= 4);
    }
  });

  it('only links squares that exist on the calendar', () => {
    const board = buildBoard(calendarFrom([
      [1, 0, null],
      [0, 0, 0],
      [0, 2, 0],
    ]));
    // (0,0) -> (2,1) exists, (1,2) exists; (2,0) is missing anyway and isn't a knight move.
    const moves = getKnightMoves(board, board.get(0, 0)).map((c) => c.key).sort();
    assert.deepEqual(moves, ['1,2', '2,1']);
  });

  it('rejects an empty calendar', () => {
    assert.throws(() => buildBoard({ weeks: [] }), /no weeks/);
  });
});

describe('generateKnightPath', () => {
  const board = buildBoard(createSampleCalendar({ endDate: new Date(Date.UTC(2026, 9, 2)) }));
  const path = generateKnightPath(board, { seed: hashBoard(board) });

  it('uses only legal knight moves, inside the grid, without repeats', () => {
    assert.ok(path.length > 1);
    assertLegalTour(board, path);
    assert.equal(validatePath(board, path), true);
  });

  it('covers most of the board', () => {
    assert.ok(path.length >= board.cells.length * 0.9, `only ${path.length}/${board.cells.length} squares`);
  });

  it('is deterministic for the same data', () => {
    const again = generateKnightPath(board, { seed: hashBoard(board) });
    assert.deepEqual(again.map((c) => c.key), path.map((c) => c.key));
  });

  it('works on a calendar with no contributions at all', () => {
    const empty = buildBoard({ weeks: createSampleCalendar().weeks.map((w) => ({
      contributionDays: w.contributionDays.map((d) => ({ ...d, contributionCount: 0, contributionLevel: 'NONE' })),
    })) });
    const emptyPath = generateKnightPath(empty, { seed: 1 });
    assertLegalTour(empty, emptyPath);
    assert.ok(emptyPath.length > 1);
  });

  it('works on tiny boards where no move is possible', () => {
    const tiny = buildBoard(calendarFrom([[3]]));
    const tinyPath = generateKnightPath(tiny, { seed: 1 });
    assert.equal(tinyPath.length, 1);
    validatePath(tiny, tinyPath);
  });
});

describe('validatePath', () => {
  const board = buildBoard(calendarFrom(Array.from({ length: 7 }, () => Array(6).fill(0))));
  const at = (x, y) => board.get(x, y);

  it('accepts a legal path', () => {
    assert.equal(validatePath(board, [at(0, 0), at(2, 1), at(4, 0)]), true);
  });

  it('throws on a sliding move', () => {
    assert.throws(() => validatePath(board, [at(0, 0), at(1, 0)]), /Illegal knight move/);
  });

  it('throws on a diagonal move', () => {
    assert.throws(() => validatePath(board, [at(0, 0), at(1, 1)]), /Illegal knight move/);
  });

  it('throws on a repeated square', () => {
    assert.throws(() => validatePath(board, [at(0, 0), at(2, 1), at(0, 0)]), /revisits/);
  });

  it('throws when leaving the grid', () => {
    assert.throws(() => validatePath(board, [at(0, 0), { x: -2, y: 1 }]), /outside the board/);
  });

  it('throws on an empty path', () => {
    assert.throws(() => validatePath(board, []), /empty/);
  });
});

describe('generateSvg', () => {
  const board = buildBoard(createSampleCalendar({ endDate: new Date(Date.UTC(2026, 9, 2)) }));
  const path = generateKnightPath(board, { seed: 3 });

  for (const theme of ['dark', 'light']) {
    it(`renders a script-free animated SVG (${theme})`, () => {
      const svg = generateSvg(board, path, { theme });
      assert.match(svg, /^<svg /);
      assert.match(svg, /@keyframes km/);
      assert.doesNotMatch(svg, /<script/i);
      assert.equal((svg.match(/<rect /g) || []).length, board.cells.length);
      assert.match(svg, new RegExp(`Knight visited ${path.length} squares`));
    });
  }
});
