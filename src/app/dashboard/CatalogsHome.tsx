import { ActionIcon, Badge, Button, Group, Menu, Stack, Text, Title } from '@mantine/core';
import { IconDots, IconFolderPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { useState, type DragEvent } from 'react';
import { RECENTS_ID, type Catalog } from '../../shared/catalogs';
import { formatNumber, formatShortDate } from '../ui/format';
import {
  confirmDeleteCatalog,
  ITEM_DRAG_TYPE,
  moveToCatalog,
  openCreateCatalog,
  openRenameCatalog,
} from './catalogActions';
import { CatalogIcon } from './CatalogMenu';
import type { CatalogStats } from './useCatalogIndex';

interface CatalogsHomeProps {
  catalogs: readonly Catalog[];
  stats: ReadonlyMap<string, CatalogStats>;
  onOpen: (catalogId: string) => void;
}

const EMPTY_STATS: CatalogStats = { count: 0, total: 0, thumbnails: [] };

/** The start page: every catalog as a card. */
export function CatalogsHome({ catalogs, stats, onOpen }: CatalogsHomeProps) {
  return (
    <Stack gap="lg" maw={1100} mx="auto">
      <Group justify="space-between" align="flex-end" wrap="nowrap">
        <div>
          <Title order={2}>Catalogs</Title>
          <Text size="sm" c="dimmed" mt={4}>
            New saves land in Recents. Move them to a catalog to keep your library tidy.
          </Text>
        </div>
        <Button
          leftSection={<IconFolderPlus size={18} />}
          onClick={() => openCreateCatalog(catalogs)}
          style={{ flexShrink: 0 }}
        >
          New catalog
        </Button>
      </Group>

      <div className="rt-catalog-grid">
        {catalogs.map((catalog) => (
          <CatalogCard
            key={catalog.id}
            catalog={catalog}
            catalogs={catalogs}
            stats={stats.get(catalog.id) ?? EMPTY_STATS}
            onOpen={onOpen}
          />
        ))}
        <button type="button" className="rt-catalog-new" onClick={() => openCreateCatalog(catalogs)}>
          <IconFolderPlus size={26} stroke={1.5} />
          <Text size="sm" fw={600}>
            New catalog
          </Text>
        </button>
      </div>

      <Text size="xs" c="dimmed" ta="center">
        Tip: drag items from the list onto a catalog to move them there. Select several items to move them together.
      </Text>
    </Stack>
  );
}

interface CatalogCardProps {
  catalog: Catalog;
  catalogs: readonly Catalog[];
  stats: CatalogStats;
  onOpen: (catalogId: string) => void;
}

function CatalogCard({ catalog, catalogs, stats, onOpen }: CatalogCardProps) {
  const [dropping, setDropping] = useState(false);
  const isRecents = catalog.id === RECENTS_ID;

  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(ITEM_DRAG_TYPE);

  return (
    <div
      role="button"
      tabIndex={0}
      className="rt-catalog-card"
      data-dropping={dropping || undefined}
      aria-label={`Open ${catalog.name}, ${stats.count} items`}
      onClick={() => onOpen(catalog.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(catalog.id);
        }
      }}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        if (!accepts(event)) return;
        event.preventDefault();
        try {
          const ids = JSON.parse(event.dataTransfer.getData(ITEM_DRAG_TYPE)) as unknown;
          if (Array.isArray(ids))
            moveToCatalog(
              ids.filter((id) => typeof id === 'string'),
              catalog,
            );
        } catch {
          // Not our payload.
        }
      }}
    >
      <Mosaic thumbnails={stats.thumbnails} catalog={catalog} />
      <div className="rt-catalog-card-body">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {catalog.name}
            </Text>
            {isRecents && (
              <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                Default
              </Badge>
            )}
          </Group>
          {!isRecents && (
            <Menu position="bottom-end" withArrow width={180}>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={`${catalog.name} actions`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => openRenameCatalog(catalog, catalogs)}>
                  Rename…
                </Menu.Item>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={() => confirmDeleteCatalog(catalog, stats.total)}
                >
                  Delete…
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
        <Text size="xs" c="dimmed" mt={2}>
          {stats.count === 0
            ? isRecents
              ? 'Nothing new. Saved items appear here.'
              : 'Empty'
            : `${formatNumber(stats.count)} ${stats.count === 1 ? 'item' : 'items'}${
                stats.latest ? ` · latest ${formatShortDate(stats.latest)}` : ''
              }`}
        </Text>
      </div>
      {dropping && <div className="rt-catalog-drop-hint">Move here</div>}
    </div>
  );
}

/** Up to four thumbnails of the newest items, or the catalog icon when there are none. */
function Mosaic({ thumbnails, catalog }: { thumbnails: readonly string[]; catalog: Catalog }) {
  if (thumbnails.length === 0) {
    return (
      <div className="rt-mosaic rt-mosaic-empty">
        <CatalogIcon catalog={catalog} size={34} />
      </div>
    );
  }
  return (
    <div className="rt-mosaic" data-count={Math.min(thumbnails.length, 4)}>
      {thumbnails.slice(0, 4).map((src, i) => (
        <img key={i} src={src} alt="" draggable={false} />
      ))}
    </div>
  );
}
