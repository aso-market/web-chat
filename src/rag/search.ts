
import type { QaScope } from '../qa/match';
import { Env } from '../domain/types';

const MAX_CHUNKS = 5;
const MAX_SNIPPET_LENGTH = 450;

export interface SearchSnippet {
  text: string;
  source?: string;
  score?: number;
}

function resolveAutoragName(env: Env, ragScope?: QaScope): string {
  if (ragScope === 'lead' && env.AUTORAG_NAME_LEAD?.trim()) {
    return env.AUTORAG_NAME_LEAD.trim();
  }
  return env.AUTORAG_NAME || 'my-rag';
}

export async function searchRag(
  env: Env,
  query: string,
  topK: number = MAX_CHUNKS,
  ragScope?: QaScope
): Promise<SearchSnippet[]> {
  if (!env.AI) {
    console.log('AI binding not found, skipping RAG retrieval.');
    return [];
  }

  if (!query || query.trim().length === 0) {
    return [];
  }

  try {
    const autoragName = resolveAutoragName(env, ragScope);
    console.log(`[RAG] Searching with AutoRAG name: ${autoragName}, scope=${ragScope ?? 'default'}, query: ${query.slice(0, 50)}`);
    
    
    const result = await env.AI.autorag(autoragName).search({
      query: query.trim(),
      limit: Math.min(topK, MAX_CHUNKS),
    });

    console.log(`[RAG] AutoRAG result:`, JSON.stringify(result).slice(0, 500));

    
    
    const results = (result as any)?.results || (result as any)?.matches || (result as any)?.data || [];
    console.log(`[RAG] Parsed results count: ${results.length}`);
    
    let snippets: SearchSnippet[] = results
      .slice(0, MAX_CHUNKS)
      .map((item: any) => {
        let text = item.text || item.content || item.chunk?.text || "";
        const source = item.metadata?.source || item.source || item.chunk?.metadata?.source || undefined;
        const score = typeof item.score === "number" ? item.score : (typeof item.chunk?.score === "number" ? item.chunk.score : undefined);

        
        if (text.length > MAX_SNIPPET_LENGTH) {
          text = text.slice(0, MAX_SNIPPET_LENGTH - 3) + "...";
        }

        return { text: text.trim(), source, score };
      })
      .filter((s: SearchSnippet) => s.text.length > 0);

    
    
    const relevantSnippets = snippets.filter(s => s.score === undefined || s.score >= 0.7);
    
    
    if (relevantSnippets.length > 0 && relevantSnippets.some(s => s.score !== undefined)) {
      snippets = relevantSnippets.sort((a, b) => {
        
        if (a.score !== undefined && b.score !== undefined) {
          return b.score - a.score;
        }
        if (a.score !== undefined) return -1;
        if (b.score !== undefined) return 1;
        return 0;
      }).slice(0, MAX_CHUNKS);
    } else if (relevantSnippets.length > 0) {
      
      snippets = relevantSnippets.slice(0, MAX_CHUNKS);
    } else {
      
      snippets = snippets.slice(0, MAX_CHUNKS);
    }

    console.log(`[RAG] Final snippets count: ${snippets.length}`);
    if (snippets.length > 0) {
      console.log(`[RAG] First snippet preview: ${snippets[0].text.slice(0, 150)}`);
    }

    return snippets;
  } catch (err: any) {
    console.error('[RAG] Search error:', err);
    console.error('[RAG] Error details:', {
      message: err?.message,
      name: err?.name,
      stack: err?.stack?.slice(0, 300)
    });
    return [];
  }
}
