import type { Env } from "../domain/types";
import { detectLanguage } from "../utils/detect-lang";
import { logError } from "../logging";

export const MAX_DRAFT_LENGTH = 1500;
const FALLBACK_RU = "Можете, пожалуйста, уточнить ваш вопрос?";
const FALLBACK_EN = "Could you please clarify your question?";

const KEEP_LITERAL = ['где ты', 'где вы', 'hello', 'hi', 'ok', 'ок', 'привет', 'норм', 'ага', 'да', 'нет'];

function shouldSkipTranslate(text: string): boolean {
  const t = text.trim();
  if (t.length <= 3) return true;
  if (/^[?!]+$/u.test(t)) return true;
  const lower = t.toLowerCase();
  if (KEEP_LITERAL.some((w) => lower === w)) return true;
  return false;
}

export async function translateToRussian(env: Env, text: string): Promise<string> {
  try {
    if (!text || !text.trim()) {
      return FALLBACK_RU;
    }
    if (shouldSkipTranslate(text)) {
      return text.slice(0, MAX_DRAFT_LENGTH);
    }
    const cyrillicRegex = /[\u0400-\u04FF]/;
    if (cyrillicRegex.test(text)) {
      return text.slice(0, MAX_DRAFT_LENGTH);
    }
    
    const model = env.MODEL || "@cf/meta/llama-3.1-70b-instruct";
    const translatePrompt = `Переведи на русский. Контекст сервиса: ${DOMAIN_CONTEXT}
Учитывай доменные термины при переводе. Верни ТОЛЬКО русский текст, без JSON и пояснений.

"${sanitizeForAiInput(text)}"`;
    
    const res = await retryWithBackoff(async () => {
      return await env.AI.run(model, {
        messages: [
          { 
            role: "system", 
            content: "Ты переводчик. Учитывай контекст TasksEarn (задания, отзывы в App Store, вывод средств). Верни ТОЛЬКО перевод на русском, без JSON и пояснений." 
          },
          { role: "user", content: sanitizeForAiInput(translatePrompt) },
        ],
        max_tokens: 300,
        temperature: 0.1,
      });
    }, 2, 300);
    
    const translated = 
      (res as any)?.response ?? 
      (res as any)?.result ?? 
      (res as any)?.text ?? 
      (res as any)?.content ?? 
      "";
    
    if (translated && translated.trim()) {
      
      let cleaned = translated.trim();
      
      cleaned = cleaned.replace(/^["']|["']$/g, '');
      return cleaned.slice(0, MAX_DRAFT_LENGTH);
    }
    
    
    return text.slice(0, MAX_DRAFT_LENGTH);
  } catch (err: any) {
    console.warn('Translation error (non-fatal):', err?.message || err);
    
    return text.slice(0, MAX_DRAFT_LENGTH);
  }
}

export async function translateFromRussian(
  env: Env,
  ruText: string,
  targetLang: string,
  clientSampleText?: string,
  domain: "support" | "lead" = "support"
): Promise<string> {
  if (!ruText || !ruText.trim()) {
    return targetLang === "ru" ? FALLBACK_RU : FALLBACK_EN;
  }
  if (targetLang === "ru") {
    return ruText.slice(0, MAX_DRAFT_LENGTH);
  }
  const domainLead =
    domain === "lead"
      ? "aso.market: ASO, App Store, Google Play, keyword rankings, reviews, ratings, API, dashboards. Not TasksEarn/withdrawals."
      : "Rate2Earn (tasks, App Store reviews, withdrawals). review=App Store review, tasks=platform tasks, withdraw=withdrawal.";
  try {
    const model = env.MODEL || "@cf/meta/llama-3.1-70b-instruct";
    const langLabel = LANG_CODE_TO_LABEL[targetLang.toLowerCase()] ?? targetLang;

    let systemContent: string;
    let translatePrompt: string;

    if (clientSampleText && clientSampleText.trim().length >= 2) {
      
      systemContent = `Translate support replies from Russian to the EXACT same language as the user message. Domain: ${domainLead}
CRITICAL LANGUAGE RULE: The entire output MUST be in ONE language only—the target language. Do NOT mix languages. Do NOT add English if the user wrote in another language. Do NOT add language names (Spanish, English, etc.), labels, or prefixes. Output ONLY the translated text. Same tone. No JSON.`;
      translatePrompt = `User message (match its language):
"${sanitizeForAiInput(clientSampleText.trim().slice(0, 500))}"

Russian reply to translate:
"${sanitizeForAiInput(ruText)}"`;
    } else {
      systemContent = `Translate support replies from Russian to ${langLabel}. Domain: ${domain === "lead" ? "aso.market (ASO, stores, reviews)." : "Rate2Earn."} CRITICAL: The entire output MUST be in ONE language only (${langLabel}). Do NOT mix languages. Do NOT add language names or labels. Output ONLY the translated text. Same tone. No JSON.`;
      translatePrompt = `Translate to ${langLabel}:\n\n"${sanitizeForAiInput(ruText)}"`;
    }

    const res = await retryWithBackoff(
      async () =>
        await env.AI.run(model, {
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: sanitizeForAiInput(translatePrompt) },
          ],
          max_tokens: 500,
          temperature: 0.1,
        }),
      2,
      300
    );

    const raw =
      (res as any)?.response ??
      (res as any)?.result ??
      (res as any)?.text ??
      (res as any)?.content ??
      "";
    if (raw && raw.trim()) {
      let cleaned = raw.trim().replace(/^["']|["']$/g, "");
      return cleaned.slice(0, MAX_DRAFT_LENGTH);
    }
    return ruText.slice(0, MAX_DRAFT_LENGTH);
  } catch (err: any) {
    console.warn("translateFromRussian error (non-fatal):", err?.message || err);
    return ruText.slice(0, MAX_DRAFT_LENGTH);
  }
}

export interface BilingualDraft {
  ru: string;
  client: string;
  lang: string;
}

const META_LINE_PATTERNS: RegExp[] = [
  /\bdetected language\b/i,
  /\blanguage detected\b/i,
  /\bconfidence\b\s*:\s*\d+/i,
  /\btranslation\b\s*:\s*/i,
  /\b(as an ai|i am an ai|i'm an ai|i am a language model|as a language model)\b/i,
  /\b(system prompt|instructions|rules)\b/i,
];

export function stripMetaArtifacts(input: string): string {
  let s = String(input ?? "").replace(/\r\n/g, "\n");

  s = s.replace(
    /(^|\n)\s*[\(\[]\s*[^)\]\n]*\b(detected\s+language|language\s+detected|system\s+prompt|instructions|rules)\b[^)\]\n]*[\)\]]\s*(?=\n|$)/gi,
    "\n"
  );

  const lines = s.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push("");
      continue;
    }
    const isMeta = META_LINE_PATTERNS.some((re) => re.test(trimmed));
    if (!isMeta) kept.push(line);
  }
  s = kept.join("\n");

  s = s.replace(/\n{3,}/g, "\n\n").trim();
  s = s.replace(/[\(\[]\s*detected\s+language\s*:[^\)\]]+[\)\]]/gi, "").trim();
  return s;
}

function extractClientMessage(prompt: string): string {
  const m = prompt.match(/<CLIENT_MESSAGE>([\s\S]*?)<\/CLIENT_MESSAGE>/i);
  return (m?.[1] ?? "").trim();
}

export function isGreetingOnly(text: string, hasActiveContext: boolean = false): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  
  
  
  if (hasActiveContext) {
    
    const explicitGreetings = [
      "hi", "hello", "hey", "yo", "sup",
      "привет", "здравствуйте", "здравствуй", "добрый день", "добрый вечер", "доброе утро",
      "hola", "buenas", "buenos días", "buenas tardes", "buenas noches",
      "olá", "oi", "bom dia", "boa tarde", "boa noite",
      "مرحبا", "السلام عليكم"
    ];
    const words = t.split(/\s+/).filter(Boolean);
    const isExplicitGreeting = words.length <= 2 && explicitGreetings.some(g => 
      t === g || t.startsWith(g + ' ') || words[0] === g
    );
    return isExplicitGreeting;
  }

  
  
  if (t.length <= 3) return true;

  
  const greetings = [
    "hi", "hello", "hey", "yo", "sup",
    "привет", "здравствуйте", "здравствуй", "ку", "добрый день", "добрый вечер", "доброе утро",
    "hola", "buenas", "buenos días", "buenas tardes", "buenas noches",
    "olá", "oi", "bom dia", "boa tarde", "boa noite",
    "مرحبا", "السلام عليكم"
  ];

  
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && greetings.includes(t)) return true;
  if (words.length === 1 && greetings.includes(words[0])) return true;

  
  if (words.length <= 3 && /^(hi|hello|hey|привет|здравствуйте|hola|olá|oi|مرحبا)$/i.test(words[0]) && /[😊😁😂🙏👍❤️]/.test(t)) {
    return true;
  }

  return false;
}

function greetingReply(langCode: string): string {
  
  if (langCode === "ru") return "Здравствуйте! Чем могу помочь?";
  
  
  
  
  return "Hello! How can I help you?";
}

const SYSTEM_PROMPT = `
You are the official human customer support agent of Review Apps & Earn Money (Rate2Earn).

CRITICAL: You MUST output STRICT JSON ONLY. No extra text. No markdown. No comments.

OUTPUT FORMAT (exactly):
{"ru":"<Russian version>","client":"<Client language version>","lang":"<detected language code>"}

LANGUAGE RULES (NO ENGLISH DEFAULT):
- Detect language ONLY from the client's last message text. Profile, country, previous messages — IGNORED.
- Supported languages: Arabic, Czech, German, English, Spanish, Persian, Finnish, French, Hebrew, Croatian, Hungarian, Indonesian, Italian, Japanese, Kazakh, Korean, Malay, Dutch, Norwegian, Polish, Portuguese, Romanian, Russian, Slovak, Serbian, Swedish, Thai, Turkish, Ukrainian, Uzbek, Vietnamese, Chinese.
- "client" MUST be written in the client's exact language. NEVER default to English if they wrote in another language.
- "ru" MUST always be Russian. NEVER mix languages inside one field.
- NEVER mention language detection.

KNOWLEDGE RULES:
- Use provided Q&A as PRIMARY truth.
- If Q&A matches question by meaning >= 70%: answer directly, no clarifying questions.
- Do NOT invent rules/prices/payout dates/guarantees.
- If missing info: ask ONE short clarifying question (in client language). No "information is being clarified", no operator handoff.

BEHAVIOR:
- All questions are about the TasksEarn service.
- If it's a greeting: greet back and ask how you can help.
- Be calm, confident, concise. No emojis. No long lists.

STRICTLY FORBIDDEN:
- Any meta text, notes, brackets, debug.
- Saying you are an AI.
- Philosophical/abstract talk.
`.trim();

const DEAD_END_REPLY_PATTERNS: RegExp[] = [
  /не\s+можем\s+предоставить/i,
  /не\s+располагаем\s+информац/i,
  /нет\s+информац/i,
  /информац\w*\s+отсутств/i,
  /нет\s+данных/i,
  /недоступн[ао]\s+в\s+баз/i,
  /не\s+могу\s+помочь/i,
  /не\s+можем\s+помочь/i,
  /рекомендуем\s+обратитьс[яь]/i,
  /уточните\s+у\s+поддержк/i,
  /обратитесь\s+в\s+техподдержк/i,
  /обратитесь\s+в\s+поддержк/i,
  /we\s+don['’]t\s+have\s+information/i,
  /we\s+cannot\s+provide\s+information/i,
  /contact\s+support/i,
];

export function isDeadEndSupportReply(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return true;
  return DEAD_END_REPLY_PATTERNS.some((re) => re.test(t));
}

function buildSafeSupportFallbackRu(prompt?: string): string {
  const p = String(prompt || "").toLowerCase();
  const isFinanceCase =
    /(баланс|начисл|выплат|вывод|withdraw|payout|комисси|реферал|деньг|usd|оплат)/i.test(p);
  if (isFinanceCase) {
    return "Понял ваш вопрос по начислениям/балансу. Чтобы проверить точнее, пришлите, пожалуйста: 1) скрин раздела с балансом или начислениями, 2) пример задания/операции, где ожидаемая сумма отличается, 3) когда вы заметили изменение. После этого сможем предметно сверить и подсказать следующий шаг.";
  }
  return "Понял ваш вопрос. Такое обычно связано с настройками аккаунта, текущим состоянием задания или временной ошибкой. Чтобы проверить точнее, пришлите, пожалуйста: 1) что именно не получается, 2) скрин экрана с ошибкой/экраном, 3) когда это началось. После этого подскажем точный следующий шаг.";
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 300
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const errorMsg = String(err?.message || err || '');
      
      
      if (errorMsg.includes('authentication') || 
          errorMsg.includes('invalid') || 
          errorMsg.includes('bad request') ||
          errorMsg.includes('rate limit') && attempt >= 1) {
        throw err;
      }
      
      
      if (attempt === maxRetries - 1) {
        throw err;
      }
      
      
      const delay = initialDelay * Math.pow(3, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
    }
  }
  
  throw lastError;
}

export async function generateDraft(env: Env, prompt: string): Promise<BilingualDraft> {
  try {
    const clientMsg = extractClientMessage(prompt);
    const detectedLang = detectLanguage(clientMsg); 
    
    const lang = detectedLang === 'ru' ? 'ru' : 'en';

    
    if (isGreetingOnly(clientMsg, false) && detectedLang === 'ru') {
      const ru = greetingReply("ru");
      return {
        ru: ru.slice(0, MAX_DRAFT_LENGTH),
        client: ru.slice(0, MAX_DRAFT_LENGTH),
        lang: 'ru',
      };
    }

    const model = env.MODEL || "@cf/meta/llama-3.1-70b-instruct";

    const res = await retryWithBackoff(async () => {
      return await env.AI.run(model, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: sanitizeForAiInput(prompt) },
        ],
        max_tokens: 700,
        temperature: 0.25,
      });
    }, 3, 300);

    const raw =
      (res as any)?.response ??
      (res as any)?.result ??
      (res as any)?.text ??
      (res as any)?.content ??
      "";

    const cleaned = stripMetaArtifacts(String(raw).trim());

    let parsed: BilingualDraft | null = null;

    try {
      
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("No JSON object in response");
      parsed = JSON.parse(m[0]);
    } catch {
      parsed = null;
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        ru: FALLBACK_RU,
        client: detectedLang === "ru" ? FALLBACK_RU : FALLBACK_EN,
        lang: detectedLang === "ru" ? "ru" : "en",
      };
    }

    
    parsed.ru = stripMetaArtifacts(String(parsed.ru ?? "")).trim();
    parsed.client = stripMetaArtifacts(String(parsed.client ?? "")).trim();
    
    
    const modelLang = String(parsed.lang ?? "").trim().toLowerCase();
    parsed.lang = (modelLang && (modelLang === 'ru' || modelLang.length === 2)) ? modelLang : (detectedLang === 'ru' ? 'ru' : 'en');

    if (!parsed.ru) parsed.ru = FALLBACK_RU;
    if (!parsed.client) parsed.client = parsed.lang === "ru" ? FALLBACK_RU : FALLBACK_EN;

    
    if (parsed.ru.length > MAX_DRAFT_LENGTH) parsed.ru = parsed.ru.slice(0, MAX_DRAFT_LENGTH - 3).trimEnd() + "...";
    if (parsed.client.length > MAX_DRAFT_LENGTH) parsed.client = parsed.client.slice(0, MAX_DRAFT_LENGTH - 3).trimEnd() + "...";

    return parsed;
  } catch (err) {
    console.error("LLM generation error:", err);
    logError(env, "llm", "LLM_GENERATION_ERROR", err, null).catch(() => {});
    return { ru: FALLBACK_RU, client: FALLBACK_EN, lang: "en" };
  }
}

export async function generateAnswer(env: Env, prompt: string): Promise<string> {
  const draft = await generateDraft(env, prompt);
  return draft.client;
}

const UNIFIED_SYSTEM = `Роль
Ты — служба поддержки сервиса Rate2Earn.
Ты отвечаешь клиентам в чате от имени сервиса.

⸻
ЖЁСТКИЕ ПРАВИЛА (ОБЯЗАТЕЛЬНЫ)

1. ЯЗЫК ОТВЕТА (КРИТИЧЕСКОЕ ПРАВИЛО)
• Определи язык ПО ФАКТИЧЕСКОМУ ТЕКСТУ клиента
• Ответ клиенту будет переведён на его язык автоматически. Ты формируешь ТОЛЬКО русский текст.
• Язык — внутреннее состояние, НЕ часть ответа. НИКОГДА не добавляй в текст: Spanish, Vietnamese, Arabic, «Ответ на испанском», «Язык: ...» и т.п.

2. ПОДДЕРЖИВАЕМЫЕ ЯЗЫКИ (ЯВНЫЙ СПИСОК)
Arabic, Czech, German, English, Spanish, Persian, Finnish, French, Hebrew, Croatian, Hungarian, Indonesian, Italian, Japanese, Kazakh, Korean, Malay, Dutch, Norwegian, Polish, Portuguese, Romanian, Russian, Slovak, Serbian, Swedish, Thai, Turkish, Ukrainian, Uzbek, Vietnamese, Chinese.
Если язык в списке — отвечай на нём без комментариев.

3. RAG / БАЗА ЗНАНИЙ (ЖЁСТКИЙ АЛГОРИТМ)
Перед КАЖДЫМ ответом:
1) Учитывай ВСЮ базу знаний (RU, EN и др.). Даже если вопрос на одном языке, а ответ есть на другом.
2) Если найдено правило / ответ — используй ТОЛЬКО информацию из базы. Ничего не выдумывай.
3) Если ничего не найдено:
   ❌ ЗАПРЕЩЕНО: «этого нет в базе», «я не знаю», «информации нет», «не можем предоставить информацию», «обратитесь в поддержку/техподдержку»
   ✅ ОБЯЗАТЕЛЬНО: коротко признать проблему, запросить 1–3 конкретных уточнения, предложить следующий практический шаг

4. ПРАВИЛА СЕРВИСА (КРИТИЧЕСКИ ВАЖНО)
• Минимальная сумма вывода: 20 USD
• Выплата невозможна, если баланс ниже минимального
• Правила одинаковы для всех языков и регионов
• Пример: клиент пишет «I want to withdraw 13$» → ответь по факту (мин. 20 USD), на его языке

5. ПЕРЕДАЧА СООБЩЕНИЙ В DRAFT
• Любое сообщение клиента передаётся БУКВАЛЬНО. ? → ?. «где ты» → «где ты».
• ❌ Запрещено интерпретировать, переписывать, «улучшать»

6. ФОТО / ВЛОЖЕНИЯ
• Фото ОБЯЗАТЕЛЬНО учитывается. Ответ на том же языке, что и подпись / предыдущие сообщения.
• Фото НЕ должно сбрасывать язык диалога.

7. ТОН
• Спокойный, человеческий. Без канцелярита. Без извинений «на всякий случай».
• Никаких тупиковых отказов. Ответ всегда должен продвигать решение вперёд.

ФОРМАТ ОТВЕТА
Выведи ТОЛЬКО текст ответа на русском. Без «Ответ (RU):», без JSON, без пояснений, без markdown — только сам ответ.`;

export const LEAD_UNIFIED_SYSTEM = `Роль
Ты — менеджер/поддержка платформы aso.market.
Ты отвечаешь лидам и клиентам в чате от имени сервиса.

⸻
ЖЁСТКИЕ ПРАВИЛА

1. ЯЗЫК
• Ответ клиенту будет переведён на его язык автоматически. Ты формируешь ТОЛЬКО русский текст.
• Не добавляй в текст названия языков, метки «Ответ на …», «Язык: …».

2. БАЗА ЗНАНИЙ
• Опирайся на предоставленный блок базы знаний. Не выдумывай цены, сроки и гарантии позиций в выдаче.
• Если данных мало — задай 1–3 уточняющих вопроса (платформа, регион, цель: ключи / отзывы / аналитика).

3. ТЕМАТИКА
• aso.market: ASO, App Store и Google Play, мотивированные установки, отзывы и рейтинги, трекинг позиций, конкуренты, API, личный кабинет.
• Не смешивай с другими сервисами (задания, вывод средств и т.п.).

4. СООБЩЕНИЯ КЛИЕНТА
• Передаются буквально; короткие символы (? !) не перефразируй.

5. ТОН
• Деловой, спокойный. Без тупиковых отказов — всегда следующий шаг.

ФОРМАТ
Выведи ТОЛЬКО текст ответа на русском. Без JSON и markdown.`;

export function sanitizeForAiInput(s: string): string {
  if (typeof s !== "string" || !s) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const code = c.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s[i + 1];
      if (next && next.charCodeAt(0) >= 0xdc00 && next.charCodeAt(0) <= 0xdfff) {
        out += c + next;
        i++;
      } else {
        out += "\uFFFD";
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }
    if (code >= 0x00 && code <= 0x1f && code !== 0x0a && code !== 0x0d && code !== 0x09) {
      out += " ";
      continue;
    }
    if (c === "\\" && s[i + 1] === "u") {
      const hex = s.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        out += " u";
        i++;
        continue;
      }
    }
    out += c;
  }
  return out;
}

export async function generateUnifiedRuDraft(env: Env, prompt: string): Promise<string> {
  try {
    const truncatedPrompt =
      prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS - 100) + "\n\n[текст обрезан из-за лимита контекста]" : prompt;

    const safePrompt = sanitizeForAiInput(truncatedPrompt);
    const safeSystem = sanitizeForAiInput(UNIFIED_SYSTEM);

    const model = env.MODEL || "@cf/meta/llama-3.1-70b-instruct";
    const res = await retryWithBackoff(
      async () =>
        await env.AI.run(model, {
          messages: [
            { role: "system", content: safeSystem },
            { role: "user", content: safePrompt },
          ],
          max_tokens: 700,
          temperature: 0.25,
        }),
      3,
      300
    );

    const raw =
      (res as any)?.response ??
      (res as any)?.result ??
      (res as any)?.text ??
      (res as any)?.content ??
      "";
    let cleaned = stripMetaArtifacts(String(raw).trim());
    cleaned = cleaned.replace(/^\s*Ответ\s*\(\s*RU\s*\)\s*:?\s*/i, "").trim();
    if (!cleaned) return buildSafeSupportFallbackRu(prompt);
    if (isDeadEndSupportReply(cleaned)) return buildSafeSupportFallbackRu(prompt);
    return cleaned.length > MAX_DRAFT_LENGTH
      ? cleaned.slice(0, MAX_DRAFT_LENGTH - 3).trimEnd() + "..."
      : cleaned;
  } catch (err: any) {
    console.error("generateUnifiedRuDraft error:", err?.message || err);
    logError(env, "llm", "LLM_TIMEOUT", err, null).catch(() => {});
    return buildSafeSupportFallbackRu(prompt);
  }
}

export async function generateLeadUnifiedRuDraft(env: Env, prompt: string): Promise<string> {
  try {
    const truncatedPrompt =
      prompt.length > MAX_PROMPT_CHARS
        ? prompt.slice(0, MAX_PROMPT_CHARS - 100) + "\n\n[текст обрезан из-за лимита контекста]"
        : prompt;

    const safePrompt = sanitizeForAiInput(truncatedPrompt);
    const safeSystem = sanitizeForAiInput(LEAD_UNIFIED_SYSTEM);

    const model = env.MODEL || "@cf/meta/llama-3.1-70b-instruct";
    const res = await retryWithBackoff(
      async () =>
        await env.AI.run(model, {
          messages: [
            { role: "system", content: safeSystem },
            { role: "user", content: safePrompt },
          ],
          max_tokens: 700,
          temperature: 0.25,
        }),
      3,
      300
    );

    const raw =
      (res as any)?.response ??
      (res as any)?.result ??
      (res as any)?.text ??
      (res as any)?.content ??
      "";
    let cleaned = stripMetaArtifacts(String(raw).trim());
    cleaned = cleaned.replace(/^\s*Ответ\s*\(\s*RU\s*\)\s*:?\s*/i, "").trim();
    if (!cleaned) return buildLeadSafeFallbackRu();
    if (isDeadEndSupportReply(cleaned)) return buildLeadSafeFallbackRu();
    return cleaned.length > MAX_DRAFT_LENGTH
      ? cleaned.slice(0, MAX_DRAFT_LENGTH - 3).trimEnd() + "..."
      : cleaned;
  } catch (err: any) {
    console.error("generateLeadUnifiedRuDraft error:", err?.message || err);
    logError(env, "llm", "LLM_TIMEOUT", err, null).catch(() => {});
    return buildLeadSafeFallbackRu();
  }
}
