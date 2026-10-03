// Small deterministic PRNG (mulberry32) so sample output is stable.
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVEL_NAMES = ['NONE', 'FIRST_QUARTILE', 'SECOND_QUARTILE', 'THIRD_QUARTILE', 'FOURTH_QUARTILE'];

/**
 * Synthetic calendar shaped like the GraphQL response: 53 Sunday-based weeks
 * ending on `endDate`, so the first and last weeks are usually partial.
 */
export function createSampleCalendar({ endDate = new Date(), seed = 7 } = {}) {
  const rng = createRng(seed);
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
  const start = new Date(end);
  start.setUTCFullYear(end.getUTCFullYear() - 1);

  const weeks = [];
  let week = null;
  let total = 0;

  for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (!week || weekday === 0) {
      week = { contributionDays: [] };
      weeks.push(week);
    }
    const r = rng();
    const contributionCount = r < 0.55 ? 0 : Math.ceil((r - 0.55) * 30);
    const level = contributionCount === 0 ? 0 : Math.min(4, Math.ceil(contributionCount / 3.5));
    total += contributionCount;
    week.contributionDays.push({
      date: day.toISOString().slice(0, 10),
      weekday,
      contributionCount,
      contributionLevel: LEVEL_NAMES[level],
    });
  }

  return { totalContributions: total, weeks };
}
