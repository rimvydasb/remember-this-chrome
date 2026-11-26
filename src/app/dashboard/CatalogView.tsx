import { ActionIcon, Button, Menu, Text, Tooltip } from '@mantine/core';
import {
  IconBrandYoutube,
  IconDots,
  IconFileText,
  IconHeartFilled,
  IconPencil,
  IconSearchOff,
  IconTrash,
} from '@tabler/icons-react';
import { memo } from 'react';
import { RECENTS_ID, type Catalog } from '../../shared/catalogs';
import type { SavedItem } from '../../shared/types';
import { formatNumber, formatShortDate } from '../ui/format';
import { confirmDeleteCatalog, openRenameCatalog } from './catalogActions';
import { CatalogIcon } from './CatalogMenu';
import type { CatalogStats } from './useCatalogIndex';

interface CatalogViewProps {
  catalog: Catalog;
  catalogs: readonly Catalog[];
  stats: CatalogStats | undefined;
  /** The catalog's items that match the search and filters. */
  items: readonly SavedItem[];
  narrowed: boolean;
  onHome: () => void;
  onOpenItem: (id: string) => void;
  onResetFilters: () => void;
}

/** One catalog: its items as a gallery. */
export function CatalogView({
  catalog,
  catalogs,
  stats,
  items,
  narrowed,
  onHome,
  onOpenItem,
  onResetFilters,
}: CatalogViewProps) {
  const isRecents = catalog.id === RECENTS_ID;
  const count = stats?.count ?? 0;

  return (
    <>
      <div className="rt-subbar">
        <nav className="rt-crumb" aria-label="Breadcrumb">
          <button type="button" onClick={onHome}>
            Catalogs
          </button>
          <span>/</span>
          <b aria-current="page">{catalog.name}</b>
        </nav>
        {!isRecents && (
          <span className="rt-acts">
            <Button
              size="sm"
              variant="default"
              leftSection={<IconPencil size={14} />}
              onClick={() => openRenameCatalog(catalog, catalogs)}
            >
              Rename
            </Button>
            <Menu position="bottom-end" width={200}>
              <Menu.Target>
                <Tooltip label="More" withArrow>
                  <ActionIcon variant="subtle" aria-label="More catalog actions">
                    <IconDots size={16} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={() => confirmDeleteCatalog(catalog, stats?.total ?? 0, onHome)}
                >
                  Delete catalog…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </span>
        )}
      </div>

      <div className="rt-rcontent">
        <div className="rt-page-head" style={{ alignItems: 'center', justifyContent: 'flex-start' }}>
          <span className="rt-catalog-title-icon">
            <CatalogIcon catalog={catalog} size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2>{catalog.name}</h2>
            <p>
              {narrowed
                ? `${formatNumber(items.length)} of ${formatNumber(count)} items match`
                : `${formatNumber(count)} ${count === 1 ? 'item' : 'items'}`}
              {isRecents && ' · new saves land here'}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          narrowed && (stats?.total ?? 0) > 0 ? (
            <div className="rt-empty">
              <IconSearchOff size={24} />
              <b>No items match</b>
              <div className="rt-meta">Nothing in this catalog matches the search and filters.</div>
              <Button variant="default" size="sm" mt={8} onClick={onResetFilters}>
                Reset search and filters
              </Button>
            </div>
          ) : (
            <div className="rt-empty">
              <CatalogIcon catalog={catalog} size={24} />
              <b>{isRecents ? 'Nothing new' : 'This catalog is empty'}</b>
              <div className="rt-meta">
                {isRecents
                  ? 'Items you save appear here first.'
                  : 'Open an item and use its catalog button, select items in the list and choose Move, or drag items onto this catalog in the sidebar.'}
              </div>
            </div>
          )
        ) : (
          <div className="rt-card-grid">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} onOpen={onOpenItem} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const ItemCard = memo(function ItemCard({ item, onOpen }: { item: SavedItem; onOpen: (id: string) => void }) {
  const thumbnail = item.meta?.thumbnail;
  const isVideo = item.type === 'youtube_transcript';
  return (
    <button type="button" className="rt-item-card" onClick={() => onOpen(item.id)}>
      {thumbnail ? (
        <img className="rt-item-card-thumb" src={thumbnail} alt="" draggable={false} />
      ) : (
        <div className="rt-item-card-thumb rt-item-card-thumb-empty">
          {isVideo ? <IconBrandYoutube size={28} /> : <IconFileText size={28} />}
        </div>
      )}
      <div className="rt-item-card-body">
        <Text size="md" fw={500} lineClamp={2}>
          {item.title || 'Untitled'}
        </Text>
        <div className="rt-item-meta">
          <span>{[item.meta?.channel, formatShortDate(item.timestamp)].filter(Boolean).join(' · ')}</span>
          {item.mark === 'loved' && <IconHeartFilled size={12} aria-label="Loved" style={{ color: 'var(--err)' }} />}
        </div>
      </div>
    </button>
  );
});
