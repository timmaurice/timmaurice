import type { Repository, CacheData } from './types';

const GITHUB_USERNAME = 'timmaurice';
const CACHE_KEY = 'gh_repos_cache';
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const CONCURRENCY_LIMIT = 5;

const EXCLUDED_REPOS = [
  'pqina-flip-clock-card', // PQINA flip clock
  'Ultra-Vehicle-Card', // Ultra Vehicle Card
  'xtend_tuya', // Xtend Tuya
];

const HA_BRANDS_URL =
  'https://raw.githubusercontent.com/home-assistant/brands/master/custom_integrations';

async function checkFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

async function findImage(
  baseUrl: string,
  repoName: string,
  type: 'icon' | 'screenshot',
): Promise<string | undefined> {
  const isCard = repoName.includes('-card') || repoName.includes('lovelace-');
  const domain = repoName.replace('lovelace-', '').replace('-card', '');

  // Prioritize most common names and extensions
  const names = type === 'icon' ? ['icon', 'logo'] : ['screenshot', 'preview', 'image'];
  const extensions = ['.png', '.jpg'];

  // Targeted paths: for cards, look in assets/ and root first
  const paths = isCard
    ? ['', 'assets/', 'images/']
    : [
        `custom_components/${domain}/brand/`,
        `custom_components/${domain.replace(/-/g, '')}/brand/`,
        '',
        'branding/',
      ];

  const urls: string[] = [];
  for (const path of paths) {
    for (const name of names) {
      for (const ext of extensions) {
        urls.push(`${baseUrl}/${path}${name}${ext}`);
      }
    }
  }

  // Check in smaller parallel chunks to find the first match quickly
  // Increased chunk size for better parallelism on fast networks
  const chunkSize = 8;
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (url) => ((await checkFileExists(url)) ? url : null)),
    );
    const found = results.find((url) => url !== null);
    if (found) return found;
  }

  return undefined;
}

// Simple batching to limit concurrency
async function pMap<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(mapper));
    results.push(...batchResults);
  }
  return results;
}

let sessionRateLimit: { limit: string; remaining: string; reset: string } | undefined;

function logRateLimit(response: Response) {
  const limit = response.headers.get('x-ratelimit-limit');
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');

  if (limit && remaining && reset) {
    const resetDate = new Date(parseInt(reset) * 1000).toLocaleTimeString();

    // Only update and log if this is the first one or if the remaining count is lower
    if (!sessionRateLimit || parseInt(remaining) < parseInt(sessionRateLimit.remaining)) {
      sessionRateLimit = { limit, remaining, reset };
      console.log(`[GitHub API] Rate Limit: ${remaining}/${limit} (Resets at ${resetDate})`);
    }
    return { limit, remaining, reset };
  }
  return undefined;
}

export async function fetchRepositories(
  onProgress?: (current: number, total: number, name: string) => void,
): Promise<Repository[]> {
  // Check cache first
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const { timestamp, repos, rateLimit }: CacheData = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_DURATION) {
      if (rateLimit) {
        const resetDate = new Date(parseInt(rateLimit.reset) * 1000).toLocaleTimeString();
        console.log(
          `[Cached] Last Rate Limit: ${rateLimit.remaining}/${rateLimit.limit} (Resets at ${resetDate})`,
        );
      }
      console.log('Serving from cache...');
      return repos;
    }
  }

  const response = await fetch(
    `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`,
  );

  const currentRateLimit = logRateLimit(response);

  if (!response.ok) {
    // If rate limited but we have cache, serve it even if expired
    if (cached) {
      const { repos }: CacheData = JSON.parse(cached);
      return repos;
    }
    throw new Error('Failed to fetch repositories (Rate limit likely exceeded)');
  }
  const data: Repository[] = await response.json();

  // Filter: Exclude specific repos AND only include those with 'home-assistant' topic
  const filteredData = data.filter(
    (repo) => !EXCLUDED_REPOS.includes(repo.name) && repo.topics.includes('home-assistant'),
  );

  // Process repositories with concurrency limit
  let processedCount = 0;
  const totalCount = filteredData.length;

  const reposWithHacs = await pMap(
    filteredData,
    async (repo) => {
      const baseUrl = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${repo.name}/${repo.default_branch}`;

      try {
        const hacsResponse = await fetch(`${baseUrl}/hacs.json`);
        if (hacsResponse.ok) {
          const hacsData = await hacsResponse.json();
          if (hacsData.name) {
            repo.hacs_name = hacsData.name;
          }
        }
      } catch {
        // Ignore errors
      }

      // Fallback names for specific repos if needed
      if (repo.name === 'bergfex') repo.hacs_name = repo.hacs_name || 'Bergfex Scraper';
      if (repo.name === 'feedparser') repo.hacs_name = repo.hacs_name || 'Feedparser';

      // Try Home Assistant Brands first (non-rate-limited, fast, 0% chance of cluttering console with 404s if successful)
      const domain = repo.name.replace('lovelace-', '').replace('-card', '');
      const brandsUrl = `${HA_BRANDS_URL}/${domain}/icon.png`;

      if (await checkFileExists(brandsUrl)) {
        repo.icon_url = brandsUrl;
      }

      // Only search for icon if not found in brands
      if (!repo.icon_url) {
        repo.icon_url = await findImage(baseUrl, repo.name, 'icon');
      }

      // Find screenshot (only if it's likely to have one)
      repo.screenshot_url = await findImage(baseUrl, repo.name, 'screenshot');

      // Fetch release info for downloads
      try {
        const releasesResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_USERNAME}/${repo.name}/releases`,
        );
        logRateLimit(releasesResponse);
        if (releasesResponse.ok) {
          const releases = await releasesResponse.json();
          repo.download_count = releases.reduce(
            (total: number, release: { assets?: { download_count: number }[] }) => {
              return (
                total +
                (release.assets || []).reduce(
                  (assetTotal: number, asset: { download_count: number }) =>
                    assetTotal + asset.download_count,
                  0,
                )
              );
            },
            0,
          );
        }
      } catch {
        repo.download_count = 0;
      }

      processedCount++;
      if (onProgress) {
        onProgress(processedCount, totalCount, repo.hacs_name || repo.name);
      }

      return repo;
    },
    CONCURRENCY_LIMIT,
  );

  const result = reposWithHacs.filter((repo): repo is Repository => repo !== null);

  // Save to cache
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      timestamp: Date.now(),
      repos: result,
      rateLimit: sessionRateLimit || currentRateLimit,
    }),
  );

  return result;
}
