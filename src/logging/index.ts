
import type { Env } from '../domain/types';
import { StorageClient } from '../storage/d1';
import { escapeHtml } from '../telegram/api';

const DEDUP_WINDOW_MS = 10 * 60 * 1000; 
const META_MAX_LEN = 800;
const STACK_MAX_LEN = 1400;
const MESSAGE_MAX_LEN = 500;
const CLIENT_TEXT_MAX_LEN = 120;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogConfig {
  channelId: string | null;
  botToken: string | null;
  heartbeatHours: number;
  errorsEnabled: boolean;
  heartbeatEnabled: boolean;
  minLevel: LogLevel;
}

export function getLogConfig(env: Env): LogConfig {
  const channelId = env.TG_LOG_CHANNEL_ID?.trim() || null;
  const botToken = env.TG_LOG_BOT_TOKEN?.trim() || null;
  const h = env.LOG_HEARTBEAT_EVERY_HOURS;
  const heartbeatHours =
    typeof h === 'number' ? h : Math.max(1, parseInt(String(h || '12'), 10) || 12);
  const errorsEnabled = (env.LOG_ERRORS_ENABLED ?? '1') !== '0';
  const heartbeatEnabled = (env.LOG_HEARTBEAT_ENABLED ?? '1') !== '0';
  const minLevel = (env.LOG_MIN_LEVEL ?? 'error') as LogLevel;
  return {
    channelId,
    botToken,
    heartbeatHours,
    errorsEnabled,
    heartbeatEnabled,
    minLevel,
  };
}

async function sendToTelegramChannel(
  botToken: string,
  channelId: string,
  text: string
): Promise<boolean> {
  const url = `https:
  const body = {
    chat_id: channelId,
    text: truncateSafe(text, 4096),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[LOG] TG send failed:', res.status, errText?.slice(0, 200));
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[LOG] TG send error:', e?.message ?? e);
    return false;
  }
}

function formatMoscowTime(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Moscow' }) + ' MSK';
}

function formatContextLines(meta: Record<string, unknown> | null): string {
  if (!meta || typeof meta !== 'object') return '';
  const lines: string[] = [];
  const keys = ['user_id', 'topic_id', 'action', 'endpoint', 'source'] as const;
  for (const k of keys) {
    const v = meta[k];
    if (v != null && String(v) !== '') {
      lines.push(`• ${k}: <code>${escapeHtml(String(v))}</code>`);
    }
  }
  return lines.length ? lines.join('\n') : '';
}

function formatErrorMessage(
  level: LogLevel,
  event: string,
  source: string,
  message: string,
  meta: Record<string, unknown> | null,
  stack?: string
): string {
  const icon = level === 'error' ? '🚨' : '⚠️';
  const title = level === 'error' ? 'Support System Error' : 'Support System Warning';
  const now = formatMoscowTime();
  const msgSafe = escapeHtml(truncateSafe(message, MESSAGE_MAX_LEN));
  const context = formatContextLines(meta);
  let trace = '';
  if (stack) {
    trace = escapeHtml(truncateSafe(stack, STACK_MAX_LEN));
    trace = `<pre>${trace}</pre>`;
  }
  let out = `${icon} <b>${title}</b>
<b>Event:</b> <code>${escapeHtml(event)}</code>
<b>Source:</b> <code>${escapeHtml(source)}</code>
<b>Time:</b> ${now}

<b>Message:</b>
<code>${msgSafe}</code>`;
  if (context) {
    out += `\n\n<b>Context:</b>\n${context}`;
  }
  if (trace) {
    out += `\n\n<b>Trace:</b>\n${trace}`;
  }
  return out;
}

export async function logEvent(
  env: Env,
  level: 'error' | 'warn',
  source: string,
  event: string,
  message: string,
  meta?: Record<string, unknown> | null,
  stack?: string
): Promise<void> {
  const config = getLogConfig(env);
  const minLevelOrder = { debug: 0, info: 1, warn: 2, error: 3 };
  if (minLevelOrder[level] < minLevelOrder[config.minLevel]) {
    return;
  }

  const fingerprint = buildFingerprint(source, event, message);
  const metaStr = meta
    ? truncateSafe(JSON.stringify(meta), META_MAX_LEN)
    : null;
  const createdAt = Date.now();

  let logId = 0;
  try {
    const storage = new StorageClient(env.DB);
    logId = await storage.insertLogEvent(
      createdAt,
      level,
      source,
      event,
      fingerprint,
      truncateSafe(message, MESSAGE_MAX_LEN),
      metaStr,
      0
    );
  } catch (e: any) {
    console.error('[LOG] Failed to insert log_events:', e?.message ?? e);
    return;
  }

  if (!config.errorsEnabled || !config.channelId || !config.botToken) {
    return;
  }

  const recentlySent = await (async () => {
    try {
      const storage = new StorageClient(env.DB);
      return await storage.hasFingerprintSentRecently(fingerprint, DEDUP_WINDOW_MS);
    } catch {
      return false;
    }
  })();

  if (recentlySent) {
    return;
  }

  const formatted = formatErrorMessage(level, event, source, message, meta ?? null, stack);
  const sent = await sendToTelegramChannel(config.botToken, config.channelId, formatted);
  if (sent && logId > 0) {
    try {
      const storage = new StorageClient(env.DB);
      await storage.updateLogEventSentToTg(logId);
    } catch {
      
    }
  }
}

export function sanitizeClientText(text: string | null | undefined): string {
  if (text == null) return '';
  const s = String(text).trim();
  return truncateSafe(s, CLIENT_TEXT_MAX_LEN);
}

export interface R2LearnSyncStats {
  uploaded: number;
  skipped: number;
  uploadedSupport: number;
  uploadedLead: number;
  skippedSupport: number;
  skippedLead: number;
  pendingBefore: number;
  putErrors: number;
}

export async function logR2LearnSyncResult(env: Env, stats: R2LearnSyncStats): Promise<void> {
  if ((env.LOG_R2_LEARN_ENABLED ?? '1') === '0') {
    console.log('[R2_LEARN] logging disabled', stats);
    return;
  }

  const summary = `uploaded=${stats.uploaded} skipped=${stats.skipped} s↑${stats.uploadedSupport} l↑${stats.uploadedLead} pend=${stats.pendingBefore} err=${stats.putErrors}`;
  console.log('[R2_LEARN]', summary);

  const idle = stats.uploaded === 0 && stats.skipped === 0 && stats.putErrors === 0;
  if (!idle) {
    try {
      const storage = new StorageClient(env.DB);
      const metaJson = truncateSafe(JSON.stringify(stats), META_MAX_LEN);
      await storage.insertLogEvent(
        Date.now(),
        'info',
        'r2_learn',
        'sync_cron',
        buildFingerprint('r2_learn', 'sync_cron', summary),
        truncateSafe(summary, MESSAGE_MAX_LEN),
        metaJson,
        0
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[R2_LEARN] log_events insert failed:', msg);
    }
  }

  if ((env.LOG_R2_LEARN_TO_TG ?? '1') === '0' || idle) {
    return;
  }

  const config = getLogConfig(env);
  if (!config.channelId || !config.botToken) {
    return;
  }

  const nowStr = formatMoscowTime();
  const errLine = stats.putErrors ? `<b>Put errors:</b> <code>${stats.putErrors}</code>\n` : '';
  const body = `📦 <b>R2 learn sync</b> (support / lead → AI Search)
<b>Uploaded:</b> <code>${stats.uploaded}</code> · support <code>${stats.uploadedSupport}</code> · lead <code>${stats.uploadedLead}</code>
<b>Skipped (no bucket):</b> <code>${stats.skipped}</code> · s <code>${stats.skippedSupport}</code> · l <code>${stats.skippedLead}</code>
<b>Batch:</b> <code>${stats.pendingBefore}</code>
${errLine}<b>Time:</b> ${nowStr}`;

  await sendToTelegramChannel(config.botToken, config.channelId, body);
}

export async function runHeartbeat(env: Env): Promise<void> {
  const config = getLogConfig(env);
  if (!config.heartbeatEnabled || !config.channelId || !config.botToken) {
    return;
  }

  const periodMs = config.heartbeatHours * 60 * 60 * 1000;
  const now = Date.now();
  const halfPeriod = periodMs / 2;

  let lastHeartbeat = 0;
  try {
    const storage = new StorageClient(env.DB);
    const state = await storage.getHeartbeatState();
    lastHeartbeat = state.last_heartbeat_at;
  } catch {
    return;
  }

  if (lastHeartbeat > 0 && now - lastHeartbeat < halfPeriod) {
    return;
  }

  const sinceMs = periodMs;
  let errorsCount = 0;
  let warnsCount = 0;
  let lastErrors: Array<{ event: string; message: string }> = [];

  try {
    const storage = new StorageClient(env.DB);
    const counts = await storage.getErrorsWarnsCount(sinceMs);
    errorsCount = counts.errors_count;
    warnsCount = counts.warns_count;
    lastErrors = await storage.getLastErrors(sinceMs, 3);
  } catch (e: any) {
    console.error('[HEARTBEAT] Failed to get stats:', e?.message ?? e);
  }

  let r2Pending = { total: 0, support: 0, lead: 0 };
  try {
    const storage = new StorageClient(env.DB);
    r2Pending = await storage.countPendingOperatorTurnsByScope();
  } catch {
