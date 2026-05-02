export type LocalizedChatCopy = {
  title: string;
  placeholder: string;
  sendLabel: string;
};

const DEFAULT_COPY: LocalizedChatCopy = {
  title: "Support",
  placeholder: "Message",
  sendLabel: "Send",
};

const LOCALIZED_COPY_BY_LANGUAGE: Record<string, Partial<LocalizedChatCopy>> = {
  am: {"title":"ድጋፍ","placeholder":"መልእክት","sendLabel":"ላክ"},
  ar: {"title":"الدعم","placeholder":"رسالة","sendLabel":"إرسال"},
  az: {"title":"Dəstəyi","placeholder":"Mesaj","sendLabel":"Göndər"},
  be: {"title":"Падтрымка","placeholder":"Паведамленне","sendLabel":"Адправіць"},
  bn: {"title":"সমর্থন","placeholder":"বার্তা","sendLabel":"পাঠান"},
  cs: {"title":"Podpora","placeholder":"Zpráva","sendLabel":"Odeslat"},
  de: {"title":"Unterstützung","placeholder":"Nachricht","sendLabel":"Senden"},
  el: {"title":"Υποστήριξη","placeholder":"Μήνυμα","sendLabel":"Αποστολή"},
  es: {"title":"Soporte","placeholder":"Mensaje","sendLabel":"Enviar"},
  fa: {"title":"پشتیبانی","placeholder":"پیام","sendLabel":"ارسال"},
  fi: {"title":"-tuki","placeholder":"Viesti","sendLabel":"Lähetä"},
  fr: {"title":"Assistance","placeholder":"Votre message","sendLabel":"Envoyer"},
  hi: {"title":"समर्थन","placeholder":"संदेश","sendLabel":"भेजें"},
  hr: {"title":"Podrška","placeholder":"Poruka","sendLabel":"Pošalji"},
  hu: {"title":"támogatás","placeholder":"Üzenet","sendLabel":"Küldés"},
  hy: {"title":"Աջակցություն","placeholder":"Հաղորդագրություն","sendLabel":"Ուղարկել"},
  id: {"title":"Mendukung","placeholder":"Pesan","sendLabel":"Kirim"},
  it: {"title":"Supporto","placeholder":"Messaggio","sendLabel":"Invia"},
  ja: {"title":"サポート","placeholder":"メッセージ","sendLabel":"送信"},
  ka: {"title":"მხარდაჭერა","placeholder":"შეტყობინება","sendLabel":"გაგზავნა"},
  km: {"title":"គាំទ្រ","placeholder":"សារ","sendLabel":"ផ្ញើ"},
  ko: {"title":"지원","placeholder":"메시지","sendLabel":"보내기"},
  mg: {"title":"MANAMPY","placeholder":"Hafatra","sendLabel":"Alefaso"},
  ms: {"title":"Sokongan","placeholder":"Mesej","sendLabel":"Hantar"},
  my: {"title":"ပံ့ပိုးမှု","placeholder":"မက်ဆေ့ချ်","sendLabel":"ပို့ရန်"},
  nl: {"title":"Ondersteuning","placeholder":"Bericht","sendLabel":"Verzenden"},
  no: {"title":"Støtte","placeholder":"Melding","sendLabel":"Send inn"},
  pl: {"title":"Wsparcie","placeholder":"Wiadomość","sendLabel":"Wyślij"},
  pt: {"title":"Suporte","placeholder":"Mensagem","sendLabel":"Enviar"},
  ro: {"title":"Asistență","placeholder":"Mesaj","sendLabel":"Trimite"},
  ru: {"title":"Поддержка","placeholder":"Сообщение","sendLabel":"Отправить"},
  sk: {"title":"Podpora","placeholder":"Správa","sendLabel":"Odoslať"},
  so: {"title":"Taageero","placeholder":"Farriin","sendLabel":"Dir"},
  sr: {"title":"Подршка","placeholder":"Порука","sendLabel":"Пошаљи"},
  sv: {"title":"Stöd","placeholder":"Meddelande","sendLabel":"Skicka"},
  sw: {"title":"Msaada","placeholder":"Ujumbe","sendLabel":"Tuma"},
  th: {"title":"สนับสนุน","placeholder":"ข้อความ","sendLabel":"ส่ง"},
  tr: {"title":"Destek","placeholder":"Mesaj","sendLabel":"Gönder"},
  uk: {"title":"Підтримка","placeholder":"Повідомлення","sendLabel":"Надіслати"},
  ur: {"title":"سپورٹ","placeholder":"پیغام","sendLabel":"بھیجیں"},
  vi: {"title":"Hỗ trợ","placeholder":"Tin nhắn","sendLabel":"Gửi"},
};

const normalizeLanguageCode = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase().replace("_", "-");
  if (!normalized) {
    return "en";
  }

  return normalized.split("-")[0] || "en";
};

export const resolveChatLanguage = (
  searchParams: URLSearchParams,
  fallback?: string | null,
) =>
  normalizeLanguageCode(
    searchParams.get("lang") ||
      searchParams.get("language") ||
      searchParams.get("locale") ||
      fallback,
  );

export const getLocalizedChatCopy = (
  searchParams: URLSearchParams,
  fallback?: string | null,
): LocalizedChatCopy => {
  const language = resolveChatLanguage(searchParams, fallback);
  return {
    ...DEFAULT_COPY,
    ...(LOCALIZED_COPY_BY_LANGUAGE[language] || {}),
  };
};
