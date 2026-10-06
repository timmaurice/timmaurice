import type { Repository, CacheData } from '@/types';
import {
  GITHUB_USERNAME,
  CACHE_KEY,
  CACHE_DURATION,
  CONCURRENCY_LIMIT,
  EXCLUDED_REPOS,
  HA_BRANDS_URL,
  BRANDS_DOMAINS_URL,
  JSDELIVR_DATA_URL,
} from '@/config';

/**
 * Checks if a file exists at the given URL using a HEAD request.
 *
 * @param {string} url The URL to check.
 * @returns {Promise<boolean>} Promise resolving to true if the file exists (HTTP 200 OK).
 */
async function checkFileExists(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Lists the relative paths where an icon or screenshot may live, in priority order.
 *
 * @param {string} repoName Repository name, used to tell cards from integrations.
 * @param {'icon' | 'screenshot'} type Whether to look for an 'icon' or a 'screenshot'.
 * @returns {string[]} Candidate paths relative to the repository root.
 */
export function imageCandidates(repoName: string, type: 'icon' | 'screenshot'): string[] {
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
        'frontend/',
      ];

  const candidates: string[] = [];
  for (const path of paths) {
    for (const name of names) {
      for (const ext of extensions) {
        candidates.push(`${path}${name}${ext}`);
      }
    }
  }
  return candidates;
}

/**
 * Searches for a valid image URL (icon or screenshot) in predefined common
 * locations within a GitHub repository.
 *
 * @param {string} baseUrl The base raw GitHub content URL for the repository.
 * @param {string} repoName The name of the repository.
 * @param {'icon' | 'screenshot'} type Whether to search for an 'icon' or a 'screenshot'.
 * @param {Set<string> | null} [files] The repository's file paths; when given, no request is made.
 * @returns {Promise<string | undefined>} Promise resolving to the first valid image URL found, or undefined.
 */
async function findImage(
  baseUrl: string,
  repoName: string,
  type: 'icon' | 'screenshot',
  files?: Set<string> | null,
): Promise<string | undefined> {
  const candidates = imageCandidates(repoName, type);

  // With the repository's file list the answer needs no request at all.
  if (files) {
    const found = candidates.find((path) => files.has(path));
    return found ? `${baseUrl}/${found}` : undefined;
  }

  // Fallback (file list unavailable, e.g. rate limited): probe the candidates.
  const urls = candidates.map((path) => `${baseUrl}/${path}`);
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
 * Fetches the paths of all files in a repository branch from jsDelivr's listing API.
 * Unlike the GitHub API it does not count against the 60 requests per hour that an
 * unauthenticated visitor gets, which the repo list and release lookups already use.
 * The listing can lag behind the branch for a few hours, which is fine for images.
 *
 * @param {string} repoName Repository name.
 * @param {string} branch Branch to list.
 * @returns {Promise<Set<string> | null>} File paths, or null when the listing is unavailable.
 */
async function fetchRepoFiles(repoName: string, branch: string): Promise<Set<string> | null> {
  try {
    const response = await fetch(
      `${JSDELIVR_DATA_URL}/${GITHUB_USERNAME}/${repoName}@${branch}?structure=flat`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data?.files)) return null;
    return new Set(data.files.map((file: { name: string }) => file.name.replace(/^\//, '')));
  } catch {
    return null;
  }
}

/**
 * Fetches the custom integration domains that have an icon in home-assistant/brands.
 *
 * @returns {Promise<Set<string> | null>} Domains, or null when the index is unavailable.
 */
async function fetchBrandDomains(): Promise<Set<string> | null> {
  try {
    const response = await fetch(BRANDS_DOMAINS_URL);
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data?.custom) ? new Set<string>(data.custom) : null;
  } catch {
    return null;
  }
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
export function logRateLimit(response: Response) {
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
  // Check cache first
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { timestamp, repos }: CacheData = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_DURATION) {
        console.log('[API] Serving from valid cache. Repos:', repos.length);
        return repos;
      }
      console.log('[API] Cache expired.');
    } catch (e) {
      console.warn('[API] Cache corruption detected. Clearing...', e);
      localStorage.removeItem(CACHE_KEY);
    }
  }

  console.log('[API] Fetching repositories for user:', GITHUB_USERNAME);
  const response = await fetch(
    `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`,
  );

  const currentRateLimit = logRateLimit(response);
  console.log('[API] Rate Limit:', currentRateLimit?.remaining, '/', currentRateLimit?.limit);

  if (!response.ok) {
    if (cached) {
      try {
        const { repos }: CacheData = JSON.parse(cached);
        console.warn('[API] Fetch failed, serving stale cache.');
        return repos;
      } catch {
        // Fall through
      }
    }
    throw new Error(
      `GitHub API Error: ${response.status} ${response.statusText}. Rate Limit Remaining: ${currentRateLimit?.remaining}`,
    );
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    console.error('[API] Unexpected API response format:', data);
    throw new Error('Unexpected GitHub API response format.');
  }

  console.log(`[API] Total repositories found: ${data.length}`);

  // Flexible filtering: include common variations of the topic
  const haTopics = ['home-assistant', 'homeassistant', 'hacs'];
  const filteredData = data.filter((repo: Repository) => {
    // An archived repo is retired (e.g. a card now bundled into its integration), so it
    // leaves the store on its own without an EXCLUDED_REPOS entry.
    const isExcluded = repo.archived || EXCLUDED_REPOS.includes(repo.name);
    const topics = repo.topics || [];
    const hasHATopic = topics.some((t: string) => haTopics.includes(t.toLowerCase()));

    return !isExcluded && hasHATopic;
  });

  console.log(`[API] Repositories after HA topic filter: ${filteredData.length}`);

  // One index instead of a HEAD request per repo against home-assistant/brands.
  const brandDomains = await fetchBrandDomains();

  let processedCount = 0;
  const totalCount = filteredData.length;

  const reposWithEnrichment = await pMap(
    filteredData,
    async (repo) => {
      const baseUrl = `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${repo.name}/${repo.default_branch}`;
      // Knowing the files up front avoids guessing image paths (one 404 per wrong guess).
      const files = await fetchRepoFiles(repo.name, repo.default_branch);

      // 1. Fetch HACS metadata
      try {
        const hacsResponse =
          files && !files.has('hacs.json') ? null : await fetch(`${baseUrl}/hacs.json`);
        if (hacsResponse?.ok) {
          const hacsData = await hacsResponse.json();
          if (hacsData.name) {
            repo.hacs_name = hacsData.name;
          }
        }
      } catch {
        // Ignore
      }

      // Fallbacks
      if (repo.name === 'bergfex') repo.hacs_name = repo.hacs_name || 'Bergfex Scraper';
      if (repo.name === 'feedparser') repo.hacs_name = repo.hacs_name || 'Feedparser';

      // 2. Fetch Icon (Brands then Local)
      const domain = repo.name.replace('lovelace-', '').replace('-card', '');
      const brandsUrl = `${HA_BRANDS_URL}/${domain}/icon.png`;

      const hasBrandIcon = brandDomains
        ? brandDomains.has(domain)
        : await checkFileExists(brandsUrl);
      if (hasBrandIcon) {
        repo.icon_url = brandsUrl;
      }

      if (!repo.icon_url) {
        repo.icon_url = await findImage(baseUrl, repo.name, 'icon', files);
      }

      // 3. Fetch Screenshot
      repo.screenshot_url = await findImage(baseUrl, repo.name, 'screenshot', files);

      // 4. Fetch Release Downloads
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

  const result = reposWithEnrichment.filter((repo): repo is Repository => repo !== null);

  // Save to cache
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        repos: result,
        rateLimit: sessionRateLimit || currentRateLimit,
      }),
    );
  } catch (e) {
    console.warn('[API] Failed to save to local storage:', e);
  }

  return result;
}
