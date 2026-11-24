import { ActionIcon, Button, EmptyState, Group, Menu, Stack, Text, Title, Tooltip } from '@mantine/core';
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
import { RECENTS_ID, type Catalog } from '../shared/catalogs';
import type { SavedItem } from '../shared/types';
import { formatNumber, formatShortDate } from '../ui/format';
import { confirmDeleteCatalog, openRenameCatalog } from './catalogActions';
import { CatalogIcon } from './CatalogMenu';
import { PageBreadcrumbs } from './PageBreadcrumbs';
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
    <Stack gap="lg" maw={1100} mx="auto">
      <PageBreadcrumbs crumbs={[{ label: 'Catalogs', onClick: onHome }, { label: catalog.name }]} />

      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <span className="rt-block-icon rt-catalog-title-icon">
            <CatalogIcon catalog={catalog} size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <Title order={2} lh={1.2} style={{ overflowWrap: 'anywhere' }}>
              {catalog.name}
            </Title>
            <Text size="sm" c="dimmed">
              {narrowed
                ? `${formatNumber(items.length)} of ${formatNumber(count)} items match`
                : `${formatNumber(count)} ${count === 1 ? 'item' : 'items'}`}
              {isRecents && ' · new saves land here'}
            </Text>
          </div>
        </Group>
        {!isRecents && (
          <Group gap="xs" wrap="nowrap">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconPencil size={15} />}
              onClick={() => openRenameCatalog(catalog, catalogs)}
            >
              Rename
            </Button>
            <Menu position="bottom-end" withArrow width={200}>
              <Menu.Target>
                <Tooltip label="More" withArrow>
                  <ActionIcon variant="default" size={30} aria-label="More catalog actions">
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
          </Group>
        )}
      </Group>

      {items.length === 0 ? (
        narrowed && (stats?.total ?? 0) > 0 ? (
          <EmptyState
            icon={<IconSearchOff size={28} />}
            title="No items match"
            description="Nothing in this catalog matches the search and filters."
            py="xl"
          >
            <EmptyState.Actions>
              <Button variant="light" size="xs" onClick={onResetFilters}>
                Reset search and filters
              </Button>
            </EmptyState.Actions>
          </EmptyState>
        ) : (
          <EmptyState
            icon={<CatalogIcon catalog={catalog} size={28} />}
            title={isRecents ? 'Nothing new' : 'This catalog is empty'}
            description={
              isRecents
                ? 'Items you save appear here first.'
                : 'Open an item and use its catalog button, select items in the list and choose Move, or drag items onto this catalog on the Catalogs page.'
            }
            maw={460}
            mx="auto"
            py="xl"
          />
        )
      ) : (
        <div className="rt-card-grid">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onOpen={onOpenItem} />
          ))}
        </div>
      )}
    </Stack>
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
          {isVideo ? <IconBrandYoutube size={30} stroke={1.5} /> : <IconFileText size={30} stroke={1.5} />}
        </div>
      )}
      <div className="rt-item-card-body">
        <Text size="sm" fw={600} lineClamp={2} lh={1.35}>
          {item.title || 'Untitled'}
        </Text>
        <Group gap={6} mt={6} wrap="nowrap">
          <Text size="xs" c="dimmed" truncate>
            {[item.meta?.channel, formatShortDate(item.timestamp)].filter(Boolean).join(' · ')}
          </Text>
          {item.mark === 'loved' && (
            <IconHeartFilled
              size={13}
              color="var(--mantine-color-pink-6)"
              aria-label="Loved"
              style={{ flexShrink: 0 }}
            />
          )}
        </Group>
      </div>
    </button>
  );
});
