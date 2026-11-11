import { Badge, Button, Checkbox, CloseButton, Group, Loader, Text } from '@mantine/core';
import { IconFilter, IconMarkdown, IconTrash } from '@tabler/icons-react';
import type { SavedItem } from '../shared/types';
import { formatNumber } from '../ui/format';
import { confirmDelete, exportMarkdown } from './actions';

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
  activeFilters: number;
  onToggleFilters: () => void;
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
  activeFilters,
  onToggleFilters,
}: ListToolbarProps) {
  const allVisibleChecked = visible.length > 0 && visible.every((item) => checked.has(item.id));
  const someVisibleChecked = visible.some((item) => checked.has(item.id));

  if (checked.size > 0) {
    return (
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap="xs" wrap="nowrap">
          <Checkbox
            size="xs"
            checked={allVisibleChecked}
            indeterminate={!allVisibleChecked && someVisibleChecked}
            onChange={onToggleAllVisible}
            aria-label="Select all visible items"
          />
          <Text size="sm" fw={600}>
            {checked.size} selected
          </Text>
        </Group>
        <Group gap={4} wrap="nowrap">
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconMarkdown size={14} />}
            onClick={() => exportMarkdown(checkedItems)}
          >
            Markdown
          </Button>
          <Button
            size="compact-xs"
            variant="light"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => confirmDelete(checkedItems, onClearChecked)}
          >
            Delete
          </Button>
          <CloseButton size="sm" aria-label="Clear selection" onClick={onClearChecked} />
        </Group>
      </Group>
    );
  }

  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap="xs" wrap="nowrap">
        <Checkbox
          size="xs"
          checked={false}
          disabled={visible.length === 0}
          onChange={onToggleAllVisible}
          aria-label="Select all visible items"
        />
        <Text size="sm" c="dimmed">
          {narrowed
            ? `${formatNumber(visible.length)} of ${formatNumber(total)} items`
            : `${formatNumber(total)} ${total === 1 ? 'item' : 'items'}`}
        </Text>
        {busy && <Loader size={14} />}
      </Group>
      <Button
        size="compact-xs"
        variant={filtersOpen ? 'light' : 'subtle'}
        color={activeFilters > 0 ? undefined : 'gray'}
        leftSection={<IconFilter size={14} />}
        rightSection={
          activeFilters > 0 ? (
            <Badge size="xs" circle variant="filled">
              {activeFilters}
            </Badge>
          ) : undefined
        }
        onClick={onToggleFilters}
        aria-expanded={filtersOpen}
        disabled={total === 0}
      >
        Filters
      </Button>
    </Group>
  );
}
