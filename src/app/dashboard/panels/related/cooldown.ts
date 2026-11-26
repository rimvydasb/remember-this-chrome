/** How long Google searches pause after Google blocked one (Search rules). */
export const SEARCH_COOLDOWN_MS = 10 * 60_000;

const KEY = 'rt-google-search-cooldown';

export interface SearchCooldown {
  /** Epoch milliseconds when searching may start again. */
  until: number;
  /** Why the searches pause, for the user. */
  reason: string;
}

/**
 * The active cooldown, or undefined. Kept in `localStorage`, so it holds for every item and
 * survives a reload of the dashboard. It is a per-browser convenience: losing it only allows an
 * earlier retry.
 */
export function readCooldown(now = Date.now()): SearchCooldown | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SearchCooldown> | null;
    if (parsed && typeof parsed.until === 'number' && parsed.until > now) {
      return { until: parsed.until, reason: typeof parsed.reason === 'string' ? parsed.reason : '' };
    }
  } catch {
    // Storage blocked or damaged: no cooldown.
  }
  return undefined;
}

/** Starts the cooldown and returns it. */
export function startCooldown(reason: string, now = Date.now()): SearchCooldown {
  const cooldown = { until: now + SEARCH_COOLDOWN_MS, reason };
  try {
    localStorage.setItem(KEY, JSON.stringify(cooldown));
  } catch {
    // Storage blocked: the cooldown holds until the page closes.
  }
  return cooldown;
}
