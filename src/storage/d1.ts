
import { Env, Conversation, MessageRecord, Role, Suggestion, SuggestionState, D1Database, Rating } from '../domain/types';

export class StorageClient {
  constructor(private db: D1Database) {}

  async getConversation(userId: string): Promise<Conversation | null> {
    return await this.db
      .prepare('SELECT * FROM conversations WHERE user_id = ?')
      .bind(userId)
      .first<Conversation>();
  }

  async getConversationByTopic(topicId: number): Promise<Conversation | null> {
    const result = await this.db
      .prepare('SELECT * FROM conversations WHERE topic_id = ?')
      .bind(topicId)
      .first<Conversation>();
    
    
    if (result) {
      result.is_editing = result.is_editing === 1 ? 1 : 0;
    }
    
    return result;
  }

  async findWebConversationByConversationId(conversationId: string): Promise<Conversation | null> {
    const result = await this.db
      .prepare(`
        SELECT * FROM conversations
        WHERE user_id LIKE ?
        ORDER BY last_activity DESC
        LIMIT 1
      `)
      .bind(`web:%:${conversationId}`)
      .first<Conversation>();

    if (result) {
      result.is_editing = result.is_editing === 1 ? 1 : 0;
    }

    return result;
  }

  async upsertConversation(userId: string, supergroupId: number, topicId: number, lastActivity: number) {
    try {
      await this.db
        .prepare(`
          INSERT INTO conversations (user_id, supergroup_id, topic_id, last_activity, status, is_editing)
          VALUES (?, ?, ?, ?, 'active', 0)
          ON CONFLICT(user_id) DO UPDATE SET
            last_activity = excluded.last_activity,
            topic_id = excluded.topic_id
        `)
        .bind(userId, supergroupId, topicId, lastActivity)
        .run();
    } catch (err: any) {
      
      if (err?.message?.includes('no such column: is_editing')) {
        await this.db
          .prepare(`
            INSERT INTO conversations (user_id, supergroup_id, topic_id, last_activity, status)
            VALUES (?, ?, ?, ?, 'active')
            ON CONFLICT(user_id) DO UPDATE SET
              last_activity = excluded.last_activity,
              topic_id = excluded.topic_id
          `)
          .bind(userId, supergroupId, topicId, lastActivity)
          .run();
      } else {
        throw err;
      }
    }
  }

  async updateConversationContext(
    userId: string,
    lastClientText: string | null,
    lastClientLang: string | null,
    conversationSummary: string | null,
    intent: string | null
  ) {
    try {
      await this.db
        .prepare(`
          UPDATE conversations 
          SET last_client_text = ?, last_client_lang = ?, conversation_summary = ?, intent = ?
          WHERE user_id = ?
        `)
        .bind(lastClientText, lastClientLang, conversationSummary, intent, userId)
        .run();
    } catch (err: any) {
      
      if (err?.message?.includes('no such column')) {
        console.warn('Conversation context columns not found, migration 007_conversation_context.sql may not be applied');
        return;
      }
      throw err;
    }
  }

  async getLeadContactedProjects(userId: string): Promise<Record<string, boolean>> {
    try {
      const row = await this.db
        .prepare('SELECT lead_contacted_projects FROM conversations WHERE user_id = ?')
        .bind(userId)
        .first<{ lead_contacted_projects?: string | null }>();
      if (!row?.lead_contacted_projects) return {};
      const parsed = JSON.parse(row.lead_contacted_projects || '{}');
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return {};
      throw err;
    }
  }

  async setLeadContacted(userId: string, projectId: string): Promise<void> {
    try {
      const current = await this.getLeadContactedProjects(userId);
      const next = { ...current, [projectId]: true };
      await this.db
        .prepare('UPDATE conversations SET lead_contacted_projects = ? WHERE user_id = ?')
        .bind(JSON.stringify(next), userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  
  
  async getLeadState(userId: string): Promise<{
    lead_supergroup_id?: string | null;
    lead_topic_id?: number | null;
    lead_draft_support_message_id?: number | null;
    lead_anchor_first_id?: number | null;
    lead_anchor_last_id?: number | null;
    lead_status?: string | null;
  }> {
    try {
      const row = await this.db
        .prepare('SELECT lead_supergroup_id, lead_topic_id, lead_draft_support_message_id, lead_anchor_first_id, lead_anchor_last_id, lead_status FROM conversations WHERE user_id = ?')
        .bind(userId)
        .first<{
          lead_supergroup_id?: string | null;
          lead_topic_id?: number | null;
          lead_draft_support_message_id?: number | null;
          lead_anchor_first_id?: number | null;
          lead_anchor_last_id?: number | null;
          lead_status?: string | null;
        }>();
      return row || {};
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return {};
      throw err;
    }
  }

  async setLeadState(userId: string, partial: {
    lead_supergroup_id?: string | null;
    lead_topic_id?: number | null;
    lead_draft_support_message_id?: number | null;
    lead_anchor_first_id?: number | null;
    lead_anchor_last_id?: number | null;
    lead_status?: string | null;
  }): Promise<void> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      
      if ('lead_supergroup_id' in partial) {
        updates.push('lead_supergroup_id = ?');
        values.push(partial.lead_supergroup_id);
      }
      if ('lead_topic_id' in partial) {
        updates.push('lead_topic_id = ?');
        values.push(partial.lead_topic_id);
      }
      if ('lead_draft_support_message_id' in partial) {
        updates.push('lead_draft_support_message_id = ?');
        values.push(partial.lead_draft_support_message_id);
      }
      if ('lead_anchor_first_id' in partial) {
        updates.push('lead_anchor_first_id = ?');
        values.push(partial.lead_anchor_first_id);
      }
      if ('lead_anchor_last_id' in partial) {
        updates.push('lead_anchor_last_id = ?');
        values.push(partial.lead_anchor_last_id);
      }
      if ('lead_status' in partial) {
        updates.push('lead_status = ?');
        values.push(partial.lead_status);
      }
      
      if (updates.length === 0) return;
      
      values.push(userId);
      await this.db
        .prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE user_id = ?`)
        .bind(...values)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  async setLeadDraftSupportMessageId(userId: string, messageId: number): Promise<void> {
    try {
      await this.db
        .prepare('UPDATE conversations SET lead_draft_support_message_id = ? WHERE user_id = ?')
        .bind(messageId, userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  async setLeadAnchors(userId: string, firstId: number, lastId: number): Promise<void> {
    try {
      await this.db
        .prepare('UPDATE conversations SET lead_anchor_first_id = ?, lead_anchor_last_id = ? WHERE user_id = ?')
        .bind(firstId, lastId, userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  async clearLeadDraftAfterSend(userId: string): Promise<void> {
    try {
      await this.db
        .prepare(
          'UPDATE conversations SET lead_draft_support_message_id = NULL, lead_anchor_first_id = NULL, lead_anchor_last_id = NULL WHERE user_id = ?'
        )
        .bind(userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  async setEditingState(topicId: number, isEditing: boolean) {
    try {
      const result = await this.db
        .prepare('UPDATE conversations SET is_editing = ? WHERE topic_id = ?')
        .bind(isEditing ? 1 : 0, topicId)
        .run();
      const changes = (result?.meta as { changes?: number })?.changes ?? -1;
      if (changes === 0) {
        await this.logDebug('set_editing_no_row', `topicId=${topicId}`);
      }
      return result;
    } catch (err: any) {
      if (err?.message?.includes('no such column: is_editing')) {
        await this.logDebug('is_editing_column_missing', 'migration 005 not applied');
        return null;
      }
      throw err;
    }
  }
  
  
  async isInEditMode(topicId: number): Promise<boolean> {
    try {
      const result = await this.db
        .prepare('SELECT is_editing FROM conversations WHERE topic_id = ?')
        .bind(topicId)
        .first<{ is_editing?: number }>();
      
      return result?.is_editing === 1;
    } catch {
      
      return false;
    }
  }

  async closeConversation(topicId: number): Promise<{ alreadyScheduled: boolean }> {
    const now = Date.now();
    try {
      
      
      const conv = await this.getConversationByTopic(topicId);
      if (conv) {
        const oneHourAgo = now - (60 * 60 * 1000);
        const wasClosedRecently = conv.closed_at && conv.closed_at > oneHourAgo;
        const ratingAlreadyHandled = conv.rating_status === 'scheduled' || conv.rating_status === 'sent' || conv.rating_status === 'rated';
        
        
        if (ratingAlreadyHandled && wasClosedRecently) {
          return { alreadyScheduled: true };
        }
        
      }

      await this.db
        .prepare("UPDATE conversations SET status = 'closed', is_editing = 0, closed_at = ?, rating_status = 'scheduled' WHERE topic_id = ?")
        .bind(now, topicId)
        .run();
      return { alreadyScheduled: false };
    } catch (err: any) {
      
      if (err?.message?.includes('no such column')) {
        try {
          await this.db
            .prepare("UPDATE conversations SET status = 'closed', closed_at = ? WHERE topic_id = ?")
            .bind(now, topicId)
            .run();
          return { alreadyScheduled: false };
        } catch (e: any) {
          
          await this.db
            .prepare("UPDATE conversations SET status = 'closed' WHERE topic_id = ?")
            .bind(topicId)
            .run();
          return { alreadyScheduled: false };
        }
      }
      throw err;
    }
  }

  async reopenConversation(topicId: number) {
    try {
      
      await this.db
        .prepare("UPDATE conversations SET status = 'active', rating_status = NULL, closed_at = NULL WHERE topic_id = ?")
        .bind(topicId)
        .run();
    } catch (err: any) {
      
      if (err?.message?.includes('no such column')) {
        try {
          await this.db
            .prepare("UPDATE conversations SET status = 'active' WHERE topic_id = ?")
            .bind(topicId)
            .run();
        } catch (e: any) {
          if (e?.message?.includes('no such column: status')) {
            console.warn('status column not found, migration may not be applied');
            return;
          }
          throw e;
        }
        return;
      }
      throw err;
    }
  }

  async getLastClientMessageForUser(userId: string): Promise<MessageRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM messages WHERE user_id = ? AND role IN ('client', 'client_edit') ORDER BY id DESC LIMIT 1`
      )
      .bind(userId)
      .first<MessageRecord>();
    return row ?? null;
  }

  async insertLeadTopicCallbackToken(token: string, storageUserId: string, createdAt: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO lead_topic_callback_tokens (token, storage_user_id, created_at, used_at)
         VALUES (?, ?, ?, NULL)`
      )
      .bind(token, storageUserId, createdAt)
      .run();
  }

  async upsertBusinessConnection(accountId: string, connectionId: string): Promise<void> {
    try {
      await this.db
        .prepare(
          `INSERT INTO business_connections (account_id, connection_id)
           VALUES (?, ?)
           ON CONFLICT(account_id) DO UPDATE SET connection_id = excluded.connection_id`
        )
        .bind(accountId, connectionId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such table: business_connections')) {
        console.warn('business_connections table not found; apply migration 016_business_connections.sql');
        return;
      }
      throw err;
    }
  }

  async getAnyBusinessConnection(): Promise<string | null> {
    try {
      const row = await this.db
        .prepare('SELECT connection_id FROM business_connections ORDER BY rowid DESC LIMIT 1')
        .first<{ connection_id?: string }>();
      return row?.connection_id ?? null;
    } catch (err: any) {
      if (err?.message?.includes('no such table: business_connections')) {
        return null;
      }
      throw err;
    }
  }

  async claimSupportTopicMediaForward(supergroupId: string, messageId: number): Promise<boolean> {
    try {
      await this.db
        .prepare(
          `INSERT INTO support_topic_media_forward (supergroup_id, message_id, created_at) VALUES (?, ?, ?)`
        )
        .bind(String(supergroupId), messageId, Date.now())
        .run();
      return true;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (/UNIQUE constraint|unique constraint|SQLITE_CONSTRAINT_UNIQUE|constraint failed/i.test(msg)) {
        return false;
      }
      if (msg.includes('no such table')) {
        return true;
      }
      throw err;
    }
  }

  async releaseSupportTopicMediaForward(supergroupId: string, messageId: number): Promise<void> {
    try {
      await this.db
        .prepare(`DELETE FROM support_topic_media_forward WHERE supergroup_id = ? AND message_id = ?`)
        .bind(String(supergroupId), messageId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such table')) return;
      throw err;
    }
  }

  async claimTelegramWebhookUpdate(updateId: number): Promise<boolean> {
    try {
      await this.db
        .prepare(`INSERT INTO telegram_webhook_dedup (update_id, created_at) VALUES (?, ?)`)
        .bind(updateId, Date.now())
        .run();
      return true;
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (/UNIQUE constraint|unique constraint|SQLITE_CONSTRAINT_UNIQUE|constraint failed/i.test(msg)) {
        return false;
      }
      if (msg.includes('no such table')) {
        return true;
      }
      throw err;
    }
  }

  async releaseTelegramWebhookUpdate(updateId: number): Promise<void> {
    try {
      await this.db.prepare(`DELETE FROM telegram_webhook_dedup WHERE update_id = ?`).bind(updateId).run();
    } catch (err: any) {
      if (err?.message?.includes('no such table')) return;
      throw err;
    }
  }

  async getClientMessagesInIdRange(
    userId: string,
    fromId: number,
    toId: number
  ): Promise<MessageRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM messages WHERE user_id = ? AND role IN ('client', 'client_edit') AND id >= ? AND id <= ? ORDER BY id ASC`
      )
      .bind(userId, fromId, toId)
      .all<MessageRecord>();
    return results;
  }

  async getLastRealSupportReplyId(userId: string): Promise<number | null> {
    const row = await this.db
      .prepare(`SELECT id FROM messages WHERE user_id = ? AND role = 'support' ORDER BY id DESC LIMIT 1`)
      .bind(userId)
      .first<{ id?: number }>();
    return typeof row?.id === 'number' ? row.id : null;
  }

  async getMessagesBeforeId(
    userId: string,
    beforeId: number,
    limit: number = 40
  ): Promise<MessageRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM messages WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
      )
      .bind(userId, beforeId, limit)
      .all<MessageRecord>();
    return results.reverse();
  }

  async deleteMessagesForUser(userId: string): Promise<void> {
    await this.db.prepare('DELETE FROM messages WHERE user_id = ?').bind(userId).run();
  }

  async getLastSuggestionByTopic(topicId: number): Promise<Suggestion | null> {
    return await this.db
      .prepare('SELECT * FROM suggestions WHERE topic_id = ? ORDER BY ts DESC LIMIT 1')
      .bind(topicId)
      .first<Suggestion>();
  }

  async getMessageByTgMessageId(userId: string, tgMessageId: number): Promise<MessageRecord | null> {
    try {
      return await this.db
        .prepare('SELECT * FROM messages WHERE user_id = ? AND tg_message_id = ? ORDER BY ts DESC LIMIT 1')
        .bind(userId, tgMessageId)
        .first<MessageRecord>();
    } catch (err: any) {
      console.error('Error getting message by tg_message_id:', err);
      return null;
    }
  }

  async updateMessageTextByTgMessageId(
    userId: string,
    tgMessageId: number,
    newText: string,
    newMeta?: string | null
  ): Promise<boolean> {
    try {
      if (newMeta !== undefined) {
        const result = await this.db
          .prepare('UPDATE messages SET text = ?, meta = ? WHERE user_id = ? AND tg_message_id = ?')
          .bind(newText, newMeta || null, userId, tgMessageId)
          .run();
        return (result.meta.changes || 0) > 0;
      } else {
        const result = await this.db
          .prepare('UPDATE messages SET text = ? WHERE user_id = ? AND tg_message_id = ?')
          .bind(newText, userId, tgMessageId)
          .run();
        return (result.meta.changes || 0) > 0;
      }
    } catch (err: any) {
      console.error('Error updating message text by tg_message_id:', err);
      return false;
    }
  }

  async saveSuggestion(userId: string, topicId: number, text: string, ts: number, supportMessageId: number) {
    
    await this.db
      .prepare(`
        INSERT INTO suggestions (user_id, topic_id, suggestion_text, ts, state, support_message_id)
        VALUES (?, ?, ?, ?, 'suggested', ?)
      `)
      .bind(userId, topicId, text, ts, supportMessageId)
      .run();
  }

  async saveBilingualSuggestion(
    userId: string,
    topicId: number,
    ruText: string,
    clientText: string,
    lang: string,
    ts: number,
    supportMessageId: number
  ) {
    try {
      await this.db
        .prepare(`
          INSERT INTO suggestions (user_id, topic_id, suggestion_text, ru_text, client_text, lang, ts, state, support_message_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'suggested', ?)
        `)
        .bind(userId, topicId, clientText, ruText, clientText, lang, ts, supportMessageId)
        .run();
    } catch (err: any) {
      
      const errMsg = String(err?.message || err || '');
      if (errMsg.includes('no such column') || errMsg.includes('ru_text') || errMsg.includes('client_text') || errMsg.includes('lang')) {
        console.warn('Bilingual columns not found, using legacy format. Please apply migration 005_bilingual_drafts.sql');
        try {
          await this.saveSuggestion(userId, topicId, clientText, ts, supportMessageId);
          
          return;
        } catch (legacyErr: any) {
          console.error('Legacy save also failed:', legacyErr);
          throw new Error(`Database error: migration may be needed. Legacy save failed: ${legacyErr?.message || legacyErr}`);
        }
      }
      console.error('saveBilingualSuggestion error:', err);
      throw err;
    }
  }

  async saveUnifiedDraftSuggestion(
    userId: string,
    topicId: number,
    ruText: string,
    suggestionText: string,
    clientTextAggregatedRu: string,
    lang: string,
    ts: number,
    supportMessageId: number
  ): Promise<void> {
    try {
      await this.db
        .prepare(`
          INSERT INTO suggestions (user_id, topic_id, suggestion_text, ru_text, client_text, lang, ts, state, support_message_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'suggested', ?)
        `)
        .bind(userId, topicId, suggestionText, ruText, clientTextAggregatedRu, lang, ts, supportMessageId)
        .run();
    } catch (err: any) {
      const errMsg = String(err?.message || err || '');
      if (errMsg.includes('no such column')) {
        await this.saveSuggestion(userId, topicId, suggestionText, ts, supportMessageId);
        return;
      }
      throw err;
    }
  }

  async getLastSuggestion(userId: string): Promise<Suggestion | null> {
    return await this.db
      .prepare('SELECT * FROM suggestions WHERE user_id = ? ORDER BY ts DESC LIMIT 1')
      .bind(userId)
      .first<Suggestion>();
  }

  async getLastSuggestedSuggestion(userId: string): Promise<Suggestion | null> {
    return await this.db
      .prepare("SELECT * FROM suggestions WHERE user_id = ? AND state = 'suggested' ORDER BY ts DESC LIMIT 1")
      .bind(userId)
      .first<Suggestion>();
  }

  async updateSuggestionText(id: number, text: string, ts: number) {
    
    await this.db
      .prepare('UPDATE suggestions SET suggestion_text = ?, ts = ? WHERE id = ?')
      .bind(text, ts, id)
      .run();
  }

  async updateBilingualSuggestion(
    id: number,
    ruText: string,
    clientText: string,
    lang: string,
    ts: number
  ) {
    try {
      await this.db
        .prepare(`
          UPDATE suggestions 
          SET suggestion_text = ?, ru_text = ?, client_text = ?, lang = ?, ts = ?
          WHERE id = ?
        `)
        .bind(clientText, ruText, clientText, lang, ts, id)
        .run();
    } catch (err: any) {
      
      if (err?.message?.includes('no such column')) {
        console.warn('Bilingual columns not found, using legacy format');
        await this.updateSuggestionText(id, clientText, ts);
        return;
      }
      throw err;
    }
  }

  async updateSuggestionByTopic(topicId: number, ruText: string, clientText: string, lang: string, ts: number) {
    await this.db
      .prepare(`
        UPDATE suggestions 
        SET suggestion_text = ?, ru_text = ?, client_text = ?, lang = ?, ts = ?
        WHERE id = (SELECT id FROM suggestions WHERE topic_id = ? AND state = 'suggested' ORDER BY ts DESC LIMIT 1)
      `)
      .bind(clientText, ruText, clientText, lang, ts, topicId)
      .run();
  }

  async updateUnifiedDraftByTopic(
    topicId: number,
    ruText: string,
    suggestionText: string,
    clientTextAggregatedRu: string,
    lang: string,
    ts: number
  ): Promise<void> {
    await this.db
      .prepare(`
        UPDATE suggestions 
        SET suggestion_text = ?, ru_text = ?, client_text = ?, lang = ?, ts = ?
        WHERE id = (SELECT id FROM suggestions WHERE topic_id = ? AND state = 'suggested' ORDER BY ts DESC LIMIT 1)
      `)
      .bind(suggestionText, ruText, clientTextAggregatedRu, lang, ts, topicId)
      .run();
  }

  async updateSuggestionClientTextByTopic(topicId: number, clientText: string): Promise<void> {
    try {
      await this.db
        .prepare(`
          UPDATE suggestions SET client_text = ?
          WHERE id = (SELECT id FROM suggestions WHERE topic_id = ? AND state = 'suggested' ORDER BY ts DESC LIMIT 1)
        `)
        .bind(clientText, topicId)
        .run();
    } catch (e: any) {
      try {
        await this.logDebug('update_suggestion_client_text_skip', String(e?.message ?? e));
  async updateLastSuggestedSupportMessageIdByTopic(topicId: number, supportMessageId: number): Promise<void> {
    try {
      await this.db
        .prepare(`
          UPDATE suggestions SET support_message_id = ?
          WHERE id = (SELECT id FROM suggestions WHERE topic_id = ? AND state = 'suggested' ORDER BY ts DESC LIMIT 1)
        `)
        .bind(supportMessageId, topicId)
        .run();
    } catch (e: any) {
      try {
        await this.logDebug('update_suggestion_support_msg_id_skip', String(e?.message ?? e));
  async moveLastSuggestedToTopic(userId: string, newTopicId: number): Promise<void> {
    try {
      await this.db
        .prepare(`
          UPDATE suggestions SET topic_id = ?
          WHERE id = (SELECT id FROM suggestions WHERE user_id = ? AND state = 'suggested' ORDER BY ts DESC LIMIT 1)
        `)
        .bind(newTopicId, userId)
        .run();
    } catch (e: any) {
      try {
        await this.logDebug('move_suggested_topic_skip', String(e?.message ?? e));
  async updateSuggestionForEdit(
    id: number,
    ruText: string,
    suggestionText: string,
    ts: number
  ): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE suggestions SET ru_text = ?, suggestion_text = ?, ts = ? WHERE id = ?`
        )
        .bind(ruText, suggestionText, ts, id)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) {
        await this.updateSuggestionText(id, suggestionText, ts);
        return;
      }
      throw err;
    }
  }

  async markSuggestionSent(id: number, state: SuggestionState) {
    await this.db
      .prepare('UPDATE suggestions SET state = ?, locked_until = NULL WHERE id = ?')
      .bind(state, id)
      .run();
  }

  async tryLockSuggestion(id: number, lockDurationSeconds: number = 10): Promise<boolean> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const lockUntil = now + lockDurationSeconds;
      
      
      const result = await this.db
        .prepare(`
          UPDATE suggestions 
          SET locked_until = ? 
          WHERE id = ? AND (locked_until IS NULL OR locked_until < ?)
        `)
        .bind(lockUntil, id, now)
        .run();
      
      return (result.meta.changes || 0) > 0;
    } catch (err: any) {
      
      if (err?.message?.includes('no such column: locked_until')) {
        console.warn('locked_until column not found, migration 008 may not be applied');
        return true; 
      }
      console.error('Error locking suggestion:', err);
      return false;
    }
  }

  async unlockSuggestion(id: number): Promise<void> {
    try {
      await this.db
        .prepare('UPDATE suggestions SET locked_until = NULL WHERE id = ?')
        .bind(id)
        .run();
    } catch (err: any) {
      
      if (err?.message?.includes('no such column: locked_until')) {
        return;
      }
      console.error('Error unlocking suggestion:', err);
    }
  }

  async isSuggestionLocked(id: number): Promise<boolean> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const result = await this.db
        .prepare('SELECT locked_until FROM suggestions WHERE id = ?')
        .bind(id)
        .first<{ locked_until: number | null }>();
      
      if (!result || !result.locked_until) {
        return false;
      }
      
      
      return result.locked_until > now;
    } catch (err: any) {
      
      if (err?.message?.includes('no such column: locked_until')) {
        return false;
      }
      console.error('Error checking suggestion lock:', err);
      return false;
    }
  }

  async touchLastActivity(userId: string, ts: number) {
    await this.db
      .prepare('UPDATE conversations SET last_activity = ? WHERE user_id = ?')
      .bind(ts, userId)
      .run();
  }

  async setDraftAnchorsById(userId: string, anchorId: number, lastId: number): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE conversations SET draft_anchor_message_id = ?, draft_last_included_message_id = ? WHERE user_id = ?`
        )
        .bind(anchorId, lastId, userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  async setFirstClientQuestionTopicMessageId(userId: string, topicMessageId: number): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE conversations SET first_client_question_topic_message_id = ? WHERE user_id = ?`
        )
        .bind(topicMessageId, userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  async updateDraftLastIncludedId(userId: string, lastId: number): Promise<void> {
    try {
      await this.db
        .prepare(`UPDATE conversations SET draft_last_included_message_id = ? WHERE user_id = ?`)
        .bind(lastId, userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  async setDraftSupportMessageId(userId: string, messageId: number): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE conversations SET draft_support_message_id = ? WHERE user_id = ?`
        )
        .bind(messageId, userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) {
        return;
      }
      throw err;
    }
  }

  async setDraftFrozen(userId: string, frozen: 0 | 1): Promise<void> {
    try {
      await this.db
        .prepare(`UPDATE conversations SET draft_is_frozen = ? WHERE user_id = ?`)
        .bind(frozen, userId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) {
        return;
      }
      throw err;
    }
  }

  async setDraftPending(clientId: string, pending: 0 | 1): Promise<void> {
    try {
      await this.db
        .prepare(`UPDATE conversations SET draft_has_pending = ? WHERE user_id = ?`)
        .bind(pending, clientId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  async clearDraftAfterSend(clientId: string): Promise<void> {
    try {
      await this.db
        .prepare(
          `UPDATE conversations SET draft_anchor_message_id = NULL, draft_last_included_message_id = NULL, draft_support_message_id = NULL, draft_is_frozen = 0, draft_has_pending = 0, is_editing = 0, first_client_question_topic_message_id = NULL WHERE user_id = ?`
        )
        .bind(clientId)
        .run();
    } catch (err: any) {
      if (err?.message?.includes('no such column')) return;
      throw err;
    }
  }

  
  
  

  async logDebug(event: string, data?: string | null) {
    const ts = Math.floor(Date.now() / 1000);
    const ev = String(event || '').slice(0, 100);
    let payload: string | null = data != null ? String(data) : null;
    if (payload && payload.length > 1500) {
      payload = payload.slice(0, 1500);
    }

    try {
      await this.db
        .prepare(
          'INSERT INTO debug_events (ts, event, data) VALUES (?, ?, ?)'
        )
        .bind(ts, ev, payload)
        .run();
    } catch {
      
    }
  }

  async getDebugRecent(limit: number = 50): Promise<
    { id: number; ts: number; event: string; data: string | null }[]
  > {
    const { results } = await this.db
      .prepare(
        'SELECT id, ts, event, data FROM debug_events ORDER BY id DESC LIMIT ?'
      )
      .bind(limit)
      .all<{
        id: number;
        ts: number;
        event: string;
        data: string | null;
      }>();

    return results;
  }

  
  
  

  async markRatingSent(topicId: number, messageId: number): Promise<void> {
    try {
      await this.db
        .prepare("UPDATE conversations SET rating_status = 'sent', rating_message_id = ? WHERE topic_id = ?")
        .bind(messageId, topicId)
        .run();
    } catch (err: any) {
      
      if (err?.message?.includes('no such column')) {
        console.warn('Rating columns not found, migration may not be applied');
        return;
      }
      throw err;
    }
  }

  async saveRating(
    conversationId: number,
    userId: string,
    clientChatId: string | null,
    score: number,
    ratedByUserId: string,
    ratingMessageId: number
  ): Promise<number> {
    const now = Date.now();
    try {
      const result = await this.db
        .prepare(`
          INSERT INTO ratings (conversation_id, user_id, client_chat_id, score, rated_by_user_id, rated_at, rating_message_id, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'rated', ?)
        `)
        .bind(conversationId, userId, clientChatId, score, ratedByUserId, now, ratingMessageId, now)
        .run();
      
      
      await this.db
        .prepare("UPDATE conversations SET rating_status = 'rated' WHERE topic_id = ?")
        .bind(conversationId)
        .run();
      
      return result.meta.last_row_id || 0;
    } catch (err: any) {
      console.error('Error saving rating:', err);
      throw err;
    }
  }

  async getRatingByMessageId(ratingMessageId: number): Promise<Rating | null> {
    try {
      return await this.db
        .prepare('SELECT * FROM ratings WHERE rating_message_id = ? LIMIT 1')
        .bind(ratingMessageId)
        .first<Rating>();
    } catch (err: any) {
      
      if (err?.message?.includes('no such table')) {
        return null;
      }
      throw err;
    }
  }

  async getRatingByConversationId(conversationId: number): Promise<Rating | null> {
    try {
      return await this.db
        .prepare('SELECT * FROM ratings WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
        .bind(conversationId)
        .first<Rating>();
    } catch (err: any) {
      
      if (err?.message?.includes('no such table')) {
        return null;
      }
      throw err;
    }
  }

  async getLastDraftByTopic(topicId: number): Promise<{ suggestion: Suggestion | null; conversation: Conversation | null }> {
    try {
      const conv = await this.getConversationByTopic(topicId);
      if (!conv) {
        return { suggestion: null, conversation: null };
      }
      
      const suggestion = await this.getLastSuggestedSuggestion(conv.user_id);
      return { suggestion, conversation: conv };
    } catch (err: any) {
      console.error('Error getting last draft by topic:', err);
      return { suggestion: null, conversation: null };
    }
  }

  
  
  

  async insertQaItem(
    lang: string,
    question: string,
    answer: string,
    questionNorm: string,
    scope: string = 'support'
  ): Promise<number> {
    try {
      const result = await this.db
        .prepare(`
          INSERT INTO qa_items (lang, question, answer, question_norm, scope, created_at)
          VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
        `)
        .bind(lang, question, answer, questionNorm, scope)
        .run();
      
      return result.meta.last_row_id || 0;
    } catch (err: any) {
      
      if (err?.message?.includes('no such table')) {
        console.warn('qa_items table not found, migration 005_qa.sql may not be applied');
        throw new Error('QA table not found. Please apply migration 005_qa.sql');
      }
      throw err;
    }
  }

  async upsertQaItemScoped(
    lang: string,
    question: string,
    answer: string,
    questionNorm: string,
    scope: string
  ): Promise<void> {
    try {
      const existing = await this.db
        .prepare('SELECT id FROM qa_items WHERE scope = ? AND lang = ? AND question_norm = ? LIMIT 1')
        .bind(scope, lang, questionNorm)
        .first<{ id: number }>();
      if (existing?.id) {
        await this.db
          .prepare(
            `UPDATE qa_items SET question = ?, answer = ?, created_at = CAST(strftime('%s','now') AS INTEGER) WHERE id = ?`
          )
          .bind(question, answer, existing.id)
          .run();
        return;
      }
      await this.insertQaItem(lang, question, answer, questionNorm, scope);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such column') && msg.includes('scope')) {
        console.warn('qa_items.scope missing; apply migration 020_qa_scope.sql');
      }
      throw err;
    }
  }

  async insertOperatorTurn(
    scope: string,
    lang: string,
    userId: string,
    clientText: string,
    clientTextNorm: string,
    operatorReply: string,
    operatorReplyRu: string | null | undefined,
    anchorMessageId: number | null,
    lastMessageId: number | null
  ): Promise<number> {
    try {
      const result = await this.db
        .prepare(
          `INSERT INTO operator_turns (
            scope, lang, user_id, client_text, client_text_norm,
            operator_reply, operator_reply_ru, anchor_message_id, last_message_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))`
        )
        .bind(
          scope,
          lang,
          userId,
          clientText,
          clientTextNorm,
          operatorReply,
          operatorReplyRu ?? null,
          anchorMessageId,
          lastMessageId
        )
        .run();
      return (result.meta as { last_row_id?: number })?.last_row_id ?? 0;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such table')) {
        console.warn('operator_turns table missing; apply migration 021_operator_turns.sql');
        return 0;
      }
      throw err;
    }
  }

  async listPendingOperatorTurnsForR2(limit: number): Promise<
    Array<{
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
    }>
  > {
    try {
      const { results } = await this.db
        .prepare(
          `SELECT id, scope, lang, user_id, client_text, operator_reply, operator_reply_ru,
                  anchor_message_id, last_message_id, created_at
           FROM operator_turns
           WHERE r2_synced_at IS NULL
           ORDER BY id ASC
           LIMIT ?`
        )
        .bind(limit)
        .all<{
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
        }>();
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("no such column") && msg.includes("r2_synced_at")) {
        console.warn("operator_turns.r2_synced_at missing; apply migration 022_operator_turns_r2_sync.sql");
        return [];
      }
      if (msg.includes("no such table")) {
        return [];
      }
      throw err;
    }
  }

  async markOperatorTurnR2Synced(id: number, r2Key: string, syncedAt: number): Promise<void> {
    await this.db
      .prepare("UPDATE operator_turns SET r2_synced_at = ?, r2_key = ? WHERE id = ?")
      .bind(syncedAt, r2Key, id)
      .run();
  }

  async clearQaItems(lang: string, scope: string = 'support'): Promise<void> {
    try {
      await this.db
        .prepare('DELETE FROM qa_items WHERE lang = ? AND scope = ?')
        .bind(lang, scope)
        .run();
    } catch (err: any) {
      
      if (err?.message?.includes('no such table')) {
        console.warn('qa_items table not found, migration 005_qa.sql may not be applied');
        return;
      }
      throw err;
    }
  }

  async listQaItems(
    lang: string,
    scope: string = 'support'
  ): Promise<Array<{ id: number; lang: string; question: string; answer: string; question_norm: string }>> {
    try {
      const { results } = await this.db
        .prepare('SELECT id, lang, question, answer, question_norm FROM qa_items WHERE lang = ? AND scope = ?')
        .bind(lang, scope)
        .all<{ id: number; lang: string; question: string; answer: string; question_norm: string }>();
      
      return results;
    } catch (err: any) {
      
      if (err?.message?.includes('no such table')) {
        console.warn('qa_items table not found, migration 005_qa.sql may not be applied');
        return [];
      }
      throw err;
    }
  }

  async getQaCandidates(
    lang: string,
    scope: string = 'support'
  ): Promise<Array<{ id: number; lang: string; question: string; answer: string; question_norm: string }>> {
    type Row = { id: number; lang: string; question: string; answer: string; question_norm: string };
    const loadQa = async (l: string): Promise<Row[]> => {
      const { results } = await this.db
        .prepare('SELECT id, lang, question, answer, question_norm FROM qa_items WHERE lang = ? AND scope = ?')
        .bind(l, scope)
        .all<Row>();
      return results;
    };
    const loadTurns = async (l: string): Promise<Row[]> => {
      try {
        const { results } = await this.db
          .prepare(
            `SELECT id, lang, client_text AS question, operator_reply AS answer, client_text_norm AS question_norm
             FROM operator_turns WHERE lang = ? AND scope = ? ORDER BY created_at DESC LIMIT ?`
          )
          .bind(l, scope, StorageClient.MAX_OPERATOR_TURNS_FOR_MATCH)
          .all<{ id: number; lang: string; question: string; answer: string; question_norm: string }>();
        return results.map((r) => ({
          ...r,
          id: StorageClient.OPERATOR_TURN_ID_OFFSET + r.id,
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('no such table')) {
          return [];
        }
        throw err;
      }
    };

    try {
      let qaRows = await loadQa(lang);
      let turnRows = await loadTurns(lang);
      if (qaRows.length === 0 && lang !== 'en') {
        qaRows = await loadQa('en');
      }
      if (turnRows.length === 0 && lang !== 'en') {
        turnRows = await loadTurns('en');
      }
      return [...qaRows, ...turnRows];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such table')) {
        console.warn('qa_items table not found, migration 005_qa.sql may not be applied');
        return [];
      }
      throw err;
    }
  }

  async getQaAnswerByQuestionNorm(
    questionNorm: string,
    targetLang: string,
    scope: string = 'support'
  ): Promise<string | null> {
    try {
      const result = await this.db
        .prepare('SELECT answer FROM qa_items WHERE question_norm = ? AND lang = ? AND scope = ? LIMIT 1')
        .bind(questionNorm, targetLang, scope)
        .first<{ answer: string }>();
      
      return result?.answer || null;
    } catch (err: any) {
      
      if (err?.message?.includes('no such table')) {
        return null;
      }
      console.error('Error getting QA answer by question_norm:', err);
      return null;
    }
  }

  
  
  

  async insertLogEvent(
    createdAt: number,
    level: string,
    source: string,
    event: string,
    fingerprint: string,
    message: string,
    metaJson: string | null,
    sentToTg: number
  ): Promise<number> {
    try {
      const result = await this.db
        .prepare(
          'INSERT INTO log_events (created_at, level, source, event, fingerprint, message, meta_json, sent_to_tg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(createdAt, level, source, event, fingerprint, message, metaJson || null, sentToTg)
        .run();
      return (result?.meta as { last_row_id?: number })?.last_row_id ?? 0;
    } catch (err: any) {
      if (err?.message?.includes('no such table')) {
        return 0;
      }
      throw err;
    }
  }

  async updateLogEventSentToTg(id: number): Promise<void> {
    try {
      await this.db.prepare('UPDATE log_events SET sent_to_tg = 1 WHERE id = ?').bind(id).run();
    } catch {
      
    }
  }

