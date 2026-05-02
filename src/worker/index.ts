import { Env, MessageBatch } from '../domain/types';
import { handleTelegramWebhook } from './handlers/webhook';
import { handleAsk } from './handlers/ask';
import { handleRatingQueue } from './handlers/rating-queue';
import { handleLeadsIngest, handleLeadsIngestAnon } from './handlers/leads-ingest';
import {
  handleWebchatInit,
  handleWebchatMessages,
  handleWebchatOptions,
  handleWebchatSend,
  handleWebchatStream,
} from './handlers/webchat';
import { StorageClient } from '../storage/d1';
import { runHeartbeat, logError } from '../logging';
import { syncPendingOperatorTurnsToR2 } from '../rag/r2-learn-sync';

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

function jsonResponse(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function unauthorized() {
  return jsonResponse({ error: 'unauthorized' }, 401);
}

function parseBearerToken(authHeader: string | null): string {
  if (!authHeader) return '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

function splitJsonl(text: string): string[] {
  if (!text) return [];
  
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
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

function getWebchatCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const raw = env.WEBCHAT_ALLOWED_ORIGINS || '';
  const allowed = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
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

function webchatErrorResponse(request: Request, env: Env, status: number, code: string, details?: string): Response {
  return new Response(
    JSON.stringify({ ok: false, error: code, details: details || null }),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...getWebchatCorsHeaders(request, env),
      },
    }
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    
    if (url.pathname.startsWith('/api/webchat/') && request.method === 'OPTIONS') {
      return handleWebchatOptions(request, env);
    }

    
    if (url.pathname === '/health') {
      return new Response('ok');
    }

    
    if (url.pathname === '/webhook' && request.method === 'POST') {
      const contentType = request.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        return new Response('Unsupported Media Type', { status: 415 });
      }
      try {
        return await handleTelegramWebhook(request, env);
      } catch (err: any) {
        console.error('[WEBHOOK] Unhandled exception:', err);
        try {
          await logError(env, 'webhook', 'UNHANDLED_EXCEPTION', err, {
            endpoint: '/webhook',
          });
        } catch {
          
        }
        return new Response('OK', { status: 200 });
      }
    }

    
    if (url.pathname === '/debug/ping' && request.method === 'GET') {
      const storage = new StorageClient(env.DB);
      await storage.logDebug('ping', 'manual ping');
      return jsonResponse({ ok: true });
    }

    
    if (url.pathname === '/debug/recent' && request.method === 'GET') {
      const storage = new StorageClient(env.DB);
      const events = await storage.getDebugRecent(50);
      return jsonResponse({ ok: true, events });
    }

    
    if (url.pathname === '/debug/lastDraft' && request.method === 'GET') {
      const ticketParam = url.searchParams.get('ticket');
      const topicId = ticketParam ? parseInt(ticketParam, 10) : null;
      
      if (!topicId || isNaN(topicId)) {
        return jsonResponse({ ok: false, error: 'ticket parameter (topic_id) is required and must be a number' }, 400);
      }

      const storage = new StorageClient(env.DB);
      const { suggestion, conversation } = await storage.getLastDraftByTopic(topicId);
      
      if (!suggestion || !conversation) {
        return jsonResponse({ ok: false, error: 'No draft found for this ticket', topicId }, 404);
      }

      
      const allEvents = await storage.getDebugRecent(200);
      const relevantEvents = allEvents.filter(e => {
        try {
          const data = e.data ? JSON.parse(e.data) : {};
          return e.event.startsWith('llm_') || 
                 (e.event === 'draft_prompt_built' && data.user_id === conversation.user_id) ||
                 (e.event === 'draft_generated' && data.user_id === conversation.user_id);
        } catch {
          return false;
        }
      });

      
      let promptLog: any = null;
      let rawLog: any = null;
      let parsedLog: any = null;
      
      for (const event of relevantEvents) {
        if (event.event === 'draft_prompt_built' && !promptLog) {
          try {
            const data = event.data ? JSON.parse(event.data) : {};
            promptLog = { prompt: data.prompt_preview || data.prompt || event.data, timestamp: event.ts };
          } catch {}
        }
        if (event.event === 'llm_raw' && !rawLog) {
          rawLog = { response: event.data, timestamp: event.ts };
        }
        if (event.event === 'llm_parsed' && !parsedLog) {
          try {
            parsedLog = { data: event.data ? JSON.parse(event.data) : event.data, timestamp: event.ts };
          } catch {
            parsedLog = { data: event.data, timestamp: event.ts };
          }
        }
      }

      
      if (!promptLog) {
        for (const event of relevantEvents) {
          if (event.event === 'llm_prompt') {
            promptLog = { prompt: event.data?.slice(0, 2000) || event.data, timestamp: event.ts };
            break;
          }
        }
      }

      return jsonResponse({
        ok: true,
        topicId,
        conversation: {
          user_id: conversation.user_id,
          status: conversation.status,
          last_activity: conversation.last_activity,
        },
        suggestion: {
          id: suggestion.id,
          ru_text: suggestion.ru_text,
          client_text: suggestion.client_text,
          lang: suggestion.lang,
          state: suggestion.state,
          ts: suggestion.ts,
          support_message_id: suggestion.support_message_id,
        },
        debug: {
          prompt: promptLog?.prompt || null,
          prompt_timestamp: promptLog?.timestamp || null,
          raw_response: rawLog?.response?.slice(0, 2000) || null,
          raw_timestamp: rawLog?.timestamp || null,
          parsed: parsedLog?.data || null,
          parsed_timestamp: parsedLog?.timestamp || null,
        }
      });
    }

    
    if (url.pathname === '/ingest' && request.method === 'POST') {
      const token = parseBearerToken(request.headers.get('authorization'));
      if (!env.INGEST_TOKEN || token !== env.INGEST_TOKEN) return unauthorized();

      const contentType = request.headers.get('content-type') || '';
      let lines: string[] = [];

      try {
        if (contentType.includes('application/json')) {
          const body = await request.json();
          if (!body || !Array.isArray(body.lines)) {
            return jsonResponse(
              {
                inserted: 0,
                skipped: 0,
                errors: 1,
                received: 0,
                errorSamples: [{ line: 0, reason: 'invalid json body' }],
              },
              400
            );
          }
          lines = body.lines.map(String).filter(Boolean);
        } else if (
          contentType.includes('text/plain') ||
          contentType.includes('application/octet-stream')
        ) {
          const txt = await request.text();
          lines = splitJsonl(txt);
        } else {
          return new Response('Unsupported Media Type', { status: 415 });
        }
      } catch {
        return jsonResponse(
          {
            inserted: 0,
            skipped: 0,
            errors: 1,
            received: 0,
            errorSamples: [{ line: 0, reason: 'parse error' }],
          },
          400
        );
      }

      let inserted = 0;
      let skipped = 0;
      let errors = 0;

      const errorSamples: Array<{ line: number; reason: string }> = [];
      const now = Math.floor(Date.now() / 1000);

      const insertStmt = env.DB.prepare(`
        INSERT OR IGNORE INTO chunks
          (id, chat_id_hash, chat_name, type, support_name, chunk_index, text, created_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const lineNo = i + 1;

        let obj: any;
        try {
          obj = JSON.parse(ln);
        } catch {
          errors++;
          if (errorSamples.length < 20) errorSamples.push({ line: lineNo, reason: 'JSON.parse failed' });
          continue;
        }

        if (!obj || typeof obj.id !== 'string' || typeof obj.text !== 'string') {
          errors++;
          if (errorSamples.length < 20) errorSamples.push({ line: lineNo, reason: 'missing id/text' });
          continue;
        }

        try {
          const res: any = await insertStmt
            .bind(
              obj.id,
              obj.chat_id_hash ?? null,
              obj.chat_name ?? null,
              obj.type ?? null,
              obj.support_name ?? null,
              typeof obj.chunk_index === 'number' ? obj.chunk_index : null,
              obj.text,
              now
            )
            .run();

          const changes = res?.meta?.changes ?? 0;
          if (changes > 0) inserted++;
          else skipped++;
        } catch {
          errors++;
          if (errorSamples.length < 20) errorSamples.push({ line: lineNo, reason: 'db insert failed' });
        }
      }

      return jsonResponse({ inserted, skipped, errors, received: lines.length, errorSamples });
    }

    
    if (url.pathname === '/api/leads/ingest' && request.method === 'POST') {
      const token = parseBearerToken(request.headers.get('authorization'));
      if (!env.LEADS_INGEST_TOKEN || token !== env.LEADS_INGEST_TOKEN) {
        return unauthorized();
      }
      return handleLeadsIngest(request, env);
    }

    
    if (url.pathname === '/api/leads/ingest-anon' && request.method === 'POST') {
      const token = parseBearerToken(request.headers.get('authorization'));
      if (!env.LEADS_INGEST_TOKEN || token !== env.LEADS_INGEST_TOKEN) {
        return unauthorized();
      }
      return handleLeadsIngestAnon(request, env);
    }

    
    if (url.pathname === '/ask' && request.method === 'POST') {
      return handleAsk(request, env);
    }

    
    if (url.pathname === '/api/webchat/init' && request.method === 'POST') {
      try {
        return await handleWebchatInit(request, env);
      } catch (err: any) {
        console.error('[WEBCHAT] init failed:', err);
        return webchatErrorResponse(request, env, 500, 'webchat_init_failed', String(err?.message ?? err));
      }
    }
    if (url.pathname === '/api/webchat/messages' && request.method === 'GET') {
      try {
        return await handleWebchatMessages(request, env);
      } catch (err: any) {
        console.error('[WEBCHAT] messages failed:', err);
        return webchatErrorResponse(request, env, 500, 'webchat_messages_failed', String(err?.message ?? err));
      }
    }
    if (url.pathname === '/api/webchat/send' && request.method === 'POST') {
      try {
          return await handleWebchatSend(request, env, ctx);
      } catch (err: any) {
        console.error('[WEBCHAT] send failed:', err);
        return webchatErrorResponse(request, env, 500, 'webchat_send_failed', String(err?.message ?? err));
      }
    }
    if (url.pathname === '/api/webchat/stream' && request.method === 'GET') {
      try {
        return await handleWebchatStream(request, env);
      } catch (err: any) {
        console.error('[WEBCHAT] stream failed:', err);
        return webchatErrorResponse(request, env, 500, 'webchat_stream_failed', String(err?.message ?? err));
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  async queue(batch: MessageBatch, env: Env): Promise<void> {
    try {
      console.log(`[QUEUE] Received batch with ${batch.messages.length} messages`);
      await handleRatingQueue(batch, env);
    } catch (err: any) {
      console.error('[QUEUE] Error in queue handler:', err);
      try {
        const storage = new StorageClient(env.DB);
        await storage.logDebug('queue_handler_error', JSON.stringify({
          error: String(err?.message || err),
          batchSize: batch.messages.length,
          stack: err?.stack?.slice(0, 500)
        }));
        await logError(env, 'queue', 'RATING_QUEUE_ERROR', err, {
          batchSize: batch.messages.length,
        });
      } catch {
       
      }
      throw err;
    }
  },

  async scheduled(event: { cron?: string }, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron ?? '';
    if (cron === '0 */12 * * *') {
      ctx.waitUntil(
        runHeartbeat(env).catch((err: any) => {
          console.error('[HEARTBEAT] Error:', err?.message ?? err);
        })
      );
      return;
    }
    if (cron === '*/10 * * * *') {
      ctx.waitUntil(
        syncPendingOperatorTurnsToR2(env).catch((err: unknown) => {
          console.error('[R2_LEARN]', err instanceof Error ? err.message : err);
        })
      );
      return;
    }
    ctx.waitUntil(
      runHeartbeat(env).catch((err: any) => {
        console.error('[HEARTBEAT] Error:', err?.message ?? err);
      })
    );
  },
};

