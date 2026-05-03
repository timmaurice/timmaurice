import { html, svg, render } from 'lit-html';
import type { Repository } from '@/types';
import { formatDate, getRepoCategory, optimizeImageUrl, highlightText, trackEvent } from '@/utils';
import { generateDynamicIcon, generateDynamicHero, getIconPath } from '@/graphics';
import { GITHUB_USERNAME, RECENTLY_UPDATED_THRESHOLD_DAYS, MS_PER_DAY } from '@/config';

/**
 * Returns a Lit-html SVG template for a specific UI icon.
 *
 * @param {'star' | 'download' | 'copy' | 'check'} name The icon name.
 * @param {string} className Optional CSS class to apply to the SVG element.
 * @returns {TemplateResult} The lit-html template result.
 */
export const iconTemplate = (
  name: 'star' | 'download' | 'copy' | 'check',
  className: string = '',
) => svg`
  <svg viewBox="0 0 16 16" class="${className}" aria-hidden="true">
    <path d="${getIconPath(name)}"></path>
  </svg>
`;

/**
 * Handles copying the repository URL to the clipboard.
 *
 * @param {string} url The URL to copy.
 * @param {MouseEvent} e The click event.
 * @param {string} repoName Name of the repository being copied.
 */
async function handleCopy(url: string, e: MouseEvent, repoName: string) {
  const btn = (e.target as HTMLElement).closest('.copy-btn');
  if (!btn) return;

  trackEvent('copy-url', { repository: repoName });

  try {
    await navigator.clipboard.writeText(url);

    // Visual feedback
    const originalIcon = btn.innerHTML;
    render(iconTemplate('check', 'check'), btn as HTMLElement);
    btn.classList.add('success');

    setTimeout(() => {
      btn.innerHTML = originalIcon;
      btn.classList.remove('success');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy!', err);
  }
}

/**
 * Returns the HTML template for an individual repository card.
 *
 * @param {Repository} repo The repository data object.
 * @param {number} index The index of the card in the list (used for priority loading).
 * @param {string} searchTerm Current search query for highlighting.
 * @returns {TemplateResult} The lit-html template result.
 */
export const repoCardTemplate = (repo: Repository, index: number, searchTerm: string = '') => {
  const category = getRepoCategory(repo.name);
  let badgeClass = 'badge other';
  let badgeText = 'Other';
  let installUrl = '';

  if (category === 'plugin') {
    badgeClass = 'badge lovelace';
    badgeText = 'Lovelace';
    installUrl = `https://my.home-assistant.io/redirect/hacs_repository/?owner=${GITHUB_USERNAME}&repository=${repo.name}&category=plugin`;
  } else if (category === 'integration') {
    badgeClass = 'badge integration';
    badgeText = 'Integration';
    installUrl = `https://my.home-assistant.io/redirect/hacs_repository/?owner=${GITHUB_USERNAME}&repository=${repo.name}&category=integration`;
  }

  const dynamicIcon = generateDynamicIcon(repo.name);
  const dynamicHero = generateDynamicHero(repo.name, repo.description || '');

  const screenshotUrl = repo.screenshot_url
    ? optimizeImageUrl(repo.screenshot_url, 600)
    : dynamicHero;
  const iconUrl = repo.icon_url ? optimizeImageUrl(repo.icon_url, 128) : dynamicIcon;

  const isPriority = index < 2;

  const updatedAt = new Date(repo.updated_at).getTime();
  const now = new Date().getTime();
  const diffDays = (now - updatedAt) / MS_PER_DAY;
  const isRecentlyUpdated = diffDays <= RECENTLY_UPDATED_THRESHOLD_DAYS;

  const displayName = repo.hacs_name || repo.name.replace('lovelace-', '').replace(/-/g, ' ');

  return html`
    <article
      class="card"
      data-id="${repo.id}"
      data-name="${(repo.hacs_name || repo.name).toLowerCase()}"
      data-description="${(repo.description || '').toLowerCase()}"
      data-stars="${repo.stargazers_count}"
      data-downloads="${repo.download_count || 0}"
      data-updated="${new Date(repo.updated_at).getTime()}"
      data-alphabetical="${(repo.hacs_name || repo.name).replace('lovelace-', '').toLowerCase()}"
    >
      <div class="card-image-wrapper">
        <img
          src="${screenshotUrl}"
          alt="${repo.name} preview"
          class="card-screenshot"
          loading="${isPriority ? 'eager' : 'lazy'}"
          fetchpriority="${isPriority ? 'high' : 'auto'}"
          decoding="async"
          @error=${(e: Event) => ((e.target as HTMLImageElement).src = dynamicHero)}
        />
      </div>
      <div class="card-content">
        <header class="card-header">
          <img
            src="${iconUrl}"
            alt="icon"
            class="card-icon-img"
            loading="lazy"
            decoding="async"
            @error=${(e: Event) => ((e.target as HTMLImageElement).src = dynamicIcon)}
          />
          <div class="card-title-group">
            <a
              href="${repo.html_url}"
              target="_blank"
              rel="noopener noreferrer"
              class="card-title-link"
              @click=${() => trackEvent('repo-click', { repository: repo.name })}
            >
              <h2 class="card-title">${highlightText(displayName, searchTerm)}</h2>
            </a>
            <a
              href="https://github.com/${GITHUB_USERNAME}"
              target="_blank"
              rel="noopener noreferrer"
              class="card-developer-link"
              @click=${() => trackEvent('developer-click', { developer: GITHUB_USERNAME })}
            >
              <div class="card-developer">@${GITHUB_USERNAME}</div>
            </a>
            <div class="badge-group">
              <span class="${badgeClass}">${badgeText}</span>
              ${isRecentlyUpdated ? html`<span class="badge updated">Updated</span>` : ''}
            </div>
          </div>
        </header>
        <div class="card-description">
          ${highlightText(repo.description || 'No description available.', searchTerm)}
        </div>
        <div class="card-tags">
          ${repo.topics.map((topic) => html`<span class="tag">${topic}</span>`)}
        </div>
        <footer class="card-footer">
          <div class="stat">${iconTemplate('star', 'star')} ${repo.stargazers_count}</div>
          <div class="stat">
            ${iconTemplate('download', 'download')} ${(repo.download_count || 0).toLocaleString()}
          </div>
          <time class="stat" datetime="${repo.updated_at}">${formatDate(repo.updated_at)}</time>
        </footer>
        <div class="card-actions">
          ${installUrl
            ? html`
                <a
                  href="${installUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="install-btn"
                  aria-label="Install ${repo.hacs_name || repo.name} via HACS"
                  data-umami-event="install-click"
                  data-umami-event-repository="${repo.name}"
                >
                  GET
                </a>
              `
            : html`
                <a
                  href="${repo.html_url}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="install-btn view-btn"
                  aria-label="View ${repo.hacs_name || repo.name} on GitHub"
                  data-umami-event="view-click"
                  data-umami-event-repository="${repo.name}"
                >
                  VIEW
                </a>
              `}
          <button
            class="copy-btn"
            title="Copy HACS Repository URL"
            @click=${(e: MouseEvent) => handleCopy(repo.html_url, e, repo.name)}
          >
            ${iconTemplate('copy')}
          </button>
        </div>
      </div>
    </article>
  `;
};

/**
 * Returns the HTML template for a skeleton repository card, used to
 * provide visual feedback during the loading state.
 *
 * @returns {TemplateResult} The lit-html template result.
 */
export const skeletonCardTemplate = () => html`
  <article class="card skeleton-card">
    <div class="card-image-wrapper">
      <div class="skeleton skeleton-image"></div>
    </div>
    <div class="card-content">
      <div class="card-header">
        <div class="skeleton skeleton-icon"></div>
        <div class="card-title-group" style="width: 100%">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-developer"></div>
        </div>
      </div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text"></div>
      <div class="skeleton skeleton-text short"></div>
      <div class="skeleton-footer">
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
      </div>
    </div>
  </article>
`;

/**
 * Returns the HTML template for the error state view.
 *
 * @param {string} message The error message to display.
 * @returns {TemplateResult} The lit-html template result.
 */
export const errorTemplate = (message: string) => html`
  <div
    class="error-state"
    style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: rgba(239, 68, 68, 0.05); border-radius: 1.25rem; border: 1px solid rgba(239, 68, 68, 0.1);"
  >
    <svg style="width: 48px; height: 48px; fill: #ef4444; margin-bottom: 1rem;" viewBox="0 0 24 24">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
      ></path>
    </svg>
    <h3 style="color: #ef4444; margin-bottom: 0.5rem;">Oops! Something went wrong</h3>
    <p style="color: var(--text-secondary);">${message}</p>
    <button
      @click=${() => {
        trackEvent('error-reload');
        window.location.reload();
      }}
      style="margin-top: 1.5rem; padding: 0.5rem 1.5rem; border-radius: 9999px; background: var(--accent-color); color: white; border: none; cursor: pointer; font-weight: 600;"
    >
      Try Again
    </button>
  </div>
`;
