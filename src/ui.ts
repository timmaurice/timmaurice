import type { Repository } from './types';
import { formatDate, getRepoCategory, escapeHtml, optimizeImageUrl } from './utils';
import { generateDynamicIcon, generateDynamicHero } from './graphics';

const GITHUB_USERNAME = 'timmaurice';

export function createRepoCard(repo: Repository, index: number): string {
  const category = getRepoCategory(repo.name);
  let badgeHtml: string;
  let installUrl = '';

  if (category === 'plugin') {
    badgeHtml = '<span class="badge lovelace">Lovelace</span>';
    installUrl = `https://my.home-assistant.io/redirect/hacs_repository/?owner=${GITHUB_USERNAME}&repository=${repo.name}&category=plugin`;
  } else if (category === 'integration') {
    badgeHtml = '<span class="badge integration">Integration</span>';
    installUrl = `https://my.home-assistant.io/redirect/hacs_repository/?owner=${GITHUB_USERNAME}&repository=${repo.name}&category=integration`;
  } else {
    badgeHtml = '<span class="badge other">Other</span>';
  }

  const dynamicIcon = generateDynamicIcon(repo.name);
  const dynamicHero = generateDynamicHero(repo.name, repo.description || '');

  const screenshotUrl = repo.screenshot_url
    ? optimizeImageUrl(repo.screenshot_url, 600)
    : dynamicHero;
  const iconUrl = repo.icon_url ? optimizeImageUrl(repo.icon_url, 128) : dynamicIcon;

  // Optimize first 2 cards for LCP (Largest Contentful Paint)
  const isPriority = index < 2;
  const screenshotLoadingAttr = isPriority ? 'eager' : 'lazy';
  const screenshotPriorityAttr = isPriority ? 'fetchpriority="high"' : '';

  // Icons are generally not LCP, so they can always be lazy or low priority
  const iconLoadingAttr = 'lazy';

  return `
    <div class="card" data-name="${escapeHtml((repo.hacs_name || repo.name).toLowerCase())}" 
         data-description="${escapeHtml((repo.description || '').toLowerCase())}"
         data-stars="${repo.stargazers_count}"
         data-downloads="${repo.download_count || 0}"
         data-updated="${new Date(repo.updated_at).getTime()}"
         data-alphabetical="${escapeHtml((repo.hacs_name || repo.name).replace('lovelace-', '').toLowerCase())}">
      <div class="card-image-wrapper">
        <img src="${screenshotUrl}" alt="${escapeHtml(repo.name)} preview" class="card-screenshot" loading="${screenshotLoadingAttr}" ${screenshotPriorityAttr} decoding="async" onerror="this.src='${dynamicHero}'" />
      </div>
      <div class="card-content">
        <div class="card-header">
          <img src="${iconUrl}" alt="icon" class="card-icon-img" loading="${iconLoadingAttr}" decoding="async" onerror="this.src='${dynamicIcon}'" />
          <div class="card-title-group">
            <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="card-title-link">
              <div class="card-title">${escapeHtml(repo.hacs_name || repo.name.replace('lovelace-', '').replace(/-/g, ' '))}</div>
            </a>
            <a href="https://github.com/${GITHUB_USERNAME}" target="_blank" rel="noopener noreferrer" class="card-developer-link">
              <div class="card-developer">@${GITHUB_USERNAME}</div>
            </a>
            ${badgeHtml}
          </div>
        </div>
        <div class="card-description">${escapeHtml(repo.description || 'No description available.')}</div>
        <div class="card-tags">
          ${repo.topics.map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`).join('')}
        </div>
        <div class="card-footer">
          <div class="stat">
            <svg viewBox="0 0 16 16" class="star"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"></path></svg>
            ${repo.stargazers_count}
          </div>
          <div class="stat">
            <svg viewBox="0 0 16 16" class="download"><path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 1 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path><path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path></svg>
            ${(repo.download_count || 0).toLocaleString()}
          </div>
          <div class="stat">
            ${formatDate(repo.updated_at)}
          </div>
        </div>
        ${
          installUrl
            ? `
        <div class="card-actions">
          <a href="${installUrl}" target="_blank" rel="noopener noreferrer" class="install-btn" aria-label="Install ${escapeHtml(repo.hacs_name || repo.name)} via HACS">
            GET
          </a>
        </div>
        `
            : `
        <div class="card-actions">
          <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="install-btn view-btn" aria-label="View ${escapeHtml(repo.hacs_name || repo.name)} on GitHub">
            VIEW
          </a>
        </div>
        `
        }
      </div>
    </div>
  `;
}

export function renderError(message: string, container: HTMLElement) {
  container.innerHTML = `
    <div class="error-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: rgba(239, 68, 68, 0.05); border-radius: 1.25rem; border: 1px solid rgba(239, 68, 68, 0.1);">
      <svg style="width: 48px; height: 48px; fill: #ef4444; margin-bottom: 1rem;" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>
      <h3 style="color: #ef4444; margin-bottom: 0.5rem;">Oops! Something went wrong</h3>
      <p style="color: var(--text-secondary);">${escapeHtml(message)}</p>
      <button onclick="window.location.reload()" style="margin-top: 1.5rem; padding: 0.5rem 1.5rem; border-radius: 9999px; background: var(--accent-color); color: white; border: none; cursor: pointer; font-weight: 600;">Try Again</button>
    </div>
  `;
}

export function updateVisibility(container: HTMLElement, searchTerm: string) {
  const cards = container.querySelectorAll<HTMLElement>('.card');
  cards.forEach((card) => {
    const name = card.dataset.name || '';
    const description = card.dataset.description || '';
    const isVisible = name.includes(searchTerm) || description.includes(searchTerm);
    if (isVisible) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
}

export function updateSort(container: HTMLElement, sortBy: string) {
  const cards = Array.from(container.querySelectorAll<HTMLElement>('.card'));

  cards.sort((a, b) => {
    if (sortBy === 'popular') {
      return Number(b.dataset.stars) - Number(a.dataset.stars);
    } else if (sortBy === 'downloads') {
      return Number(b.dataset.downloads) - Number(a.dataset.downloads);
    } else if (sortBy === 'alphabetical') {
      return (a.dataset.alphabetical || '').localeCompare(b.dataset.alphabetical || '');
    } else if (sortBy === 'updated') {
      return Number(b.dataset.updated) - Number(a.dataset.updated);
    }
    return 0;
  });

  cards.forEach((card, index) => {
    card.style.order = index.toString();
  });
}
