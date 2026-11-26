import { Button, Popover, Switch } from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlugConnected,
  IconRefresh,
  IconSettings,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { taggingPipeline } from '../../followups/services';
import { TAGGING_RETRY_MS } from '../../followups/tagging/BackgroundTagger';
import { normalizeBaseUrl, requestLlmPermission } from '../../llm';
import { saveSettings, type LlmSettings } from '../../shared/settings';
import type { SavedItem } from '../../shared/types';
import { ActivityBar, elapsed } from './ActivityBar';
import { aiActivity, useAiActivity, type AiActivity, type AiTask, type TaggingJob } from './aiActivity';
import type { AiConnection } from './useAiConnection';

export type SettingsSection = 'server' | 'prompts' | 'tagging' | 'appearance' | 'storage';

interface AiStatusProps {
  all: readonly SavedItem[];
  llm: LlmSettings | undefined;
  connection: AiConnection;
  onCheck: () => void;
  onOpenSettings: (section: SettingsSection) => void;
}

type Dot = 'ok' | 'err' | 'off';

/** "12 s ago", "4 min ago", "yesterday 21:14". */
function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return new Date(now).toDateString() === date.toDateString()
    ? `today ${time}`
    : `${date.toLocaleDateString()} ${time}`;
}

const serverLabel = (baseUrl: string) => {
  try {
    return normalizeBaseUrl(baseUrl).replace(/^https?:\/\//, '');
  } catch {
    return baseUrl;
  }
};

/** The pill text and dot: the running work first, then the connection. */
function pillState(activity: AiActivity, connection: AiConnection): { dot: Dot; text: string; working: boolean } {
  const { tasks, tagging } = activity;
  const count = tasks.length + (tagging ? 1 : 0);
  if (count > 1) return { dot: 'ok', text: `${count} tasks`, working: true };
  if (tagging) return { dot: 'ok', text: `tagging ${tagging.done}/${tagging.total}`, working: true };
  if (tasks[0]) return { dot: 'ok', text: tasks[0].label.toLowerCase(), working: true };
  switch (connection.status) {
    case 'ok':
      return { dot: 'ok', text: activity.taggingPaused ? 'paused' : 'ready', working: false };
    case 'offline':
      return { dot: 'err', text: 'offline', working: false };
    case 'off':
      return { dot: 'off', text: 'off', working: false };
    default:
      return { dot: 'off', text: 'checking…', working: false };
  }
}

function TaggingCard({ job }: { job: TaggingJob }) {
  return (
    <div className="rt-job">
      <div className="rt-job-top">
        <b>Tagging library</b>
        <span className="rt-mono rt-meta">
          {job.done} / {job.total}
        </span>
      </div>
      <ActivityBar value={job.total > 0 ? job.done / job.total : undefined} />
      <div className="rt-job-cur">Now: {job.itemTitle}</div>
    </div>
  );
}

function TaskCard({ task, now }: { task: AiTask; now: number }) {
  return (
    <div className="rt-job">
      <div className="rt-job-top">
        <b>{task.label}</b>
        <span className="rt-mono rt-meta">{elapsed(task.startedAt, now)}</span>
      </div>
      <ActivityBar />
      <div className="rt-job-cur">{task.itemTitle}</div>
    </div>
  );
}

/** The AI pill in the header and the panel it opens: connection, running work, and the controls. */
export function AiStatus({ all, llm, connection, onCheck, onOpenSettings }: AiStatusProps) {
  const activity = useAiActivity();
  const [opened, setOpened] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { dot, text, working } = pillState(activity, connection);
  const ticking = opened || working;
  const interval = useInterval(() => setNow(Date.now()), 1000);
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    interval.start();
    return interval.stop;
    // `interval` is a new object on each render; start and stop are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticking]);

  const eligible = all.filter((item) => item.mark !== 'forgotten' && item.content.trim() !== '');
  const untagged = eligible.filter((item) => taggingPipeline.needsTags(item)).length;
  const tagging = llm?.useForTags ?? false;
  const share =
    activity.tagging && activity.tagging.total > 0 ? activity.tagging.done / activity.tagging.total : undefined;

  const setTagging = (useForTags: boolean) => {
    if (!llm) return;
    void saveSettings({ llm: { ...llm, useForTags } });
    if (useForTags) aiActivity.setTaggingPaused(false);
  };

  const connect = () => {
    if (!llm) return;
    // Inside the click: Chrome shows the permission prompt only during a user gesture.
    requestLlmPermission(llm.baseUrl).then(
      (granted) => {
        if (granted) onCheck();
        else onOpenSettings('server');
      },
      (error: unknown) => notifications.show({ color: 'red', message: String(error) }),
    );
  };

  const title =
    connection.status === 'ok'
      ? 'Local AI connected'
      : connection.status === 'offline'
        ? 'Cannot reach the AI server'
        : connection.status === 'off'
          ? 'Local AI is not connected'
          : 'Checking the AI server…';
  const headDot: Dot = connection.status === 'ok' ? 'ok' : connection.status === 'offline' ? 'err' : 'off';
  const lastCall = activity.lastCall;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      offset={4}
      width={344}
      shadow="md"
      radius="lg"
      onOpen={onCheck}
    >
      <Popover.Target>
        <button
          type="button"
          className="rt-ai-pill"
          aria-label={`AI status: ${text}`}
          aria-expanded={opened}
          onClick={() => setOpened((value) => !value)}
        >
          <span className="rt-dot" data-state={dot} data-pulse={working || undefined} />
          <b>AI</b>
          <span className="rt-ai-pill-text">{text}</span>
          {working && (
            <span className="rt-ai-pill-mini">
              <ActivityBar value={activity.tasks.length === 0 ? share : undefined} small />
            </span>
          )}
        </button>
      </Popover.Target>
      <Popover.Dropdown className="rt-pop">
        <div className="rt-pop-h">
          <span className="rt-dot" data-state={headDot} data-pulse={working || undefined} />
          <b>{title}</b>
          {connection.status === 'ok' && <span className="rt-meta rt-mono">{connection.latencyMs} ms</span>}
        </div>

        <div className="rt-pop-b">
          {connection.status === 'off' ? (
            <p>
              Connect an OpenAI-compatible server (for example LM Studio) to get summaries, sentiment, answers and tags.
              Transcripts are sent only to that server.
            </p>
          ) : (
            <>
              {connection.status === 'offline' && (
                <div className="rt-alert" data-tone="err">
                  <IconAlertTriangle size={16} />
                  <div>
                    <b>{connection.message}</b>
                    <p>
                      Is the server running?{' '}
                      {tagging && !activity.taggingPaused
                        ? `Background tagging is paused and retries every ${TAGGING_RETRY_MS / 60_000} minutes.`
                        : ''}
                    </p>
                  </div>
                </div>
              )}
              {llm && (
                <dl className="rt-pop-kv">
                  <dt>Server</dt>
                  <dd>{serverLabel(llm.baseUrl)}</dd>
                  <dt>Model</dt>
                  <dd>
                    {llm.model ||
                      (connection.status === 'ok' && connection.models.length === 1
                        ? connection.models[0]
                        : 'loaded model')}
                  </dd>
                  {lastCall && (
                    <>
                      <dt>Last call</dt>
                      <dd>
                        {ago(lastCall.at, now)} · {lastCall.ok ? 'ok' : 'failed'}
                      </dd>
                    </>
                  )}
                  {!working && eligible.length > 0 && (
                    <>
                      <dt>Tagged</dt>
                      <dd>
                        {eligible.length - untagged} / {eligible.length} items
                      </dd>
                    </>
                  )}
                </dl>
              )}
              {activity.tagging && <TaggingCard job={activity.tagging} />}
              {activity.tasks.map((task) => (
                <TaskCard key={task.id} task={task} now={now} />
              ))}
              {llm && (
                <div className="rt-toggle-row">
                  <div>
                    Tag new items in the background
                    <small>
                      {!tagging
                        ? 'Off: items show keyword tags'
                        : activity.taggingPaused
                          ? 'Paused until you resume or reopen the dashboard'
                          : untagged === 0
                            ? 'All items are tagged'
                            : 'Open item first, then newest first'}
                    </small>
                  </div>
                  <Switch
                    aria-label="Tag new items in the background"
                    checked={tagging}
                    onChange={(event) => setTagging(event.currentTarget.checked)}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="rt-pop-f">
          {connection.status === 'off' ? (
            <Button size="compact-sm" leftSection={<IconPlugConnected size={14} />} onClick={connect}>
              Connect a server
            </Button>
          ) : connection.status === 'offline' ? (
            <Button size="compact-sm" leftSection={<IconRefresh size={14} />} onClick={onCheck}>
              Retry now
            </Button>
          ) : (
            <>
              {tagging && (
                <Button
                  size="compact-sm"
                  variant="default"
                  leftSection={activity.taggingPaused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
                  onClick={() => aiActivity.setTaggingPaused(!activity.taggingPaused)}
                >
                  {activity.taggingPaused ? 'Resume' : 'Pause'}
                </Button>
              )}
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<IconPlugConnected size={14} />}
                onClick={onCheck}
                loading={connection.status === 'checking'}
              >
                Test
              </Button>
            </>
          )}
          <Button
            size="compact-sm"
            variant="subtle"
            className="rt-spacer"
            leftSection={<IconSettings size={14} />}
            onClick={() => {
              setOpened(false);
              onOpenSettings('server');
            }}
          >
            AI settings
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
