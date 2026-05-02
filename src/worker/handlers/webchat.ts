import { Env, MessageRecord } from '../../domain/types';
import { StorageClient } from '../../storage/d1';
import { TelegramApi } from '../../telegram/api';
import { getOrCreateTopicForUser } from '../../telegram/forum';
import { listWebchatProjectIds, resolveWebchatProjectConfig } from './webchat-project-config';
import { searchRag } from '../../rag/search';
import { buildPrompt } from '../../rag/prompts';
import { generateDraft, translateToRussian } from '../../rag/llm';
import { createDraftKeyboard, formatDraftMessage } from '../../telegram/draft-format';

type WebchatExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const MAX_PROJECT_ID_LENGTH = 64;
const MAX_CONVERSATION_ID_LENGTH = 128;
const MAX_CUSTOMER_ID_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 4000;
const SSE_MAX_DURATION_MS = 25000;
const SSE_POLL_INTERVAL_MS = 1200;
const DEFAULT_MESSAGES_LIMIT = 50;
const MAX_MESSAGES_LIMIT = 200;
const SEND_RATE_LIMIT_WINDOW_MS = 60_000;
const SEND_RATE_LIMIT_MAX_MESSAGES = 20;

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(headers || {}),
    },
  });
}

function buildStorageUserId(projectId: string, conversationId: string): string {
  return `web:${projectId}:${conversationId}`;
}

function isValidProjectId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

function isValidConversationId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(value);
}

function isValidCustomerId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

function extractProjectIdFromStorageUserId(userId: string): string | null {
  const match = String(userId || '').match(/^web:([^:]+):([^:]+)$/);
  return match ? match[1] : null;
}

function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string, allowed: string[]): boolean {
  if (!origin) return false;
  for (const rule of allowed) {
    if (!rule) continue;
    if (rule === origin) return true;
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1); 
      if (origin.endsWith(suffix)) return true;
    }
  }
  return false;
}

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowed = parseAllowedOrigins(env.WEBCHAT_ALLOWED_ORIGINS);

  if (allowed.length === 0) {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
      vary: 'origin',
    };
  }

  const allowOrigin = isOriginAllowed(origin, allowed) ? origin : allowed[0];
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    vary: 'origin',
  };
}

function getTopicDisplayName(projectId: string, conversationId: string): string {
  const shortConversation = conversationId.slice(0, 12);
  return `Web ${projectId} #${shortConversation}`.slice(0, 120);
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeHex(input: string): string {
  return input.trim().toLowerCase();
}

async function verifySignatureIfEnabled(
  env: Env,
  projectId: string,
  conversationId: string,
  providedSignature: string | null
): Promise<boolean> {
  const secret = env.WEBCHAT_SIGNING_SECRET?.trim();
  if (!secret) return true;
  if (!providedSignature) return false;
  const payload = `${projectId}:${conversationId}`;
  const expected = await hmacSha256Hex(secret, payload);
  return normalizeHex(expected) === normalizeHex(providedSignature);
}

async function resolveProjectIdForWebchatInit(
  env: Env,
  storage: StorageClient,
  explicitProjectId: string,
  conversationId: string,
  customerId: string,
  signature: string | null
): Promise<string | null> {
  if (explicitProjectId) {
    return explicitProjectId;
  }

  const lookupConversationId = conversationId || customerId;
  if (lookupConversationId) {
    const existingConv = await storage.findWebConversationByConversationId(lookupConversationId);
    const existingProjectId = extractProjectIdFromStorageUserId(existingConv?.user_id || '');
    if (existingProjectId && isValidProjectId(existingProjectId)) {
      return existingProjectId;
    }
  }

  if (!lookupConversationId) {
    return null;
  }

  const candidates: string[] = [];
  for (const candidateProjectId of listWebchatProjectIds()) {
    if (await verifySignatureIfEnabled(env, candidateProjectId, lookupConversationId, signature)) {
      candidates.push(candidateProjectId);
    }
  }

  return candidates.length === 1 ? candidates[0] : null;
}

function parseJsonBody(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function filterVisibleMessages(messages: MessageRecord[]): MessageRecord[] {
  return messages.filter((m) => m.role === 'client' || m.role === 'support' || m.role === 'client_edit');
}

function isWebchatDraftEnabled(env: Env): boolean {
  return String(env.WEBCHAT_TG_DRAFT_ENABLED || '').trim() === '1';
}

function toWebchatMessage(m: MessageRecord) {
  return {
    id: m.id ?? null,
    role: m.role,
    text: m.text,
    ts: m.ts,
  };
}

export function handleWebchatOptions(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env),
  });
}

export async function handleWebchatInit(request: Request, env: Env): Promise<Response> {
  const corsHeaders = getCorsHeaders(request, env);
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ ok: false, error: 'unsupported content-type' }, 415, corsHeaders);
  }

  const raw = await request.text();
  const body = parseJsonBody(raw);
  if (!body || typeof body !== 'object') {
    return jsonResponse({ ok: false, error: 'invalid json body' }, 400, corsHeaders);
  }

  const explicitProjectId = String(body.projectId || '').trim();
  if (explicitProjectId && !isValidProjectId(explicitProjectId)) {
    return jsonResponse({ ok: false, error: 'invalid projectId' }, 400, corsHeaders);
  }
  if (explicitProjectId.length > MAX_PROJECT_ID_LENGTH) {
    return jsonResponse({ ok: false, error: 'projectId too long' }, 400, corsHeaders);
  }

  const customerId = String(body.customerId || '').trim();
  if (customerId && (!isValidCustomerId(customerId) || customerId.length > MAX_CUSTOMER_ID_LENGTH)) {
    return jsonResponse({ ok: false, error: 'invalid customerId' }, 400, corsHeaders);
  }

  const providedConversationId = String(body.conversationId || '').trim();
  const conversationId = providedConversationId || customerId || crypto.randomUUID().replace(/-/g, '');
  if (!isValidConversationId(conversationId) || conversationId.length > MAX_CONVERSATION_ID_LENGTH) {
    return jsonResponse({ ok: false, error: 'invalid conversationId' }, 400, corsHeaders);
  }

  const signature = body.signature != null ? String(body.signature) : null;
  const storage = new StorageClient(env.DB);
  const projectId = await resolveProjectIdForWebchatInit(
    env,
    storage,
    explicitProjectId,
    providedConversationId,
    customerId,
    signature
  );
  if (!projectId || !isValidProjectId(projectId)) {
    return jsonResponse({ ok: false, error: 'projectId_resolution_failed' }, 400, corsHeaders);
  }

  const signatureOk = await verifySignatureIfEnabled(env, projectId, conversationId, signature);
  if (!signatureOk) {
    return jsonResponse({ ok: false, error: 'invalid signature' }, 401, corsHeaders);
  }

  const storageUserId = buildStorageUserId(projectId, conversationId);
  const projectConfig = resolveWebchatProjectConfig(projectId);

  return jsonResponse(
    {
      ok: true,
      projectId,
      conversationId,
      projectConfig,
    },
    200,
    corsHeaders
  );
}

export async function handleWebchatMessages(request: Request, env: Env): Promise<Response> {
  const corsHeaders = getCorsHeaders(request, env);
  const url = new URL(request.url);
  const projectId = String(url.searchParams.get('projectId') || '').trim();
  const conversationId = String(url.searchParams.get('conversationId') || '').trim();

  if (!isValidProjectId(projectId) || !isValidConversationId(conversationId)) {
    return jsonResponse({ ok: false, error: 'invalid projectId or conversationId' }, 400, corsHeaders);
  }

  const signature = url.searchParams.get('signature');
  const signatureOk = await verifySignatureIfEnabled(env, projectId, conversationId, signature);
  if (!signatureOk) {
    return jsonResponse({ ok: false, error: 'invalid signature' }, 401, corsHeaders);
  }

  const storage = new StorageClient(env.DB);
  const storageUserId = buildStorageUserId(projectId, conversationId);

  const limitRaw = Number(url.searchParams.get('limit') || DEFAULT_MESSAGES_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_MESSAGES_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_MESSAGES_LIMIT;

  const all = await storage.getLastMessages(storageUserId, limit);
  const visible = filterVisibleMessages(all);
  const lastId = visible.length > 0 ? visible[visible.length - 1].id ?? 0 : 0;

  return jsonResponse(
    {
      ok: true,
      projectId,
      conversationId,
      messages: visible.map(toWebchatMessage),
      lastMessageId: lastId,
    },
    200,
    corsHeaders
  );
}

export async function handleWebchatSend(
  request: Request,
  env: Env,
  ctx?: WebchatExecutionContext
): Promise<Response> {
  const corsHeaders = getCorsHeaders(request, env);
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ ok: false, error: 'unsupported content-type' }, 415, corsHeaders);
  }

  const body = parseJsonBody(await request.text());
  if (!body || typeof body !== 'object') {
    return jsonResponse({ ok: false, error: 'invalid json body' }, 400, corsHeaders);
  }

  const projectId = String(body.projectId || '').trim();
  const conversationId = String(body.conversationId || '').trim();
  const text = String(body.text || '').trim();
  if (!isValidProjectId(projectId) || !isValidConversationId(conversationId)) {
    return jsonResponse({ ok: false, error: 'invalid projectId or conversationId' }, 400, corsHeaders);
  }
  if (!text) return jsonResponse({ ok: false, error: 'text is required' }, 400, corsHeaders);
  if (text.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ ok: false, error: `text too long (max ${MAX_MESSAGE_LENGTH})` }, 400, corsHeaders);
  }

  const signature = body.signature != null ? String(body.signature) : null;
  const signatureOk = await verifySignatureIfEnabled(env, projectId, conversationId, signature);
  if (!signatureOk) {
    return jsonResponse({ ok: false, error: 'invalid signature' }, 401, corsHeaders);
  }

  const storage = new StorageClient(env.DB);
  const api = new TelegramApi(env.TELEGRAM_BOT_TOKEN);
  const storageUserId = buildStorageUserId(projectId, conversationId);
  const rateWindowStart = Date.now() - SEND_RATE_LIMIT_WINDOW_MS;
  const recentSendCount = await storage.countMessagesSince(storageUserId, 'client', rateWindowStart);
  if (recentSendCount >= SEND_RATE_LIMIT_MAX_MESSAGES) {
    return jsonResponse(
      {
        ok: false,
        error: 'rate_limited',
        details: `Too many messages. Limit: ${SEND_RATE_LIMIT_MAX_MESSAGES} per minute.`,
      },
      429,
      {
        ...corsHeaders,
        'retry-after': '60',
      }
    );
  }

  let topicId: number;
  try {
    topicId = await getOrCreateTopicForUser(
      storage,
      api,
      String(env.SUPERGROUP_ID),
      storageUserId,
      getTopicDisplayName(projectId, conversationId)
    );
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: 'telegram_topic_create_failed',
        details: String((err as Error)?.message || err),
      },
      502,
      corsHeaders
    );
  }

  const ts = Date.now();
  const meta = JSON.stringify({
    source: 'webchat',
    project_id: projectId,
  });
  const messageId = await storage.appendMessage(storageUserId, 'client', text, ts, undefined, meta);
  await storage.touchLastActivity(storageUserId, ts);

  let tgMessageId: number | null = null;
  let draftMessageId: number | null = null;
  try {
    const telegramMessage = await api.sendMessage(String(env.SUPERGROUP_ID), text, { threadId: topicId });
    tgMessageId = typeof telegramMessage?.message_id === 'number' ? telegramMessage.message_id : null;
    if (tgMessageId != null && typeof messageId === 'number') {
      await storage.updateMessageTelegramIdById(messageId, tgMessageId);
    }

    if (isWebchatDraftEnabled(env) && typeof messageId === 'number') {
      const draftTask = (async () => {
        try {
          const history = filterVisibleMessages(await storage.getLastMessages(storageUserId, 20));
          const snippets = await searchRag(env, text, 5).catch(() => []);
          const prompt = buildPrompt({
            clientText: text,
            dialogMessages: history,
            ragSnippets: snippets,
          });
          const bilingual = await generateDraft(env, prompt);
          const ruSummary = await translateToRussian(env, text);
          const draftBody = formatDraftMessage(ruSummary, bilingual.ru, 0, storageUserId);
          const keyboard = createDraftKeyboard(topicId, false, false);
          const draftMsg = await api.sendMessage(String(env.SUPERGROUP_ID), draftBody, {
            threadId: topicId,
            parseMode: 'HTML',
            replyMarkup: keyboard,
          });
          draftMessageId = typeof draftMsg?.message_id === 'number' ? draftMsg.message_id : null;
          if (draftMessageId != null) {
            await storage.saveUnifiedDraftSuggestion(
              storageUserId,
              topicId,
              bilingual.ru,
              bilingual.client,
              ruSummary,
              bilingual.lang,
              Date.now(),
              draftMessageId
            );
            await storage.setDraftSupportMessageId(storageUserId, draftMessageId);
            await storage.setDraftAnchorsById(storageUserId, messageId, messageId);
            await storage.setDraftFrozen(storageUserId, 0);
            await storage.setDraftPending(storageUserId, 0);
          }
        } catch (draftErr) {
          try {
            await storage.logDebug(
              'webchat_draft_failed',
              JSON.stringify({
                user_id: storageUserId,
                topic_id: topicId,
                message_id: messageId,
                error: String((draftErr as Error)?.message || draftErr),
              })
            );
          } catch {
          }
        }
      })();

      if (ctx) {
        ctx.waitUntil(draftTask);
      } else {
        void draftTask;
      }
    }
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: 'telegram_send_failed',
        details: String((err as Error)?.message || err),
      },
      502,
      corsHeaders
    );
  }

  return jsonResponse(
    {
      ok: true,
      projectId,
      conversationId,
      topicId,
      message: {
        id: messageId === false ? null : messageId,
        role: 'client',
        text,
        ts,
        tgMessageId,
        draftMessageId,
      },
    },
    200,
    corsHeaders
  );
}

export async function handleWebchatStream(request: Request, env: Env): Promise<Response> {
  const corsHeaders = getCorsHeaders(request, env);
  const url = new URL(request.url);
  const projectId = String(url.searchParams.get('projectId') || '').trim();
  const conversationId = String(url.searchParams.get('conversationId') || '').trim();
  const signature = url.searchParams.get('signature');
  const sinceIdFromQuery = Math.max(0, Number(url.searchParams.get('sinceId') || 0));
  const lastEventIdHeader = request.headers.get('last-event-id');
  const sinceIdFromHeader = Math.max(0, Number(lastEventIdHeader || 0));
  const sinceId = Math.max(sinceIdFromQuery, sinceIdFromHeader);

  if (!isValidProjectId(projectId) || !isValidConversationId(conversationId)) {
    return jsonResponse({ ok: false, error: 'invalid projectId or conversationId' }, 400, corsHeaders);
  }
  const signatureOk = await verifySignatureIfEnabled(env, projectId, conversationId, signature);
  if (!signatureOk) {
    return jsonResponse({ ok: false, error: 'invalid signature' }, 401, corsHeaders);
  }

  const storage = new StorageClient(env.DB);
  const storageUserId = buildStorageUserId(projectId, conversationId);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let currentId = sinceId;
      const startedAt = Date.now();

      const write = (event: string, payload: unknown, eventId?: number) => {
        const idLine = typeof eventId === 'number' && eventId > 0 ? `id: ${eventId}\n` : '';
        const chunk = `${idLine}event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      write('ready', { ok: true, projectId, conversationId, sinceId: currentId });

      try {
        while (Date.now() - startedAt < SSE_MAX_DURATION_MS) {
          const fresh = await storage.getMessagesAfterId(storageUserId, currentId, MAX_MESSAGES_LIMIT);
          const visible = filterVisibleMessages(fresh);
          if (visible.length > 0) {
            for (const msg of visible) {
              if (typeof msg.id === 'number' && msg.id > currentId) {
                currentId = msg.id;
              }
              write('message', toWebchatMessage(msg), typeof msg.id === 'number' ? msg.id : undefined);
            }
          } else {
            write('ping', { ts: Date.now(), lastMessageId: currentId });
          }
          await new Promise((resolve) => setTimeout(resolve, SSE_POLL_INTERVAL_MS));
          const signal = (request as Request & { signal?: AbortSignal }).signal;
          if (signal?.aborted) break;
        }
      } catch (err) {
        write('error', { message: String((err as Error)?.message || err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
