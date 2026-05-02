import type { Env } from '../domain/types';
import { logError } from '../logging';
import type { StorageClient } from '../storage/d1';
import { searchRag, type SearchSnippet } from './search';
import { matchQa, type QaScope } from '../qa/match';
import type { UnifiedDraftItem } from './prompts';

export async function getRagSnippetsForDraft(
  env: Env,
  storage: StorageClient,
  items: UnifiedDraftItem[],
  lastLang: string,
  qaScope: QaScope = 'support'
): Promise<SearchSnippet[]> {
  const aggregatedRu = items.map((i) => i.ru_text).join('\n\n').trim();
  const aggregatedOriginal = items.map((i) => i.original_text).join('\n\n').trim();
  let snips: SearchSnippet[] = [];
  try {
    snips = await searchRag(env, aggregatedRu, 5, qaScope);
    if (aggregatedOriginal && lastLang !== 'ru') {
      const extra = await searchRag(env, aggregatedOriginal, 4, qaScope);
      const seen = new Set<string>();
      for (const s of snips) seen.add(s.text);
      for (const s of extra) {
        if (!seen.has(s.text)) {
          seen.add(s.text);
          snips.push(s);
        }
      }
      snips = snips.slice(0, 5);
    }
  } catch (e) {
    if (storage) {
      try {
        await storage.logDebug('rag_plus_qa_error', String((e as { message?: string })?.message ?? e));
      } catch {
