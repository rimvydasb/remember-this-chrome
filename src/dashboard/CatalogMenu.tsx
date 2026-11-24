import { Menu } from '@mantine/core';
import { IconCheck, IconFolder, IconFolderPlus, IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { RECENTS_ID, type Catalog } from '../shared/catalogs';
import { moveToCatalog, openCreateCatalog } from './catalogActions';

export function CatalogIcon({ catalog, size = 16 }: { catalog: Catalog; size?: number }) {
  return catalog.id === RECENTS_ID ? <IconInbox size={size} /> : <IconFolder size={size} />;
}

interface CatalogMenuProps {
  catalogs: readonly Catalog[];
  /** The items to move. */
  itemIds: readonly string[];
  /** The catalog all the items are in, if they share one. It is shown with a check mark. */
  currentId?: string;
  /** The button that opens the menu. */
  target: ReactNode;
  onMoved?: () => void;
}

/** Menu that moves items to a catalog, or to a new one. */
export function CatalogMenu({ catalogs, itemIds, currentId, target, onMoved }: CatalogMenuProps) {
  const move = (catalog: Catalog) => moveToCatalog(itemIds, catalog).then(onMoved);
  return (
    <Menu position="bottom-start" width={240} withArrow shadow="md">
      <Menu.Target>{target}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Move to catalog</Menu.Label>
        {catalogs.map((catalog) => (
          <Menu.Item
            key={catalog.id}
            leftSection={<CatalogIcon catalog={catalog} />}
            rightSection={catalog.id === currentId ? <IconCheck size={14} /> : undefined}
            disabled={catalog.id === currentId}
            onClick={() => move(catalog)}
          >
            {catalog.name}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item leftSection={<IconFolderPlus size={16} />} onClick={() => openCreateCatalog(catalogs, move)}>
          New catalog…
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
