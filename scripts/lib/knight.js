// Knight move rules and the tour search over the contribution board.

export const KNIGHT_OFFSETS = [
  [2, 1], [2, -1], [-2, 1], [-2, -1],
  [1, 2], [1, -2], [-1, 2], [-1, -2],
];

export function isValidKnightMove(a, b) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);
}

export function getKnightMoves(board, cell) {
  const moves = [];
  for (const [dx, dy] of KNIGHT_OFFSETS) {
    const next = board.get(cell.x + dx, cell.y + dy);
    if (next) moves.push(next);
  }
  return moves;
}

// Each profile is one way of trading Warnsdorff's "fewest onward moves" rule
// against the wish to land on squares that have contributions.
const PROFILES = [
  { degree: 1, contribution: 0, count: 0, jitter: 0.2 },
  { degree: 1, contribution: 1.5, count: 0.3, jitter: 0.3 },
  { degree: 1, contribution: 3, count: 0.6, jitter: 0.4 },
];

const DEAD_END_PENALTY = 100;

// Lower score = better move.
export function scoreMove(board, visited, to, weights, rng) {
  let onward = 0;
  for (const next of getKnightMoves(board, to)) {
    if (!visited.has(next.key)) onward++;
  }
  const isLastSquare = visited.size + 1 === board.cells.length;
  const hasContribution = to.contributionCount > 0;

  return (
    onward * weights.degree +
    (onward === 0 && !isLastSquare ? DEAD_END_PENALTY : 0) -
    (hasContribution ? weights.contribution : 0) -
    Math.log1p(to.contributionCount) * weights.count +
    rng() * weights.jitter
  );
}

// Deterministic PRNG so the same calendar always yields the same tour
// (and therefore an identical SVG that doesn't need a new commit).
export function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isBetter(candidate, best) {
  if (candidate.contributions !== best.contributions) {
    return candidate.contributions > best.contributions;
  }
  return candidate.length > best.length;
}

// Depth-first search ordered by scoreMove, with a node budget so a bad start
// gets abandoned quickly instead of backtracking forever.
function searchFrom(board, start, weights, rng, budget) {
  const total = board.cells.length;
  const visited = new Set();
  const path = [];
  let contributions = 0;
  let nodes = 0;
  let best = { path: [], contributions: -1, length: 0 };

  function visit(cell) {
    visited.add(cell.key);
    path.push(cell);
    if (cell.contributionCount > 0) contributions++;
    nodes++;

    const current = { contributions, length: path.length };
    if (isBetter(current, best)) best = { ...current, path: path.slice() };
    if (path.length === total) return true;

    if (nodes < budget) {
      const candidates = getKnightMoves(board, cell)
        .filter((next) => !visited.has(next.key))
        .map((next) => ({ next, score: scoreMove(board, visited, next, weights, rng) }))
        .sort((a, b) => a.score - b.score);

      for (const { next } of candidates) {
        if (visit(next)) return true;
        if (nodes >= budget) break;
      }
    }

    visited.delete(cell.key);
    path.pop();
    if (cell.contributionCount > 0) contributions--;
    return false;
  }

  visit(start);
  return best;
}

function pickStarts(board, rng, count) {
  const byDegree = [...board.cells]
    .map((cell) => ({ cell, degree: getKnightMoves(board, cell).length, r: rng() }))
    .sort((a, b) => a.degree - b.degree || a.r - b.r)
    .map(({ cell }) => cell);

  // Corners/edges (low degree) are the classic good starting squares.
  return byDegree.slice(0, count);
}

export function generateKnightPath(board, { seed = 1, attempts = 48, budget = 4000 } = {}) {
  if (board.cells.length === 0) throw new Error('Cannot generate a path on an empty board');

  const rng = createRng(seed);
  const starts = pickStarts(board, rng, Math.min(attempts, board.cells.length));
  let best = { path: [], contributions: -1, length: 0 };

  for (let i = 0; i < attempts; i++) {
    const start = starts[i % starts.length];
    const weights = PROFILES[i % PROFILES.length];
    const result = searchFrom(board, start, weights, createRng(seed + i + 1), budget);

    if (isBetter(result, best)) best = result;
    if (best.length === board.cells.length) break;
  }

  return best.path;
}

export function validatePath(board, path) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('Knight path is empty');
  }

  const seen = new Set();
  path.forEach((cell, i) => {
    const { x, y } = cell;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= board.width || y >= board.height) {
      throw new Error(`Step ${i} is outside the board: (${x}, ${y})`);
    }
    if (!board.get(x, y)) {
      throw new Error(`Step ${i} lands on a square that is not on the calendar: (${x}, ${y})`);
    }
    const key = `${x},${y}`;
    if (seen.has(key)) throw new Error(`Step ${i} revisits square (${x}, ${y})`);
    seen.add(key);

    if (i > 0 && !isValidKnightMove(path[i - 1], cell)) {
      const prev = path[i - 1];
      throw new Error(`Illegal knight move at step ${i}: (${prev.x}, ${prev.y}) -> (${x}, ${y})`);
    }
  });

  return true;
}
