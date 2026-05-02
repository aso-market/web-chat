
import { StorageClient } from '../storage/d1';
import { TelegramApi } from './api';

export async function getOrCreateTopicForUser(
  storage: StorageClient,
  api: TelegramApi,
  supergroupId: number | string,
  userId: string,
  displayName: string
): Promise<number> {
  const conv = await storage.getConversation(userId);
  if (conv) return conv.topic_id;

  console.log(`Creating new topic for user ${userId} (${displayName})`);
  const { topicId } = await api.createForumTopic(supergroupId, displayName || `Client ${userId}`);
  
  await storage.upsertConversation(userId, Number(supergroupId), topicId, Date.now());
  return topicId;
}
