import { Questions } from './questions/Questions';
import { RelatedArticles } from './related/RelatedArticles';
import { Summary } from './summary/Summary';
import type { ReaderPanel } from './types';
import { VideoDetails } from './videoDetails/VideoDetails';

/**
 * The panels attached to the reader, in display order. Attach a panel by adding it here and
 * detach it by removing it; nothing else refers to a panel.
 */
export const READER_PANELS: readonly ReaderPanel[] = [
  { id: 'summary', Component: Summary },
  { id: 'questions', Component: Questions },
  { id: 'related-articles', Component: RelatedArticles },
  { id: 'video-details', Component: VideoDetails },
];
