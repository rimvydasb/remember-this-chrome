import type { SavedItem } from '../../../shared/types';
import { READER_PANELS } from './registry';
import type { ReaderPanel } from './types';

/** Renders the attached panels that apply to the item. Each panel is keyed by the item, so its state resets with it. */
export function ReaderPanels({ item, panels = READER_PANELS }: { item: SavedItem; panels?: readonly ReaderPanel[] }) {
  return (
    <>
      {panels
        .filter((panel) => panel.appliesTo?.(item) ?? true)
        .map(({ id, Component }) => (
          <Component key={`${id}:${item.id}`} item={item} />
        ))}
    </>
  );
}
