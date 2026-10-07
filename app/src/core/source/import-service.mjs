import {
  downloadImage,
  fetchSource,
  mergeSourceIntoConfig,
  prepareSourceBundle
} from './extractor.mjs';
import { analyzeSourceBundle } from './source-analysis.mjs';

export { downloadImage, fetchSource, mergeSourceIntoConfig, prepareSourceBundle };

export async function importAndAnalyzeSources(input, options = {}) {
  const prepared = await prepareSourceBundle(input, options);
  return {
    ...prepared,
    analysis: analyzeSourceBundle(prepared.source, options)
  };
}
