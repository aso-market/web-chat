
import { ParsedUpdate } from '../domain/types';

export type AttachmentType = 'photo' | 'document' | 'video' | 'voice' | 'audio' | 'sticker' | 'animation' | 'video_note';

function extractMessageContent(msg: any): {
  text: string;
  hasAttachment: boolean;
  attachmentType?: AttachmentType;
  fileId?: string;
  attachmentFileName?: string;
  stickerEmoji?: string;
} {
  let text = msg.text || msg.caption || '';
  let hasAttachment = false;
  let attachmentType: AttachmentType | undefined = undefined;
  let fileId: string | undefined = undefined;
  let attachmentFileName: string | undefined = undefined;
  let stickerEmoji: string | undefined = undefined;

  if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
    hasAttachment = true;
    attachmentType = 'photo';
    fileId = msg.photo[msg.photo.length - 1].file_id;
  } else if (msg.document) {
    hasAttachment = true;
    attachmentType = 'document';
    fileId = msg.document.file_id;
    if (msg.document.file_name) attachmentFileName = String(msg.document.file_name);
  } else if (msg.sticker) {
    hasAttachment = true;
    attachmentType = 'sticker';
    fileId = msg.sticker.file_id;
    if (msg.sticker.emoji) stickerEmoji = String(msg.sticker.emoji);
  } else if (msg.animation) {
    hasAttachment = true;
    attachmentType = 'animation';
    fileId = msg.animation.file_id;
    if (msg.animation.file_name) attachmentFileName = String(msg.animation.file_name);
  } else if (msg.video) {
    hasAttachment = true;
    attachmentType = 'video';
    fileId = msg.video.file_id;
  } else if (msg.voice) {
    hasAttachment = true;
    attachmentType = 'voice';
    fileId = msg.voice.file_id;
  } else if (msg.audio) {
    hasAttachment = true;
    attachmentType = 'audio';
    fileId = msg.audio.file_id;
  } else if (msg.video_note) {
    hasAttachment = true;
    attachmentType = 'video_note';
    fileId = msg.video_note.file_id;
  }

  return { text, hasAttachment, attachmentType, fileId, attachmentFileName, stickerEmoji };
}

export function parseUpdate(update: any): ParsedUpdate {
  if (update.business_message) {
    const msg = update.business_message;
    const content = extractMessageContent(msg);
    
    
    if (content.hasAttachment && !content.text) {
      return {
        kind: 'client_attachment_without_text',
        userId: String(msg.from.id),
        clientChatId: msg.chat.id,
        text: '',
        tgMessageId: msg.message_id,
        displayName: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
        businessConnectionId: update.business_connection_id || msg.business_connection_id,
        hasAttachment: true,
        attachmentType: content.attachmentType,
        fileId: content.fileId,
        attachmentFileName: content.attachmentFileName,
        stickerEmoji: content.stickerEmoji,
        isEdited: false,
      };
    }
    
    return {
      kind: 'client_message',
      userId: String(msg.from.id),
      clientChatId: msg.chat.id,
      text: content.text,
      tgMessageId: msg.message_id,
      displayName: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
      businessConnectionId: update.business_connection_id || msg.business_connection_id,
      hasAttachment: content.hasAttachment,
      attachmentType: content.attachmentType,
      fileId: content.fileId,
      attachmentFileName: content.attachmentFileName,
      stickerEmoji: content.stickerEmoji,
      isEdited: false,
    };
  }

  if (update.edited_business_message) {
    const msg = update.edited_business_message;
    const content = extractMessageContent(msg);
    
    return {
      kind: 'client_edit',
      userId: String(msg.from.id),
      clientChatId: msg.chat.id,
      text: content.text,
      tgMessageId: msg.message_id,
      displayName: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
      businessConnectionId: update.business_connection_id || msg.business_connection_id,
      hasAttachment: content.hasAttachment,
      attachmentType: content.attachmentType,
      fileId: content.fileId,
      attachmentFileName: content.attachmentFileName,
      stickerEmoji: content.stickerEmoji,
      isEdited: true,
    };
  }
  
  
  if (update.edited_message && update.edited_message.chat.type === 'private') {
    const msg = update.edited_message;
    const content = extractMessageContent(msg);
    
    return {
      kind: 'client_edit',
      userId: String(msg.from.id),
      clientChatId: msg.chat.id,
      text: content.text,
      tgMessageId: msg.message_id,
      displayName: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
      hasAttachment: content.hasAttachment,
      attachmentType: content.attachmentType,
      fileId: content.fileId,
      attachmentFileName: content.attachmentFileName,
      stickerEmoji: content.stickerEmoji,
      isEdited: true,
    };
  }

  
  if (update.callback_query) {
    const cb = update.callback_query;
    const msg = cb.message;
    
    if (msg && msg.message_thread_id) {
      return {
        kind: 'callback_query',
        callbackQueryId: cb.id,
        callbackData: cb.data || '',
        messageThreadId: msg.message_thread_id,
        supergroupId: msg.chat.id,
        tgMessageId: msg.message_id,
        fromUserId: String(cb.from.id),
      };
    }
    
    if (msg) {
      return {
        kind: 'callback_query',
        callbackQueryId: cb.id,
        callbackData: cb.data || '',
        messageThreadId: undefined,
        supergroupId: msg.chat.id,
        tgMessageId: msg.message_id,
        fromUserId: String(cb.from.id),
      };
    }
  }

  
  if (update.message && update.message.message_thread_id) {
    const msg = update.message;
    const cmdText = msg.text || '';
    if (cmdText.startsWith('/send') || cmdText === '/regen' || cmdText.startsWith('/edit ')) {
      return {
        kind: 'support_command',
        text: cmdText,
        messageThreadId: msg.message_thread_id,
        supergroupId: msg.chat.id,
        tgMessageId: msg.message_id,
        fromUserId: String(msg.from.id),
      };
    }
    const content = extractMessageContent(msg);
    return {
      kind: 'support_message',
      text: content.text,
      messageThreadId: msg.message_thread_id,
      supergroupId: msg.chat.id,
      tgMessageId: msg.message_id,
      fromUserId: String(msg.from.id),
      hasAttachment: content.hasAttachment,
      attachmentType: content.attachmentType,
      fileId: content.fileId,
      attachmentFileName: content.attachmentFileName,
      stickerEmoji: content.stickerEmoji,
    };
  }

  if (update.message && update.message.chat.type === 'private') {
    const msg = update.message;
    const content = extractMessageContent(msg);
    
    
    if (content.hasAttachment && !content.text) {
      return {
        kind: 'client_attachment_without_text',
        userId: String(msg.from.id),
        clientChatId: msg.chat.id,
        text: '',
        tgMessageId: msg.message_id,
        displayName: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
        hasAttachment: true,
        attachmentType: content.attachmentType,
        fileId: content.fileId,
        attachmentFileName: content.attachmentFileName,
        stickerEmoji: content.stickerEmoji,
        isEdited: false,
      };
    }
    
    return {
      kind: 'client_message',
      userId: String(msg.from.id),
      clientChatId: msg.chat.id,
      text: content.text,
      tgMessageId: msg.message_id,
      displayName: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim(),
      hasAttachment: content.hasAttachment,
      attachmentType: content.attachmentType,
      fileId: content.fileId,
      attachmentFileName: content.attachmentFileName,
      stickerEmoji: content.stickerEmoji,
      isEdited: false,
    };
  }

  return { kind: 'ignore' };
}
