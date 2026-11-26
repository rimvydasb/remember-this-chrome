import { ActionIcon, CopyButton, Highlight, Menu, Tooltip, Typography } from '@mantine/core';
import {
  IconArticle,
  IconBrandYoutube,
  IconCheck,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconEyeOff,
  IconFileText,
  IconFolder,
  IconHeart,
  IconHeartFilled,
  IconInbox,
  IconMarkdown,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { RECENTS_ID, type Catalog } from '../../shared/catalogs';
import { formatDuration, TYPE_LABELS } from '../../shared/markdown';
import { countWords } from '../../shared/transcript';
import type { Keyword } from '../../shared/keywords';
import { hasTopicTags } from '../../shared/tags';
import type { SavedItem } from '../../shared/types';
import { formatDateTime, formatNumber, formatShortDate, readingTime } from '../ui/format';
import { confirmDelete, exportMarkdown, markItems } from './actions';
import { AiTagsButton } from './AiTagsButton';
import { CatalogMenu } from './CatalogMenu';
import { ClampedText } from './ClampedText';
import { ContentBlock } from './ContentBlock';
import { KeywordBadges } from './KeywordBadges';
import { ReaderPanels } from './panels/ReaderPanels';
import { badgeLetters } from './Sidebar';

interface ItemReaderProps {
  item: SavedItem;
  terms: readonly string[];
  keywords: readonly Keyword[] | undefined;
  activeKeywords: ReadonlySet<string>;
  onToggleKeyword: (key: string) => void;
  /** True while background tagging works on this item. */
  aiTagging?: boolean;
  catalogs: readonly Catalog[];
  /** The catalog the item is in. */
  catalog: Catalog;
  onHome: () => void;
  onOpenCatalog: (catalogId: string) => void;
}

function countMatches(text: string, terms: readonly string[]): number {
  const lower = text.toLowerCase();
  let total = 0;
  for (const term of terms) {
    for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + term.length)) total++;
  }
  return total;
}

export function ItemReader({
  item,
  terms,
  keywords,
  activeKeywords,
  onToggleKeyword,
  aiTagging = false,
  catalogs,
  catalog,
  onHome,
  onOpenCatalog,
}: ItemReaderProps) {
  const paragraphs = useMemo(() => item.content.split(/\n{2,}/), [item.content]);
  const words = useMemo(() => countWords(item.content), [item.content]);
  const matches = useMemo(() => (terms.length ? countMatches(item.content, terms) : 0), [item.content, terms]);
  const highlight = terms as string[];
  const loved = item.mark === 'loved';
  const forgotten = item.mark === 'forgotten';
  const isTranscript = item.type === 'youtube_transcript';
  const thumbnail = item.meta?.thumbnail;
  const duration = item.meta?.durationSec ? formatDuration(item.meta.durationSec) : undefined;
  const viewsAt = item.meta?.viewCountAt ?? item.timestamp;

  return (
    <>
      <div className="rt-subbar">
        <nav className="rt-crumb" aria-label="Breadcrumb">
          <button type="button" onClick={onHome}>
            Catalogs
          </button>
          <span>/</span>
          <button type="button" onClick={() => onOpenCatalog(catalog.id)}>
            <CatalogBadge catalog={catalog} />
            {catalog.name}
          </button>
          <span>/</span>
          <b aria-current="page">{item.title || 'Untitled'}</b>
        </nav>
        <span className="rt-acts">
          <Tooltip label={loved ? 'Remove from loved' : 'Love'} withArrow>
            <ActionIcon
              variant="subtle"
              aria-label={loved ? 'Remove from loved' : 'Love'}
              aria-pressed={loved}
              onClick={() => markItems([item], loved ? undefined : 'loved')}
            >
              {loved ? <IconHeartFilled size={16} style={{ color: 'var(--err)' }} /> : <IconHeart size={16} />}
            </ActionIcon>
          </Tooltip>
          <CopyButton value={item.content} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy text'} withArrow>
                <ActionIcon variant="subtle" aria-label={copied ? 'Copied' : 'Copy text'} onClick={copy}>
                  {copied ? <IconCheck size={16} style={{ color: 'var(--ok)' }} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          <Tooltip label="Export Markdown" withArrow>
            <ActionIcon variant="subtle" aria-label="Export Markdown" onClick={() => exportMarkdown([item])}>
              <IconMarkdown size={16} />
            </ActionIcon>
          </Tooltip>
          <CatalogMenu
            catalogs={catalogs}
            itemIds={[item.id]}
            currentId={catalog.id}
            target={
              <Tooltip label={`Catalog: ${catalog.name} · click to move`} withArrow>
                <ActionIcon variant="subtle" aria-label="Move to catalog">
                  <IconFolder size={16} />
                </ActionIcon>
              </Tooltip>
            }
          />
          <Tooltip label="Open source" withArrow>
            <ActionIcon
              variant="subtle"
              component="a"
              href={item.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open source"
            >
              <IconExternalLink size={16} />
            </ActionIcon>
          </Tooltip>
          <Menu position="bottom-end" width={200}>
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label="More item actions">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {forgotten ? (
                <Menu.Item leftSection={<IconRestore size={16} />} onClick={() => markItems([item], undefined)}>
                  Restore
                </Menu.Item>
              ) : (
                <Menu.Item leftSection={<IconEyeOff size={16} />} onClick={() => markItems([item], 'forgotten')}>
                  Forget
                </Menu.Item>
              )}
              {forgotten && (
                <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => confirmDelete([item])}>
                  Delete permanently…
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </span>
      </div>

      <div className="rt-rcontent">
        <div className="rt-rhead">
          <div className="rt-rhead-thumb-wrap">
            {thumbnail ? (
              <img className="rt-rhead-thumb" src={thumbnail} alt="" draggable={false} />
            ) : (
              <div className="rt-rhead-thumb" aria-hidden>
                {isTranscript ? <IconBrandYoutube size={28} /> : <IconFileText size={28} />}
              </div>
            )}
            {duration && <span>{duration}</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <h2>
              <Highlight highlight={highlight} inherit>
                {item.title || 'Untitled'}
              </Highlight>
            </h2>
            <div className="rt-facts">
              <span>{TYPE_LABELS[item.type]}</span>
              <span>
                <b>{formatNumber(words)}</b> words
              </span>
              <span>{readingTime(words)}</span>
              {item.meta?.viewCount !== undefined && (
                <Tooltip label={`View count on ${formatDateTime(viewsAt)}`} withArrow>
                  <span>
                    <b>{formatNumber(item.meta.viewCount)}</b> {item.meta.viewCount === 1 ? 'view' : 'views'} as of{' '}
                    {formatShortDate(viewsAt)}
                  </span>
                </Tooltip>
              )}
              {item.meta?.language && <b>{item.meta.language}</b>}
              <span>
                saved <b>{formatDateTime(item.timestamp)}</b>
              </span>
              {forgotten && <span>forgotten</span>}
              {terms.length > 0 && (
                <span>
                  <b>
                    {matches} {matches === 1 ? 'match' : 'matches'}
                  </b>
                </span>
              )}
            </div>
            <KeywordBadges
              keywords={keywords ?? []}
              active={activeKeywords}
              onToggle={onToggleKeyword}
              size="sm"
              after={hasTopicTags(item) ? undefined : <AiTagsButton item={item} busy={aiTagging} />}
            />
          </div>
        </div>

        <div className="rt-blocks">
          <ReaderPanels item={item} />

          <ContentBlock
            storageKey="content"
            icon={isTranscript ? <IconFileText /> : <IconArticle />}
            title={isTranscript ? 'Transcript' : 'Content'}
            copy={{ value: item.content, label: isTranscript ? 'Copy transcript' : 'Copy content' }}
            actions={<span className="rt-block-count">{formatNumber(words)} words</span>}
          >
            <ClampedText key={item.id} unclamped={highlight.length > 0}>
              <Typography className="rt-reader">
                {paragraphs.map((paragraph, i) =>
                  highlight.length ? (
                    <Highlight key={i} component="p" highlight={highlight} inherit>
                      {paragraph}
                    </Highlight>
                  ) : (
                    <p key={i}>{paragraph}</p>
                  ),
                )}
              </Typography>
            </ClampedText>
          </ContentBlock>
        </div>
      </div>
    </>
  );
}

/** The letter badge of a catalog (the inbox icon for Recents). */
export function CatalogBadge({ catalog }: { catalog: Catalog }) {
  return catalog.id === RECENTS_ID ? (
    <IconInbox size={16} />
  ) : (
    <span className="rt-mono-ic">{badgeLetters(catalog.name)}</span>
  );
}
