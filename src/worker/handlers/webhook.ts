import { Env } from '../../domain/types';
import { parseUpdate } from '../../telegram/parse';
import { TelegramApi, escapeHtml, truncateForTelegram } from '../../telegram/api';
import { logError } from '../../logging';
import { StorageClient } from '../../storage/d1';
import { getOrCreateTopicForUser } from '../../telegram/forum';
import { searchRag, type SearchSnippet } from '../../rag/search';
import { normalizeQaText } from '../../qa/match';
import { getRagSnippetsForDraft } from '../../rag/draft-rag';
import {
  generateDraft,
  type BilingualDraft,
  translateToRussian,
  translateFromRussian,
  generateUnifiedRuDraft,
  MAX_DRAFT_LENGTH,
} from '../../rag/llm';
import { buildPrompt, buildUnifiedDraftPrompt, type UnifiedDraftItem, type ConversationHistoryEntry } from '../../rag/prompts';
import { detectLanguage } from '../../utils/detect-lang';
import { detectClientLang, looksEnglish, stripLanguageNamePrefix } from '../../qa/lang';
import { sendAccountMessage } from '../../external/account-api';
import { formatDraftMessage as formatDraftMessageShared, createDraftKeyboard as createDraftKeyboardShared } from '../../telegram/draft-format';
import { resolveLeadRuDraft } from '../../leads/generateLeadAIReply';
import {
  buildLeadSourceBlock,
  generateLeadIngestDraft,
  getLeadTopicDisplayName,
} from './leads-ingest';

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

function isLeadCallback(env: Env, supergroupId: string | number): boolean {
  if (!env.LEADS_SUPERGROUP_ID) return false;
  return String(supergroupId) === String(env.LEADS_SUPERGROUP_ID);
}

async function isLeadConversationByMeta(
  storage: StorageClient,
  userId: string
): Promise<boolean> {
  const lastMessages = await storage.getLastMessages(userId, 5);
  for (const msg of lastMessages) {
    if ((msg.role === 'client' || msg.role === 'client_edit') && msg.meta) {
      try {
        const meta = JSON.parse(msg.meta);
        if (meta.project_id === 'aso_testers_leads' || meta.project_id === 'reviews_ratings_leads') {
          return true;
        }
      } catch {
        
      }
    }
  }
  return false;
}

function formatAttachmentMarker(
  _N: number,
  type: 'photo' | 'document' | 'video' | 'voice' | 'audio' | 'sticker' | 'animation' | 'video_note' | string | undefined,
  _filename?: string | null,
  stickerEmoji?: string | null
): string {
  const t = (type ?? '').toLowerCase();
  if (t === 'photo') return '📷 Фото';
  if (t === 'document') return '📄 Документ';
  if (t === 'sticker') return stickerEmoji ? `🧷 Стикер ${stickerEmoji}` : '🧷 Стикер';
  if (t === 'animation') return '🎞 GIF';
  if (t === 'video') return '🎥 Видео';
  if (t === 'voice') return '🎤 Голосовое';
  if (t === 'audio') return '🎵 Аудио';
  if (t === 'video_note') return '📹 Видеосообщение';
  return `📎 Вложение: ${t || 'file'}`;
}

function toTgInternalChatId(supergroupId: string | number): string | null {
  const raw = String(supergroupId ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('-100')) return raw.slice(4);
  if (raw.startsWith('-')) return raw.slice(1);
  return raw;
}

function buildTopicMessageLink(supergroupId: string | number, messageId: number): string | null {
  const chatId = toTgInternalChatId(supergroupId);
  if (!chatId || !messageId) return null;
  return `https:
}

function renderClientDraftItem(item: ClientDraftItem, index: number): string {
  if (item.type === 'text') return item.text;
  const marker = formatAttachmentMarker(index, item.mediaType, undefined, item.stickerEmoji);
  const linkBlock = item.link ? `${marker} -> Открыть\n${item.link}` : `${marker} -> Открыть`;
  const caption = item.caption?.trim();
  return caption ? `${linkBlock}\n↳ Подпись:\n${caption}` : linkBlock;
}

function parseClientDraftItems(rangeMessages: Array<{ text: string; meta?: string }>): ClientDraftItem[] {
  const items: ClientDraftItem[] = [];
  for (const m of rangeMessages) {
    let ru = m.text;
    let hasAttachment = false;
    let attachmentType: string | undefined;
    let stickerEmoji: string | null = null;
    let link: string | undefined;
    if (m.meta) {
      try {
        const o = JSON.parse(m.meta) as Record<string, unknown>;
        if (typeof o.ru_text === 'string' && (o.ru_text as string).trim()) ru = o.ru_text as string;
        if (o.has_attachment && o.attachment_type) {
          hasAttachment = true;
          attachmentType = String(o.attachment_type);
          if (typeof o.sticker_emoji === 'string') stickerEmoji = o.sticker_emoji as string;
          if (typeof o.topic_message_id === 'number' && (typeof o.topic_chat_id === 'string' || typeof o.topic_chat_id === 'number')) {
            const maybeLink = buildTopicMessageLink(o.topic_chat_id as string | number, o.topic_message_id as number);
            if (maybeLink) link = maybeLink;
          }
        }
function buildClientRuSummaryFromMessages(
  rangeMessages: Array<{ text: string; meta?: string }>
): string {
  const parsed = parseClientDraftItems(rangeMessages);
  const lines: string[] = [];
  let mediaN = 0;
  for (const item of parsed) {
    if (item.type === 'media') mediaN++;
    lines.push(renderClientDraftItem(item, mediaN));
  }
  return lines.join('\n\n');
}

    }
    return { original_text: m.text, ru_text: ru, lang, attachment_info: attachmentInfo };
  });
}

const DRAFT_SEP = '────────────────────';

async function forwardAttachmentToTopic(
  env: Env,
  api: TelegramApi,
  supergroupId: number | string,
  topicId: number,
  fileId: string | undefined,
  attachmentType: string | undefined
): Promise<number | null> {
  if (!fileId) return null;
  const type = (attachmentType ?? 'document') as 'photo' | 'document' | 'video' | 'voice' | 'audio' | 'sticker' | 'animation' | 'video_note';
  try {
    const sent = await api.sendAttachment(supergroupId, fileId, type, { threadId: topicId });
    return typeof sent?.message_id === 'number' ? sent.message_id : null;
  } catch (e: any) {
    console.error('forwardAttachmentToTopic error:', e?.message ?? e);
    logError(env, 'telegram', 'TG_SEND_FAILED', e, {
      action: 'sendAttachment',
      topic_id: topicId,
    }).catch(() => {});
    if (isMessageThreadNotFoundError(e)) throw e;
    return null;
  }
}

async function persistAttachmentTopicMeta(
  storage: StorageClient,
  userId: string,
  tgMessageId: number | undefined,
  topicMessageId: number | null,
  supergroupId: number | string
): Promise<void> {
  if (!tgMessageId || !topicMessageId) return;
  try {
    const existing = await storage.getMessageByTgMessageId(userId, tgMessageId);
    if (!existing) return;
    const metaObj = existing.meta ? JSON.parse(existing.meta) as Record<string, unknown> : {};
    metaObj.topic_message_id = topicMessageId;
    metaObj.topic_chat_id = String(supergroupId);
    await storage.updateMessageTextByTgMessageId(userId, tgMessageId, existing.text || '', JSON.stringify(metaObj));
  } catch {
    
  }
}

async function recreateDraftAtBottom(
  env: Env,
  api: TelegramApi,
  storage: StorageClient,
  params: {
    userId: string;
    supergroupId: number | string;
    topicId: number;
    draftBody: string;
    keyboard: any;
    currentDraftId?: number | null;
  }
): Promise<number | null> {
  const debounceKey = `${params.userId}:${params.topicId}`;
  const token = Date.now();
  recreateDebounceByUser.set(debounceKey, token);
  await sleep(RECREATE_DEBOUNCE_MS);
  if (recreateDebounceByUser.get(debounceKey) !== token) return null;

  const latestConv = await storage.getConversation(params.userId);
  const latestDraftId = latestConv?.draft_support_message_id ?? null;
  if (params.currentDraftId != null && latestDraftId !== params.currentDraftId) return null;

  if (latestDraftId != null) {
    try {
      await api.deleteMessage(params.supergroupId, latestDraftId);
    } catch (deleteErr: any) {
      await storage.logDebug('draft_delete_failed', JSON.stringify({
        user_id: params.userId,
        topic_id: params.topicId,
        old_draft_id: latestDraftId,
        error: String(deleteErr?.message || deleteErr),
      }));
    }
  }

  let effectiveTopicId = params.topicId;
  let supportMsg: any;
  try {
    supportMsg = await api.sendMessage(params.supergroupId, params.draftBody, {
      threadId: effectiveTopicId,
      replyMarkup: params.keyboard,
    });
  } catch (e) {
    if (isMessageThreadNotFoundError(e)) {
      effectiveTopicId = await recreateTopicForUser(storage, api, params.supergroupId, params.userId, params.userId);
      await storage.moveLastSuggestedToTopic(params.userId, effectiveTopicId);
      supportMsg = await api.sendMessage(params.supergroupId, params.draftBody, {
        threadId: effectiveTopicId,
        replyMarkup: params.keyboard,
      });
    } else {
      throw e;
    }
  }

  await storage.setDraftSupportMessageId(params.userId, supportMsg.message_id);
  await storage.updateLastSuggestedSupportMessageIdByTopic(effectiveTopicId, supportMsg.message_id);
  return supportMsg.message_id;
}

function formatBilingualDraft(ruText: string, clientText: string, lang: string, isClosed: boolean = false): string {
  const safeRu = escapeHtml(truncateForTelegram(ruText, 1000));
  const safeClient = escapeHtml(truncateForTelegram(clientText, 1000));
  return `Draft (RU):\n${safeRu}\n\nDraft (Client):\n${safeClient}`;
}

const HISTORY_TRUNCATE = 160;

function getLangAndClientSample(
  items: UnifiedDraftItem[],
  conv: { last_client_lang?: string | null } | null,
  fallbackClientText?: string
): { lang: string; clientSample?: string } {
  const lastWithText = [...items].reverse().find((i) => i.original_text && i.original_text.trim().length >= 1);
  const lang = lastWithText?.lang ?? (conv?.last_client_lang && conv.last_client_lang !== '' ? conv.last_client_lang : 'en');
  const clientSample = lastWithText?.original_text?.trim() || fallbackClientText?.trim() || undefined;
  return { lang, clientSample };
}

async function getConversationHistory(
  storage: StorageClient,
  userId: string,
  beforeId: number
): Promise<ConversationHistoryEntry[]> {
  const prev = await storage.getMessagesBeforeId(userId, beforeId, 18);
  return prev.map((m) => {
    let text = m.text ?? '';
    if (m.role === 'client' || m.role === 'client_edit') {
      if (m.meta) {
        try {
          const o = JSON.parse(m.meta) as Record<string, unknown>;
          if (typeof o.ru_text === 'string' && (o.ru_text as string).trim()) text = o.ru_text as string;
        if (callbackDataStr.startsWith('create_topic:')) {
          const topicToken = callbackDataStr.slice('create_topic:'.length);
          if (!topicToken) {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Ошибка: неполные данные', true);
            return new Response('OK');
          }

          if (env.COLLECTOR_CHAT_IDS && env.COLLECTOR_CHAT_IDS.trim()) {
            try {
              const allowed = JSON.parse(env.COLLECTOR_CHAT_IDS) as unknown;
              if (Array.isArray(allowed) && allowed.length > 0 && parsed.supergroupId != null) {
                const sid = String(parsed.supergroupId);
                if (!allowed.some((a) => String(a) === sid)) {
                  await storage.logDebug('create_topic_wrong_collector', JSON.stringify({ sid, allowed }));
                  await api.answerCallbackQuery(parsed.callbackQueryId, 'Неверный чат', true);
                  return new Response('OK');
                }
              }
            } catch {
            }
            const usedAt = Date.now();
            await storage.markLeadTopicCallbackTokenUsed(topicToken, usedAt);
            return new Response('OK');
          }

          const lastClient = await storage.getLastClientMessageForUser(storageUserId);
          if (!lastClient?.meta) {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Нет данных лида', true);
            return new Response('OK');
          }

          let metaObj: Record<string, unknown>;
          try {
            metaObj = JSON.parse(lastClient.meta) as Record<string, unknown>;
          } catch {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Нет данных лида', true);
            return new Response('OK');
          }

          const projectId = metaObj.project_id != null ? String(metaObj.project_id).trim() : '';
          const sourceMetaRaw =
            metaObj.source_meta && typeof metaObj.source_meta === 'object'
              ? (metaObj.source_meta as Record<string, unknown>)
              : {};
          const leadText = lastClient.text || '';
          const leadLang = typeof metaObj.lang === 'string' ? metaObj.lang.trim() : '';
          const sourceMetaUsername = normalizeLeadUsername(
            sourceMetaRaw.username ?? sourceMetaRaw.author_username
          );
          const draftClientIdLabel = sourceMetaUsername
            ? `@${sourceMetaUsername}`
            : projectId || storageUserId;

          const targetLang = leadLang || 'ru';

          if (!env.LEADS_SUPERGROUP_ID || env.LEADS_SUPERGROUP_ID.trim() === '') {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Супергруппа лидов не настроена', true);
            return new Response('OK');
          }

          await api.answerCallbackQuery(parsed.callbackQueryId);

          try {
            const topicDisplayName = getLeadTopicDisplayName(projectId, storageUserId, sourceMetaUsername);
            const leadsSg = env.LEADS_SUPERGROUP_ID;
            const topicId = await getOrCreateTopicForUser(
              storage,
              api,
              leadsSg,
              storageUserId,
              topicDisplayName
            );

            const clientBlock = `${leadText}\n\n${buildLeadSourceBlock(sourceMetaRaw)}`;
            const { ru: leadReplyRu, client: clientReplyText } = await generateLeadIngestDraft(
              env,
              storage,
              leadText,
              targetLang
            );
            const draftBody = formatDraftMessage(clientBlock, leadReplyRu, 0, draftClientIdLabel);
            const keyboard = createDraftKeyboardShared(topicId, false, false);

            const supportMsg = await api.sendMessage(leadsSg, draftBody, {
              threadId: topicId,
              replyMarkup: keyboard,
            });

            const ts = Date.now();
            await storage.saveBilingualSuggestion(
              storageUserId,
              topicId,
              leadReplyRu,
              clientReplyText,
              targetLang,
              ts,
              supportMsg.message_id
            );
            await storage.setDraftSupportMessageId(storageUserId, supportMsg.message_id);
            const anchorId = typeof lastClient.id === 'number' ? lastClient.id : 1;
            await storage.setDraftAnchorsById(storageUserId, anchorId, anchorId);
            await storage.updateConversationContext(storageUserId, leadText, targetLang, null, null);
            if (projectId) {
              await storage.setLeadContacted(storageUserId, projectId);
            }
            await storage.markLeadTopicCallbackTokenUsed(topicToken, ts);

            try {
              if (parsed.supergroupId != null && parsed.tgMessageId != null) {
                await api.editMessageReplyMarkup(String(parsed.supergroupId), parsed.tgMessageId, {
                  inline_keyboard: [],
                });
                await api.editMessageText(String(parsed.supergroupId), parsed.tgMessageId, '✅ Топик создан', {
                  parseMode: '',
                });
              }
            } catch {
        let leadTelegramUserId: string | undefined;
        let leadHintSourceMsg: { tgMessageId?: number; text?: string; meta?: string } | null = null;
        try {
          const lastMessages = await storage.getLastMessages(conv.user_id, 20);
          for (let i = lastMessages.length - 1; i >= 0; i--) {
            const msg = lastMessages[i];
            if (msg.role === 'client' || msg.role === 'client_edit') {
              if (!leadHintSourceMsg) {
                leadHintSourceMsg = {
                  tgMessageId: msg.tg_message_id,
                  text: msg.text,
                  meta: msg.meta,
                };
              }
              if (!clientSampleText && msg.text) {
                clientSampleText = msg.text;
              }
              if (msg.meta) {
                try {
                  const meta = JSON.parse(msg.meta) as {
                    business_connection_id?: string;
                    telegram_user_id?: string | number;
                    username?: string;
                    telegram_username?: string;
                    user_username?: string;
                    access_hash?: string | number;
                    telegram_access_hash?: string | number;
                    user_access_hash?: string | number;
                    source_meta?: {
                      username?: string;
                      telegram_username?: string;
                      user_username?: string;
                      telegram_user_id?: string | number;
                      access_hash?: string | number;
                      telegram_access_hash?: string | number;
                      user_access_hash?: string | number;
                    };
                  };
                  if (meta.business_connection_id && !connectionId) {
                    connectionId = meta.business_connection_id;
                  }
                  if (!leadTelegramUserId) {
                    const tid =
                      meta.telegram_user_id ?? meta.source_meta?.telegram_user_id;
                    if (tid != null && String(tid).trim()) {
                      leadTelegramUserId = String(tid).trim();
                    }
                  }
                  if (!leadUsername) {
                    const candidateUsername =
                      meta.source_meta?.username ??
                      meta.source_meta?.user_username ??
                      meta.source_meta?.telegram_username ??
                      meta.username ??
                      meta.user_username ??
                      meta.telegram_username;
                    const normalized = normalizeLeadUsername(candidateUsername);
                    if (normalized) {
                      leadUsername = normalized;
                    }
                  }
                  if (!leadAccessHash) {
                    const candidateAccessHash =
                      meta.source_meta?.access_hash ??
                      meta.source_meta?.user_access_hash ??
                      meta.source_meta?.telegram_access_hash ??
                      meta.access_hash ??
                      meta.user_access_hash ??
                      meta.telegram_access_hash;
                    const normalizedAccessHash = normalizeLeadAccessHash(candidateAccessHash);
                    if (normalizedAccessHash) {
                      leadAccessHash = normalizedAccessHash;
                    }
                  }
            }
          }
        } catch (e) {
          console.error('Error extracting business_connection_id:', e);
        }

        let clientQuestionForQa = '';
        const anchorQa = conv.draft_anchor_message_id ?? null;
        const lastQa = conv.draft_last_included_message_id ?? null;
        if (anchorQa != null && lastQa != null) {
          try {
            const rangeForQa = await getClientMessagesForActiveDraftRange(storage, conv.user_id, anchorQa, lastQa);
            const itemsForQa = buildUnifiedDraftItemsFromMessages(rangeForQa);
            clientQuestionForQa = itemsForQa.map((i) => i.original_text).join('\n\n').trim();
          } catch {

      } else if (data.startsWith('regen_')) {
        if (isAnonLead) {
          await api.answerCallbackQuery(parsed.callbackQueryId, 'Нет RAG для анонимного лида. Редактируйте вручную.', true);
          return new Response('OK');
        }
        const anchorId = conv.draft_anchor_message_id ?? null;
        const lastId = conv.draft_last_included_message_id ?? null;
        
        if (anchorId == null || lastId == null) {
          await storage.logDebug('regen_no_anchor', `user=${conv.user_id}, topic=${topicId}, isLead=${isLead}`);
          await api.answerCallbackQuery(parsed.callbackQueryId, 'Нет якорей. Невозможно пересоздать.');
          return new Response('OK');
        }
        let suggestionId: number | null = null;
        if (lastSuggested?.id) {
          suggestionId = lastSuggested.id;
          const isLocked = await storage.isSuggestionLocked(suggestionId);
          if (isLocked) {
            await storage.logDebug('regen_already_locked', `user=${conv.user_id}, suggestion_id=${suggestionId}`);
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Драфт занят. Попробуйте через 10 с.');
            return new Response('OK');
          }
          const lockAcquired = await storage.tryLockSuggestion(suggestionId, 10);
          if (!lockAcquired) {
            await storage.logDebug('regen_lock_failed', `user=${conv.user_id}, suggestion_id=${suggestionId}`);
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Драфт занят. Попробуйте через 10 с.');
            return new Response('OK');
          }
        }
        try {
          const targetSupergroupId = String(conv.supergroup_id);
          const targetTopicId = topicId!;
          
          const rangeMessages = await getClientMessagesForActiveDraftRange(storage, conv.user_id, anchorId, lastId);
          const items = buildUnifiedDraftItemsFromMessages(rangeMessages);
          if (!items.length) {
            await storage.logDebug('regen_no_messages', `user=${conv.user_id}`);
            if (suggestionId) await storage.unlockSuggestion(suggestionId);
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Нет сообщений в пачке.');
            return new Response('OK');
          }
          await api.answerCallbackQuery(parsed.callbackQueryId, 'Регенерация драфта...');
          await storage.setDraftFrozen(conv.user_id, 0);
          await storage.setDraftPending(conv.user_id, 0);
          await storage.setEditingState(topicId, false);
          const aggregatedRu = items.map((i) => i.ru_text).join('\n\n');
          let sourceLink = '—';
          if (isLead) {
            const lastMsg = rangeMessages[rangeMessages.length - 1];
            if (lastMsg?.meta) {
              try {
                const meta = JSON.parse(lastMsg.meta) as { source_meta?: { source_link?: string } };
                if (meta.source_meta?.source_link) sourceLink = String(meta.source_meta.source_link);
              } catch {
        } finally {
          if (suggestionId) {
          }
          await storage.clearDraftAfterSend(conv.user_id);

          let ratingWillRun = false;
          
          if (!isLead && !closeResult.alreadyScheduled && env.RATING_QUEUE) {
            try {
              const queuePayload = {
                topicId: targetTopicId,
                userId: conv.user_id,
                supergroupId: String(targetSupergroupId),
              };
              await env.RATING_QUEUE.send(queuePayload, { delaySeconds: 30 });
              await storage.logDebug('rating_scheduled', JSON.stringify({
                topicId: targetTopicId,
                userId: conv.user_id,
                payload: queuePayload
              }));
              ratingWillRun = true;
            } catch (queueErr: any) {
              console.error('Error scheduling rating via queue:', queueErr);
              await storage.logDebug('rating_queue_send_error', JSON.stringify({
                error: String(queueErr?.message || queueErr),
                topicId,
                userId: conv.user_id,
                stack: queueErr?.stack?.slice(0, 500)
              }));
              logError(env, 'queue', 'RATING_QUEUE_SEND_ERROR', queueErr, {
                topic_id: topicId,
                user_id: conv.user_id,
              }).catch(() => {});
            }
          } else if (!env.RATING_QUEUE) {
            await storage.logDebug('rating_queue_missing', 'RATING_QUEUE binding not available');
          } else {
            await storage.logDebug('rating_already_scheduled', JSON.stringify({
              topicId,
              userId: conv.user_id
            }));
          }
          if (!ratingWillRun) {
            await storage.deleteMessagesForUser(conv.user_id);
          }

          await api.answerCallbackQuery(parsed.callbackQueryId, 'Диалог закрыт');
        } catch (err: any) {
          console.error('Close button error:', err);
          await storage.logDebug('close_button_error', String(err?.message || err));
          logError(env, 'callback', 'CLOSE_BUTTON_ERROR', err, { topic_id: topicId }).catch(() => {});
          await api.answerCallbackQuery(parsed.callbackQueryId, 'Ошибка при закрытии диалога', true);
        }
        return new Response('OK');

      } else if (data.startsWith('reopen_')) {
        try {
          await storage.reopenConversation(topicId);
          if (lastSuggested && lastSuggested.support_message_id) {
            const summary = lastSuggested.client_text || '';
            const draftRu = lastSuggested.ru_text || lastSuggested.suggestion_text || '';
            const draftText = formatDraftMessage(summary, draftRu, 0, isAnonLead ? undefined : conv.user_id);
            const keyboard = createDraftKeyboard(topicId, false, isAnonLead);
            await api.editMessageText(String(conv.supergroup_id), lastSuggested.support_message_id, draftText, { threadId: topicId, replyMarkup: keyboard });
          }
          await api.answerCallbackQuery(parsed.callbackQueryId, 'Диалог открыт');
        } catch (err: any) {
          console.error('Reopen button error:', err);
          await storage.logDebug('reopen_button_error', String(err?.message || err));
          logError(env, 'callback', 'REOPEN_BUTTON_ERROR', err, { topic_id: topicId }).catch(() => {});
          await api.answerCallbackQuery(parsed.callbackQueryId, 'Ошибка при открытии диалога', true);
        }
        return new Response('OK');

      } else if (data.startsWith('rate|')) {
        
        
        try {
          const parts = data.split('|');
          let ratingTopicId: number;
          let score: number;
          
          if (parts.length === 3) {
            
            ratingTopicId = parseInt(parts[1], 10);
            score = parseInt(parts[2], 10);
          } else if (parts.length === 4) {
            
            ratingTopicId = parseInt(parts[2], 10);
            score = parseInt(parts[3], 10);
          } else {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Неверный формат оценки', true);
            return new Response('OK');
          }

          if (isNaN(ratingTopicId) || isNaN(score) || score < 1 || score > 5) {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Неверная оценка', true);
            return new Response('OK');
          }

          
          const ratingConv = await storage.getConversationByTopic(ratingTopicId);
          if (!ratingConv) {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Диалог не найден', true);
            return new Response('OK');
          }

          
          if (parsed.messageThreadId && ratingTopicId !== parsed.messageThreadId) {
            await storage.logDebug('rating_topic_mismatch', JSON.stringify({ expected: parsed.messageThreadId, got: ratingTopicId }));
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Ошибка: неверный диалог', true);
            return new Response('OK');
          }

          
          const existingRating = await storage.getRatingByMessageId(parsed.tgMessageId!);
          if (existingRating) {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Оценка уже принята', true);
            return new Response('OK');
          }

          
          let clientChatId: string | number | null = null;
          let businessConnectionId: string | undefined = undefined;
          
          try {
            const lastMessages = await storage.getLastMessages(ratingConv.user_id, 20);
            for (let i = lastMessages.length - 1; i >= 0; i--) {
              const msg = lastMessages[i];
              if ((msg.role === 'client' || msg.role === 'client_edit') && msg.meta) {
                try {
                  const meta = JSON.parse(msg.meta);
                  if (meta.business_connection_id) {
                    businessConnectionId = meta.business_connection_id;
                    clientChatId = ratingConv.user_id;
                    break;
                  }
                } catch (e) {
                  
                }
              }
            }
          } catch (e) {
            console.error('Error extracting client info:', e);
          }

          
          if (!clientChatId) {
            clientChatId = ratingConv.user_id;
          }

          
          let clientLang = 'en'; 
          try {
            const lastMessages = await storage.getLastMessages(ratingConv.user_id, 20);
            
            for (let i = lastMessages.length - 1; i >= 0; i--) {
              const msg = lastMessages[i];
              if (msg.role === 'client' || msg.role === 'client_edit') {
                clientLang = detectLanguage(msg.text);
                break; 
              }
            }
          } catch (e) {
            console.error('Error detecting client language:', e);
          }

          
          await storage.saveRating(
            ratingTopicId,
            ratingConv.user_id,
            clientChatId ? String(clientChatId) : null,
            score,
            parsed.fromUserId || 'unknown',
            parsed.tgMessageId!
          );

          
          const stars = '⭐️'.repeat(score);
          let ratingText: string;
          if (clientLang === 'ru') {
            ratingText = `Оценка принята: ${stars} (${score}/5)`;
          } else {
            
            ratingText = `Rating accepted: ${stars} (${score}/5)`;
          }
          
          
          
          
          const isFromClientChat = !parsed.messageThreadId;
          const updateChatId = isFromClientChat ? clientChatId : parsed.supergroupId;
          
          await api.editMessageText(
            updateChatId!,
            parsed.tgMessageId!,
            ratingText,
            { 
              businessConnectionId: isFromClientChat ? businessConnectionId : undefined,
              replyMarkup: { inline_keyboard: [] } 
            }
          );

          await api.answerCallbackQuery(parsed.callbackQueryId, 'Спасибо, оценка принята');
          await storage.logDebug('rating_saved', JSON.stringify({ 
            topicId: ratingTopicId, 
            score, 
            ratedBy: parsed.fromUserId,
            fromClientChat: !parsed.messageThreadId
          }));
        } catch (err: any) {
          console.error('Rating callback error:', err);
          await storage.logDebug('rating_callback_error', String(err?.message || err));
          logError(env, 'callback', 'RATING_CALLBACK_ERROR', err, null).catch(() => {});
          await api.answerCallbackQuery(parsed.callbackQueryId, 'Ошибка при сохранении оценки', true);
        }
        return new Response('OK');

      } else {
        
        await storage.logDebug('callback_query_unknown', `data=${data}`);
        await api.answerCallbackQuery(parsed.callbackQueryId, 'Неизвестная команда', true);
      }

      return new Response('OK');
      } catch (err: any) {
        console.error('Callback query error:', err);
        await storage.logDebug('callback_query_error', String(err?.message || err));
        logError(env, 'callback', 'CALLBACK_QUERY_ERROR', err, {
          callback_data: parsed.callbackData?.slice(0, 50),
        }).catch(() => {});
        if (parsed.callbackQueryId) {
          try {
            await api.answerCallbackQuery(parsed.callbackQueryId, 'Произошла ошибка', true);
          } catch (e) {
            console.error('Failed to answer callback query:', e);
          }
        }
        return new Response('OK');
      }
    }

    if (
      parsed.kind === 'support_message' &&
      parsed.messageThreadId &&
      parsed.hasAttachment &&
      parsed.fileId &&
      parsed.attachmentType
    ) {
      const topicId = parsed.messageThreadId;
      const sg = String(parsed.supergroupId ?? supergroupId);
      const conv = await storage.getConversationByTopic(topicId);
      if (!conv) return new Response('OK');
      if (parsed.supergroupId != null && isLeadCallback(env, parsed.supergroupId)) {
        return new Response('OK');
      }

      const notifyFail = async () => {
        try {
          await api.sendMessage(sg, '❌ Не удалось отправить клиенту', { threadId: topicId });
        } catch {}
      };

      try {
        const uid = String(conv.user_id || '').trim();
        if (!uid) {
          await notifyFail();
          return new Response('OK');
        }

        let businessConnectionId: string | undefined;
        try {
          const lastMessages = await storage.getLastMessages(uid, 30);
          for (let i = lastMessages.length - 1; i >= 0; i--) {
            const m = lastMessages[i];
            if ((m.role === 'client' || m.role === 'client_edit') && m.meta) {
              try {
                const meta = JSON.parse(m.meta) as { business_connection_id?: string };
                if (meta.business_connection_id) {
                  businessConnectionId = meta.business_connection_id;
                  break;
                }
              } catch {}
            }
          }
        } catch {}
        if (!businessConnectionId) {
          const envBc = env.BUSINESS_CONNECTION_ID?.trim();
          if (envBc) businessConnectionId = envBc;
        }
        if (!businessConnectionId) {
          const anyBc = await storage.getAnyBusinessConnection();
          if (anyBc) businessConnectionId = anyBc;
        }

        if (!businessConnectionId) {
          await notifyFail();
          await storage.logDebug('support_media_no_business_connection', JSON.stringify({ topic_id: topicId, user_id: uid }));
          return new Response('OK');
        }

        const opMsgId = parsed.tgMessageId;
        if (opMsgId == null) {
          await storage.logDebug('support_media_no_operator_msg_id', JSON.stringify({ topic_id: topicId }));
          return new Response('OK');
        }

        const claimedTopic = await storage.claimSupportTopicMediaForward(sg, opMsgId);
        if (!claimedTopic) {
          await storage.logDebug(
            'support_media_forward_dedupe',
            JSON.stringify({ supergroup_id: sg, message_id: opMsgId, topic_id: topicId })
          );
          return new Response('OK');
        }

        const captionRaw = (parsed.text || '').trim();
        const cap =
          captionRaw && parsed.attachmentType !== 'sticker' && parsed.attachmentType !== 'video_note'
            ? captionRaw
            : undefined;

        try {
          await api.sendBusinessMedia(uid, parsed.fileId, parsed.attachmentType, {
            businessConnectionId,
            caption: cap,
            fileName: parsed.attachmentFileName,
          });
        } catch (sendErr: any) {
          await storage.releaseSupportTopicMediaForward(sg, opMsgId);
          throw sendErr;
        }
      } catch (e: any) {
        await storage.logDebug('support_media_to_client_error', String(e?.message ?? e));
        await notifyFail();
      }
      return new Response('OK');
    }

    if (parsed.kind === 'support_message' && parsed.messageThreadId && parsed.text && !parsed.text.startsWith('/')) {
      const topicId = parsed.messageThreadId;
      const conv = await storage.getConversationByTopic(topicId);
      
      if (!conv) {
        await storage.logDebug('support_message_no_conv', `topicId=${topicId}`);
        return new Response('OK');
      }
      
      const isEditingValue = (conv as any).is_editing;
      const isEditingDirect = isEditingValue === 1 || isEditingValue === true;
      let isEditing = isEditingDirect;
      if (!isEditingDirect) {
        isEditing = await storage.isInEditMode(topicId);
      }

      if (isEditing) {
        await storage.logDebug('edit_mode_active', `topicId=${topicId}, processing edit`);
        const lastSuggested = await storage.getLastSuggestedSuggestion(conv.user_id);
        
        if (!lastSuggested) {
          await storage.logDebug('edit_no_suggestion', `topicId=${topicId}, user_id=${conv.user_id}`);
          await storage.setEditingState(topicId, false);
          return new Response('OK');
        }
        
        const draftMsgId = conv.draft_support_message_id ?? lastSuggested.support_message_id ?? null;
        if (!draftMsgId || !lastSuggested.id) {
          await storage.logDebug('edit_missing_data', JSON.stringify({ topicId, has_draft_msg_id: !!draftMsgId, has_support_message_id: !!lastSuggested.support_message_id, has_id: !!lastSuggested.id }));
          await storage.setEditingState(topicId, false);
          return new Response('OK');
        }
        const newText = parsed.text.trim();
        if (!newText) {
          await storage.setEditingState(topicId, false);
          return new Response('OK');
        }

        const ruText = newText;
        const clientLang = lastSuggested.lang || 'en';

        
        let clientSampleForEdit: string | undefined;
        try {
          const lastMessages = await storage.getLastMessages(conv.user_id, 20);
          for (let i = lastMessages.length - 1; i >= 0; i--) {
            const msg = lastMessages[i];
            if ((msg.role === 'client' || msg.role === 'client_edit') && msg.text) {
              clientSampleForEdit = msg.text;
              break;
            }
          }
