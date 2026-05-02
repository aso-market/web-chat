import type { D1Database } from '../domain/types';
import { StorageClient } from '../storage/d1';

export type QaScope = 'support' | 'lead';

export function normalizeQaText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') 
    .replace(/\s+/g, ' ') 
    .trim();
}

function normalize(text: string): string {
  return normalizeQaText(text);
}

function tokenize(text: string): Set<string> {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  return new Set(words);
}

function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 1.0;
  if (set1.size === 0 || set2.size === 0) return 0.0;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

function calculateScore(messageNorm: string, questionNorm: string): number {
  
  const messageWords = messageNorm.split(/\s+/).filter(w => w.length > 0);
  if (messageWords.length <= 2) {
    return 0;
  }

  
  const messageTokens = tokenize(messageNorm);
  const questionTokens = tokenize(questionNorm);
  let score = jaccardSimilarity(messageTokens, questionTokens);

  
  if (questionNorm.includes(messageNorm) || messageNorm.includes(questionNorm)) {
    score = Math.max(score, 0.85); 
  }

  return score;
}

export interface QaMatchResult {
  matched: true;
  question: string;
  answer: string;
  score: number;
  id: number;
  lang: string;
  question_norm: string;
}

export interface QaNoMatchResult {
  matched: false;
}

export type QaMatchResponse = QaMatchResult | QaNoMatchResult;

export async function matchQa(
  db: D1Database,
  message: string,
  clientLang: string,
  threshold: number = 0.70,
  scope: QaScope = 'support'
): Promise<QaMatchResponse> {
  try {
    const storage = new StorageClient(db);
    const messageNorm = normalize(message);

    
    if (messageNorm.length < 3) {
      return { matched: false };
    }

    
    const candidates = await storage.getQaCandidates(clientLang, scope);

    if (candidates.length === 0) {
      return { matched: false };
    }

    
    const scored = candidates.map(candidate => ({
      ...candidate,
      score: calculateScore(messageNorm, candidate.question_norm),
    }));

    
    scored.sort((a, b) => b.score - a.score);

    
    const topMatch = scored[0];

    
    if (topMatch.score >= threshold) {
      return {
        matched: true,
        question: topMatch.question,
        answer: topMatch.answer,
        score: topMatch.score,
        id: topMatch.id,
        lang: topMatch.lang,
        question_norm: topMatch.question_norm,
      };
    }

    return { matched: false };
  } catch (err: any) {
    
    
    console.warn('QA matching error (non-fatal):', err?.message || err);
    return { matched: false };
  }
}
