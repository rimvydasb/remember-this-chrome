import type { ComponentType } from 'react';
import type { SavedItem } from '../../../shared/types';

/**
 * A self-contained section of the reader view: it owns its UI, its LLM calls and its writes to
 * the follow-ups of the item it gets. Panels know nothing about each other or about the reader.
 */
export interface ReaderPanel {
  /** Unique, stable name; also the React key. */
  id: string;
  /** Hides the panel for items it does not suit. Omit to show it for every item. */
  appliesTo?: (item: SavedItem) => boolean;
  /** Receives the item; the reader remounts it for another item. */
  Component: ComponentType<{ item: SavedItem }>;
}
