import { escapeHtml, truncateForTelegram } from './api';

export const DRAFT_SEP = '────────────────────';
const DRAFT_HARD_SEP = '━━━━━━━━━━━━━━━━━━━';

export function formatDraftMessage(
  clientRuSummary: string,
  draftRu: string,
  pendingFlag: 0 | 1,
  clientUserId?: string
): string {
  const safeSummary = escapeHtml(truncateForTelegram(clientRuSummary, 1500));
  const safeDraft = escapeHtml(truncateForTelegram(draftRu, 1500));
  const idDisplay = clientUserId ? `<blockquote>${escapeHtml(clientUserId)}</blockquote>\n` : '';
  let out =
    `${DRAFT_HARD_SEP}\n<b>👤 КЛИЕНТ</b>\n${DRAFT_HARD_SEP}\n\n${idDisplay}${safeSummary}\n\n` +
    `${DRAFT_HARD_SEP}\n<b>🤖 ОТВЕТ</b>\n${DRAFT_HARD_SEP}\n\n${safeDraft}`;
  if (pendingFlag === 1) {
    out += `\n\n${DRAFT_SEP}\nНовые сообщения получены. Нажмите Regen, чтобы обновить ответ.`;
  }
  return `${out}\n\n${DRAFT_HARD_SEP}`;
}

export function createDraftKeyboard(
  topicId: number,
  isClosed: boolean = false,
  isAnon: boolean = false
): { inline_keyboard: any[] } {
  if (isClosed) {
    return {
      inline_keyboard: [[{ text: 'Reopen', callback_data: `reopen_${topicId}` }]],
    };
  }
  const sendData = isAnon ? `send_anon_${topicId}` : `send_${topicId}`;
  return {
    inline_keyboard: [
      [
        { text: 'Edit', callback_data: `edit_${topicId}` },
        { text: 'Send', callback_data: sendData },
      ],
      [
        { text: 'Regen', callback_data: `regen_${topicId}` },
        { text: 'Close', callback_data: `close_${topicId}` },
      ],
    ],
  };
}
