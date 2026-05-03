import '@/scss/main.scss';
import { html, render } from 'lit-html';
import { fetchRepositories } from '@/api';
import type { Repository } from '@/types';
import { repoCardTemplate, errorTemplate, iconTemplate, skeletonCardTemplate } from '@/ui';
import { debounce } from '@/utils';

/**
 * APPLICATION STATE
 */
interface AppState {
  repositories: Repository[];
  filteredRepositories: Repository[];
  totalStars: number;
  totalDownloads: number;
  searchTerm: string;
  sortBy: string;
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
  loading: true,
  progressText: 'Initializing...',
  progressWidth: '0%',
};

/**
 * TEMPLATES
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

const appTemplate = (onSearch: (e: Event) => void, onSort: (e: Event) => void) => html`
  ${headerTemplate()}
  <main>
    ${controlsTemplate(onSearch, onSort)}
    <div id="repoGrid" class="grid" aria-live="polite">
      ${state.filteredRepositories.length > 0
        ? state.filteredRepositories.map((repo, index) => repoCardTemplate(repo, index))
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
 * RENDERING & LOGIC
 */

function updateUI() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  if (!app) return;

  if (state.loading) {
    render(loaderTemplate(), app);
  } else {
    render(appTemplate(handleSearch, handleSort), app);
  }
}

const handleSearch = debounce((e: Event) => {
  state.searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
  applyFiltersAndSort();
  updateUI();
}, 300);

const handleSort = (e: Event) => {
  state.sortBy = (e.target as HTMLSelectElement).value;
  applyFiltersAndSort();
  updateUI();
};

function applyFiltersAndSort() {
  // Filter
  state.filteredRepositories = state.repositories.filter(
    (repo) =>
      (repo.hacs_name || repo.name).toLowerCase().includes(state.searchTerm) ||
      (repo.description || '').toLowerCase().includes(state.searchTerm),
  );

  // Sort
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
}

async function init() {
  updateUI();

  try {
    state.repositories = await fetchRepositories((current, total, name) => {
      state.progressWidth = `${(current / total) * 100}%`;
      state.progressText = `Fetching ${name} (${current}/${total})...`;
      updateUI();
    });

    state.totalStars = state.repositories.reduce((sum, repo) => sum + repo.stargazers_count, 0);
    state.totalDownloads = state.repositories.reduce(
      (sum, repo) => sum + (repo.download_count || 0),
      0,
    );
    state.loading = false;

    applyFiltersAndSort();
    updateUI();

    // Dynamic preload for top 2
    state.filteredRepositories.slice(0, 2).forEach((repo) => {
      if (repo.screenshot_url) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        link.href = `https://images.weserv.nl/?url=${encodeURIComponent(repo.screenshot_url)}&w=600&fit=cover&output=webp&q=75&il`;
        link.fetchPriority = 'high';
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
