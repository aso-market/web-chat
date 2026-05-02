import { Env, MessageBatch } from '../../domain/types';
import { TelegramApi } from '../../telegram/api';
import { StorageClient } from '../../storage/d1';
import { detectLanguage } from '../../utils/detect-lang';

export interface RatingQueueMessage {
  topicId: number;
  userId: string;
  supergroupId: string;
}

export async function handleRatingQueue(
  batch: MessageBatch,
  env: Env
): Promise<void> {
  console.log(`[RATING_QUEUE] Starting processing, batch size: ${batch.messages.length}`);
  
  const storage = new StorageClient(env.DB);
  const api = new TelegramApi(env.TELEGRAM_BOT_TOKEN);
  const supergroupId = env.SUPERGROUP_ID;

  try {
    await storage.logDebug('rating_queue_batch_received', JSON.stringify({
      batchSize: batch.messages.length,
      messageIds: batch.messages.map(m => m.id)
    }));
  } catch (logErr: any) {
    console.error('[RATING_QUEUE] Failed to log batch_received:', logErr);
    
  }

  for (const message of batch.messages) {
    try {
      const body = message.body as RatingQueueMessage;
      const { topicId, userId, supergroupId: msgSupergroupId } = body;
      
      await storage.logDebug('rating_queue_processing', JSON.stringify({
        messageId: message.id,
        topicId,
        userId,
        supergroupId: msgSupergroupId
      }));

     
      if (String(msgSupergroupId) !== String(supergroupId)) {
        await storage.logDebug('rating_queue_wrong_group', JSON.stringify({
          expected: supergroupId,
          got: msgSupergroupId,
          topicId
        }));
        message.ack();
        continue;
      }

      
      const conv = await storage.getConversationByTopic(topicId);
      if (!conv) {
        await storage.logDebug('rating_queue_no_conv', JSON.stringify({ topicId }));
        message.ack();
        continue;
      }

      
      if (conv.rating_status === 'sent' || conv.rating_status === 'rated') {
        await storage.logDebug('rating_queue_already_handled', JSON.stringify({
          topicId,
          status: conv.rating_status
        }));
        message.ack();
        continue;
      }

      
      if (conv.status !== 'closed') {
        await storage.logDebug('rating_queue_not_closed', JSON.stringify({
          topicId,
          status: conv.status
        }));
        message.ack();
        continue;
      }

      
      let clientChatId: string | number = userId;
      let businessConnectionId: string | undefined = undefined;
      let clientLang = 'en'; 
      
      try {
        const lastMessages = await storage.getLastMessages(userId, 20);
        let lastClientMsg: { text: string } | null = null;
        for (let i = lastMessages.length - 1; i >= 0; i--) {
          const msg = lastMessages[i];
          if (msg.role !== 'client' && msg.role !== 'client_edit') continue;
          if (!lastClientMsg) lastClientMsg = msg;
          if (msg.meta) {
            try {
              const meta = JSON.parse(msg.meta) as { business_connection_id?: string };
              if (meta.business_connection_id) {
                businessConnectionId = meta.business_connection_id;
                clientChatId = userId;
                break;
              }
