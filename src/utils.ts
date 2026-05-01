export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

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

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function optimizeImageUrl(url: string, width: number): string {
  if (!url || url.startsWith('data:') || url.includes('weserv.nl')) return url;
  // Use weserv.nl to resize and compress images
  // output=webp: Forces WebP format
  // q=75: Sets quality to 75% for better compression
  // il: Enables progressive (interlaced) loading
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${width}&fit=cover&output=webp&q=75&il`;
}
