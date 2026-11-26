import { ActionIcon, Button, Checkbox, Loader, Tooltip } from '@mantine/core';
import type { Catalog } from '../../shared/catalogs';
import {
  IconChevronDown,
  IconEyeOff,
  IconFilter,
  IconFolderShare,
  IconMarkdown,
  IconRestore,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import type { SavedItem } from '../../shared/types';
import { formatNumber } from '../ui/format';
import { confirmDelete, exportMarkdown, markItems } from './actions';
import { CatalogMenu } from './CatalogMenu';

interface ListToolbarProps {
  total: number;
  visible: readonly SavedItem[];
  checked: ReadonlySet<string>;
  checkedItems: readonly SavedItem[];
  onToggleAllVisible: () => void;
  onClearChecked: () => void;
  /** True while the search, filter, or keyword results are being updated. */
  busy: boolean;
  narrowed: boolean;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  catalogs: readonly Catalog[];
  /** The catalog that all checked items are in, if they share one. */
  checkedCatalogId: string | undefined;
}

export function ListToolbar({
  total,
  visible,
  checked,
  checkedItems,
  onToggleAllVisible,
  onClearChecked,
  busy,
  narrowed,
  filtersOpen,
  onToggleFilters,
  catalogs,
  checkedCatalogId,
}: ListToolbarProps) {
  const allVisibleChecked = visible.length > 0 && visible.every((item) => checked.has(item.id));
  const someVisibleChecked = visible.some((item) => checked.has(item.id));
  const forgottenCount = checkedItems.filter((item) => item.mark === 'forgotten').length;
  const allForgotten = checkedItems.length > 0 && forgottenCount === checkedItems.length;

  if (checked.size > 0) {
    return (
      <div className="rt-subbar">
        <span className="rt-select-all">
          <Checkbox
            size="xs"
            checked={allVisibleChecked}
            indeterminate={!allVisibleChecked && someVisibleChecked}
            onChange={onToggleAllVisible}
            aria-label="Select all visible items"
          />
        </span>
        <span className="rt-selected-count">{checked.size} selected</span>
        <div className="rt-acts rt-selection-acts">
          <CatalogMenu
            catalogs={catalogs}
            itemIds={checkedItems.map((item) => item.id)}
            currentId={checkedCatalogId}
            onMoved={onClearChecked}
            target={
              <Button size="sm" variant="default" leftSection={<IconFolderShare size={14} />}>
                Move
              </Button>
            }
          />
          <Tooltip label="Export as Markdown" withArrow>
            <Button
              size="sm"
              variant="default"
              px={8}
              aria-label="Markdown"
              onClick={() => exportMarkdown(checkedItems)}
            >
              <IconMarkdown size={16} />
            </Button>
          </Tooltip>
          {allForgotten ? (
            <Button
              size="sm"
              variant="default"
              leftSection={<IconRestore size={14} />}
              onClick={() => markItems(checkedItems, undefined)}
            >
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              leftSection={<IconEyeOff size={14} />}
              onClick={() => markItems(checkedItems, 'forgotten').then(onClearChecked)}
            >
              Forget
            </Button>
          )}
          {forgottenCount > 0 && (
            <Tooltip
              label={allForgotten ? 'Delete permanently' : `Deletes only the ${forgottenCount} forgotten`}
              withArrow
            >
              <Button
                size="sm"
                variant="default"
                color="red"
                className="rt-danger"
                leftSection={<IconTrash size={14} />}
                onClick={() => confirmDelete(checkedItems, onClearChecked)}
              >
                Delete
              </Button>
            </Tooltip>
          )}
          <ActionIcon variant="subtle" aria-label="Clear selection" onClick={onClearChecked}>
            <IconX size={16} />
          </ActionIcon>
        </div>
      </div>
    );
  }

  return (
    <div className="rt-subbar">
      <Button
        size="sm"
        variant="default"
        className="rt-ftoggle"
        data-open={filtersOpen || undefined}
        leftSection={<IconFilter size={16} />}
        rightSection={<IconChevronDown size={14} className="rt-chev" />}
        onClick={onToggleFilters}
        aria-expanded={filtersOpen}
        disabled={total === 0}
      >
        Filters
      </Button>
      {busy && <Loader size={14} />}
      <span className="rt-list-count">
        {narrowed
          ? `${formatNumber(visible.length)} of ${formatNumber(total)}`
          : `${formatNumber(visible.length)} ${visible.length === 1 ? 'item' : 'items'}`}
      </span>
      <span className="rt-select-all">
        <Checkbox
          size="xs"
          checked={false}
          disabled={visible.length === 0}
          onChange={onToggleAllVisible}
          aria-label="Select all visible items"
        />
      </span>
    </div>
  );
}
