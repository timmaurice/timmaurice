import '@/scss/main.scss';
import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { fetchRepositories } from '@/api';
import type { Repository } from '@/types';
import { repoCardTemplate, errorTemplate, iconTemplate, skeletonCardTemplate } from '@/ui';
import { debounce, getRepoCategory, trackEvent } from '@/utils';
import { ANALYTICS_WEBSITE_ID, ANALYTICS_DOMAINS } from '@/config';

/**
 * Dynamically injects the Umami analytics script into the document head.
 */
function injectAnalytics() {
  if (!ANALYTICS_WEBSITE_ID) return;

  const script = document.createElement('script');
  script.async = true;
  script.defer = true;
  script.src = 'https://cloud.umami.is/script.js';
  script.setAttribute('data-website-id', ANALYTICS_WEBSITE_ID);
  if (ANALYTICS_DOMAINS) {
    script.setAttribute('data-domains', ANALYTICS_DOMAINS);
  }
  document.head.appendChild(script);
}

interface AppState {
  repositories: Repository[];
  filteredRepositories: Repository[];
  totalStars: number;
  totalDownloads: number;
  searchTerm: string;
  sortBy: string;
  categoryFilter: 'all' | 'plugin' | 'integration';
  loading: boolean;
  progressText: string;
  progressWidth: string;
}

const state: AppState = {
  repositories: [],
  filteredRepositories: [],
  totalStars: 0,
  totalDownloads: 0,
  searchTerm: '',
  sortBy: 'popular',
  categoryFilter: 'all',
  loading: true,
  progressText: 'Initializing...',
  progressWidth: '0%',
};

/**
 * Returns the HTML template for the application header, including title
 * and aggregate project statistics.
 */
const headerTemplate = () => html`
  <header class="app-header">
    <h1>Home Assistant Apps</h1>
    <p>Custom cards and integrations by @timmaurice</p>
    <div id="headerStats" class="header-stats ${state.repositories.length > 0 ? '' : 'hidden'}">
      <div class="stat-item">
        ${iconTemplate('star', 'star')}
        <span id="totalStars">${state.totalStars.toLocaleString()}</span> Stars
      </div>
      <span class="stat-separator">|</span>
      <div class="stat-item">
        ${iconTemplate('download', 'download')}
        <span id="totalDownloads">${state.totalDownloads.toLocaleString()}</span> Downloads
      </div>
    </div>
  </header>
`;

/**
 * Returns the HTML template for the category filter tabs.
 *
 * @param {(category: 'all' | 'plugin' | 'integration') => void} onFilter Category change handler.
 */
const filterTabsTemplate = (onFilter: (category: 'all' | 'plugin' | 'integration') => void) => html`
  <div class="filter-tabs">
    <button
      class="filter-tab ${state.categoryFilter === 'all' ? 'active' : ''}"
      @click=${() => onFilter('all')}
    >
      All
    </button>
    <button
      class="filter-tab ${state.categoryFilter === 'plugin' ? 'active' : ''}"
      @click=${() => onFilter('plugin')}
    >
      Lovelace
    </button>
    <button
      class="filter-tab ${state.categoryFilter === 'integration' ? 'active' : ''}"
      @click=${() => onFilter('integration')}
    >
      Integrations
    </button>
  </div>
`;

/**
 * Returns the HTML template for the search input and sort selection dropdown.
 *
 * @param {(e: Event) => void} onSearch Callback for input events on the search field.
 * @param {(e: Event) => void} onSort Callback for change events on the sort dropdown.
 */
const controlsTemplate = (onSearch: (e: Event) => void, onSort: (e: Event) => void) => html`
  <div class="controls-container">
    <div class="input-group">
      <label for="searchInput" class="sr-only">Search repositories</label>
      <input
        type="search"
        id="searchInput"
        class="search-input"
        placeholder="Search repositories..."
        .value=${state.searchTerm}
        @input=${onSearch}
      />
    </div>
    <div class="input-group">
      <label for="sortSelect" class="sr-only">Sort by</label>
      <select id="sortSelect" class="sort-select" @change=${onSort}>
        <option value="popular" ?selected=${state.sortBy === 'popular'}>Popular (Stars)</option>
        <option value="downloads" ?selected=${state.sortBy === 'downloads'}>Most Downloaded</option>
        <option value="alphabetical" ?selected=${state.sortBy === 'alphabetical'}>
          Alphabetical
        </option>
        <option value="updated" ?selected=${state.sortBy === 'updated'}>Recently Updated</option>
      </select>
    </div>
  </div>
`;

/**
 * Returns the main application template, containing the header, controls,
 * and the grid of repository cards.
 *
 * @param {(e: Event) => void} onSearch Search input event handler.
 * @param {(e: Event) => void} onSort Sort selection event handler.
 * @param {(cat: 'all' | 'plugin' | 'integration') => void} onFilter Category change handler.
 */
const appTemplate = (
  onSearch: (e: Event) => void,
  onSort: (e: Event) => void,
  onFilter: (cat: 'all' | 'plugin' | 'integration') => void,
) => html`
  ${headerTemplate()}
  <main>
    ${filterTabsTemplate(onFilter)} ${controlsTemplate(onSearch, onSort)}
    <div id="repoGrid" class="grid" aria-live="polite">
      ${state.filteredRepositories.length > 0
        ? repeat(
            state.filteredRepositories,
            (repo) => repo.id,
            (repo, index) => repoCardTemplate(repo, index, state.searchTerm),
          )
        : html`
            <div
              style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: rgba(255,255,255,0.03); border-radius: 1.25rem;"
            >
              <p style="color: var(--text-secondary);">No Home Assistant repositories found.</p>
            </div>
          `}
    </div>
  </main>
`;

/**
 * Returns the loading state template, featuring a progress bar and
 * animated skeleton cards to prevent layout shift.
 */
const loaderTemplate = () => html`
  ${headerTemplate()}
  <main>
    <div class="controls-container">
      <div class="progress-container">
        <div class="progress-bar-wrapper">
          <div id="progressBar" class="progress-bar" style="width: ${state.progressWidth}"></div>
        </div>
        <div id="progressText" class="progress-text">${state.progressText}</div>
      </div>
    </div>
    <div class="grid">${Array.from({ length: 8 }).map(() => skeletonCardTemplate())}</div>
  </main>
`;

/**
 * Updates the entire application UI based on the current global state.
 * Implements FLIP animations to ensure smooth transitions when reordering cards.
 */
function updateUI() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  if (!app) return;

  // Capture current positions for FLIP animation
  const grid = document.getElementById('repoGrid');
  const firstRects = new Map<string, DOMRect>();

  if (grid) {
    Array.from(grid.children).forEach((child) => {
      const id = child.getAttribute('data-id');
      if (id) firstRects.set(id, child.getBoundingClientRect());
    });
  }

  // Render the template
  if (state.loading) {
    render(loaderTemplate(), app);
  } else {
    render(appTemplate(handleSearch, handleSort, handleFilter), app);
  }

  // Execute FLIP animation to slide cards to new positions
  if (grid && !state.loading) {
    requestAnimationFrame(() => {
      const newGrid = document.getElementById('repoGrid');
      if (!newGrid) return;

      Array.from(newGrid.children).forEach((child) => {
        const id = child.getAttribute('data-id');
        const firstRect = id ? firstRects.get(id) : null;

        if (firstRect) {
          const lastRect = child.getBoundingClientRect();
          const dx = firstRect.left - lastRect.left;
          const dy = firstRect.top - lastRect.top;

          if (dx !== 0 || dy !== 0) {
            child.animate(
              [
                { transform: `translate3d(${dx}px, ${dy}px, 0)` },
                { transform: 'translate3d(0, 0, 0)' },
              ],
              {
                duration: 400,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
              },
            );
          }
        }
      });
    });
  }
}

/**
 * Event handler for search input, debounced to prevent excessive re-renders.
 */
const handleSearch = debounce((e: Event) => {
  state.searchTerm = (e.target as HTMLInputElement).value.toLowerCase();

  if (state.searchTerm.length > 2) {
    trackEvent('search-query', { query: state.searchTerm });
  }

  applyFiltersAndSort();
  updateUI();
}, 300);

const handleSort = (e: Event) => {
  state.sortBy = (e.target as HTMLSelectElement).value;

  trackEvent('sort-change', { type: state.sortBy });

  applyFiltersAndSort();
  updateUI();
};

const handleFilter = (category: 'all' | 'plugin' | 'integration') => {
  state.categoryFilter = category;

  trackEvent('filter-category', { category });

  applyFiltersAndSort();
  updateUI();
};

/**
 * Synchronizes the filteredRepositories list based on the current
 * search term and sort criteria stored in state.
 */
function applyFiltersAndSort() {
  console.log(
    '[App] Applying filters. Search:',
    state.searchTerm,
    'Category:',
    state.categoryFilter,
  );

  state.filteredRepositories = state.repositories.filter((repo) => {
    const name = (repo.hacs_name || repo.name).toLowerCase();
    const desc = (repo.description || '').toLowerCase();

    const matchesSearch = name.includes(state.searchTerm) || desc.includes(state.searchTerm);
    const matchesCategory =
      state.categoryFilter === 'all' || getRepoCategory(repo.name) === state.categoryFilter;

    return matchesSearch && matchesCategory;
  });

  state.filteredRepositories.sort((a, b) => {
    switch (state.sortBy) {
      case 'popular':
        return b.stargazers_count - a.stargazers_count;
      case 'downloads':
        return (b.download_count || 0) - (a.download_count || 0);
      case 'alphabetical':
        return (a.hacs_name || a.name)
          .replace('lovelace-', '')
          .localeCompare((b.hacs_name || b.name).replace('lovelace-', ''));
      case 'updated':
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      default:
        return 0;
    }
  });

  console.log(
    `[App] Filtering complete. Showing ${state.filteredRepositories.length} of ${state.repositories.length} repos.`,
  );
}

/**
 * Main application entry point. Fetches repository data, calculates
 * initial stats, and triggers the first render.
 */
async function init() {
  injectAnalytics();
  console.log('[App] App starting...');
  updateUI();

  try {
    console.log('[App] Triggering repository fetch...');
    state.repositories = await fetchRepositories((current, total, name) => {
      state.progressWidth = `${(current / total) * 100}%`;
      state.progressText = `Fetching ${name} (${current}/${total})...`;
      updateUI();
    });

    console.log(`[App] Fetch success. Found ${state.repositories.length} repositories.`);

    state.totalStars = state.repositories.reduce((sum, repo) => sum + repo.stargazers_count, 0);
    state.totalDownloads = state.repositories.reduce(
      (sum, repo) => sum + (repo.download_count || 0),
      0,
    );
    state.loading = false;

    applyFiltersAndSort();
    updateUI();

    // Preload priority images to improve LCP
    state.filteredRepositories.slice(0, 2).forEach((repo) => {
      if (repo.screenshot_url) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = `https://images.weserv.nl/?url=${encodeURIComponent(repo.screenshot_url)}&w=600&fit=cover&output=webp&q=75&il`;
        document.head.appendChild(link);
      }
    });
  } catch (error) {
    const app = document.querySelector<HTMLDivElement>('#app')!;
    console.error('[App] Critical initialization error:', error);
    render(
      errorTemplate(error instanceof Error ? error.message : 'An unexpected error occurred.'),
      app,
    );
  }
}

init();
