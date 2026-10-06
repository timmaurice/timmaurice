import type { Repository } from '@/types';
import { html } from 'lit-html';

/**
 * Formats an ISO date string into a human-readable "MMM D, YYYY" format.
 *
 * @param {string} dateString The ISO date string from the API.
 * @returns {string} The formatted date string.
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Determines the category of a repository based on its name.
 *
 * @param {string} repoName The name of the repository.
 * @returns {'plugin' | 'integration' | 'other'} The category.
 */
export function getRepoCategory(repoName: string): 'plugin' | 'integration' | 'other' {
  const lowerName = repoName.toLowerCase();
  if (lowerName.includes('lovelace') || lowerName.includes('card')) {
    return 'plugin';
  }
  if (lowerName === 'stylus-salesforce-fixes') {
    return 'other';
  }
  return 'integration';
}

/**
 * The date a repo was last released, which is what users get; commits without a
 * release (CI, docs, dependency bumps) do not count. Falls back to the last push.
 *
 * @param {Pick<Repository, 'released_at' | 'updated_at'>} repo The repository.
 * @returns {string} ISO timestamp.
 */
export function releaseDate(repo: Pick<Repository, 'released_at' | 'updated_at'>): string {
  return repo.released_at ?? repo.updated_at;
}

/**
 * Tells whether an integration ships a Lovelace card of its own. Such repos carry the
 * `lovelace-card` topic; HACS still installs them as an integration.
 *
 * @param {Pick<Repository, 'name' | 'topics'>} repo The repository.
 * @returns {boolean} True for an integration with a bundled card.
 */
export function hasBundledCard(repo: Pick<Repository, 'name' | 'topics'>): boolean {
  return (
    getRepoCategory(repo.name) === 'integration' && (repo.topics || []).includes('lovelace-card')
  );
}

/**
 * Tells whether a repository belongs under a category tab. "Lovelace" lists every repo
 * that brings a card, including integrations with a bundled one.
 *
 * @param {Pick<Repository, 'name' | 'topics'>} repo The repository.
 * @param {'all' | 'plugin' | 'integration'} filter The selected tab.
 * @returns {boolean} True when the repo should be shown.
 */
export function matchesCategory(
  repo: Pick<Repository, 'name' | 'topics'>,
  filter: 'all' | 'plugin' | 'integration',
): boolean {
  if (filter === 'all') return true;
  const category = getRepoCategory(repo.name);
  if (filter === 'plugin') return category === 'plugin' || hasBundledCard(repo);
  return category === filter;
}

/**
 * Returns a debounced version of the provided function.
 *
 * @param {T} func The function to debounce.
 * @param {number} wait Delay in milliseconds.
 * @returns {(...args: Parameters<T>) => void} The debounced function.
 */
export function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Transforms a raw image URL into an optimized version using the
 * weserv.nl image proxy service for resizing and compression.
 *
 * @param {string} url The raw image source URL.
 * @param {number} width The target width for the image.
 * @returns {string} The optimized image URL.
 */
export function optimizeImageUrl(url: string, width: number): string {
  if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url;
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${width}&fit=cover&output=webp&q=75&il`;
}

/**
 * Highlights the occurrences of a search term within a given text.
 *
 * @param {string} text The text to process.
 * @param {string} query The search term to highlight.
 * @returns {TemplateResult} The lit-html template with highlighted matches.
 */
export function highlightText(text: string, query: string) {
  if (!query || !query.trim()) return html`${text}`;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return html`${parts.map((part) =>
    regex.test(part) ? html`<mark class="highlight">${part}</mark>` : part,
  )}`;
}

/**
 * Tracks a custom event using Umami analytics if available.
 *
 * @param {string} name The event name.
 * @param {Record<string, string | number | boolean>} data Optional event data.
 */
export function trackEvent(name: string, data?: Record<string, string | number | boolean>) {
  if (window.umami) {
    window.umami.track(name, data);
  }
}
