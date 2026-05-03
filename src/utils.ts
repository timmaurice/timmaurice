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
