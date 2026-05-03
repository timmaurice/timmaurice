/**
 * Generates a deterministic HSL color string based on an input string.
 *
 * @param {string} str The input string (e.g., repository name).
 * @returns {string} The HSL color string.
 */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 60%, 45%)`;
}

/**
 * Extracts up to two initials from a repository name.
 *
 * @param {string} name The repository name.
 * @returns {string} The initials.
 */
function getInitials(name: string): string {
  return name
    .replace('lovelace-', '')
    .split(/[-_ ]/)
    .map((word) => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

/**
 * Safely converts a string to a base64 encoded Data URL segment.
 *
 * @param {string} str The input string (HTML/SVG markup).
 * @returns {string} The base64 encoded segment.
 */
function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}

/**
 * Generates a Data URL for a dynamic SVG icon based on a repository name.
 *
 * @param {string} name The repository name.
 * @returns {string} The SVG Data URL.
 */
export function generateDynamicIcon(name: string): string {
  const color = stringToColor(name);
  const initials = getInitials(name);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="20" fill="${color}" />
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
            fill="white" font-family="Inter, sans-serif" font-weight="700" font-size="40">
        ${initials}
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

/**
 * Generates a Data URL for a dynamic SVG hero/screenshot based on repository
 * name and description.
 *
 * @param {string} name Repository name.
 * @param {string} description Repository description.
 * @returns {string} The SVG Data URL.
 */
export function generateDynamicHero(name: string, description: string): string {
  const color = stringToColor(name);
  const displayName = name.replace('lovelace-', '').replace(/-/g, ' ');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#0f1115;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill="url(#grad)" />
      <text x="40" y="80" fill="white" font-family="Inter, sans-serif" font-weight="700" font-size="28">
        ${displayName}
      </text>
      <text x="40" y="115" fill="rgba(255,255,255,0.7)" font-family="Inter, sans-serif" font-size="14" width="320">
        ${description.substring(0, 45)}${description.length > 45 ? '...' : ''}
      </text>
      <rect x="40" y="140" width="60" height="4" rx="2" fill="white" opacity="0.3" />
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${toBase64(svg)}`;
}

export type IconName = 'star' | 'download' | 'copy' | 'check';

/**
 * Returns the SVG path data for common UI icons.
 *
 * @param {IconName} name The specific icon name ('star' or 'download').
 * @returns {string} The SVG path segment.
 */
export function getIconPath(name: IconName): string {
  const icons: Record<IconName, string> = {
    star: 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z',
    download:
      'M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 1 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z',
    copy: 'M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Z M6.75 1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z',
    check:
      'M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z',
  };

  return icons[name];
}
