import {
  ActionIcon,
  CloseButton,
  FileButton,
  Kbd,
  Menu,
  TextInput,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconDots,
  IconDownload,
  IconMarkdown,
  IconMoon,
  IconSearch,
  IconSettings,
  IconSun,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import type { Ref } from 'react';
import type { SavedItem } from '../../shared/types';
import { Logo } from '../ui/Logo';
import { confirmClearLibrary, exportLibraryJson, exportMarkdown } from './actions';
import { SettingsDialog } from './SettingsDialog';

interface AppHeaderProps {
  all: readonly SavedItem[];
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: Ref<HTMLInputElement>;
  onImport: (file: File | null) => void;
  onHome: () => void;
}

/** The app header: logo, search, and (top right) theme, settings and library actions. */
export function AppHeader({ all, query, onQueryChange, searchRef, onImport, onHome }: AppHeaderProps) {
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('dark');
  const empty = all.length === 0;
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure(false);

  return (
    <header className="rt-topbar">
      <button type="button" onClick={onHome} aria-label="Catalogs home" className="rt-home-link">
        <Logo />
      </button>

      <TextInput
        ref={searchRef}
        className="rt-search"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onQueryChange('');
            event.currentTarget.blur();
          }
        }}
        placeholder="Search titles and transcripts…"
        aria-label="Search library"
        leftSection={<IconSearch size={16} />}
        rightSectionWidth={query ? 32 : 40}
        rightSection={
          query ? <CloseButton size="sm" aria-label="Clear search" onClick={() => onQueryChange('')} /> : <Kbd>/</Kbd>
        }
      />

      <div className="rt-topbar-right">
        <Tooltip label={colorScheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} withArrow>
          <ActionIcon
            variant="subtle"
            aria-label="Toggle color scheme"
            onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
          >
            {colorScheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Settings" withArrow>
          <ActionIcon variant="subtle" aria-label="Settings" onClick={openSettings}>
            <IconSettings size={16} />
          </ActionIcon>
        </Tooltip>
        <SettingsDialog opened={settingsOpened} onClose={closeSettings} />
        <Menu position="bottom-end" width={264} keepMounted>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label="More actions">
              <IconDots size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Library</Menu.Label>
            <FileButton onChange={onImport} accept="application/json,.json">
              {(props) => (
                <Menu.Item {...props} leftSection={<IconUpload size={16} />}>
                  Import JSON…
                </Menu.Item>
              )}
            </FileButton>
            <Menu.Item leftSection={<IconDownload size={16} />} onClick={exportLibraryJson} disabled={empty}>
              Export JSON
            </Menu.Item>
            <Menu.Item
              leftSection={<IconMarkdown size={16} />}
              onClick={() => exportMarkdown(all.filter((item) => item.type === 'youtube_transcript'))}
              disabled={empty}
            >
              Export all transcripts as Markdown
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => confirmClearLibrary(all.length)}
              disabled={empty}
            >
              Clear library…
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </header>
  );
}
