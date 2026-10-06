export const GITHUB_USERNAME = 'timmaurice';

export const EXCLUDED_REPOS = [
  'pqina-flip-clock-card', // PQINA flip clock
  'Ultra-Vehicle-Card', // Ultra Vehicle Card
  'xtend_tuya', // Xtend Tuya
];

// Time units in milliseconds
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export const CACHE_KEY = 'gh_repos_cache';
export const CACHE_DURATION = MS_PER_HOUR; // 1 hour
export const CONCURRENCY_LIMIT = 5;

export const HA_BRANDS_URL =
  'https://raw.githubusercontent.com/home-assistant/brands/master/custom_integrations';

// Index of every domain with an icon in home-assistant/brands (CORS-enabled).
export const BRANDS_DOMAINS_URL = 'https://brands.home-assistant.io/domains.json';

// File listings of GitHub repos, without the GitHub API rate limit (CORS-enabled).
export const JSDELIVR_DATA_URL = 'https://data.jsdelivr.com/v1/packages/gh';

export const IMAGE_WESERV_URL = 'https://images.weserv.nl/';

export const RECENTLY_UPDATED_THRESHOLD_DAYS = 7;

export const ANALYTICS_WEBSITE_ID = '19375596-a853-42c5-9914-d5e6dcece04b';
export const ANALYTICS_DOMAINS = 'timmaurice.github.io';
