export function detectClientLang(text: string): string {
  if (!text || text.trim().length === 0) {
    return 'en';
  }

  const t = text.trim();

  
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';

  
  if (/[\u0590-\u05FF]/.test(t)) return 'he';

  
  if (/[\u0E00-\u0E7F]/.test(t)) return 'th';

  
  if (/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(t)) return 'zh';

  
  if (/[\u0400-\u04FF]/.test(t)) {
    if (/[іїєґІЇЄҐ]/.test(t)) return 'uk';
    return 'ru';
  }

  
  
  return 'en';
}

export const SUPPORTED_LANG_CODES = [
  'ar', 'cs', 'de', 'en', 'es',
  'fa', 'fi', 'fr', 'he',
  'hr', 'hu', 'id', 'it',
  'ja', 'kk', 'ko', 'ms',
  'nl', 'no', 'pl', 'pt',
  'ro', 'ru', 'sk', 'sr',
  'sv', 'th', 'tr', 'uk',
  'uz', 'vi', 'zh',
] as const;

export type SupportedLangCode = (typeof SUPPORTED_LANG_CODES)[number];

export function looksEnglish(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = text.toLowerCase();

  
  if (/[\u0400-\u04FF]/.test(t)) return false; 
  if (/[\u0600-\u06FF]/.test(t)) return false; 
  if (/[\u0590-\u05FF]/.test(t)) return false; 
  if (/[\u0E00-\u0E7F]/.test(t)) return false; 
  if (/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(t)) return false; 

  const sample = t.slice(0, 300);
  const englishMarkers = [
    ' the ', ' and ', ' you ', ' your ', ' we ',
    ' will ', ' can ', ' please ', ' to ', ' for ',
    ' on ', ' in ', ' with ', ' our ', ' from ',
  ];

  let hits = 0;
  for (const marker of englishMarkers) {
    if (sample.includes(marker)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

export function stripLanguageNamePrefix(text: string): string {
  if (!text) return text;
  const prefixRe = /^\s*(Arabic|Czech|German|English|Spanish|Persian|Finnish|French|Hebrew|Croatian|Hungarian|Indonesian|Italian|Japanese|Kazakh|Korean|Malay|Dutch|Norwegian|Polish|Portuguese|Romanian|Russian|Slovak|Serbian|Swedish|Thai|Turkish|Ukrainian|Uzbek|Vietnamese|Chinese)\s*[:\-–]\s*/i;
  return text.replace(prefixRe, '');
}

