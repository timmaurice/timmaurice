import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRepositories, imageCandidates, logRateLimit } from '@/api';
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

  it('keeps only repos with a Home Assistant topic and drops excluded and archived repos', async () => {
    const repos = [
      { id: 1, name: 'lovelace-radar-card', topics: ['home-assistant'], default_branch: 'main' },
      { id: 2, name: 'unrelated-repo', topics: ['javascript'], default_branch: 'main' },
      // Excluded despite matching topic (see EXCLUDED_REPOS in config.ts):
      { id: 3, name: 'Ultra-Vehicle-Card', topics: ['hacs'], default_branch: 'main' },
      { id: 4, name: 'no-topics-repo', default_branch: 'main' },
      // Archived repos drop out on their own, without an EXCLUDED_REPOS entry:
      {
        id: 5,
        name: 'lovelace-sea-temperatures-card',
        topics: ['home-assistant'],
        archived: true,
        default_branch: 'main',
      },
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

describe('imageCandidates', () => {
  it('looks in the repo root for cards and in the brand folder first for integrations', () => {
    expect(imageCandidates('lovelace-radar-card', 'icon').slice(0, 2)).toEqual([
      'icon.png',
      'icon.jpg',
    ]);
    expect(imageCandidates('sea-temperatures', 'icon').slice(0, 2)).toEqual([
      'custom_components/sea-temperatures/brand/icon.png',
      'custom_components/sea-temperatures/brand/icon.jpg',
    ]);
    expect(imageCandidates('sea-temperatures', 'icon')).toContain(
      'custom_components/seatemperatures/brand/icon.png',
    );
  });
});

describe('fetchRepositories image lookup', () => {
  it('picks images from the jsDelivr file listing and the brands index without probing', async () => {
    const repos = [
      { id: 1, name: 'lovelace-radar-card', topics: ['hacs'], default_branch: 'main' },
      { id: 2, name: 'skyline-webcams', topics: ['hacs'], default_branch: 'main' },
      { id: 3, name: 'bergfex', topics: ['hacs'], default_branch: 'main' },
    ];
    const trees: Record<string, string[]> = {
      'lovelace-radar-card': ['hacs.json', 'icon.png', 'screenshot.png'],
      'skyline-webcams': [
        'hacs.json',
        'custom_components/skylinewebcams/brand/icon.png',
        'custom_components/skylinewebcams/brand/logo.png',
        'image.png',
      ],
      bergfex: ['custom_components/bergfex/brand/icon.png', 'image.png'],
    };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'HEAD') return Promise.resolve(jsonResponse(null, { ok: false }));
      if (url.includes('/repos?per_page=100')) return Promise.resolve(jsonResponse(repos));
      if (url.includes('domains.json')) {
        return Promise.resolve(jsonResponse({ custom: ['bergfex', 'skylinewebcams'] }));
      }
      const listing = url.match(/data\.jsdelivr\.com\/v1\/packages\/gh\/timmaurice\/([^@]+)@/);
      if (listing) {
        return Promise.resolve(
          jsonResponse({ files: trees[listing[1]].map((path) => ({ name: `/${path}` })) }),
        );
      }
      return Promise.resolve(jsonResponse(null, { ok: false }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchRepositories();
    const byName = Object.fromEntries(result.map((r) => [r.name, r]));

    expect(byName['lovelace-radar-card'].icon_url).toMatch(/lovelace-radar-card\/main\/icon\.png$/);
    expect(byName['lovelace-radar-card'].screenshot_url).toMatch(/\/screenshot\.png$/);
    // "skyline-webcams" is not a brands domain, so the repo's own brand icon wins.
    expect(byName['skyline-webcams'].icon_url).toMatch(
      /custom_components\/skylinewebcams\/brand\/icon\.png$/,
    );
    expect(byName['skyline-webcams'].screenshot_url).toMatch(/skyline-webcams\/main\/image\.png$/);
    // "bergfex" is listed in brands, which takes precedence over the repo's icon.
    expect(byName['bergfex'].icon_url).toContain('home-assistant/brands');
    // Nothing was guessed, and bergfex without a hacs.json was not asked for one.
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'HEAD')).toHaveLength(0);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('bergfex/main/hacs.json')),
    ).toBe(false);
  });
});
