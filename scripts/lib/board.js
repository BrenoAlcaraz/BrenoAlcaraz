const LEVELS = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

export const BOARD_HEIGHT = 7;

function toLevel(day, count) {
  if (day.contributionLevel in LEVELS) return LEVELS[day.contributionLevel];
  return count > 0 ? 1 : 0;
}

function toWeekday(day) {
  if (Number.isInteger(day.weekday)) return day.weekday;
  return new Date(`${day.date}T00:00:00Z`).getUTCDay();
}

/**
 * Turns a GitHub contributionCalendar into a board where
 * x = week index and y = weekday (0 = Sunday, as on the GitHub graph).
 * Missing days (partial first/last weeks) simply have no cell.
 */
export function buildBoard(calendar) {
  const weeks = calendar?.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) {
    throw new Error('Contribution calendar has no weeks');
  }

  const byKey = new Map();
  weeks.forEach((week, x) => {
    for (const day of week.contributionDays ?? []) {
      const y = toWeekday(day);
      if (y < 0 || y >= BOARD_HEIGHT) throw new Error(`Invalid weekday ${y} on ${day.date}`);

      const key = `${x},${y}`;
      if (byKey.has(key)) throw new Error(`Duplicate calendar day at week ${x}, weekday ${y}`);

      const contributionCount = Math.max(0, Number(day.contributionCount) || 0);
      byKey.set(key, {
        key,
        x,
        y,
        date: day.date,
        contributionCount,
        contributionLevel: toLevel(day, contributionCount),
      });
    }
  });

  if (byKey.size === 0) throw new Error('Contribution calendar has no days');

  const cells = [...byKey.values()];
  return {
    width: weeks.length,
    height: BOARD_HEIGHT,
    cells,
    totalContributions: calendar.totalContributions ?? cells.reduce((sum, c) => sum + c.contributionCount, 0),
    get: (x, y) => byKey.get(`${x},${y}`),
  };
}

// FNV-1a over the calendar contents, used to seed the tour search.
export function hashBoard(board) {
  let hash = 0x811c9dc5;
  for (const cell of board.cells) {
    const text = `${cell.date}:${cell.contributionCount};`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}
