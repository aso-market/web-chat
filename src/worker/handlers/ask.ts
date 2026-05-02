
import { Env } from '../../domain/types';
import { searchRag } from '../../rag/search';
import { generateDraft, type BilingualDraft, MAX_DRAFT_LENGTH, translateToRussian } from '../../rag/llm';
import { buildPrompt } from '../../rag/prompts';
import { matchQa } from '../../qa/match';
import { detectClientLang } from '../../qa/lang';
import { StorageClient } from '../../storage/d1';

const MAX_QUERY_LENGTH = 1000;

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function stripBomAndTrim(s: string) {
  if (!s) return '';
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.trim();
}

export async function handleAsk(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return new Response('Unsupported Media Type', { status: 415 });
  }

  let raw = '';
  try {
    raw = await request.text(); 
  } catch (e: any) {
    return json({ ok: false, error: 'bad body', details: String(e?.message ?? e) }, 400);
  }

  raw = stripBomAndTrim(raw);
  const preview = raw.slice(0, 300);

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch (e: any) {
    return json({ ok: false, error: 'bad json', details: String(e?.message ?? e), preview }, 400);
  }

  const query = String(body?.query ?? '').trim();
  if (!query) return json({ ok: false, error: 'query is required' }, 400);
  
  if (query.length > MAX_QUERY_LENGTH) {
    return json({ ok: false, error: `query too long (max ${MAX_QUERY_LENGTH} chars)` }, 400);
  }

  try {
    const storage = new StorageClient(env.DB);
    
    
    let draft: BilingualDraft;
    let qaMatched = false;
    
    
    const clientLang = detectClientLang(query);
    
    
    const qaMatch = await matchQa(env.DB, query, clientLang, 0.70);
    
    if (qaMatch.matched) {
      qaMatched = true;
      await storage.logDebug('ask_qa_hit', JSON.stringify({
        id: qaMatch.id,
        score: qaMatch.score,
        lang: qaMatch.lang,
        question_preview: query.slice(0, 50)
      }));
      
      
      
      const ruAnswer = await translateToRussian(env, qaMatch.answer);
      
      draft = {
        ru: ruAnswer,
        client: qaMatch.answer,
        lang: qaMatch.lang,
      };
    } else {
      await storage.logDebug('ask_qa_miss', `lang=${clientLang}, text=${query.slice(0, 50)}`);
      
      
      
      const snippets = await searchRag(env, query, 5);
      
      
      const prompt = buildPrompt({
        clientText: query,
        dialogMessages: [],
        ragSnippets: snippets,
      });
      
      draft = await generateDraft(env, prompt);
      
      return json({
        ok: true,
        query,
        answer: draft.client, 
        ru: draft.ru,
        client: draft.client,
        lang: draft.lang,
        qa_matched: false,
        snippets: snippets.map(s => ({
          text: s.text,
          source: s.source,
          score: s.score,
        })),
      });
    }

    
    return json({
      ok: true,
      query,
      answer: draft.client, 
      ru: draft.ru,
      client: draft.client,
      lang: draft.lang,
      qa_matched: true,
      snippets: [],
    });
  } catch (err: any) {
    console.error('Ask endpoint error:', err);
    return json({
      ok: false,
      error: 'processing failed',
      details: String(err?.message ?? err),
    }, 500);
  }
}
