import type { Env } from '../domain/types';
import type { StorageClient } from '../storage/d1';
import { buildUnifiedDraftPrompt, type ConversationHistoryEntry, type UnifiedDraftItem } from '../rag/prompts';
import type { SearchSnippet } from '../rag/search';
import {
  LEAD_UNIFIED_SYSTEM,
  MAX_PROMPT_CHARS,
  MAX_DRAFT_LENGTH,
  sanitizeForAiInput,
  stripMetaArtifacts,
  isDeadEndSupportReply,
  generateLeadUnifiedRuDraft,
} from '../rag/llm';

const DEFAULT_LEAD_AI_TIMEOUT_MS = 8000;

function leadAiEnabled(env: Env): boolean {
  return (env.LEAD_AI_ENABLED ?? '1').trim() !== '0';
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('LEAD_AI_TIMEOUT')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export interface GenerateLeadAIReplyParams {
  history: ConversationHistoryEntry[];
  ragSnippets?: SearchSnippet[];
    if (!cleaned || cleaned.length < 5) return null;
    if (isDeadEndSupportReply(cleaned)) return null;
    return cleaned.length > MAX_DRAFT_LENGTH
      ? cleaned.slice(0, MAX_DRAFT_LENGTH - 3).trimEnd() + '...'
      : cleaned;
  } catch (e) {
    console.error('generateLeadAIReply error:', (e as { message?: string })?.message ?? e);
    return null;
  }
}

export async function resolveLeadRuDraft(
  env: Env,
  storage: StorageClient,
  items: UnifiedDraftItem[],
  history: ConversationHistoryEntry[],
  ragSnippets: SearchSnippet[]
): Promise<string> {
  const knowledge = (env.LEAD_AI_KNOWLEDGE ?? '').trim();

  if (leadAiEnabled(env)) {
    try {
      const ai = await generateLeadAIReply(env, {
        messages: items,
        history,
        ragSnippets,
        knowledge: knowledge || undefined,
      });
      if (ai && ai.trim().length >= 5) {
        try {
          await storage.logDebug('lead_ai_draft_ok', `chars=${ai.length}`);
        } catch {
      }
    }
    try {
      await storage.logDebug('lead_ai_fallback_template', 'using generateLeadUnifiedRuDraft');
    } catch {
