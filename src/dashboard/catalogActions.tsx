import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { catalogNameError, MAX_CATALOG_NAME, RECENTS_ID, type Catalog } from '../shared/catalogs';
import { createCatalog, deleteCatalog, moveItemsToCatalog, renameCatalog } from '../shared/storage';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** MIME type of the item IDs (a JSON array) that list rows carry when dragged onto a catalog. */
export const ITEM_DRAG_TYPE = 'application/x-remember-this-items';

/** Moves items to a catalog and says where they went. */
export async function moveToCatalog(ids: readonly string[], catalog: Catalog): Promise<void> {
  if (ids.length === 0) return;
  await moveItemsToCatalog(ids, catalog.id);
  notifications.show({
    color: 'teal',
    message: `${ids.length === 1 ? 'Moved' : `${plural(ids.length, 'item')} moved`} to ${catalog.name}.`,
  });
}

/** Asks for a name and creates a catalog. `onCreated` runs with the new catalog (for example to move items to it). */
export function openCreateCatalog(catalogs: readonly Catalog[], onCreated?: (catalog: Catalog) => void): void {
  const id = modals.open({
    title: 'New catalog',
    centered: true,
    children: (
      <CatalogNameForm
        catalogs={catalogs}
        submitLabel={onCreated ? 'Create and move' : 'Create'}
        onCancel={() => modals.close(id)}
        onSubmit={async (name) => {
          const catalog = await createCatalog(name);
          modals.close(id);
          if (onCreated) onCreated(catalog);
          else notifications.show({ color: 'teal', message: `Catalog “${catalog.name}” created.` });
        }}
      />
    ),
  });
}

export function openRenameCatalog(catalog: Catalog, catalogs: readonly Catalog[]): void {
  if (catalog.id === RECENTS_ID) return;
  const id = modals.open({
    title: 'Rename catalog',
    centered: true,
    children: (
      <CatalogNameForm
        catalogs={catalogs}
        exceptId={catalog.id}
        initial={catalog.name}
        submitLabel="Rename"
        onCancel={() => modals.close(id)}
        onSubmit={async (name) => {
          await renameCatalog(catalog.id, name);
          modals.close(id);
        }}
      />
    ),
  });
}

/** Asks to delete a catalog. Its items move to Recents; nothing is deleted from the library. */
export function confirmDeleteCatalog(catalog: Catalog, itemCount: number, onDeleted?: () => void): void {
  if (catalog.id === RECENTS_ID) return;
  modals.openConfirmModal({
    title: `Delete “${catalog.name}”?`,
    centered: true,
    children: (
      <Text size="sm">
        {itemCount > 0
          ? `Its ${plural(itemCount, 'item')} will move to Recents. No items are deleted.`
          : 'The catalog is empty. No items are deleted.'}
      </Text>
    ),
    labels: { confirm: 'Delete catalog', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: async () => {
      const moved = await deleteCatalog(catalog.id);
      onDeleted?.();
      notifications.show({
        color: 'gray',
        message: `Catalog deleted.${moved > 0 ? ` ${plural(moved, 'item')} moved to Recents.` : ''}`,
      });
    },
  });
}

interface CatalogNameFormProps {
  catalogs: readonly Catalog[];
  exceptId?: string;
  initial?: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}

function CatalogNameForm({ catalogs, exceptId, initial = '', submitLabel, onCancel, onSubmit }: CatalogNameFormProps) {
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = catalogNameError(name, catalogs, exceptId);
  const unchanged = initial !== '' && name.trim() === initial;

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setTouched(true);
        if (error || unchanged || busy) return;
        setBusy(true);
        try {
          await onSubmit(name.trim());
        } finally {
          setBusy(false);
        }
      }}
    >
      <Stack gap="md">
        <TextInput
          data-autofocus
          label="Name"
          placeholder="For example: Cooking, Work, Watch later"
          value={name}
          maxLength={MAX_CATALOG_NAME}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setTouched(true);
          }}
          error={touched && name !== '' ? error : null}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={Boolean(error) || unchanged}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
