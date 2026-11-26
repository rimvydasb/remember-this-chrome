import { ActionIcon, Tooltip } from '@mantine/core';
import {
  IconEyeOff,
  IconFolderPlus,
  IconHeart,
  IconInbox,
  IconLayoutGrid,
  IconLayoutSidebarLeftCollapse,
} from '@tabler/icons-react';
import { useState, type DragEvent, type ReactNode } from 'react';
import { RECENTS_ID, type Catalog } from '../../shared/catalogs';
import type { SavedItem } from '../../shared/types';
import { formatNumber } from '../ui/format';
import { ITEM_DRAG_TYPE, moveToCatalog, openCreateCatalog } from './catalogActions';
import type { CatalogStats } from './useCatalogIndex';
import type { MarkFilter } from './useLibraryFilters';

interface SidebarProps {
  all: readonly SavedItem[];
  catalogs: readonly Catalog[];
  catalogStats: ReadonlyMap<string, CatalogStats>;
  /** The open catalog, if the list is limited to one. */
  scopeId: string | undefined;
  mark: MarkFilter;
  onMark: (mark: MarkFilter) => void;
  onOpenCatalog: (catalogId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** Library scopes (all, loved, forgotten) and the catalogs. Folds to a 48 px icon rail. */
export function Sidebar({
  all,
  catalogs,
  catalogStats,
  scopeId,
  mark,
  onMark,
  onOpenCatalog,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const loved = all.filter((item) => item.mark === 'loved').length;
  const forgotten = all.filter((item) => item.mark === 'forgotten').length;
  const inLibrary = all.length - forgotten;
  const global = scopeId === undefined;

  return (
    <aside className="rt-side" aria-label="Library">
      <div className="rt-subbar">
        <span className="rt-label">Library</span>
        <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} withArrow position="right">
          <ActionIcon
            variant="subtle"
            className="rt-collapse-btn"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapsed}
          >
            <IconLayoutSidebarLeftCollapse size={16} />
          </ActionIcon>
        </Tooltip>
      </div>
      <nav className="rt-side-body">
        <NavItem
          icon={<IconLayoutGrid />}
          label="All items"
          count={inLibrary}
          active={global && mark === 'library'}
          onClick={() => onMark('library')}
        />
        <NavItem
          icon={<IconHeart />}
          label="Loved"
          count={loved}
          active={global && mark === 'loved'}
          onClick={() => onMark('loved')}
        />
        <NavItem
          icon={<IconEyeOff />}
          label="Forgotten"
          count={forgotten}
          active={global && mark === 'forgotten'}
          onClick={() => onMark('forgotten')}
        />

        <div className="rt-grp">
          <span>Catalogs</span>
          {!collapsed && (
            <Tooltip label="New catalog" withArrow>
              <ActionIcon
                variant="subtle"
                size="sm"
                className="rt-grp-add"
                aria-label="New catalog"
                onClick={() => openCreateCatalog(catalogs)}
              >
                <IconFolderPlus size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
        {catalogs.map((catalog) => (
          <CatalogNavItem
            key={catalog.id}
            catalog={catalog}
            count={catalogStats.get(catalog.id)?.count ?? 0}
            active={scopeId === catalog.id}
            onClick={() => onOpenCatalog(catalog.id)}
          />
        ))}
        {collapsed && (
          <Tooltip label="New catalog" withArrow position="right">
            <button
              type="button"
              className="rt-nav rt-nav-new"
              aria-label="New catalog"
              onClick={() => openCreateCatalog(catalogs)}
            >
              <IconFolderPlus />
            </button>
          </Tooltip>
        )}
      </nav>
    </aside>
  );
}

interface NavItemProps {
  icon: ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, count, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      className="rt-nav"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      title={`${label} · ${formatNumber(count)}`}
      onClick={onClick}
    >
      {icon}
      <span className="rt-nav-label">{label}</span>
      <small>{formatNumber(count)}</small>
    </button>
  );
}

/** A catalog: the inbox icon for Recents, a letter badge for the others. Items can be dropped on it. */
function CatalogNavItem({
  catalog,
  count,
  active,
  onClick,
}: {
  catalog: Catalog;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const [dropping, setDropping] = useState(false);
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(ITEM_DRAG_TYPE);
  return (
    <button
      type="button"
      className="rt-nav"
      data-active={active || undefined}
      data-dropping={dropping || undefined}
      aria-current={active ? 'page' : undefined}
      title={`${catalog.name} · ${formatNumber(count)}`}
      onClick={onClick}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        setDropping(false);
        if (!accepts(event)) return;
        event.preventDefault();
        try {
          const ids = JSON.parse(event.dataTransfer.getData(ITEM_DRAG_TYPE)) as unknown;
          if (Array.isArray(ids))
            void moveToCatalog(
              ids.filter((id) => typeof id === 'string'),
              catalog,
            );
        } catch {
          // Not our payload.
        }
      }}
    >
      {catalog.id === RECENTS_ID ? <IconInbox /> : <span className="rt-mono-ic">{badgeLetters(catalog.name)}</span>}
      <span className="rt-nav-label">{catalog.name}</span>
      <small>{formatNumber(count)}</small>
    </button>
  );
}

/** One or two capital letters that stand for a catalog name: "Markets" → "M", "AI research" → "AI". */
export function badgeLetters(name: string): string {
  const trimmed = name.trim();
  const first = trimmed.split(/\s+/)[0] ?? '';
  if (first.length > 1 && first === first.toUpperCase() && /^[A-Z0-9]+$/.test(first)) return first.slice(0, 2);
  return (trimmed[0] ?? '?').toUpperCase();
}
