export function detectLanguage(text: string): string {
  if (!text || text.trim().length === 0) {
    return 'latin';
  }

  
  const cyrillicRegex = /[\u0400-\u04FF]/;
  if (cyrillicRegex.test(text)) {
    return 'ru';
  }

  
  
  
  return 'latin';
}
