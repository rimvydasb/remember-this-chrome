import { Alert, Button, CopyButton, Kbd, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconBrandYoutube,
  IconCheck,
  IconClipboard,
  IconClipboardCheck,
  IconFileText,
  IconInfoCircle,
  IconLayoutGrid,
  IconRefresh,
  IconUser,
  IconWorld,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { CaptureField } from '../../shared/mergeCapture';
import { countItems, findCapture, isItemKey } from '../../shared/storage';
import type { CaptureResponse, RuntimeMessage, SavedItem } from '../../shared/types';
import { canonicalYouTubeUrl, getYouTubeVideoId } from '../../shared/youtube';
import { findSentiment } from '../../shared/sentiment';
import { formatDuration } from '../../shared/markdown';
import { countWords } from '../../shared/transcript';
import { CATEGORY_ICONS, MOOD_COLORS } from '../dashboard/sentimentStyle';
import { Chip } from '../ui/Chip';
import { Logo } from '../ui/Logo';
import { formatDateTime, formatNumber } from '../ui/format';

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
  /** The library item for this video: undefined while loading, null when not saved yet. */
  const [saved, setSaved] = useState<SavedItem | null | undefined>(undefined);

  const videoId = getYouTubeVideoId(tab?.url);
  const isYouTube = videoId !== null;

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([active]) => {
      if (active?.id !== undefined) setTab({ id: active.id, url: active.url, title: active.title });
    });
  }, []);

  useEffect(() => {
    const refresh = () => {
      countItems().then(setCount);
      if (videoId)
        findCapture(canonicalYouTubeUrl(videoId), 'youtube_transcript').then((item) => setSaved(item ?? null));
      else setSaved(null);
    };
    refresh();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && Object.keys(changes).some(isItemKey)) refresh();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [videoId]);

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

  const pageTitle = isYouTube
    ? (tab?.title?.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '') ?? 'Video')
    : 'Web page';
  const channel = saved?.meta?.channel;
  const sentiments = saved?.tags?.filter((tag) => tag.kind === 'sentiment') ?? [];

  return (
    <div className="pp">
      <header className="pp-head">
        <Logo size="sm" />
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconLayoutGrid size={16} />}
          aria-label="Open library"
          onClick={() => openLibrary()}
        >
          Library
        </Button>
      </header>

      <div className="pp-body">
        <div className="pp-video">
          {saved?.meta?.thumbnail ? (
            <img className="pp-thumb" src={saved.meta.thumbnail} alt="" />
          ) : (
            <div className="pp-thumb" aria-hidden>
              {isYouTube ? <IconBrandYoutube size={20} /> : <IconWorld size={20} />}
            </div>
          )}
          <div className="pp-video-info">
            <span className="rt-label">{isYouTube ? 'YouTube video' : 'Current page'}</span>
            <h3>{pageTitle}</h3>
            {(channel || sentiments.length > 0) && (
              <div className="rt-chips">
                {channel && (
                  <Chip color="red" icon={<IconUser size={12} />}>
                    {channel}
                  </Chip>
                )}
                {sentiments.map((tag) => {
                  const sentiment = findSentiment(tag.label);
                  const CategoryIcon = sentiment ? CATEGORY_ICONS[sentiment.category] : undefined;
                  return (
                    <Chip
                      key={tag.label}
                      color={sentiment ? MOOD_COLORS[sentiment.mood] : 'grape'}
                      icon={CategoryIcon ? <CategoryIcon size={12} /> : undefined}
                    >
                      {tag.label}
                    </Chip>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <dl className="pp-kv">
          <dt>status</dt>
          <dd className={saved ? 'ok' : undefined}>{saved ? '● in library' : 'not saved'}</dd>
          {saved?.meta?.durationSec ? (
            <>
              <dt>duration</dt>
              <dd>{formatDuration(saved.meta.durationSec)}</dd>
            </>
          ) : null}
          {saved && (
            <>
              <dt>words</dt>
              <dd>{formatNumber(countWords(saved.content))}</dd>
              <dt>last capture</dt>
              <dd>{formatDateTime(saved.timestamp)}</dd>
            </>
          )}
        </dl>

        <div className="pp-cta">
          <Button
            className="pp-primary"
            loading={busy}
            disabled={!tab || (isYouTube && saved === undefined)}
            onClick={capture}
            leftSection={
              !isYouTube ? (
                <IconFileText size={16} />
              ) : saved ? (
                <IconRefresh size={16} />
              ) : (
                <IconBrandYoutube size={16} />
              )
            }
          >
            {!isYouTube ? 'Capture page text' : saved ? 'Update transcript' : 'Save transcript'}
          </Button>
        </div>

        {result && <CaptureResult result={result} />}
      </div>

      <footer className="pp-foot">
        <span className="pp-stat">
          <span className="rt-dot" />
          {count === null ? ' ' : `${formatNumber(count)} ${count === 1 ? 'item' : 'items'} in library`}
        </span>
        <span>
          <Kbd>Alt</Kbd> <Kbd>Shift</Kbd> <Kbd>S</Kbd>
        </span>
      </footer>
    </div>
  );
}

function CaptureResult({ result }: { result: CaptureResponse }) {
  if (!result.ok) {
    const notImplemented = result.code === 'not_implemented';
    return (
      <Alert
        variant="light"
        className="pp-result"
        color={notImplemented ? 'gray' : 'red'}
        title={notImplemented ? 'Not implemented yet' : 'Could not save the transcript'}
        icon={notImplemented ? <IconInfoCircle /> : <IconAlertTriangle />}
      >
        <Text size="sm">{result.error}</Text>
      </Alert>
    );
  }

  const { item, stats, created, changed } = result;
  return (
    <Alert
      variant="light"
      color="green"
      title={created ? 'Transcript saved' : 'Transcript updated'}
      icon={<IconCheck size={16} />}
      className="pp-result"
    >
      <div className="rt-chips">
        <Chip color="green">{formatNumber(stats.words)} words</Chip>
        <Chip color="green">{stats.paragraphs} paragraphs</Chip>
        <Chip color="gray">{stats.extractMs} ms</Chip>
      </div>
      {!created && (
        <Text size="xs" mt="sm">
          {changed.length > 0 ? `Changed: ${describeChanges(changed)}.` : 'No changes since the last capture.'}
        </Text>
      )}
      <div className="pp-result-acts">
        <CopyButton value={item.content} timeout={2000}>
          {({ copied, copy }) => (
            <Button
              size="sm"
              variant="default"
              leftSection={copied ? <IconClipboardCheck size={14} /> : <IconClipboard size={14} />}
              onClick={copy}
            >
              {copied ? 'Copied' : 'Copy text'}
            </Button>
          )}
        </CopyButton>
        <Button
          size="sm"
          variant="default"
          leftSection={<IconLayoutGrid size={14} />}
          onClick={() => openLibrary(item.id)}
        >
          View
        </Button>
      </div>
    </Alert>
  );
}

const FIELD_LABELS: Record<CaptureField, string> = {
  title: 'title',
  content: 'transcript',
  channel: 'channel',
  duration: 'duration',
  language: 'language',
  views: 'view count',
  description: 'description',
  links: 'links',
  chapters: 'chapters',
};

function describeChanges(changed: readonly CaptureField[]): string {
  return changed.map((field) => FIELD_LABELS[field]).join(', ');
}
