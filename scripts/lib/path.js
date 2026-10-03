// Route for the knight: nearest-neighbour hops between contribution squares,
// with stepping-stone squares inserted so no single jump crosses the grid.

export const MAX_JUMP = 4; // longest allowed hop, in cells
const STEP = 2.5; // target hop length when a gap has to be split

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

// Going backwards costs a bit more, so the route sweeps left to right
// instead of leaving stragglers that need a long jump back later.
const cost = (from, to) => distance(from, to) + Math.max(0, from.x - to.x) * 0.5;

function nearestInColumn(board, x, y) {
  for (let d = 0; d < board.height; d++) {
    const cell = board.get(x, y - d) ?? board.get(x, y + d);
    if (cell) return cell;
  }
  return null;
}

function steppingStones(board, from, to) {
  const hops = Math.ceil(distance(from, to) / STEP);
  const stones = [];
  for (let k = 1; k < hops; k++) {
    const x = Math.round(from.x + ((to.x - from.x) * k) / hops);
    const y = Math.round(from.y + ((to.y - from.y) * k) / hops);
    const cell = nearestInColumn(board, x, y);
    if (cell && cell !== from && cell !== to && cell !== stones.at(-1)) stones.push(cell);
  }
  return stones;
}

// Used when there are no contributions at all: a gentle zigzag across the grid.
function fallbackTargets(board) {
  const targets = [];
  for (let x = 0; x < board.width; x += 3) {
    const cell = nearestInColumn(board, x, (x / 3) % 2 ? 2 : 4);
    if (cell) targets.push(cell);
  }
  return targets.length ? targets : [board.cells[0]];
}

export function generatePath(board) {
  const byDate = (a, b) => a.x - b.x || a.y - b.y;
  const contributions = board.cells.filter((c) => c.contributionCount > 0).sort(byDate);
  const targets = contributions.length ? contributions : fallbackTargets(board);

  const remaining = new Set(targets.slice(1));
  const path = [targets[0]];

  while (remaining.size > 0) {
    const current = path.at(-1);
    let next = null;
    for (const cell of remaining) {
      if (!next || cost(current, cell) < cost(current, next)) next = cell;
    }
    for (const stone of steppingStones(board, current, next)) {
      path.push(stone);
      remaining.delete(stone);
    }
    path.push(next);
    remaining.delete(next);
  }

  return path;
}
