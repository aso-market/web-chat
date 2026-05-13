import { useEffect, useMemo, useRef, useState } from "react";
import {
  AIChatCard,
  AIChatLayoutName,
  AIChatMessage,
  AI_CHAT_THEMES,
  AIChatThemeName,
  AIChatThemeTokens,
} from "../ui/ai-chat";

type ChatContainerProps = {
  projectId?: string;
  customerId?: string;
  apiBase?: string;
  signature?: string;
  conversationIdOverride?: string;
  storageKeyOverride?: string;
  themeOverride?: AIChatThemeName;
  titleOverride?: string;
  subtitleOverride?: string;
  welcomeTextOverride?: string;
  placeholderOverride?: string;
  avatarOverride?: string;
  backgroundOverride?: string;
  layoutOverride?: AIChatLayoutName;
  lockViewport?: boolean;
};

type ChatBootstrapPayload = {
  projectId?: string;
  customerId?: string;
  apiBase?: string;
  signature?: string;
  conversationId?: string;
  theme?: AIChatThemeName;
  layout?: AIChatLayoutName;
  title?: string;
  subtitle?: string;
  welcomeText?: string;
  placeholder?: string;
  sendLabel?: string;
  avatar?: string;
  background?: string;
  themePrimary?: string;
  themeButtonColor?: string;
  themeBubbleClientBg?: string;
  themeBubbleClientText?: string;
  themeBubbleSupportBg?: string;
  themeBubbleSupportText?: string;
  themeBackground?: string;
  themeSurface?: string;
  themeHeaderColor?: string;
};

type WebchatConfig = {
  title?: string;
  subtitle?: string;
  welcomeText?: string;
  placeholder?: string;
  widgetIcon?: string;
  primaryColor?: string;
  buttonColor?: string;
  bubbleClientBg?: string;
  bubbleClientText?: string;
  bubbleSupportBg?: string;
  bubbleSupportText?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  headerColor?: string;
  incomingBubbleColor?: string;
  outgoingBubbleColor?: string;
};

type InitResponse = {
  ok: boolean;
  projectId: string;
  conversationId: string;
  projectConfig?: WebchatConfig;
  error?: string;
};

type BackendMessage = {
  id: number | null;
  role: "client" | "support" | "client_edit" | string;
  text: string;
  ts: number;
};

function hasMessageById(messages: AIChatMessage[], id: number | null): boolean {
  if (typeof id !== "number") return false;
  return messages.some((m) => m.id === id);
}

const CHAT_THEME_KEYS: Record<string, AIChatThemeName> = {
  demo: "neon-blue",
  nightops: "emerald-night",
};

const DEFAULT_WEBCHAT_API_BASE =
  import.meta.env.VITE_API_BASE || window.location.origin;

const normalizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

function getBootstrapPayload(value: unknown): ChatBootstrapPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as ChatBootstrapPayload;
}

function getParentOrigin(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : "*";
  } catch {
    return "*";
  }
}

function getViewportHeight(): number {
  return Math.max(
    1,
    Math.round(
      window.visualViewport?.height ||
        window.innerHeight ||
        document.documentElement.clientHeight,
    ),
  );
}

function syncViewportHeight() {
  const height = `${getViewportHeight()}px`;
  document.documentElement.style.setProperty("--chat-viewport-height", height);
  document.body.style.setProperty("--chat-viewport-height", height);
  document.getElementById("app")?.style.setProperty(
    "--chat-viewport-height",
    height,
  );
}

function toDisplayMessage(message: BackendMessage): AIChatMessage {
  const role = message.role === "support" ? "assistant" : "user";
  return {
    id: message.id ?? `${message.role}-${message.ts}-${Math.random()}`,
    role,
    text: message.text,
    timestamp: Number.isFinite(message.ts)
      ? new Date(message.ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : undefined,
  };
}

function parseThemeFromQuery(
  params: URLSearchParams,
): AIChatThemeName | undefined {
  const value = (params.get("theme") || "").trim() as AIChatThemeName;
  const all = Object.keys(AI_CHAT_THEMES) as AIChatThemeName[];
  return all.includes(value) ? value : undefined;
}

function parseLayoutFromQuery(
  params: URLSearchParams,
): AIChatLayoutName | undefined {
  const value = (params.get("layout") || "").trim() as AIChatLayoutName;
  return value === "card" || value === "plain" ? value : undefined;
}

export function ChatContainer(props: ChatContainerProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const isBootstrapMode = params.get("bootstrap") === "1";
  const bootstrapToken = normalizeString(params.get("bootstrapToken"));
  const [bootstrapConfig, setBootstrapConfig] =
    useState<ChatBootstrapPayload | null>(null);
  const parentOrigin = useMemo(() => getParentOrigin(), []);

  const bootstrapProjectId = normalizeString(bootstrapConfig?.projectId);
  const bootstrapCustomerId = normalizeString(bootstrapConfig?.customerId);
  const bootstrapApiBase = normalizeString(bootstrapConfig?.apiBase);
  const bootstrapSignature = normalizeString(bootstrapConfig?.signature);
  const bootstrapConversationId = normalizeString(
    bootstrapConfig?.conversationId,
  );
  const bootstrapTheme = bootstrapConfig?.theme;
  const bootstrapLayout = bootstrapConfig?.layout;

  const inputProjectId =
    props.projectId ??
    (bootstrapProjectId || normalizeString(params.get("projectId")));
  const customerId =
    props.customerId ??
    (bootstrapCustomerId || normalizeString(params.get("customerId")));
  const apiBase = (
    props.apiBase ??
    (bootstrapApiBase ||
      params.get("apiBase") ||
      DEFAULT_WEBCHAT_API_BASE)
  ).replace(/\/+$/, "");
  const signature =
    props.signature ??
    (bootstrapSignature || normalizeString(params.get("signature")));
  const queryConversationId =
    bootstrapConversationId || normalizeString(params.get("conversationId"));
  const themeParam = parseThemeFromQuery(params);
  const layoutParam = parseLayoutFromQuery(params);
  const storageKey =
    props.storageKeyOverride ||
    (inputProjectId && customerId
      ? `support_widget_conversation:${inputProjectId}:customer:${customerId}`
      : inputProjectId
        ? `support_widget_conversation:${inputProjectId}`
        : customerId
          ? `support_widget_conversation:customer:${customerId}`
          : "");
  const storedConversationId =
    storageKey ? localStorage.getItem(storageKey) || "" : "";
  const seededConversationId =
    props.conversationIdOverride ||
    queryConversationId ||
    storedConversationId;
  const [conversationId, setConversationId] = useState(
    seededConversationId,
  );
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [resolvedProjectId, setResolvedProjectId] = useState(inputProjectId);
  const [statusText, setStatusText] = useState("Initializing chat...");
  const [errorText, setErrorText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [themeName, setThemeName] = useState<AIChatThemeName>(
    props.themeOverride || bootstrapTheme || themeParam || "neon-blue",
  );
  const [projectConfig, setProjectConfig] = useState<WebchatConfig | undefined>(
    undefined,
  );
  const lastMessageIdRef = useRef(0);
  const streamRef = useRef<EventSource | null>(null);
  const sendInFlightRef = useRef(false);
  const lastSentRef = useRef<{ text: string; ts: number } | null>(null);
  const shouldLockViewport =
    props.lockViewport ??
    (!props.projectId &&
      !props.customerId &&
      !props.conversationIdOverride &&
      !props.storageKeyOverride);

  const titleOverride =
    props.titleOverride ??
    (normalizeString(bootstrapConfig?.title) ||
      normalizeString(params.get("title")));
  const subtitleOverride =
    props.subtitleOverride ??
    (normalizeString(bootstrapConfig?.subtitle) ||
      normalizeString(params.get("subtitle") || params.get("description")));
  const placeholderOverride =
    props.placeholderOverride ??
    (normalizeString(bootstrapConfig?.placeholder) ||
      normalizeString(params.get("placeholder")));
  const welcomeOverride =
    props.welcomeTextOverride ??
    (normalizeString(bootstrapConfig?.welcomeText) ||
      normalizeString(params.get("welcomeText")));
  const sendLabelOverride =
    normalizeString(bootstrapConfig?.sendLabel) ||
    normalizeString(params.get("sendLabel"));
  const themePrimary =
    normalizeString(bootstrapConfig?.themePrimary) ||
    normalizeString(params.get("themePrimary"));
  const themeButtonColor =
    normalizeString(bootstrapConfig?.themeButtonColor) ||
    normalizeString(params.get("themeButtonColor"));
  const themeBubbleClientBg =
    normalizeString(bootstrapConfig?.themeBubbleClientBg) ||
    normalizeString(params.get("themeBubbleClientBg"));
  const themeBubbleClientText =
    normalizeString(bootstrapConfig?.themeBubbleClientText) ||
    normalizeString(params.get("themeBubbleClientText"));
  const themeBubbleSupportBg =
    normalizeString(bootstrapConfig?.themeBubbleSupportBg) ||
    normalizeString(params.get("themeBubbleSupportBg"));
  const themeBubbleSupportText =
    normalizeString(bootstrapConfig?.themeBubbleSupportText) ||
    normalizeString(params.get("themeBubbleSupportText"));
  const themeBackground =
    normalizeString(bootstrapConfig?.themeBackground) ||
    normalizeString(params.get("themeBackground"));
  const themeSurface =
    normalizeString(bootstrapConfig?.themeSurface) ||
    normalizeString(params.get("themeSurface"));
  const themeHeaderColor =
    normalizeString(bootstrapConfig?.themeHeaderColor) ||
    normalizeString(params.get("themeHeaderColor"));
  const backgroundOverride =
    props.backgroundOverride || normalizeString(bootstrapConfig?.background);

  const visualProjectConfig =
    props.themeOverride || bootstrapTheme || themeParam
      ? undefined
      : projectConfig;

  useEffect(() => {
    if (!conversationId && seededConversationId) {
      setConversationId(seededConversationId);
    }
  }, [conversationId, seededConversationId]);

  useEffect(() => {
    const nextTheme =
      props.themeOverride || bootstrapTheme || themeParam || "neon-blue";
    setThemeName(nextTheme);
  }, [bootstrapTheme, props.themeOverride, themeParam]);

  useEffect(() => {
    if (!isBootstrapMode) {
      return;
    }

    const handleBootstrapMessage = (event: MessageEvent) => {
      if (parentOrigin !== "*" && event.origin !== parentOrigin) {
        return;
      }

      const message =
        event.data && typeof event.data === "object"
          ? (event.data as Record<string, unknown>)
          : null;
      if (!message || message.type !== "webchat:bootstrap") {
        return;
      }

      const incomingToken = normalizeString(message.bootstrapToken);
      if (bootstrapToken && incomingToken !== bootstrapToken) {
        return;
      }

      const payload = getBootstrapPayload(message.payload);
      if (!payload) {
        return;
      }

      setBootstrapConfig(payload);
      setErrorText("");
      setStatusText("");
    };

    setStatusText("Waiting for host...");
    setErrorText("");
    window.addEventListener("message", handleBootstrapMessage);

    return () => {
      window.removeEventListener("message", handleBootstrapMessage);
    };
  }, [bootstrapToken, isBootstrapMode, parentOrigin]);

  const tokensOverride = useMemo<Partial<AIChatThemeTokens>>(() => {
    const next: Partial<AIChatThemeTokens> = {};

    const accent = themePrimary || visualProjectConfig?.primaryColor;
    if (accent) next.accent = accent;

    const sendButtonBg = themeButtonColor || visualProjectConfig?.buttonColor;
    if (sendButtonBg) next.sendButtonBg = sendButtonBg;

    const aiBubbleBg =
      themeBubbleSupportBg ||
      visualProjectConfig?.incomingBubbleColor ||
      visualProjectConfig?.bubbleSupportBg;
    if (aiBubbleBg) next.aiBubbleBg = aiBubbleBg;

    const aiBubbleText =
      themeBubbleSupportText || visualProjectConfig?.bubbleSupportText;
    if (aiBubbleText) next.aiBubbleText = aiBubbleText;

    const userBubbleBg =
      themeBubbleClientBg ||
      visualProjectConfig?.outgoingBubbleColor ||
      visualProjectConfig?.bubbleClientBg;
    if (userBubbleBg) next.userBubbleBg = userBubbleBg;

    const userBubbleText =
      themeBubbleClientText || visualProjectConfig?.bubbleClientText;
    if (userBubbleText) next.userBubbleText = userBubbleText;

    const surface = themeSurface || visualProjectConfig?.surfaceColor;
    if (surface) {
      next.shellBg = surface;
      next.inputBg = surface;
    }

    const headerBg = themeHeaderColor || visualProjectConfig?.headerColor;
    if (headerBg) next.headerBg = headerBg;

    if (themeBackground) next.shellBorder = `${themeBackground}aa`;

    return next;
  }, [
    visualProjectConfig,
    themeBackground,
    themeBubbleClientBg,
    themeBubbleClientText,
    themeBubbleSupportBg,
    themeBubbleSupportText,
    themeButtonColor,
    themeHeaderColor,
    themePrimary,
    themeSurface,
  ]);

  useEffect(() => {
    if (isBootstrapMode && !inputProjectId && !customerId) {
      setErrorText("");
      setStatusText("Waiting for host...");
      return;
    }

    if (!inputProjectId && !customerId) {
      setErrorText("Missing projectId or customerId query param.");
      setStatusText("");
    }
  }, [customerId, inputProjectId, isBootstrapMode]);

  useEffect(() => {
    if (!inputProjectId && !customerId) return;
    let cancelled = false;

    const initAndLoad = async () => {
      setErrorText("");
      setStatusText("Initializing chat...");
      try {
        const payload: Record<string, string> = {};
        if (inputProjectId) payload.projectId = inputProjectId;
        if (customerId) payload.customerId = customerId;
        if (conversationId || seededConversationId) {
          payload.conversationId = conversationId || seededConversationId;
        }
        if (signature) payload.signature = signature;

        const initRes = await fetch(`${apiBase}/api/webchat/init`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const initBody = (await initRes.json()) as InitResponse;
        if (!initRes.ok || !initBody.ok)
          throw new Error(initBody.error || "init_failed");
        if (cancelled) return;

        setConversationId(initBody.conversationId);
        setResolvedProjectId(initBody.projectId);
        setProjectConfig(initBody.projectConfig);
        setThemeName(
          props.themeOverride ||
            themeParam ||
            CHAT_THEME_KEYS[initBody.projectId] ||
            "neon-blue",
        );
        if (storageKey) {
          localStorage.setItem(storageKey, initBody.conversationId);
          window.parent?.postMessage(
            {
              type: "webchat:conversation",
              projectId: initBody.projectId,
              conversationId: initBody.conversationId,
            },
            parentOrigin,
          );
        }

        const historyParams = new URLSearchParams({
          projectId: initBody.projectId,
          conversationId: initBody.conversationId,
          limit: "100",
        });
        if (signature) historyParams.set("signature", signature);
        const historyRes = await fetch(
          `${apiBase}/api/webchat/messages?${historyParams.toString()}`,
        );
        const historyBody = (await historyRes.json()) as {
          ok: boolean;
          messages?: BackendMessage[];
          lastMessageId?: number;
          error?: string;
        };
        if (!historyRes.ok || !historyBody.ok)
          throw new Error(historyBody.error || "history_failed");
        if (cancelled) return;

        const nextMessages = (historyBody.messages || []).map(toDisplayMessage);
        setMessages(nextMessages);
        lastMessageIdRef.current =
          historyBody.lastMessageId || lastMessageIdRef.current;

        if (streamRef.current) streamRef.current.close();
        const streamParams = new URLSearchParams({
          projectId: initBody.projectId,
          conversationId: initBody.conversationId,
          sinceId: String(lastMessageIdRef.current || 0),
        });
        if (signature) streamParams.set("signature", signature);
        const stream = new EventSource(
          `${apiBase}/api/webchat/stream?${streamParams.toString()}`,
        );
        streamRef.current = stream;
        stream.addEventListener("open", () => setStatusText(""));
        // Keep silent on transient SSE reconnects to avoid "stuck reconnecting" UX noise.
        stream.addEventListener("error", () => setStatusText(""));
        stream.addEventListener("message", (event) => {
          try {
            const payload = JSON.parse(event.data) as BackendMessage;
            if (
              typeof payload.id === "number" &&
              payload.id <= lastMessageIdRef.current
            )
              return;
            if (typeof payload.id === "number")
              lastMessageIdRef.current = payload.id;
            setMessages((prev) => {
              if (hasMessageById(prev, payload.id)) return prev;
              return [...prev, toDisplayMessage(payload)];
            });
          } catch {
            // ignore malformed payload
          }
        });
      } catch (error) {
        if (!cancelled) setErrorText(String((error as Error).message || error));
      } finally {
        if (!cancelled) setStatusText("");
      }
    };

    void initAndLoad();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
    };
  }, [
    apiBase,
    customerId,
    inputProjectId,
    parentOrigin,
    props.themeOverride,
    seededConversationId,
    signature,
    storageKey,
    themeParam,
    queryConversationId,
  ]);

  const send = async (text: string) => {
    if (!resolvedProjectId || !conversationId || sendInFlightRef.current)
      return;
    const now = Date.now();
    const prev = lastSentRef.current;
    if (prev && prev.text === text && now - prev.ts < 1500) return;
    lastSentRef.current = { text, ts: now };
    sendInFlightRef.current = true;
    setErrorText("");
    setStatusText("Sending...");
    setIsSending(true);
    try {
      const body: Record<string, string> = {
        projectId: resolvedProjectId,
        conversationId,
        text,
      };
      if (signature) body.signature = signature;
      const response = await fetch(`${apiBase}/api/webchat/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        message?: BackendMessage;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.message) {
        throw new Error(payload.error || "send_failed");
      }
      if (typeof payload.message.id === "number") {
        lastMessageIdRef.current = Math.max(
          lastMessageIdRef.current,
          payload.message.id,
        );
      }
      setMessages((prev) => {
        if (hasMessageById(prev, payload.message?.id ?? null)) return prev;
        return [...prev, toDisplayMessage(payload.message as BackendMessage)];
      });
    } catch (error) {
      setErrorText(String((error as Error).message || error));
    } finally {
      sendInFlightRef.current = false;
      setStatusText("");
      setIsSending(false);
    }
  };

  const appBackground =
    backgroundOverride ||
    themeBackground ||
    visualProjectConfig?.backgroundColor ||
    AI_CHAT_THEMES[themeName].shellBg;

  useEffect(() => {
    if (!shouldLockViewport) {
      return;
    }

    const app = document.getElementById("app");

    document.documentElement.classList.add("chat-viewport-locked");
    document.body.classList.add("chat-viewport-locked");
    app?.classList.add("chat-viewport-locked");
    syncViewportHeight();

    const syncSoon = () => {
      syncViewportHeight();
      window.setTimeout(syncViewportHeight, 80);
      window.setTimeout(syncViewportHeight, 260);
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncSoon);
    viewport?.addEventListener("scroll", syncSoon);
    window.addEventListener("resize", syncSoon);
    window.addEventListener("orientationchange", syncSoon);

    return () => {
      viewport?.removeEventListener("resize", syncSoon);
      viewport?.removeEventListener("scroll", syncSoon);
      window.removeEventListener("resize", syncSoon);
      window.removeEventListener("orientationchange", syncSoon);
      document.documentElement.classList.remove("chat-viewport-locked");
      document.body.classList.remove("chat-viewport-locked");
      app?.classList.remove("chat-viewport-locked");
      document.documentElement.style.removeProperty("--chat-viewport-height");
      document.body.style.removeProperty("--chat-viewport-height");
      app?.style.removeProperty("--chat-viewport-height");
    };
  }, [shouldLockViewport]);

  useEffect(() => {
    const previousBodyBackground = document.body.style.background;
    const previousHtmlBackground = document.documentElement.style.background;

    document.body.style.background = appBackground;
    document.documentElement.style.background = appBackground;

    return () => {
      document.body.style.background = previousBodyBackground;
      document.documentElement.style.background = previousHtmlBackground;
    };
  }, [appBackground]);

  return (
    <div
      className="min-h-0 overflow-hidden"
      style={{
        background: appBackground,
        height: shouldLockViewport
          ? "var(--chat-viewport-height, 100dvh)"
          : "100%",
      }}
    >
      <AIChatCard
        messages={messages}
        onSend={send}
        isSending={isSending}
        isTyping={statusText.includes("Realtime")}
        statusText={statusText}
        errorText={errorText}
        theme={themeName}
        layout={props.layoutOverride || bootstrapLayout || layoutParam || "card"}
        tokensOverride={tokensOverride}
        title={titleOverride || projectConfig?.title}
        subtitle={subtitleOverride || projectConfig?.subtitle}
        welcomeText={welcomeOverride || projectConfig?.welcomeText}
        placeholder={placeholderOverride || projectConfig?.placeholder}
        sendLabel={sendLabelOverride}
        avatar={props.avatarOverride || projectConfig?.widgetIcon || "💬"}
        fitViewport={shouldLockViewport}
      />
    </div>
  );
}
