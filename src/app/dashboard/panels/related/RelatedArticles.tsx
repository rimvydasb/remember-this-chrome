import { ActionIcon, Alert, Anchor, Button, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertCircle, IconClockPause, IconTrash, IconWorldSearch } from '@tabler/icons-react';
import type { FollowUp, RelatedArticle, SavedItem } from '../../../../shared/types';
import { formatDateTime } from '../../../ui/format';
import { ContentBlock } from '../../ContentBlock';
import { CopyAction } from '../../CopyAction';
import { progressLabel, useRelatedArticles } from './useRelatedArticles';

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** The host of a URL without `www.`, for the row subtitle. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Queries as the user wrote them: without the YouTube exclusion that the code adds. */
const showQuery = (query: string) => query.replace(/\s*-site:youtube\.com/i, '');

function QueryList({ queries }: { queries: readonly string[] }) {
  return <>{queries.map((query) => `“${showQuery(query)}”`).join(', ')}</>;
}

function ArticleRow({ article }: { article: RelatedArticle }) {
  return (
    <li className="rt-related-article">
      <Anchor href={article.url} target="_blank" rel="noreferrer" fw={500} size="sm">
        {article.title || article.url}
      </Anchor>
      <Text size="xs" c="dimmed">
        {hostOf(article.url)}
        {article.queries.length > 0 && (
          <>
            {' · found by '}
            <QueryList queries={article.queries} />
          </>
        )}
      </Text>
      {article.snippet && (
        <Text size="xs" lineClamp={2}>
          {article.snippet}
        </Text>
      )}
    </li>
  );
}

function SearchCard({ search, onDelete }: { search: FollowUp; onDelete: () => void }) {
  const articles = search.articles ?? [];
  return (
    <div className="rt-question">
      <Group gap="xs" wrap="nowrap" align="flex-start" className="rt-question-head">
        <Stack gap={2} flex={1}>
          <Text fw={600} size="sm">
            {articles.length} {articles.length === 1 ? 'article' : 'articles'} · {formatDateTime(search.createdAt)}
            {search.model ? ` · ${search.model}` : ''}
          </Text>
          {search.queries && search.queries.length > 0 && (
            <Text size="xs" c="dimmed">
              Queries: <QueryList queries={search.queries} />
            </Text>
          )}
        </Stack>
        <Group gap={2} wrap="nowrap">
          <CopyAction value={search.generatedContent} label="Copy links" />
          <Tooltip label="Delete these results" withArrow>
            <ActionIcon variant="subtle" color="red" aria-label="Delete these results" onClick={onDelete}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <div className="rt-question-answer">
        {articles.length > 0 ? (
          <ul className="rt-related-list">
            {articles.map((article) => (
              <ArticleRow key={article.url} article={article} />
            ))}
          </ul>
        ) : (
          // Imported from a file without the structured list: the Markdown copy has the links.
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {search.generatedContent}
          </Text>
        )}
      </div>
    </div>
  );
}

/** Articles on the web about the item, found with Google; each search is kept. */
export function RelatedArticles({ item }: { item: SavedItem }) {
  const { searches, progress, error, cooldown, canSearch, find, remove } = useRelatedArticles(item);
  const source = item.type === 'youtube_transcript' ? 'video' : 'page';

  return (
    <ContentBlock
      storageKey="related"
      icon={<IconWorldSearch size={17} />}
      title="Related articles"
      count={searches.length || undefined}
    >
      <Stack gap="md">
        <Stack gap={6}>
          <Group gap="sm">
            <Button
              size="xs"
              variant="outline"
              leftSection={progress ? <Loader size={12} /> : <IconWorldSearch size={15} />}
              aria-busy={Boolean(progress)}
              disabled={!canSearch}
              onClick={() => void find()}
            >
              {progress ? progressLabel(progress) : 'Find related articles'}
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            AI writes a few search queries about this {source}, and Google runs them with your Google cookies. The
            queries can reveal what you watch or read.
          </Text>
        </Stack>

        {cooldown && (
          <Alert color="yellow" icon={<IconClockPause size={18} />} title="Google search is paused">
            {cooldown.reason} You can search again at {timeFormatter.format(cooldown.until)}.
          </Alert>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertCircle size={18} />} title="Cannot find related articles">
            <Stack gap={4}>
              <span>{error.message}</span>
              {error.queries.length > 0 && (
                <Text size="xs">
                  Queries: <QueryList queries={error.queries} />
                </Text>
              )}
            </Stack>
          </Alert>
        )}

        {searches.map((search) => (
          <SearchCard key={search.id} search={search} onDelete={() => remove(search)} />
        ))}
      </Stack>
    </ContentBlock>
  );
}
