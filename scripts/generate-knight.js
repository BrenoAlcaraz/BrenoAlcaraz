#!/usr/bin/env node
// Usage:
//   GITHUB_TOKEN=... node scripts/generate-knight.js [--user BrenoAlcaraz] [--out assets]
//   node scripts/generate-knight.js --sample      (synthetic data, no token needed)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { buildBoard, hashBoard } from './lib/board.js';
import { fetchContributions } from './lib/github.js';
import { generateKnightPath, validatePath } from './lib/knight.js';
import { createSampleCalendar } from './lib/sample.js';
import { generateSvg } from './lib/svg.js';

const OUTPUTS = [
  { theme: 'dark', file: 'knight-contributions.svg' },
  { theme: 'light', file: 'knight-contributions-light.svg' },
];

async function writeIfChanged(file, content) {
  const previous = await readFile(file, 'utf8').catch(() => null);
  if (previous === content) return false;
  await writeFile(file, content);
  return true;
}

async function main() {
  const { values } = parseArgs({
    options: {
      user: { type: 'string', default: process.env.GITHUB_USER || 'BrenoAlcaraz' },
      out: { type: 'string', default: 'assets' },
      sample: { type: 'boolean', default: false },
    },
  });

  const calendar = values.sample
    ? createSampleCalendar()
    : await fetchContributions(values.user, process.env.GITHUB_TOKEN);

  const board = buildBoard(calendar);
  const path = generateKnightPath(board, { seed: hashBoard(board) });

  // Throws on any illegal move, so no SVG is written for a broken path.
  validatePath(board, path);

  const contributionCells = board.cells.filter((c) => c.contributionCount > 0).length;
  const visitedContributions = path.filter((c) => c.contributionCount > 0).length;
  console.log(
    `Board ${board.width}x${board.height} (${board.cells.length} squares). ` +
      `Knight visited ${path.length} squares, ${visitedContributions}/${contributionCells} with contributions. ` +
      `All ${path.length - 1} moves validated.`
  );

  const svgs = OUTPUTS.map(({ theme, file }) => ({ file, content: generateSvg(board, path, { theme }) }));

  await mkdir(values.out, { recursive: true });
  for (const { file, content } of svgs) {
    const target = join(values.out, file);
    const changed = await writeIfChanged(target, content);
    console.log(`${changed ? 'Wrote' : 'Unchanged'} ${target} (${(content.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((error) => {
  console.error(`generate-knight failed: ${error.message}`);
  process.exit(1);
});
