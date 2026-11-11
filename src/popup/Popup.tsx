import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Group,
  Kbd,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconBooks,
  IconBrandYoutube,
  IconCheck,
  IconClipboard,
  IconClipboardCheck,
  IconFileText,
  IconInfoCircle,
  IconWorld,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { countItems, isItemKey } from '../shared/storage';
import type { CaptureResponse, RuntimeMessage } from '../shared/types';
import { isYouTubeWatchUrl } from '../shared/youtube';
import { Logo } from '../ui/Logo';
import { formatNumber } from '../ui/format';

interface ActiveTab {
  id: number;
  url?: string;
  title?: string;
}

function openLibrary(itemId?: string) {
  const url = chrome.runtime.getURL(`dashboard.html${itemId ? `#item=${encodeURIComponent(itemId)}` : ''}`);
  chrome.tabs.create({ url }).then(() => window.close());
}

export function Popup() {
  const [tab, setTab] = useState<ActiveTab | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaptureResponse | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      if (active?.id !== undefined) setTab({ id: active.id, url: active.url, title: active.title });
    });
    const refreshCount = () => countItems().then(setCount);
    refreshCount();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && Object.keys(changes).some(isItemKey)) refreshCount();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const isYouTube = isYouTubeWatchUrl(tab?.url);

  const capture = useCallback(async () => {
    if (!tab) return;
    setBusy(true);
    setResult(null);
    try {
      const message: RuntimeMessage = { type: 'capture-tab', tabId: tab.id };
      setResult((await chrome.runtime.sendMessage(message)) as CaptureResponse);
    } catch (error) {
      setResult({ ok: false, code: 'extraction_failed', error: String(error) });
    } finally {
      setBusy(false);
    }
  }, [tab]);

  return (
    <Stack gap="sm" p="md" w={360}>
      <Group justify="space-between" wrap="nowrap">
        <Logo size="sm" />
        <Tooltip label="Open library" position="left" withArrow>
          <ActionIcon variant="light" size="lg" aria-label="Open library" onClick={() => openLibrary()}>
            <IconBooks size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Card withBorder padding="sm" radius="md">
        <Group gap="xs" wrap="nowrap" mb={6}>
          {isYouTube ? (
            <IconBrandYoutube size={18} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
          ) : (
            <IconWorld size={18} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
          )}
          <Text size="xs" c="dimmed" fw={500} tt="uppercase">
            {isYouTube ? 'YouTube video' : 'Current page'}
          </Text>
        </Group>
        <Text size="sm" fw={600} lineClamp={2} mb="sm">
          {isYouTube ? (tab?.title?.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '') ?? 'Video') : 'Web page'}
        </Text>
        <Button
          fullWidth
          loading={busy}
          disabled={!tab}
          onClick={capture}
          leftSection={isYouTube ? <IconBrandYoutube size={18} /> : <IconFileText size={18} />}
          variant={isYouTube ? 'filled' : 'light'}
        >
          {isYouTube ? 'Save transcript' : 'Capture page text'}
        </Button>
      </Card>

      {result && <CaptureResult result={result} />}

      <Divider />
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {count === null ? ' ' : `${formatNumber(count)} ${count === 1 ? 'item' : 'items'} in library`}
        </Text>
        <Text size="xs" c="dimmed">
          Shortcut <Kbd size="xs">Alt</Kbd> + <Kbd size="xs">Shift</Kbd> + <Kbd size="xs">S</Kbd>
        </Text>
      </Group>
    </Stack>
  );
}

function CaptureResult({ result }: { result: CaptureResponse }) {
  if (!result.ok) {
    const notImplemented = result.code === 'not_implemented';
    return (
      <Alert
        variant="light"
        color={notImplemented ? 'gray' : 'red'}
        title={notImplemented ? 'Not implemented yet' : 'Could not save the transcript'}
        icon={notImplemented ? <IconInfoCircle /> : <IconAlertTriangle />}
      >
        <Text size="sm">{result.error}</Text>
      </Alert>
    );
  }

  const { item, stats, created } = result;
  return (
    <Alert
      variant="light"
      color="teal"
      title={created ? 'Transcript saved' : 'Transcript updated'}
      icon={<IconCheck />}
    >
      <Group gap={6} mb="sm">
        <Badge variant="white" color="teal" size="sm">
          {formatNumber(stats.words)} words
        </Badge>
        <Badge variant="white" color="teal" size="sm">
          {stats.paragraphs} paragraphs
        </Badge>
        <Badge variant="white" color="gray" size="sm">
          {stats.extractMs} ms
        </Badge>
      </Group>
      <Group gap="xs" grow>
        <CopyButton value={item.content} timeout={2000}>
          {({ copied, copy }) => (
            <Button
              size="xs"
              variant={copied ? 'filled' : 'default'}
              color={copied ? 'teal' : undefined}
              leftSection={copied ? <IconClipboardCheck size={15} /> : <IconClipboard size={15} />}
              onClick={copy}
            >
              {copied ? 'Copied' : 'Copy text'}
            </Button>
          )}
        </CopyButton>
        <Button size="xs" variant="default" leftSection={<IconBooks size={15} />} onClick={() => openLibrary(item.id)}>
          View
        </Button>
      </Group>
    </Alert>
  );
}
