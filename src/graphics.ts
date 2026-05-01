/**
 * Generates a deterministic color based on a string
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
 * Gets initials from a repository name
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

function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}

/**
 * Generates a Data URL for a dynamic icon SVG
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
 * Generates a Data URL for a dynamic hero/screenshot SVG
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
