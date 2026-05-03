import type { Repository, CacheData } from '@/types';
import {
  GITHUB_USERNAME,
  CACHE_KEY,
  CACHE_DURATION,
  CONCURRENCY_LIMIT,
  EXCLUDED_REPOS,
  HA_BRANDS_URL,
} from '@/config';

/**
 * Checks if a file exists at the given URL using a HEAD request.
 *
 * @param {string} url The URL to check.
 * @returns {Promise<boolean>} Promise resolving to true if the file exists (HTTP 200 OK).
 */
async function checkFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Searches for a valid image URL (icon or screenshot) in predefined common
 * locations within a GitHub repository.
 *
 * @param {string} baseUrl The base raw GitHub content URL for the repository.
 * @param {string} repoName The name of the repository.
 * @param {'icon' | 'screenshot'} type Whether to search for an 'icon' or a 'screenshot'.
 * @returns {Promise<string | undefined>} Promise resolving to the first valid image URL found, or undefined.
 */
async function findImage(
  baseUrl: string,
  repoName: string,
  type: 'icon' | 'screenshot',
): Promise<string | undefined> {
  const isCard = repoName.includes('-card') || repoName.includes('lovelace-');
  const domain = repoName.replace('lovelace-', '').replace('-card', '');

  const names = type === 'icon' ? ['icon', 'logo'] : ['screenshot', 'preview', 'image'];
  const extensions = ['.png', '.jpg'];

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

/**
 * Maps items in parallel with a specified concurrency limit.
 *
 * @param {T[]} items List of items to process.
 * @param {(item: T) => Promise<R>} mapper Async mapping function.
 * @param {number} concurrency Maximum number of concurrent operations.
 * @returns {Promise<R[]>} Promise resolving to the mapped results.
 */
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

/**
 * Extracts and tracks GitHub API rate limit information from a response.
 *
 * @param {Response} response The Fetch response object.
 * @returns {{ limit: string; remaining: string; reset: string } | undefined} Rate limit info.
 */
function logRateLimit(response: Response) {
  const limit = response.headers.get('x-ratelimit-limit');
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');

  if (limit && remaining && reset) {
    if (!sessionRateLimit || parseInt(remaining) < parseInt(sessionRateLimit.remaining)) {
      sessionRateLimit = { limit, remaining, reset };
    }
    return { limit, remaining, reset };
  }
  return undefined;
}

/**
 * Fetches all Home Assistant repositories for the configured user,
 * enriches them with asset URLs (icons, screenshots), and release data.
 *
 * @param {(current: number, total: number, name: string) => void} [onProgress] Callback to track progress.
 * @returns {Promise<Repository[]>} Promise resolving to an array of enriched Repository objects.
 */
export async function fetchRepositories(
  onProgress?: (current: number, total: number, name: string) => void,
): Promise<Repository[]> {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const { timestamp, repos }: CacheData = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_DURATION) {
      console.log('Serving from cache...');
      return repos;
    }
  }

  const response = await fetch(
    `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`,
  );

  const currentRateLimit = logRateLimit(response);

  if (!response.ok) {
    if (cached) {
      const { repos }: CacheData = JSON.parse(cached);
      return repos;
    }
    throw new Error('Failed to fetch repositories (Rate limit likely exceeded)');
  }
  const data: Repository[] = await response.json();

  const filteredData = data.filter(
    (repo) => !EXCLUDED_REPOS.includes(repo.name) && repo.topics.includes('home-assistant'),
  );

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
        // Ignore
      }

      if (repo.name === 'bergfex') repo.hacs_name = repo.hacs_name || 'Bergfex Scraper';
      if (repo.name === 'feedparser') repo.hacs_name = repo.hacs_name || 'Feedparser';

      const domain = repo.name.replace('lovelace-', '').replace('-card', '');
      const brandsUrl = `${HA_BRANDS_URL}/${domain}/icon.png`;

      if (await checkFileExists(brandsUrl)) {
        repo.icon_url = brandsUrl;
      }

      if (!repo.icon_url) {
        repo.icon_url = await findImage(baseUrl, repo.name, 'icon');
      }

      repo.screenshot_url = await findImage(baseUrl, repo.name, 'screenshot');

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
