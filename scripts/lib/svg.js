export const THEMES = {
  dark: {
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    knight: '#f0f6fc',
    knightOutline: '#0d1117',
    trail: '#f0f6fc',
    text: '#7d8590',
  },
  light: {
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    knight: '#1f2328',
    knightOutline: '#ffffff',
    trail: '#1f2328',
    text: '#59636e',
  },
};

const CELL = 10;
const GAP = 3;
const PITCH = CELL + GAP;
const PAD_X = 14;
const GRID_TOP = 30;
const FOOTER = 28;

const INTRO_MS = 700;
const HOLD_MS = 1800;
const FADE_MS = 700;
const AIRBORNE = 0.7; // share of each move slot spent in the air; the rest is a short pause on the square
const HOP_LIFT = 6;
const HOP_SCALE = 1.18;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Knight silhouette facing left, drawn in a 100x100 box with its base at y=94.
const KNIGHT_PATH =
  'M70 84C72 62 72 40 60 26L56 12L48 22C40 24 32 28 26 34C22 40 18 46 16 52C14 58 18 62 24 62' +
  'C30 62 36 58 42 56C44 62 40 72 34 84ZM26 84H74Q78 84 78 88V94H22V88Q22 84 26 84Z';

export function moveDurationMs(moves) {
  return Math.min(250, Math.max(160, Math.round(70000 / Math.max(1, moves))));
}

const cx = (x) => PAD_X + x * PITCH + CELL / 2;
const cy = (y) => GRID_TOP + y * PITCH + CELL / 2;
const round = (n) => Math.round(n * 10) / 10;

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
  const moveMs = moveDurationMs(moves);
  const takeoff = (i) => INTRO_MS + i * moveMs;
  const land = (i) => takeoff(i) + AIRBORNE * moveMs;
  const total = INTRO_MS + moves * moveMs + HOLD_MS + FADE_MS;
  const pct = (t) => `${Number(((t / total) * 100).toFixed(3))}%`;
  const visitTime = (j) => (j === 0 ? INTRO_MS : land(j - 1));
  return { moves, moveMs, takeoff, land, total, pct, visitTime };
}

function buildCss(path, theme, tl) {
  const { moves, moveMs, takeoff, land, total, pct, visitTime } = tl;
  const pos = (c) => `{transform:translate(${cx(c.x)}px,${cy(c.y)}px)}`;
  const css = [];
  const anim = (name) => `animation:${name} ${total}ms infinite`;

  css.push(`.fx{${anim('fx')} linear}`);
  css.push(`@keyframes fx{0%{opacity:0}${pct(INTRO_MS)},${pct(total - FADE_MS)}{opacity:1}100%{opacity:0}}`);

  // Horizontal travel between squares.
  const move = [`0%${pos(path[0])}`];
  for (let i = 0; i < moves; i++) {
    move.push(`${pct(takeoff(i))}${pos(path[i])}`, `${pct(land(i))}${pos(path[i + 1])}`);
  }
  move.push(`100%${pos(path[path.length - 1])}`);
  css.push(`.km{${anim('km')} ease-in-out}`, `@keyframes km{${move.join('')}}`);

  // Vertical arc + slight scale-up mid-jump.
  if (moves > 0) {
    const ground = ['0%', '100%'];
    const air = [];
    for (let i = 0; i < moves; i++) {
      ground.push(pct(takeoff(i)), pct(land(i)));
      air.push(pct(takeoff(i) + (AIRBORNE * moveMs) / 2));
    }
    css.push(
      `.kh{${anim('kh')}}`,
      `@keyframes kh{${ground.join(',')}{transform:none;animation-timing-function:ease-out}` +
        `${air.join(',')}{transform:translateY(-${HOP_LIFT}px) scale(${HOP_SCALE});animation-timing-function:ease-in}}`
    );
  }

  // Trail drawn in step with the knight.
  if (moves > 0) {
    let length = 0;
    const cumulative = [0];
    for (let i = 1; i < path.length; i++) {
      length += Math.hypot((path[i].x - path[i - 1].x) * PITCH, (path[i].y - path[i - 1].y) * PITCH);
      cumulative.push(length);
    }
    const dash = Math.ceil(length) + 1;
    const offset = (n) => `{stroke-dashoffset:${round(dash - n)}}`;
    const trail = [`0%${offset(0)}`];
    for (let i = 0; i < moves; i++) {
      trail.push(`${pct(takeoff(i))}${offset(cumulative[i])}`, `${pct(land(i))}${offset(cumulative[i + 1])}`);
    }
    trail.push(`100%${offset(dash)}`);
    css.push(
      `.tr{stroke-dasharray:${dash} ${dash};${anim('tr')} ease-in-out}`,
      `@keyframes tr{${trail.join('')}}`
    );
  }

  // Each visited square gets a dot that lights up when the knight lands.
  css.push(`.d{opacity:0;animation-duration:${total}ms;animation-iteration-count:infinite}`);
  path.forEach((_, j) => {
    const t = visitTime(j);
    css.push(
      `@keyframes d${j}{0%,${pct(t)}{opacity:0}${pct(t + 120)}{opacity:1}${pct(t + 900)},100%{opacity:.45}}`
    );
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
  const contributionSquares = path.filter((c) => c.contributionCount > 0).length;

  const cells = board.cells
    .map(
      (c) =>
        `<rect x="${PAD_X + c.x * PITCH}" y="${GRID_TOP + c.y * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.levels[c.contributionLevel]}"/>`
    )
    .join('');

  const months = monthLabels(board)
    .map((m) => `<text x="${PAD_X + m.x * PITCH}" y="${GRID_TOP - 10}">${m.text}</text>`)
    .join('');

  const trail =
    path.length > 1
      ? `<path class="tr" d="M${path.map((c) => `${cx(c.x)} ${cy(c.y)}`).join('L')}" fill="none" stroke="${theme.trail}" stroke-opacity=".2" stroke-width="1" stroke-linejoin="round" stroke-linecap="round"/>`
      : '';

  const dots = path
    .map(
      (c, j) =>
        `<circle class="d" style="animation-name:d${j}" cx="${cx(c.x)}" cy="${cy(c.y)}" r="1.6" fill="${theme.trail}"/>`
    )
    .join('');

  const knight =
    `<g class="km"><g class="kh">` +
    `<g transform="translate(0 5) scale(.19) translate(-50 -94)">` +
    `<path d="${KNIGHT_PATH}" fill="${theme.knight}" stroke="${theme.knightOutline}" stroke-width="7" stroke-linejoin="round"/>` +
    `<circle cx="37" cy="38" r="3.5" fill="${theme.knightOutline}"/>` +
    `</g></g></g>`;

  const footerY = gridBottom + 20;
  const summary = `Knight visited ${path.length} squares · ${contributionSquares} with contributions`;
  const description = `A chess knight touring the GitHub contribution graph with legal knight moves only. ${summary}.`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="t d">`,
    `<title id="t">Knight's Tour of My Contributions</title>`,
    `<desc id="d">${escapeXml(description)}</desc>`,
    `<style>\n${buildCss(path, theme, tl)}\n</style>`,
    months,
    `<g>${cells}</g>`,
    `<g class="fx">${trail}${dots}${knight}</g>`,
    `<text x="${PAD_X}" y="${footerY}">${escapeXml(`${board.totalContributions} contributions in the last year`)}</text>`,
    `<text x="${width - PAD_X}" y="${footerY}" text-anchor="end">${escapeXml(summary)}</text>`,
    `</svg>`,
    '',
  ].join('\n');
}
