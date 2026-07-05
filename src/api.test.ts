import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRepositories, logRateLimit } from '@/api';
import { CACHE_KEY } from '@/config';

function makeStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function jsonResponse(body: unknown, init?: { ok?: boolean; headers?: Record<string, string> }) {
  return {
    ok: init?.ok ?? true,
    status: init?.ok === false ? 500 : 200,
    statusText: init?.ok === false ? 'Internal Server Error' : 'OK',
    headers: { get: (name: string) => init?.headers?.[name] ?? null },
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', makeStore());
});

describe('logRateLimit', () => {
  it('extracts rate limit headers when all three are present', () => {
    const response = jsonResponse(
      {},
      {
        headers: {
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '58',
          'x-ratelimit-reset': '123',
        },
      },
    );

    expect(logRateLimit(response)).toEqual({ limit: '60', remaining: '58', reset: '123' });
  });

  it('returns undefined when a header is missing', () => {
    const response = jsonResponse({}, { headers: { 'x-ratelimit-limit': '60' } });

    expect(logRateLimit(response)).toBeUndefined();
  });
});

describe('fetchRepositories', () => {
  it('serves repos straight from a valid cache without hitting the network', async () => {
    const cachedRepos = [{ id: 1, name: 'cached-repo' }];
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), repos: cachedRepos }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchRepositories();

    expect(result).toEqual(cachedRepos);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the stale cache when the network request fails', async () => {
    const staleRepos = [{ id: 2, name: 'stale-repo' }];
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ timestamp: 0, repos: staleRepos }), // timestamp 0 => always expired
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, { ok: false })));

    const result = await fetchRepositories();

    expect(result).toEqual(staleRepos);
  });

  it('throws when the network request fails and there is no cache to fall back to', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, { ok: false })));

    await expect(fetchRepositories()).rejects.toThrow('GitHub API Error');
  });

  it('keeps only repos with a Home Assistant topic and drops explicitly excluded repos', async () => {
    const repos = [
      { id: 1, name: 'lovelace-radar-card', topics: ['home-assistant'], default_branch: 'main' },
      { id: 2, name: 'unrelated-repo', topics: ['javascript'], default_branch: 'main' },
      // Excluded despite matching topic (see EXCLUDED_REPOS in config.ts):
      { id: 3, name: 'Ultra-Vehicle-Card', topics: ['hacs'], default_branch: 'main' },
      { id: 4, name: 'no-topics-repo', default_branch: 'main' },
    ];

    // Any secondary lookup during enrichment (hacs.json/icons/screenshots/releases) is
    // irrelevant to filtering, so make every one of them resolve as "not found".
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/repos?per_page=100')) return Promise.resolve(jsonResponse(repos));
        return Promise.resolve(jsonResponse(null, { ok: false }));
      }),
    );

    const result = await fetchRepositories();

    expect(result.map((r) => r.name)).toEqual(['lovelace-radar-card']);
  });
});
