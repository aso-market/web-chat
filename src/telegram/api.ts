
export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncateForTelegram(text: string, maxLength: number = 4096): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

const DEFAULT_429_RETRY_AFTER_SEC = 30;
const MAX_429_RETRIES = 2;

export class TelegramApi {
  private baseUrl: string;

  constructor(token: string) {
    this.baseUrl = `https:
  }

      }
      console.warn(`Telegram API 429 Too Many Requests; waiting ${waitSec}s before retry (${retriesLeft} left)`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      return this.postWith429Retry(endpoint, body, retriesLeft - 1);
    }
    return res;
  }

  async sendMessage(
    chat_id: number | string,
    text: string,
    opts?: { threadId?: number; replyTo?: number; businessConnectionId?: string; parseMode?: string; replyMarkup?: any }
  ): Promise<any> {
    const truncatedText = truncateForTelegram(text);
    
    const body: any = {
      chat_id: chat_id,
      text: truncatedText,
      message_thread_id: opts?.threadId,
      reply_to_message_id: opts?.replyTo,
    };

    
    if (opts?.parseMode !== undefined) {
      if (opts.parseMode) {
        body.parse_mode = opts.parseMode;
      }
      
    } else if (!opts?.businessConnectionId) {
      
      body.parse_mode = "HTML";
    }
    

    if (opts?.businessConnectionId) {
      body.business_connection_id = opts.businessConnectionId;
    }

    if (opts?.replyMarkup) {
      body.reply_markup = opts.replyMarkup;
    }

    const res = await this.postWith429Retry('sendMessage', body);
    if (!res.ok) {
      let errorData: any;
      try {
        errorData = await res.json();
      } catch (e) {
        errorData = { status: res.status, statusText: res.statusText };
      }
      console.error('Telegram API Error (sendMessage):', errorData);
      const error = new Error(`Telegram API Error (sendMessage): ${JSON.stringify(errorData)}`);
      (error as any).response = res;
      (error as any).errorData = errorData;
      throw error;
    }
    return (await res.json() as any).result;
  }

  
  async sendBusinessReply(clientChatId: number | string, text: string, businessConnectionId?: string): Promise<any> {
    
    console.log(`[DEBUG] Sending Business Reply to ${clientChatId} (Connection: ${businessConnectionId || 'none'})`);
    
    
    const safeText = escapeHtml(text);
    
    return this.sendMessage(clientChatId, safeText, {
      businessConnectionId: businessConnectionId,
      parseMode: "HTML" 
    });
  }

  async editMessageText(
    chat_id: number | string,
    message_id: number,
    text: string,
    opts?: { threadId?: number; parseMode?: string; replyMarkup?: any; businessConnectionId?: string }
  ): Promise<any> {
    const truncatedText = truncateForTelegram(text);
    
    const body: any = {
      chat_id: chat_id,
      message_id: message_id,
      text: truncatedText,
    };

    
    if (opts?.parseMode !== undefined) {
      if (opts.parseMode) {
        body.parse_mode = opts.parseMode;
      }
      
    } else if (!opts?.businessConnectionId) {
      
      body.parse_mode = "HTML";
    }
    

    if (opts?.threadId) {
      body.message_thread_id = opts.threadId;
    }

    if (opts?.businessConnectionId) {
      body.business_connection_id = opts.businessConnectionId;
    }

    if (opts?.replyMarkup) {
      body.reply_markup = opts.replyMarkup;
    }

    const res = await fetch(`${this.baseUrl}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { ok?: boolean; result?: any; description?: string };
    if (!res.ok) {
      const desc = String(data?.description ?? '');
      if (/message is not modified|not modified/i.test(desc)) {
        return (data as any).result ?? {};
      }
      console.error('Telegram API Error (editMessageText):', data);
      throw new Error(`Telegram API Error: ${JSON.stringify(data)}`);
    }
    return data.result;
  }

  async createForumTopic(supergroupId: number | string, name: string): Promise<{ topicId: number }> {
    const res = await fetch(`${this.baseUrl}/createForumTopic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: supergroupId,
        name: name,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error('CreateForumTopic Error:', err);
      throw new Error('Failed to create forum topic');
    }

    const data = await res.json() as any;
    return { topicId: data.result.message_thread_id };
  }

  async editMessageReplyMarkup(
    chat_id: number | string,
    message_id: number,
    reply_markup?: any
  ): Promise<any> {
    const body: any = {
      chat_id: chat_id,
      message_id: message_id,
    };

    if (reply_markup) {
      body.reply_markup = reply_markup;
    }

    const res = await fetch(`${this.baseUrl}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.json();
      console.error('Telegram API Error (editMessageReplyMarkup):', errorData);
      throw new Error(`Telegram API Error: ${JSON.stringify(errorData)}`);
    }

    return (await res.json() as any).result;
  }

  async deleteMessage(chat_id: number | string, message_id: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, message_id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Telegram API Error (deleteMessage):', err);
      throw new Error(`Telegram API Error (deleteMessage): ${JSON.stringify(err)}`);
    }
  }

  async sendBusinessMedia(
    clientChatId: number | string,
    fileId: string,
    attachmentType: 'photo' | 'document' | 'video' | 'voice' | 'audio' | 'sticker' | 'animation' | 'video_note',
    opts?: { caption?: string; businessConnectionId?: string; fileName?: string }
  ): Promise<any> {
    const methodMap: Record<string, string> = {
      photo: 'sendPhoto',
      document: 'sendDocument',
      video: 'sendVideo',
      voice: 'sendVoice',
      audio: 'sendAudio',
      sticker: 'sendSticker',
      animation: 'sendAnimation',
      video_note: 'sendVideoNote',
    };
    const method = methodMap[attachmentType] || 'sendDocument';
    const field =
      attachmentType === 'photo'
        ? 'photo'
        : attachmentType === 'video_note'
          ? 'video_note'
          : attachmentType;

    const body: Record<string, unknown> = {
      chat_id: clientChatId,
      [field]: fileId,
    };

    if (opts?.businessConnectionId) {
      body.business_connection_id = opts.businessConnectionId;
    }

    const cap = (opts?.caption ?? '').trim();
    if (cap && attachmentType !== 'sticker' && attachmentType !== 'video_note') {
      body.caption = truncateForTelegram(cap, 1024);
    }

    if (attachmentType === 'document' && opts?.fileName) {
      body.filename = opts.fileName;
    }

    const res = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: any; description?: string };
    if (!res.ok) {
      console.error(`Telegram API Error (${method} business media):`, json);
      const error = new Error(`Telegram API Error (${method}): ${JSON.stringify(json)}`);
      (error as any).errorData = json;
      throw error;
    }
    return json.result;
  }

  async sendAttachment(
    chat_id: number | string,
    file_id: string,
    attachmentType: 'photo' | 'document' | 'video' | 'voice' | 'audio' | 'sticker' | 'animation' | 'video_note',
    opts?: { threadId?: number }
  ): Promise<any> {
    const methodMap: Record<string, string> = {
      photo: 'sendPhoto',
      document: 'sendDocument',
      video: 'sendVideo',
      voice: 'sendVoice',
      audio: 'sendAudio',
      sticker: 'sendSticker',
      animation: 'sendAnimation',
      video_note: 'sendVideoNote',
    };
    const method = methodMap[attachmentType] || 'sendDocument';
    const field = attachmentType === 'photo' ? 'photo' : attachmentType === 'video_note' ? 'video_note' : attachmentType;
    const body: Record<string, unknown> = { chat_id, [field]: file_id };
    if (opts?.threadId != null) body.message_thread_id = opts.threadId;
    const res = await this.postWith429Retry(method, body);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`Telegram API Error (${method}):`, err);
      throw new Error(`Telegram API Error (${method}): ${JSON.stringify(err)}`);
    }
    return (await res.json() as any).result;
  }

  async answerCallbackQuery(callback_query_id: string, text?: string, show_alert?: boolean): Promise<any> {
    const body: any = {
      callback_query_id: callback_query_id,
    };

    if (text !== undefined) {
      body.text = text;
    }
    if (show_alert !== undefined) {
      body.show_alert = show_alert;
    }

    const res = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { ok?: boolean; result?: any; description?: string };
    if (!res.ok) {
      const desc = String(data?.description ?? '');
      if (/query is too old|query id is invalid|response timeout expired/i.test(desc)) {
        
        return null;
      }
      console.error('Telegram API Error (answerCallbackQuery):', data);
      throw new Error(`Telegram API Error: ${JSON.stringify(data)}`);
    }

    return data.result;
  }
}
