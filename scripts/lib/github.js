const QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              weekday
              contributionCount
              contributionLevel
            }
          }
        }
      }
    }
  }
`;

export async function fetchContributions(login, token) {
  if (!login) throw new Error('Missing GitHub username (set GITHUB_USER or pass --user)');
  if (!token) {
    throw new Error('Missing GITHUB_TOKEN. Export a token, or run with --sample to use synthetic data.');
  }

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'knight-contributions',
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API responded ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${payload.errors.map((e) => e.message).join('; ')}`);
  }

  const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error(`No contribution calendar returned for user "${login}"`);
  return calendar;
}
