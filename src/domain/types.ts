  first_client_question_topic_message_id?: number | null;
  lead_supergroup_id?: string | null;
  lead_topic_id?: number | null;
  lead_draft_support_message_id?: number | null;
  lead_anchor_first_id?: number | null;
  lead_anchor_last_id?: number | null;
  lead_status?: string | null;
}

export interface MessageRecord {
  id?: number;
  user_id: string;
  role: Role;
  text: string;
  ts: number;
  tg_message_id?: number;
  meta?: string;
}

export interface Suggestion {
  id?: number;
  user_id: string;
  topic_id: number;
  suggestion_text: string; 
  ru_text?: string;
  client_text?: string;
  lang?: string;
  ts: number;
  state: SuggestionState;
  support_message_id: number;
}

export interface QueueMessage {
  send(body: any, options?: { contentType?: string; delaySeconds?: number }): Promise<void>;
}

export interface MessageBatch<T = any> {
  messages: QueueMessageItem<T>[];
}

export interface QueueMessageItem<T = any> {
  id: string;
  body: T;
  ack(): void;
  retry(): void;
}

export interface Env {
  DB: D1Database;
  AI: any; 
  TELEGRAM_BOT_TOKEN: string;
  BUSINESS_CONNECTION_ID?: string;
  SUPERGROUP_ID: string;
  LEADS_SUPERGROUP_ID?: string;
  MODEL: string;
  INGEST_TOKEN?: string;
  LEADS_INGEST_TOKEN?: string;
  AUTORAG_NAME?: string; 
  LEAD_AI_ENABLED?: string;
  LEAD_AI_TIMEOUT_MS?: string;
  WEBHOOK_SECRET?: string; 
  RATING_QUEUE?: QueueMessage; 
  
  TG_LOG_CHANNEL_ID?: string;
  TG_LOG_BOT_TOKEN?: string;
  LOG_HEARTBEAT_EVERY_HOURS?: string | number;
  LOG_ERRORS_ENABLED?: string;
  LOG_HEARTBEAT_ENABLED?: string;
  LOG_R2_LEARN_TO_TG?: string;
  LOG_MIN_LEVEL?: string;
  WORKER_VERSION?: string;
  INTERNAL_API_TOKEN?: string;
  COLLECTOR_CHAT_IDS?: string;
  WEBCHAT_ALLOWED_ORIGINS?: string;
  attachmentFileName?: string;
