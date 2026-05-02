import { Env } from '../../domain/types';
import { StorageClient } from '../../storage/d1';
import { TelegramApi } from '../../telegram/api';
import { getOrCreateTopicForUser } from '../../telegram/forum';
import { translateFromRussian, buildLeadSafeFallbackRu } from '../../rag/llm';
import { resolveLeadRuDraft } from '../../leads/generateLeadAIReply';
import { getRagSnippetsForDraft } from '../../rag/draft-rag';
import type { UnifiedDraftItem } from '../../rag/prompts';
import type { SearchSnippet } from '../../rag/search';
import { formatDraftMessage, createDraftKeyboard } from '../../telegram/draft-format';

export function getLeadTopicDisplayName(
  projectId: string,
  _userId: string,
  username?: string
): string {
  const preferred = username && username.trim() ? `@${username.trim().replace(/^@+/, '')}` : '@no_username';
  if (projectId === 'aso_testers_leads') return `🧪 TESTERS • ${preferred}`;
  if (projectId === 'reviews_ratings_leads') return `⭐ REVIEWS • ${preferred}`;
  return `LEAD • ${projectId} • ${preferred}`;
}

export async function generateLeadIngestDraft(
  env: Env,
  storage: StorageClient,
  leadText: string,
  targetLang: string
): Promise<{ ru: string; client: string }> {
  const items: UnifiedDraftItem[] = [
    { original_text: leadText, ru_text: leadText, lang: targetLang },
  ];
  let ragSnips: SearchSnippet[] = [];
  try {
    ragSnips = await getRagSnippetsForDraft(env, storage, items, targetLang, 'lead');
  } catch (e) {
    try {
      await storage.logDebug('leads_ingest_rag_error', String((e as { message?: string })?.message ?? e));
    } catch {
const ANON_TOPIC_TITLE_MAX = 64;
const ANON_TOPIC_PREFIX = '⚠️ ANON • ';

function buildAnonTopicDisplayName(authorHint: string | null, fallbackMsgId: string | number): string {
  const raw = (authorHint && authorHint.trim()) || String(fallbackMsgId || 'lead');
  const sanitized = raw.replace(/:/g, '·').trim();
  const suffix = sanitized.slice(0, ANON_TOPIC_TITLE_MAX - ANON_TOPIC_PREFIX.length);
  return ANON_TOPIC_PREFIX + (suffix || 'lead');
}

function normalizeLeadUsername(input: unknown): string | undefined {
  if (input == null) return undefined;
  const cleaned = String(input).trim().replace(/^@+/, '');
  if (!cleaned) return undefined;
  if (!/^[A-Za-z0-9_]{5,32}$/.test(cleaned)) return undefined;
  return cleaned;
}

function normalizeLeadAccessHash(input: unknown): string | undefined {
  if (input == null) return undefined;
  const cleaned = String(input).trim();
  if (!/^-?\d+$/.test(cleaned)) return undefined;
  return cleaned;
}

function resolveLeadStorageUserId(projectId: string, bodyUserId: string, sourceMetaUsername?: string): string {
  const id = String(bodyUserId || '').trim();
  if (/^lead_[unf]:/.test(id)) {
    return id;
  }
  return buildLeadStorageUserId(projectId, id, sourceMetaUsername);
}

function pickCollectorMessageThreadId(meta: Record<string, unknown>): number | undefined {
  const raw = meta.collector_message_thread_id ?? meta.message_thread_id;
  if (raw == null) return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.trunc(n);
}

function buildNormalizedSourceMeta(
  sourceMeta: Record<string, unknown>,
  fallback: { sourceChatId?: unknown; sourceMessageId?: unknown; sourceLink?: unknown; author?: unknown }
): Record<string, unknown> {
  const source_chat_title = pickString(
    sourceMeta.source_chat_title,
    sourceMeta.source_title,
    sourceMeta.chat_title
  );
  const source_chat_username = pickString(
    sourceMeta.source_chat_username,
    sourceMeta.source_username,
    sourceMeta.chat_username
  )?.replace(/^@+/, '');
  const source_chat_id = pickString(
    sourceMeta.source_chat_id,
    sourceMeta.chat_id,
    sourceMeta.collector_chat_id,
    fallback.sourceChatId
  );
  const source_message_id = pickString(
    sourceMeta.source_message_id,
    sourceMeta.message_id,
    fallback.sourceMessageId
  );
  const source_link = pickString(
    sourceMeta.source_link,
    sourceMeta.link,
    fallback.sourceLink
  );
  const author_name = pickString(sourceMeta.author_name);
  const author = pickString(
    sourceMeta.author,
    sourceMeta.author_hint,
    sourceMeta.source_author,
    sourceMeta.username,
    author_name,
    fallback.author
  );

  return {
    ...(sourceMeta as Record<string, unknown>),
    ...(source_chat_title ? { source_chat_title } : {}),
    ...(source_chat_username ? { source_chat_username } : {}),
    ...(source_chat_id ? { source_chat_id } : {}),
    ...(source_message_id ? { source_message_id } : {}),
    ...(source_link ? { source_link } : {}),
    ...(author_name ? { author_name } : {}),
    ...(author ? { author } : {}),
  };
}

function isCollectorStableSource(sourceMeta: Record<string, unknown>): boolean {
  return sourceMeta.collector_stable === true;
}

export function buildLeadSourceBlock(sourceMeta: Record<string, unknown>): string {
  const sourceTitle =
    pickString(sourceMeta.source_chat_title, sourceMeta.source_chat_id) || 'недоступно';
  const sourceLink = pickString(sourceMeta.source_link) || 'недоступна';
  const au = normalizeLeadUsername(sourceMeta.author_username ?? sourceMeta.username);
  const an = pickString(sourceMeta.author_name);
  const authorFromParts =
    an && au
      ? `${an} (@${au})`
      : an
        ? an
        : au
          ? `@${au}`
          : undefined;
  const author =
    pickString(authorFromParts, sourceMeta.author, sourceMeta.username, sourceMeta.author_hint) || 'недоступно';
  return `Источник:\n${sourceTitle}\n\nСсылка:\n${sourceLink}\n\nАвтор:\n${author}`;
}

export async function handleLeadsIngest(request: Request, env: Env): Promise<Response> {
  if (!env.DB) {
    return jsonResponse({ status: 'error', message: 'db_missing' }, 200);
  }

  const storage = new StorageClient(env.DB);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ status: 'error', message: 'unsupported_media_type' }, 200);
  }

  let body: any;
  try {
    body = await request.json();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await storage.logDebug('leads_ingest_bad_json', msg);
    return jsonResponse({ status: 'error', message: 'bad_json' }, 200);
  }

  const rawUserId = body?.user_id != null ? String(body.user_id).trim() : '';
  const leadText = body?.lead_text != null ? String(body.lead_text).trim() : '';
  const leadLang = typeof body?.lead_lang === 'string' ? body.lead_lang.trim() : '';
  const sourceMetaRaw = body?.source_meta && typeof body.source_meta === 'object' ? body.source_meta : {};
  const sourceMeta = buildNormalizedSourceMeta(
    sourceMetaRaw,
    { sourceChatId: undefined, sourceMessageId: undefined, sourceLink: body?.source_link, author: body?.author_hint }
  );
  const sourceMetaUsername = normalizeLeadUsername(
    sourceMeta?.username ??
      sourceMeta?.author_username ??
      sourceMeta?.user_username ??
      sourceMeta?.telegram_username
  );
  const sourceMetaAccessHashRaw =
    sourceMeta?.access_hash ?? sourceMeta?.user_access_hash ?? sourceMeta?.telegram_access_hash;
  const sourceMetaAccessHash = normalizeLeadAccessHash(sourceMetaAccessHashRaw);
  const collectorStable = isCollectorStableSource(sourceMeta as Record<string, unknown>);
  const sourceMetaNormalized: Record<string, unknown> = {
    ...(sourceMeta as Record<string, unknown>),
    ...(sourceMetaUsername ? { username: sourceMetaUsername } : {}),
    ...(sourceMetaAccessHash ? { access_hash: sourceMetaAccessHash } : {}),
  };
  const rawProjectId = body?.project_id;
  const projectId = rawProjectId != null ? String(rawProjectId).trim() : '';
  if (!rawUserId) {
    await storage.logDebug(
      'leads_ingest_missing_user_id',
      JSON.stringify({ project_id: projectId, has_lead_text: !!leadText })
    );
    return jsonResponse({ status: 'skipped_missing_user_id' }, 200);
  }

  if (collectorStable && !sourceMetaUsername) {
    await storage.logDebug(
      'leads_ingest_no_username',
      JSON.stringify({ project_id: projectId, user_id: rawUserId })
    );
    return jsonResponse({ status: 'skipped_no_username' }, 200);
  }

  const storageUserId = resolveLeadStorageUserId(projectId, rawUserId, sourceMetaUsername);
  const telegramPeerForMeta = resolveTelegramPeerForMeta(body as Record<string, unknown>, rawUserId);
  const draftClientIdLabel = sourceMetaUsername
    ? `@${sourceMetaUsername}`
    : pickString(sourceMetaNormalized.author_name) ||
      telegramPeerForMeta ||
      storageUserId;

  if (!leadText) {
    return jsonResponse({ status: 'error', message: 'lead_text_required' }, 200);
  }

  if (!projectId) {
    return jsonResponse({ status: 'error', message: 'project_id_required' }, 200);
  }

  if (!env.LEADS_SUPERGROUP_ID || env.LEADS_SUPERGROUP_ID.trim() === '') {
    return jsonResponse({ status: 'error', message: 'leads_supergroup_not_configured' }, 200);
  }

  try {
    const leadBotToken = env.LEADS_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
    const api = new TelegramApi(leadBotToken);

    const contacted = await storage.getLeadContactedProjects(storageUserId);
    if (contacted[projectId]) {
      const existing = await storage.getConversation(storageUserId);
      const draftMsgId = existing?.draft_support_message_id ?? null;
      const existingTopicId = existing?.topic_id ?? null;
      if (existing && draftMsgId != null && existingTopicId != null) {
        await storage.logDebug(
          'leads_ingest_skipped_exists',
          JSON.stringify({
            storage_user_id: storageUserId,
            telegram_peer_id: telegramPeerForMeta,
            project_id: projectId,
          })
        );
        return jsonResponse({
          status: 'skipped_exists',
          topicId: existingTopicId,
          draftMessageId: draftMsgId,
        }, 200);
      }
      if (existing && existingTopicId != null && draftMsgId == null) {
        await storage.logDebug(
          'leads_ingest_recreate_draft',
          JSON.stringify({
            storage_user_id: storageUserId,
            telegram_peer_id: telegramPeerForMeta,
            project_id: projectId,
          })
        );
        const clientBlock = `${leadText}\n\n${buildLeadSourceBlock(sourceMetaNormalized)}`;
        const targetLang = leadLang || 'ru';
        const { ru: leadReplyRu, client: clientReplyText } = await generateLeadIngestDraft(
          env,
          storage,
          leadText,
          targetLang
        );
        const draftBody = formatDraftMessage(clientBlock, leadReplyRu, 0, draftClientIdLabel);
        const keyboard = createDraftKeyboard(existingTopicId, false, false);
        const chatId = Number(existing.supergroup_id);
        const supportMsg = await api.sendMessage(chatId, draftBody, {
          threadId: existingTopicId,
          replyMarkup: keyboard,
        });
        await storage.setDraftSupportMessageId(storageUserId, supportMsg.message_id);
        await storage.saveBilingualSuggestion(
          storageUserId,
          existingTopicId,
          leadReplyRu,
          clientReplyText,
          targetLang,
          Date.now(),
          supportMsg.message_id
        );
        return jsonResponse({
          status: 'created',
          topicId: existingTopicId,
          draftMessageId: supportMsg.message_id,
        }, 200);
      }
    }

    const ts = Date.now();
    const metaObj: Record<string, unknown> = {
      project_id: projectId,
      source_meta: sourceMetaNormalized,
      source: 'junction',
      lang: leadLang || undefined,
      ...(telegramPeerForMeta ? { telegram_user_id: telegramPeerForMeta } : {}),
      ...(sourceMetaUsername ? { username: sourceMetaUsername } : {}),
      ...(sourceMetaAccessHash ? { access_hash: sourceMetaAccessHash } : {}),
    };
    const meta = JSON.stringify(metaObj);

    const msgId = await storage.appendMessage(
      storageUserId,
      'client',
      leadText,
      ts,
      undefined,
      meta
    );

    if (msgId === false) {
      await storage.logDebug(
        'leads_ingest_duplicate_message',
        JSON.stringify({ storage_user_id: storageUserId, project_id: projectId })
      );
      return jsonResponse({ status: 'skipped_duplicate' }, 200);
    }

    await storage.logDebug(
      'lead_saved_without_topic',
      JSON.stringify({
        storage_user_id: storageUserId,
        telegram_peer_id: telegramPeerForMeta,
        project_id: projectId,
      })
    );

    const tokenBytes = new Uint8Array(16);
    crypto.getRandomValues(tokenBytes);
    const topicToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      await storage.insertLeadTopicCallbackToken(topicToken, storageUserId, ts);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      await storage.logDebug('lead_topic_token_insert_error', errMsg);
      return jsonResponse({ status: 'error', message: 'token_insert_failed' }, 200);
    }

    const collectorChatId = pickString(
      sourceMetaNormalized.collector_chat_id,
      sourceMetaNormalized.source_chat_id,
      sourceMetaNormalized.chat_id
    );
    const junctionMessageIdRaw = pickString(
      sourceMetaNormalized.source_message_id,
      sourceMetaNormalized.message_id
    );
    const replyToId = junctionMessageIdRaw != null ? parseInt(String(junctionMessageIdRaw), 10) : NaN;
    const collectorThreadId = pickCollectorMessageThreadId(sourceMetaNormalized);

    if (!collectorChatId || !Number.isFinite(replyToId)) {
      await storage.logDebug(
        'lead_saved_without_topic_no_collector_reply_target',
        JSON.stringify({
          storage_user_id: storageUserId,
          has_collector_chat: !!collectorChatId,
          has_message_id: Number.isFinite(replyToId),
        })
      );
      return jsonResponse(
        {
          status: 'pending_topic',
          storageUserId,
          token: topicToken,
          warning: 'collector_chat_or_message_id_missing',
        },
        200
      );
    }

    const callbackData = `create_topic:${topicToken}`;
    try {
      await api.sendMessage(collectorChatId, 'Создать топик для этого лида', {
        replyTo: replyToId,
        ...(collectorThreadId != null ? { threadId: collectorThreadId } : {}),
        replyMarkup: {
          inline_keyboard: [[{ text: 'Создать топик', callback_data: callbackData }]],
        },
        parseMode: undefined,
      });
    } catch (sendErr: unknown) {
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await storage.logDebug(
        'lead_topic_prompt_send_error',
        JSON.stringify({
          error: errMsg,
          collector_thread_id: collectorThreadId ?? null,
          reply_to: replyToId,
        })
      );
      return jsonResponse(
        {
          status: 'pending_topic',
          storageUserId,
          token: topicToken,
          warning: 'prompt_send_failed',
        },
        200
      );
    }

    return jsonResponse(
      {
        status: 'pending_topic',
        storageUserId,
        token: topicToken,
      },
      200
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Leads ingest error:', err);
    try {
      await storage.logDebug('leads_ingest_error', message);
    } catch {
      
    }
    return jsonResponse({ status: 'error', message }, 200);
  }
}

export async function handleLeadsIngestAnon(request: Request, env: Env): Promise<Response> {
  if (!env.DB) {
    return jsonResponse({ status: 'error', message: 'db_missing' }, 200);
  }

  const storage = new StorageClient(env.DB);

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return jsonResponse({ status: 'error', message: 'unsupported_media_type' }, 200);
  }

  let body: any;
  try {
    body = await request.json();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await storage.logDebug('leads_ingest_anon_bad_json', msg);
    return jsonResponse({ status: 'error', message: 'bad_json' }, 200);
  }

  const leadText = body?.lead_text != null ? String(body.lead_text).trim() : '';
  const leadLang = typeof body?.lead_lang === 'string' ? body.lead_lang.trim() : '';
  const sourceMetaRaw = body?.source_meta && typeof body.source_meta === 'object' ? body.source_meta : {};
  const rawProjectId = body?.project_id;
  const projectId = rawProjectId != null ? String(rawProjectId).trim() : '';
  const authorHint = body?.author_hint != null ? String(body.author_hint).trim() : null;
  const sourceLink = body?.source_link != null ? String(body.source_link).trim() : '';

  if (!leadText) {
    return jsonResponse({ status: 'error', message: 'lead_text_required' }, 200);
  }
  if (!projectId) {
    return jsonResponse({ status: 'error', message: 'project_id_required' }, 200);
  }
  if (!env.LEADS_SUPERGROUP_ID || env.LEADS_SUPERGROUP_ID.trim() === '') {
    return jsonResponse({ status: 'error', message: 'leads_supergroup_not_configured' }, 200);
  }

  const sourceMeta = buildNormalizedSourceMeta(
    sourceMetaRaw,
    { sourceChatId: sourceMetaRaw?.collector_chat_id, sourceMessageId: sourceMetaRaw?.message_id, sourceLink, author: authorHint }
  );
  const sourceChatId = sourceMeta?.source_chat_id ?? sourceMeta?.collector_chat_id ?? '';
  const sourceMessageId = sourceMeta?.source_message_id ?? sourceMeta?.message_id ?? '';
  const anonId = `anon:${projectId}:${sourceChatId}:${sourceMessageId}`;
  const topicDisplayName = buildAnonTopicDisplayName(authorHint, String(sourceMessageId ?? ''));

  try {
    const leadBotToken = env.LEADS_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
    const api = new TelegramApi(leadBotToken);
    const supergroupId = env.LEADS_SUPERGROUP_ID;

    const existing = await storage.getConversation(anonId);
    const existingTopicId = existing?.topic_id ?? null;
    const existingDraftMsgId = existing?.draft_support_message_id ?? null;
    if (existing && existingTopicId != null && existingDraftMsgId != null) {
      return jsonResponse({
        status: 'skipped_exists',
        topicId: existingTopicId,
        draftMessageId: existingDraftMsgId,
      }, 200);
    }
    if (existing && existingTopicId != null && existingDraftMsgId == null) {
      await storage.logDebug('leads_ingest_anon_recreate_draft', JSON.stringify({ anon_id: anonId }));
      const clientBlockWithSourceLink = `${leadText}\n\n${buildLeadSourceBlock(sourceMeta)}`;
      const draftBody = formatDraftMessage(clientBlockWithSourceLink, ANON_STATUS_TEXT, 0, undefined);
      const keyboard = createDraftKeyboard(existingTopicId, false, true);
      const supportMsg = await api.sendMessage(Number(existing.supergroup_id), draftBody, {
        threadId: existingTopicId,
        replyMarkup: keyboard,
      });
      await storage.setDraftSupportMessageId(anonId, supportMsg.message_id);
      await storage.saveBilingualSuggestion(
        anonId,
        existingTopicId,
        ANON_STATUS_TEXT,
        clientBlockWithSourceLink,
        leadLang || 'ru',
        Date.now(),
        supportMsg.message_id
      );
      return jsonResponse({
        status: 'created',
        topicId: existingTopicId,
        draftMessageId: supportMsg.message_id,
      }, 200);
    }

    const topicId = await getOrCreateTopicForUser(
      storage,
      api,
      supergroupId,
      anonId,
      topicDisplayName
    );

    const clientBlockWithSourceLink = `${leadText}\n\n${buildLeadSourceBlock(sourceMeta)}`;
    const draftBody = formatDraftMessage(clientBlockWithSourceLink, ANON_STATUS_TEXT, 0, undefined);
    const keyboard = createDraftKeyboard(topicId, false, true);

    const supportMsg = await api.sendMessage(supergroupId, draftBody, {
      threadId: topicId,
      replyMarkup: keyboard,
    });

    await storage.setDraftSupportMessageId(anonId, supportMsg.message_id);
    await storage.saveBilingualSuggestion(
      anonId,
      topicId,
      ANON_STATUS_TEXT,
      clientBlockWithSourceLink,
      leadLang || 'ru',
      Date.now(),
      supportMsg.message_id
    );

    await storage.logDebug(
      'leads_ingest_anon_created',
      JSON.stringify({ anon_id: anonId, project_id: projectId, topic_id: topicId, draft_message_id: supportMsg.message_id })
    );

    return jsonResponse({
      status: 'created',
      topicId,
      draftMessageId: supportMsg.message_id,
    }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Leads ingest-anon error:', err);
    try {
      await storage.logDebug('leads_ingest_anon_error', message);
    } catch {
      
    }
    return jsonResponse({ status: 'error', message }, 200);
  }
}
