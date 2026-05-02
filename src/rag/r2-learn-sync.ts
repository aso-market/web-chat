import type { Env, AnyR2Bucket } from '../domain/types';
import { StorageClient } from '../storage/d1';
import { logR2LearnSyncResult } from '../logging';

const BATCH_LIMIT = 80;

export interface OperatorTurnRow {
  id: number;
  scope: string;
  lang: string;
  user_id: string;
  client_text: string;
  operator_reply: string;
  operator_reply_ru: string | null;
  anchor_message_id: number | null;
  last_message_id: number | null;
  created_at: number;
}

function buildObjectBody(row: OperatorTurnRow): string {
  const ru = row.operator_reply_ru?.trim();
  const lines = [
    '# Operator learning (for RAG / AI Search)',
    `scope: ${row.scope}`,
    `lang: ${row.lang}`,
    `turn_id: ${row.id}`,
    `user_id: ${row.user_id}`,
    `created_at_unix: ${row.created_at}`,
    `anchor_message_id: ${row.anchor_message_id ?? ''}`,
    `last_message_id: ${row.last_message_id ?? ''}`,
    '',
    '## Client message (batch answered)',
    row.client_text.trim(),
    '',
    '## Operator reply (sent to client)',
    row.operator_reply.trim(),
    '',
  ];
  if (ru) {
    lines.push('## Russian draft (internal)', ru, '');
  }
  return lines.join('\n').slice(0, 3_900_000);
}

function r2KeyForTurn(id: number): string {
  return `operator-turns/${id}.txt`;
}

export async function syncPendingOperatorTurnsToR2(env: Env): Promise<{ uploaded: number; skipped: number }> {
  const support = env.RAG_LEARN_SUPPORT as AnyR2Bucket | undefined;
  const lead = env.RAG_LEARN_LEAD as AnyR2Bucket | undefined;

  if (!support && !lead) {
    return { uploaded: 0, skipped: 0 };
  }

  const storage = new StorageClient(env.DB);
  let uploaded = 0;
  let skipped = 0;
  let uploadedSupport = 0;
  let uploadedLead = 0;
  let skippedSupport = 0;
  let skippedLead = 0;
  let putErrors = 0;

  const pending = await storage.listPendingOperatorTurnsForR2(BATCH_LIMIT);
  const pendingBefore = pending.length;
  const now = Math.floor(Date.now() / 1000);

  for (const row of pending) {
    const bucket = row.scope === 'lead' ? lead : support;
    if (!bucket) {
      skipped++;
      if (row.scope === 'lead') skippedLead++;
      else skippedSupport++;
      continue;
    }

    const key = r2KeyForTurn(row.id);
    const body = buildObjectBody(row);

    try {
      await bucket.put(key, body, {
        httpMetadata: { contentType: 'text/plain; charset=utf-8' },
        customMetadata: {
          scope: row.scope,
          source: 'operator_turn',
          lang: row.lang,
          turn_id: String(row.id),
        },
      });
      await storage.markOperatorTurnR2Synced(row.id, key, now);
      uploaded++;
      if (row.scope === 'lead') uploadedLead++;
      else uploadedSupport++;
    } catch (err: unknown) {
      putErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      try {
        await storage.logDebug('r2_learn_sync_error', JSON.stringify({ id: row.id, scope: row.scope, error: msg.slice(0, 500) }));
      } catch {
