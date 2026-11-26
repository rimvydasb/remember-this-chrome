import * as storage from '../shared/storage';
import { QuestionPipeline } from './questions/QuestionPipeline';
import type { ItemStore } from './ports';
import { RelatedArticlesPipeline } from './related/RelatedArticlesPipeline';
import { SummaryPipeline } from './summary/SummaryPipeline';
import { TaggingPipeline } from './tagging/TaggingPipeline';

/** The library as the pipelines see it. */
const store: ItemStore = {
  addFollowUp: (...args) => storage.addFollowUp(...args),
  updateFollowUp: (...args) => storage.updateFollowUp(...args),
  deleteFollowUp: (...args) => storage.deleteFollowUp(...args),
  setAiTags: (...args) => storage.setAiTags(...args),
};

/**
 * The composition root of the follow-ups: the only place that wires pipelines to the library.
 * A new follow-up adds its pipeline here.
 */
export const summaryPipeline = new SummaryPipeline({ store });
export const questionPipeline = new QuestionPipeline({ store });
export const taggingPipeline = new TaggingPipeline({ store });
export const relatedArticlesPipeline = new RelatedArticlesPipeline({ store });
