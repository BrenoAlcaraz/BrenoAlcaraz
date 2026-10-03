export const THEMES = {
  dark: {
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    knight: '#f0f6fc',
    knightOutline: '#0d1117',
    flash: '#ffffff',
    flashPeak: 0.35,
    text: '#7d8590',
  },
  light: {
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    knight: '#1f2328',
    knightOutline: '#ffffff',
    flash: '#1f2328',
    flashPeak: 0.2,
    text: '#59636e',
  },
};

const CELL = 10;
const GAP = 3;
const PITCH = CELL + GAP;
const PAD_X = 14;
const GRID_TOP = 30;
const FOOTER = 28;

const JUMP_MS = 700;
const PAUSE_MS = 200; // rest on each square before the next jump
const INTRO_MS = 600;
const HOLD_MS = 1500;
const FADE_MS = 600;
const FLASH_MS = 900;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Knight silhouette facing left, drawn in a 100x100 box with its base at y=94.
const KNIGHT_PATH =
  'M70 84C72 62 72 40 60 26L56 12L48 22C40 24 32 28 26 34C22 40 18 46 16 52C14 58 18 62 24 62' +
  'C30 62 36 58 42 56C44 62 40 72 34 84ZM26 84H74Q78 84 78 88V94H22V88Q22 84 26 84Z';

const cx = (x) => PAD_X + x * PITCH + CELL / 2;
const cy = (y) => GRID_TOP + y * PITCH + CELL / 2;
// Longer hops arc higher, within a range that stays subtle.
const liftFor = (a, b) => Math.round(Math.min(14, Math.max(7, 5 + 2 * Math.hypot(b.x - a.x, b.y - a.y))));

function escapeXml(text) {
  return String(text).replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function monthLabels(board) {
  const labels = [];
  let previousMonth = null;
  for (let x = 0; x < board.width; x++) {
    const first = board.cells.filter((c) => c.x === x).sort((a, b) => a.y - b.y)[0];
    if (!first) continue;
    const month = Number(first.date.slice(5, 7)) - 1;
    if (month !== previousMonth) labels.push({ x, text: MONTHS[month] });
    previousMonth = month;
  }
  // Drop a label that would collide with the next one (e.g. a partial first month).
  return labels.filter((label, i) => !labels[i + 1] || labels[i + 1].x - label.x >= 3);
}

function buildTimeline(path) {
  const moves = path.length - 1;
  const takeoff = (i) => INTRO_MS + i * (JUMP_MS + PAUSE_MS);
  const land = (i) => takeoff(i) + JUMP_MS;
  const total = INTRO_MS + moves * (JUMP_MS + PAUSE_MS) + HOLD_MS + FADE_MS;
  const pct = (t) => `${Number(((t / total) * 100).toFixed(3))}%`;
  const arrival = (j) => (j === 0 ? INTRO_MS : land(j - 1));
  return { moves, takeoff, land, total, pct, arrival };
}

function buildCss(path, theme, tl) {
  const { moves, takeoff, land, total, pct, arrival } = tl;
  const pos = (c) => `{transform:translate(${cx(c.x)}px,${cy(c.y)}px)}`;
  const css = [];
  const anim = (name) => `animation:${name} ${total}ms infinite`;

  // Knight fades in at the start and out after a short hold at the end.
  css.push(`.fx{${anim('fx')} linear}`);
  css.push(`@keyframes fx{0%{opacity:0}${pct(INTRO_MS)},${pct(total - FADE_MS)}{opacity:1}100%{opacity:0}}`);

  // Travel between squares; it holds still during each pause.
  const move = [`0%${pos(path[0])}`];
  for (let i = 0; i < moves; i++) {
    move.push(`${pct(takeoff(i))}${pos(path[i])}`, `${pct(land(i))}${pos(path[i + 1])}`);
  }
  move.push(`100%${pos(path.at(-1))}`);
  css.push(`.km{${anim('km')} cubic-bezier(.35,0,.65,1)}`, `@keyframes km{${move.join('')}}`);

  // Hop: rise (ease-out), fall (ease-in), then a small squash on landing.
  if (moves > 0) {
    const ground = ['0%', '100%'];
    const squash = [];
    const airByLift = new Map();
    for (let i = 0; i < moves; i++) {
      ground.push(pct(takeoff(i)), pct(land(i)), pct(land(i) + PAUSE_MS));
      squash.push(pct(land(i) + 90));
      const lift = liftFor(path[i], path[i + 1]);
      airByLift.set(lift, [...(airByLift.get(lift) ?? []), pct(takeoff(i) + JUMP_MS / 2)]);
    }
    const air = [...airByLift]
      .map(([lift, at]) => `${at.join(',')}{transform:translateY(-${lift}px) scale(1.08);animation-timing-function:ease-in}`)
      .join('');
    css.push(
      `.kh{transform-origin:0 5px;${anim('kh')}}`,
      `@keyframes kh{${ground.join(',')}{transform:none;animation-timing-function:ease-out}` +
        `${squash.join(',')}{transform:scale(1.06,.9);animation-timing-function:ease-in-out}${air}}`
    );
  }

  // Each landing square brightens briefly, then returns to normal.
  css.push(`.g{opacity:0;animation-duration:${total}ms;animation-iteration-count:infinite}`);
  path.forEach((_, j) => {
    const t = arrival(j);
    css.push(`@keyframes g${j}{0%,${pct(t)}{opacity:0}${pct(t + 150)}{opacity:${theme.flashPeak}}${pct(t + FLASH_MS)},100%{opacity:0}}`);
  });

  css.push(`text{font:10px -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;fill:${theme.text}}`);
  return css.join('\n');
}

export function generateSvg(board, path, { theme: themeName = 'dark' } = {}) {
  const theme = THEMES[themeName];
  if (!theme) throw new Error(`Unknown theme "${themeName}"`);
  if (path.length === 0) throw new Error('Cannot render an empty path');

  const tl = buildTimeline(path);
  const width = PAD_X * 2 + board.width * PITCH - GAP;
  const gridBottom = GRID_TOP + board.height * PITCH - GAP;
  const height = gridBottom + FOOTER;
  const visited = [...new Set(path)];
  const contributionSquares = visited.filter((c) => c.contributionCount > 0).length;

  const cells = board.cells
    .map(
      (c) =>
        `<rect x="${PAD_X + c.x * PITCH}" y="${GRID_TOP + c.y * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.levels[c.contributionLevel]}"/>`
    )
    .join('');

  const months = monthLabels(board)
    .map((m) => `<text x="${PAD_X + m.x * PITCH}" y="${GRID_TOP - 10}">${m.text}</text>`)
    .join('');

  const flashes = path
    .map(
      (c, j) =>
        `<rect class="g" style="animation-name:g${j}" x="${PAD_X + c.x * PITCH}" y="${GRID_TOP + c.y * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.flash}"/>`
    )
    .join('');

  const knight =
    `<g class="km"><g class="kh">` +
    `<g transform="translate(0 5) scale(.19) translate(-50 -94)">` +
    `<path d="${KNIGHT_PATH}" fill="${theme.knight}" stroke="${theme.knightOutline}" stroke-width="7" stroke-linejoin="round"/>` +
    `<circle cx="37" cy="38" r="3.5" fill="${theme.knightOutline}"/>` +
    `</g></g></g>`;

  const footerY = gridBottom + 20;
  const summary = `Knight visited ${visited.length} squares · ${contributionSquares} with contributions`;
  const description = `A chess knight hopping across the GitHub contribution graph. ${summary}.`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="t d">`,
    `<title id="t">Knight's Tour of My Contributions</title>`,
    `<desc id="d">${escapeXml(description)}</desc>`,
    `<style>\n${buildCss(path, theme, tl)}\n</style>`,
    months,
    `<g>${cells}</g>`,
    `<g>${flashes}</g>`,
    `<g class="fx">${knight}</g>`,
    `<text x="${PAD_X}" y="${footerY}">${escapeXml(`${board.totalContributions} contributions in the last year`)}</text>`,
    `<text x="${width - PAD_X}" y="${footerY}" text-anchor="end">${escapeXml(summary)}</text>`,
    `</svg>`,
    '',
  ].join('\n');
}
