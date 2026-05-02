export type WebchatThemeConfig = {
  title: string;
  subtitle: string;
  welcomeText: string;
  placeholder: string;
  widgetLabel: string;
  widgetIcon: string;
  primaryColor: string;
  buttonColor: string;
  bubbleClientBg: string;
  bubbleClientText: string;
  bubbleSupportBg: string;
  bubbleSupportText: string;
  backgroundColor: string;
  surfaceColor: string;
  headerColor: string;
  incomingBubbleColor: string;
  outgoingBubbleColor: string;
};

const FALLBACK_CONFIG: WebchatThemeConfig = {
  title: 'Support',
  subtitle: '',
  welcomeText: '',
  placeholder: 'Message',
  widgetLabel: 'Support',
  widgetIcon: '💬',
  primaryColor: '#3b82f6',
  buttonColor: '#2563eb',
  bubbleClientBg: '#1d4ed8',
  bubbleClientText: '#ffffff',
  bubbleSupportBg: '#1f2937',
  bubbleSupportText: '#f3f4f6',
  backgroundColor: '#0b1220',
  surfaceColor: '#111827',
  headerColor: '#0f172a',
  incomingBubbleColor: '#1f2937',
  outgoingBubbleColor: '#1d4ed8',
};

const PROJECT_CONFIGS: Record<string, Partial<WebchatThemeConfig>> = {
  demo: {
    title: 'Support',
    subtitle: '',
    welcomeText: '',
    placeholder: 'Message',
    widgetLabel: 'Support',
    widgetIcon: '🛟',
    primaryColor: '#3b82f6',
    buttonColor: '#2563eb',
    bubbleClientBg: '#1d4ed8',
    bubbleClientText: '#ffffff',
    bubbleSupportBg: '#1f2937',
    bubbleSupportText: '#f3f4f6',
    backgroundColor: '#0b1220',
    surfaceColor: '#111827',
    headerColor: '#0f172a',
    incomingBubbleColor: '#1f2937',
    outgoingBubbleColor: '#1d4ed8',
  },
  nightops: {
    title: 'Support',
    subtitle: '',
    welcomeText: '',
    placeholder: 'Message',
    widgetLabel: 'NightOps',
    widgetIcon: '🌙',
    primaryColor: '#22c55e',
    buttonColor: '#16a34a',
    bubbleClientBg: '#14532d',
    bubbleClientText: '#ecfdf5',
    bubbleSupportBg: '#1f2937',
    bubbleSupportText: '#f3f4f6',
    backgroundColor: '#0b1220',
    surfaceColor: '#111827',
    headerColor: '#0f172a',
    incomingBubbleColor: '#1f2937',
    outgoingBubbleColor: '#14532d',
  },
};

export function listWebchatProjectIds(): string[] {
  return Object.keys(PROJECT_CONFIGS);
}

export function resolveWebchatProjectConfig(projectId: string): WebchatThemeConfig {
  const projectSpecific = PROJECT_CONFIGS[projectId] || {};
  return {
    ...FALLBACK_CONFIG,
    ...projectSpecific,
  };
}

