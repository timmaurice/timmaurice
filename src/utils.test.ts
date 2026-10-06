import { describe, it, expect } from 'vitest';
import { hasBundledCard, matchesCategory, releaseDate } from '@/utils';

const card = { name: 'lovelace-radar-card', topics: ['lovelace-card'] };
const bundled = { name: 'sea-temperatures', topics: ['hacs-integration', 'lovelace-card'] };
const integration = { name: 'feedparser', topics: ['hacs-integration'] };

describe('hasBundledCard', () => {
  it('is true only for an integration with the lovelace-card topic', () => {
    expect(hasBundledCard(bundled)).toBe(true);
    expect(hasBundledCard(integration)).toBe(false);
    // A card repo is a card, not an integration with a bundled one.
    expect(hasBundledCard(card)).toBe(false);
  });
});

describe('matchesCategory', () => {
  it('lists integrations with a bundled card under Lovelace as well', () => {
    expect(matchesCategory(card, 'plugin')).toBe(true);
    expect(matchesCategory(bundled, 'plugin')).toBe(true);
    expect(matchesCategory(integration, 'plugin')).toBe(false);
  });

  it('keeps integrations with a bundled card under Integrations', () => {
    expect(matchesCategory(bundled, 'integration')).toBe(true);
    expect(matchesCategory(integration, 'integration')).toBe(true);
    expect(matchesCategory(card, 'integration')).toBe(false);
  });

  it('shows everything under All', () => {
    for (const repo of [card, bundled, integration])
      expect(matchesCategory(repo, 'all')).toBe(true);
  });
});

describe('releaseDate', () => {
  it('prefers the latest release over the last push', () => {
    expect(
      releaseDate({ released_at: '2026-09-12T00:00:00Z', updated_at: '2026-10-04T00:00:00Z' }),
    ).toBe('2026-09-12T00:00:00Z');
    expect(releaseDate({ updated_at: '2026-10-04T00:00:00Z' })).toBe('2026-10-04T00:00:00Z');
  });
});
