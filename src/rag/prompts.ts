import { MessageRecord } from '../domain/types';
import { detectLanguage } from '../utils/detect-lang';
import type { SearchSnippet } from './search';

export interface UnifiedDraftItem {
  original_text: string;
  ru_text: string;
  lang: string;
  attachment_info?: string | null;
}

function isGreetingOrShort(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const greetings = ['hi', 'hello', 'привет', 'здравствуйте', 'здравствуй', 'ку', '👍', '👋', 'hey', 'hola', 'bonjour'];
  
  
  if (greetings.some(g => normalized === g || normalized.startsWith(g + ' '))) {
    return true;
  }
  
  
  const meaningfulChars = normalized.replace(/[\s\.,!?;:]+/g, '').length;
  if (meaningfulChars < 10) {
    return true;
  }
  
  return false;
}

export function buildPrompt({
  clientText,
  dialogMessages,
  ragSnippets,
  conversationSummary,
  intent,
  lastClientText,
  isShortFollowUp = false
}: {
  clientText: string;
  dialogMessages: MessageRecord[];
  ragSnippets: SearchSnippet[];
  conversationSummary?: string | null;
  intent?: string | null;
  lastClientText?: string | null;
  isShortFollowUp?: boolean;
}): string {
  const detectedLang = detectLanguage(clientText);
  const isShort = isGreetingOrShort(clientText);
  
  const history = dialogMessages
    .map(m => {
      let roleLabel = 'Support';
      if (m.role === 'client' || m.role === 'client_edit') {
        roleLabel = 'Client';
      } else if (m.role === 'support') {
        roleLabel = 'Support';
      } else if (m.role === 'system') {
        roleLabel = 'System';
      }
      return `${roleLabel}: ${m.text}`;
    })
    .join('\n');

  
  
  const hasContext = !!(conversationSummary || intent || (isShortFollowUp && lastClientText));
  
  if (isShort && !hasContext) {
    return `<CLIENT_MESSAGE>
${clientText}
</CLIENT_MESSAGE>

This is a greeting or very short message. Respond with a polite, friendly greeting and offer help.

CRITICAL LANGUAGE RULES (NO ENGLISH DEFAULT):
- Detect language ONLY from <CLIENT_MESSAGE> text
- If Cyrillic → lang="ru", client and ru in Russian
- If other language → lang=code (es, fr, de, etc.), "client" in THAT language, "ru" in Russian
- NEVER default to English if client wrote in another language (e.g. "Hola" → Spanish, not English)

EXAMPLES:

Input: "Привет"
Output (JSON only):
{"client": "Здравствуйте! Чем могу помочь?", "ru": "Здравствуйте! Чем могу помочь?", "lang": "ru"}

Input: "Hello"
Output (JSON only):
{"client": "Hello! How can I help you?", "ru": "Здравствуйте! Чем могу помочь?", "lang": "en"}

Input: "Hola"
Output (JSON only):
{"client": "¡Hola! ¿Cómo puedo ayudarle?", "ru": "Здравствуйте! Чем могу помочь?", "lang": "es"}

OUTPUT FORMAT (STRICT JSON, NO OTHER TEXT):
- Output ONLY valid JSON object
- NO &&&, NO &&, NO extra symbols, NO explanations
- NO markdown code blocks
- Just the JSON: {"client":"...","ru":"...","lang":"..."}`;
  }

  
  const knowledgeBaseText = ragSnippets.length > 0 
    ? ragSnippets.map((s, idx) => {
        const sourceInfo = s.source ? ` (source: ${s.source})` : '';
        const scoreInfo = s.score !== undefined ? ` [score: ${s.score.toFixed(2)}]` : '';
        return `[${idx + 1}] ${s.text}${sourceInfo}${scoreInfo}`;
      }).join('\n\n')
    : "No relevant knowledge found.";

  
  const historyText = history.length > 0 
    ? history 
    : "No previous conversation history.";

  
  let contextSection = "";
  if (conversationSummary || intent || (isShortFollowUp && lastClientText)) {
    contextSection = "\n═══════════════════════════════════════\nCONVERSATION CONTEXT\n═══════════════════════════════════════\n";
    
    if (conversationSummary) {
      contextSection += `Summary: ${conversationSummary}\n`;
    }
    if (intent) {
      contextSection += `Current topic/intent: ${intent}\n`;
    }
    if (isShortFollowUp && lastClientText) {
      contextSection += `Previous client message: ${lastClientText}\n`;
      contextSection += `Current follow-up: ${clientText}\n`;
      contextSection += "\nIMPORTANT: The current message is a short follow-up to the previous message. Continue the same topic.\n";
    }
    contextSection += "\n";
  }

  return `<CLIENT_MESSAGE>
${clientText}
</CLIENT_MESSAGE>${contextSection}
═══════════════════════════════════════
KNOWLEDGE BASE (PRIMARY SOURCE - USE THIS FIRST)
═══════════════════════════════════════
${knowledgeBaseText}

═══════════════════════════════════════
CONVERSATION HISTORY (SECONDARY - FOR CONTEXT ONLY)
═══════════════════════════════════════
${historyText}

═══════════════════════════════════════
KNOWLEDGE BASE (PRIMARY SOURCE - USE THIS FIRST)
═══════════════════════════════════════
${knowledgeBaseText}

═══════════════════════════════════════
CONVERSATION HISTORY (SECONDARY - FOR CONTEXT ONLY)
═══════════════════════════════════════
${historyText}

═══════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════

1. KNOWLEDGE BASE PRIORITY:
   - If question matches Knowledge Base content by ≥70% in meaning → answer DIRECTLY using KB facts
   - Do NOT ask clarifying questions if KB has relevant information
   - NEVER contradict or ignore Knowledge Base
   - History is only for understanding context/tone, NOT for facts

2. LANGUAGE DETECTION (NO ENGLISH DEFAULT):
   - Detect language ONLY from <CLIENT_MESSAGE> text. Profile/country/previous messages IGNORED.
   - Supported: Arabic, Czech, German, English, Spanish, Persian, Finnish, French, Hebrew, Croatian, Hungarian, Indonesian, Italian, Japanese, Kazakh, Korean, Malay, Dutch, Norwegian, Polish, Portuguese, Romanian, Russian, Slovak, Serbian, Swedish, Thai, Turkish, Ukrainian, Uzbek, Vietnamese, Chinese.
   - If Cyrillic → lang="ru", client field in Russian
   - Otherwise → lang = detected code (en, es, fr, de, etc.), client field in THAT language
   - NEVER default to English if client wrote in another language. Field "ru" is ALWAYS Russian.

3. RESPONSE QUALITY:
   - NO "information is being clarified" or "checking with operator"
   - NO abstract/philosophical answers
   - NO redundant questions if KB has answer
   - Be confident and direct when KB provides facts
   - If no KB match → ask ONE specific clarifying question

4. STYLE:
   - Natural, professional, human-like
   - Russian: use "Мы" (not "Нам") as subject
   - No emojis, no markdown, no meta-comments

═══════════════════════════════════════
OUTPUT FORMAT (STRICT - JSON ONLY)
═══════════════════════════════════════

You MUST output ONLY valid JSON, nothing else. No explanations, no markdown, no text before/after.
STRICTLY FORBIDDEN: No &&&, &&, &, ***, ###, or any special character artifacts.
Output clean, valid JSON only.

{
  "client": "Reply in client's exact language",
  "ru": "Russian translation (always in Russian)",
  "lang": "ru" or "latin"
}

EXAMPLES:

Input (RU): "Как поменять номер телефона?"
Output (ONLY JSON):
{
  "client": "Чтобы изменить номер телефона, перейдите в настройки профиля и выберите 'Изменить номер'. Мы отправим код подтверждения на новый номер.",
  "ru": "Чтобы изменить номер телефона, перейдите в настройки профиля и выберите 'Изменить номер'. Мы отправим код подтверждения на новый номер.",
  "lang": "ru"
}

Input (EN): "How do I change my phone number?"
Output (ONLY JSON):
{
  "client": "To change your phone number, go to profile settings and select 'Change phone number'. We will send a verification code to the new number.",
  "ru": "Чтобы изменить номер телефона, перейдите в настройки профиля и выберите 'Изменить номер'. Мы отправим код подтверждения на новый номер.",
  "lang": "latin"
}

Remember: OUTPUT ONLY THE JSON OBJECT, NO OTHER TEXT.`.trim();
}

export interface ConversationHistoryEntry {
  role: 'client' | 'support';
  text: string;
}

export function buildUnifiedDraftPrompt({
  items,
  ragSnippets = [],
  conversationHistory = [],
  variant = 'support',
}: {
  items: UnifiedDraftItem[];
  ragSnippets?: SearchSnippet[];
  conversationHistory?: ConversationHistoryEntry[];
