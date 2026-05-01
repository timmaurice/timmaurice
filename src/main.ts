import './style.css';
import { fetchRepositories } from './api';
import { createRepoCard, updateVisibility, updateSort, renderError } from './ui';
import { debounce } from './utils';

async function init() {
  const app = document.querySelector<HTMLDivElement>('#app')!;

  app.innerHTML = `
    <header>
      <h1>Home Assistant Apps</h1>
      <p>Custom cards and integrations by @timmaurice</p>
    </header>
    <main>
      <div class="controls-container">
        <div class="input-group">
          <label for="searchInput" class="sr-only">Search repositories</label>
          <input type="text" id="searchInput" class="search-input" placeholder="Search repositories..." />
        </div>
        <div class="input-group">
          <label for="sortSelect" class="sr-only">Sort by</label>
          <select id="sortSelect" class="sort-select">
            <option value="popular">Popular (Stars)</option>
            <option value="downloads">Most Downloaded</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="updated">Recently Updated</option>
          </select>
        </div>
      </div>
      <div id="repoGrid" class="grid">
        <div class="loader-container" style="grid-column: 1 / -1;">
          <div class="spinner"></div>
          <div id="progressContainer" class="progress-container hidden">
            <div class="progress-bar-wrapper">
              <div id="progressBar" class="progress-bar"></div>
            </div>
            <div id="progressText" class="progress-text">Initializing...</div>
          </div>
        </div>
      </div>
    </main>
  `;

  const repoGrid = document.getElementById('repoGrid')!;
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;
  const sortSelect = document.getElementById('sortSelect') as HTMLSelectElement;
  const progressContainer = document.getElementById('progressContainer')!;
  const progressBar = document.getElementById('progressBar')!;
  const progressText = document.getElementById('progressText')!;

  try {
    const repositories = await fetchRepositories((current, total, name) => {
      progressContainer.classList.remove('hidden');
      const percentage = (current / total) * 100;
      progressBar.style.width = `${percentage}%`;
      progressText.innerText = `Fetching ${name} (${current}/${total})...`;
    });

    // Pre-sort repositories based on initial sort value (default: popular)
    const initialSort = sortSelect.value;
    repositories.sort((a, b) => {
      if (initialSort === 'popular') return b.stargazers_count - a.stargazers_count;
      if (initialSort === 'downloads') return (b.download_count || 0) - (a.download_count || 0);
      if (initialSort === 'updated')
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return (a.hacs_name || a.name).localeCompare(b.hacs_name || b.name);
    });

    // Dynamic preload for the top 2 screenshots (LCP candidates)
    repositories.slice(0, 2).forEach((repo) => {
      if (repo.screenshot_url) {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'image';
        // Need to import optimizeImageUrl or use the full path
        const optimizedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(repo.screenshot_url)}&w=600&fit=cover&output=webp&q=75&il`;
        link.href = optimizedUrl;
        link.fetchPriority = 'high';
        document.head.appendChild(link);
      }
    });

    // Initial render of all cards with correct priority
    repoGrid.innerHTML = repositories.map((repo, index) => createRepoCard(repo, index)).join('');

    // Initial sort (to apply visual order if DOM order differs, though they match now)
    updateSort(repoGrid, sortSelect.value);

    // Optimized search with debounce and visibility toggling
    const handleSearch = debounce(() => {
      const searchTerm = searchInput.value.toLowerCase();
      updateVisibility(repoGrid, searchTerm);
    }, 300);

    searchInput.addEventListener('input', handleSearch);

    // Optimized sort using CSS order
    sortSelect.addEventListener('change', () => {
      updateSort(repoGrid, sortSelect.value);
    });
  } catch (error) {
    console.error('Error initializing app:', error);
    renderError(
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading repositories.',
      repoGrid,
    );
  }
}

init();
