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
import { useHotkeys } from '@mantine/hooks';
import {
  IconArrowsTransferUpDown,
  IconDownload,
  IconMarkdown,
  IconMoon,
  IconSearch,
  IconSettings,
  IconSun,
  IconUpload,
} from '@tabler/icons-react';
import { useState, type Ref } from 'react';
import type { SavedItem } from '../../shared/types';
import { Logo } from '../ui/Logo';
import { exportLibraryJson, exportMarkdown } from './actions';
import { AiStatus, type SettingsSection } from './AiStatus';
import { SettingsDialog } from './SettingsDialog';
import { useAiConnection } from './useAiConnection';
import { useSettings } from './useSettings';

interface AppHeaderProps {
  all: readonly SavedItem[];
  /** The open item; the prompt preview in Settings uses it. */
  openItem: SavedItem | undefined;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: Ref<HTMLInputElement>;
  onImport: (file: File | null) => void;
  onHome: () => void;
}

/** The app header: logo, search, and (top right) AI status, theme, settings and import / export. */
export function AppHeader({ all, openItem, query, onQueryChange, searchRef, onImport, onHome }: AppHeaderProps) {
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('dark');
  const empty = all.length === 0;
  const llm = useSettings()?.llm;
  const { connection, check } = useAiConnection(llm);
  const [settings, setSettings] = useState<SettingsSection | null>(null);

  useHotkeys([[',', () => setSettings((open) => open ?? 'server')]]);

  return (
    <header className="rt-topbar">
      <div className="rt-brand">
        <button type="button" onClick={onHome} aria-label="Catalogs home" className="rt-home-link">
          <Logo />
        </button>
      </div>

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
        <AiStatus all={all} llm={llm} connection={connection} onCheck={check} onOpenSettings={setSettings} />
        <span className="rt-tb-sep" aria-hidden />
        <Tooltip label={colorScheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} withArrow>
          <ActionIcon
            variant="subtle"
            aria-label="Toggle color scheme"
            onClick={() => setColorScheme(colorScheme === 'dark' ? 'light' : 'dark')}
          >
            {colorScheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Settings  ," withArrow>
          <ActionIcon variant="subtle" aria-label="Settings" onClick={() => setSettings('server')}>
            <IconSettings size={16} />
          </ActionIcon>
        </Tooltip>
        <SettingsDialog
          opened={settings !== null}
          section={settings ?? 'server'}
          onSectionChange={setSettings}
          onClose={() => setSettings(null)}
          connection={connection}
          previewItem={openItem ?? all[0]}
        />
        <Menu position="bottom-end" width={264} keepMounted>
          <Tooltip label="Import / export" withArrow>
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label="Import and export">
                <IconArrowsTransferUpDown size={16} />
              </ActionIcon>
            </Menu.Target>
          </Tooltip>
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
          </Menu.Dropdown>
        </Menu>
      </div>
    </header>
  );
}
