import { ActionIcon, Button, Group, Menu, Text } from '@mantine/core';
import { IconDots, IconFolderPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { useState, type DragEvent } from 'react';
import { RECENTS_ID, type Catalog } from '../../shared/catalogs';
import { Chip } from '../ui/Chip';
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
    <>
      <div className="rt-subbar">
        <nav className="rt-crumb" aria-label="Breadcrumb">
          <b aria-current="page">Catalogs</b>
        </nav>
      </div>
      <div className="rt-rcontent">
        <div className="rt-page-head">
          <div>
            <h2>Catalogs</h2>
            <p>New saves land in Recents. Move them to a catalog to keep your library tidy.</p>
          </div>
          <Button
            leftSection={<IconFolderPlus size={16} />}
            onClick={() => openCreateCatalog(catalogs)}
            style={{ flexShrink: 0 }}
          >
            New catalog
          </Button>
        </div>

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
            <IconFolderPlus size={24} stroke={1.75} />
            <Text size="sm" fw={500}>
              New catalog
            </Text>
          </button>
        </div>

        <p className="rt-meta" style={{ textAlign: 'center', marginTop: 'var(--s-6)' }}>
          Tip: drag items from the list onto a catalog to move them there. Select several items to move them together.
        </p>
      </div>
    </>
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
            <Text fw={600} size="md" truncate>
              {catalog.name}
            </Text>
            {isRecents && <Chip color="gray">Default</Chip>}
          </Group>
          {!isRecents && (
            <Menu position="bottom-end" withArrow width={180}>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label={`${catalog.name} actions`}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <IconDots size={14} />
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
        <Text className="rt-meta">
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
