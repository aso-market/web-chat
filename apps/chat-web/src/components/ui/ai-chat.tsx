import { AnimatePresence, motion } from "framer-motion";
import { SendHorizontal } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";

export type AIChatThemeName =
  | "neon-blue"
  | "violet-noir"
  | "emerald-night"
  | "crimson-carbon"
  | "amber-obsidian"
  | "qickcash-dark";

export type AIChatLayoutName = "card" | "plain";

export type AIChatRole = "assistant" | "user";

export type AIChatMessage = {
  id: string | number;
  role: AIChatRole;
  text: string;
  timestamp?: string;
};

export type AIChatThemeTokens = {
  title: string;
  subtitle: string;
  welcomeText: string;
  placeholder: string;
  accent: string;
  shellBg: string;
  shellBorder: string;
  shellGlow: string;
  headerBg: string;
  headerBorder: string;
  inputBg: string;
  inputBorder: string;
  inputFocusRing: string;
  sendButtonBg: string;
  sendButtonText: string;
  aiBubbleBg: string;
  aiBubbleText: string;
  userBubbleBg: string;
  userBubbleText: string;
  typingTint: string;
  particleTint: string;
};

export const AI_CHAT_THEMES: Record<AIChatThemeName, AIChatThemeTokens> = {
  "neon-blue": {
    title: "Support",
    subtitle: "",
    welcomeText: "",
    placeholder: "Message",
    accent: "#38bdf8",
    shellBg: "#070b16",
    shellBorder: "#1e2a44",
    shellGlow: "0 30px 82px rgba(56, 189, 248, 0.24)",
    headerBg: "#0b1630",
    headerBorder: "#1f3b66",
    inputBg: "#0a1325",
    inputBorder: "#1d3358",
    inputFocusRing: "rgba(56, 189, 248, 0.38)",
    sendButtonBg: "#0ea5e9",
    sendButtonText: "#f0f9ff",
    aiBubbleBg: "#214b8f",
    aiBubbleText: "#dbeafe",
    userBubbleBg: "#1d4ed8",
    userBubbleText: "#eff6ff",
    typingTint: "#7dd3fc",
    particleTint: "rgba(56, 189, 248, 0.18)",
  },
  "violet-noir": {
    title: "Support",
    subtitle: "",
    welcomeText: "",
    placeholder: "Message",
    accent: "#b794ff",
    shellBg: "#0c0913",
    shellBorder: "#2b1f3d",
    shellGlow: "0 30px 82px rgba(183, 148, 255, 0.25)",
    headerBg: "#171026",
    headerBorder: "#403063",
    inputBg: "#130f21",
    inputBorder: "#31254f",
    inputFocusRing: "rgba(167, 139, 250, 0.34)",
    sendButtonBg: "#8b5cf6",
    sendButtonText: "#f5f3ff",
    aiBubbleBg: "#4d2f78",
    aiBubbleText: "#ede9fe",
    userBubbleBg: "#6d28d9",
    userBubbleText: "#faf5ff",
    typingTint: "#c4b5fd",
    particleTint: "rgba(167, 139, 250, 0.18)",
  },
  "emerald-night": {
    title: "Support",
    subtitle: "",
    welcomeText: "",
    placeholder: "Message",
    accent: "#34d399",
    shellBg: "#050d0c",
    shellBorder: "#173a33",
    shellGlow: "0 28px 70px rgba(52, 211, 153, 0.15)",
    headerBg: "#0a1b18",
    headerBorder: "#1f4f45",
    inputBg: "#091714",
    inputBorder: "#1d463e",
    inputFocusRing: "rgba(52, 211, 153, 0.34)",
    sendButtonBg: "#059669",
    sendButtonText: "#ecfdf5",
    aiBubbleBg: "#1f4f45",
    aiBubbleText: "#d1fae5",
    userBubbleBg: "#047857",
    userBubbleText: "#ecfdf5",
    typingTint: "#6ee7b7",
    particleTint: "rgba(52, 211, 153, 0.17)",
  },
  "crimson-carbon": {
    title: "Support",
    subtitle: "",
    welcomeText: "",
    placeholder: "Message",
    accent: "#fb7185",
    shellBg: "#12090c",
    shellBorder: "#44202a",
    shellGlow: "0 28px 70px rgba(251, 113, 133, 0.14)",
    headerBg: "#1d0f14",
    headerBorder: "#5a2735",
    inputBg: "#180d12",
    inputBorder: "#4e2330",
    inputFocusRing: "rgba(251, 113, 133, 0.34)",
    sendButtonBg: "#be123c",
    sendButtonText: "#fff1f2",
    aiBubbleBg: "#5a2735",
    aiBubbleText: "#ffe4e6",
    userBubbleBg: "#9f1239",
    userBubbleText: "#fff1f2",
    typingTint: "#fda4af",
    particleTint: "rgba(251, 113, 133, 0.16)",
  },
  "amber-obsidian": {
    title: "Support",
    subtitle: "",
    welcomeText: "",
    placeholder: "Message",
    accent: "#fbbf24",
    shellBg: "#110d08",
    shellBorder: "#4b3820",
    shellGlow: "0 28px 70px rgba(251, 191, 36, 0.14)",
    headerBg: "#1b150d",
    headerBorder: "#6b4f24",
    inputBg: "#19130b",
    inputBorder: "#5d451d",
    inputFocusRing: "rgba(251, 191, 36, 0.34)",
    sendButtonBg: "#d97706",
    sendButtonText: "#fffbeb",
    aiBubbleBg: "#6b4f24",
    aiBubbleText: "#fef3c7",
    userBubbleBg: "#b45309",
    userBubbleText: "#fffbeb",
    typingTint: "#fcd34d",
    particleTint: "rgba(251, 191, 36, 0.16)",
  },
  "qickcash-dark": {
    title: "Support",
    subtitle: "",
    welcomeText: "",
    placeholder: "Message",
    accent: "#38E07A",
    shellBg: "#121714",
    shellBorder: "#2D3530",
    shellGlow: "0 18px 46px rgba(0, 0, 0, 0.28)",
    headerBg: "#1C2621",
    headerBorder: "#2D3530",
    inputBg: "#1C2621",
    inputBorder: "#3D5245",
    inputFocusRing: "rgba(56, 224, 122, 0.22)",
    sendButtonBg: "#38E07A",
    sendButtonText: "#121714",
    aiBubbleBg: "#29382E",
    aiBubbleText: "#FFFFFF",
    userBubbleBg: "#38E07A",
    userBubbleText: "#121714",
    typingTint: "#9EB8A8",
    particleTint: "rgba(56, 224, 122, 0.08)",
  },
};

export type AIChatCardProps = {
  messages: AIChatMessage[];
  onSend: (text: string) => Promise<void> | void;
  isSending?: boolean;
  isTyping?: boolean;
  statusText?: string;
  errorText?: string;
  theme?: AIChatThemeName;
  tokensOverride?: Partial<AIChatThemeTokens>;
  title?: string;
  subtitle?: string;
  welcomeText?: string;
  placeholder?: string;
  className?: string;
  avatar?: string;
  layout?: AIChatLayoutName;
  fitViewport?: boolean;
};

function typingDotsStyle(delayMs: number): Record<string, string | number> {
  return {
    animation: "pulse 1s infinite",
    animationDelay: `${delayMs}ms`,
  };
}

export function AIChatCard({
  messages,
  onSend,
  isSending = false,
  isTyping = false,
  statusText,
  errorText,
  theme = "neon-blue",
  tokensOverride,
  title,
  subtitle,
  welcomeText,
  placeholder,
  className,
  avatar = "🤖",
  layout = "card",
  fitViewport = true,
}: AIChatCardProps) {
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const submitLockRef = useRef(false);
  const sending = isSending;
  const isPlainLayout = layout === "plain";

  const tokens = useMemo(
    () => ({ ...AI_CHAT_THEMES[theme], ...tokensOverride }),
    [theme, tokensOverride],
  );

  const resolvedTitle = title || tokens.title;
  const resolvedSubtitle = subtitle || tokens.subtitle;
  const resolvedWelcome = welcomeText || tokens.welcomeText;
  const resolvedPlaceholder = placeholder || tokens.placeholder;
  const isQickCashTheme = theme === "qickcash-dark";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLockRef.current) return;
    const text = draft.trim();
    if (!text || sending) return;
    submitLockRef.current = true;
    setDraft("");
    try {
      await onSend(text);
    } finally {
      submitLockRef.current = false;
    }
  };

  const stabilizeViewport = () => {
    const resetScroll = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      rootRef.current?.scrollTo(0, 0);
    };

    resetScroll();
    window.setTimeout(resetScroll, 80);
    window.setTimeout(resetScroll, 260);
  };

  return (
    <div
      ref={rootRef}
      className={`flex w-full min-h-0 flex-col overflow-hidden ${fitViewport ? "" : "h-full"} ${isPlainLayout ? "px-3 pb-4 pt-2" : "mx-auto max-w-[760px] p-2"} ${className || ""}`}
      style={{
        background: "transparent",
        height: fitViewport ? "var(--chat-viewport-height, 100dvh)" : "100%",
        maxHeight: fitViewport
          ? "var(--chat-viewport-height, 100dvh)"
          : "100%",
      }}
    >
      <section
        className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${isPlainLayout ? "" : "rounded-[24px] border"}`}
        style={{
          background: isPlainLayout ? "transparent" : tokens.shellBg,
          borderColor: isPlainLayout ? "transparent" : tokens.shellBorder,
          boxShadow: isPlainLayout ? "none" : tokens.shellGlow,
        }}
      >
        {!isPlainLayout ? (
          <>
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(circle at 15% -20%, ${tokens.particleTint}, transparent 55%)`,
              }}
            />
            <header
              className="relative border-b px-5 pb-4 pt-4"
              style={{
                background: `linear-gradient(120deg, ${tokens.headerBg}, ${tokens.shellBg})`,
                borderColor: tokens.headerBorder,
              }}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full border text-lg"
                  style={{
                    borderColor: `${tokens.accent}55`,
                    background: `${tokens.accent}22`,
                    boxShadow: `0 8px 24px ${tokens.accent}30`,
                  }}
                >
                  {avatar || "•"}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="m-0 truncate text-[15px] font-semibold tracking-[0.01em] text-slate-100">
                    {resolvedTitle}
                  </h1>
                  {resolvedSubtitle ? (
                    <p className="m-0 mt-1 truncate text-xs text-slate-300">
                      {resolvedSubtitle}
                    </p>
                  ) : null}
                </div>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: tokens.accent,
                    boxShadow: `0 0 12px ${tokens.accent}`,
                  }}
                />
              </div>
              <div
                className="mt-4 h-px"
                style={{ background: `${tokens.headerBorder}aa` }}
              />
            </header>
          </>
        ) : null}

        <div
          className={`relative flex min-h-0 flex-1 flex-col ${isPlainLayout ? "gap-2" : "p-4"}`}
        >
          <div
            className={`chat-scroll min-h-0 flex-1 overflow-y-auto border p-3.5 ${isQickCashTheme ? "rounded-[22px]" : "rounded-2xl"}`}
            style={{
              background: isQickCashTheme
                ? "linear-gradient(180deg, rgba(28, 38, 33, 0.96), rgba(18, 23, 20, 0.98))"
                : `${tokens.shellBg}e8`,
              borderColor: isQickCashTheme
                ? "#2D3530"
                : `${tokens.shellBorder}cc`,
              boxShadow: isQickCashTheme
                ? "inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 36px rgba(0,0,0,0.18)"
                : `inset 0 1px 0 rgba(255,255,255,0.03)`,
            }}
          >
            {messages.length === 0 && resolvedWelcome ? (
              <div className="flex flex-col items-start">
                <div
                  className="inline-block max-w-[84%] rounded-[18px] px-3.5 py-2.5 text-sm leading-6"
                  style={{
                    background: isQickCashTheme
                      ? "linear-gradient(180deg, #2D3A31, #29382E)"
                      : `linear-gradient(180deg, ${tokens.aiBubbleBg}, ${tokens.aiBubbleBg})`,
                    color: tokens.aiBubbleText,
                    borderBottomRightRadius: 18,
                    borderBottomLeftRadius: 6,
                    border: `1px solid ${
                      isQickCashTheme ? "#3D5245" : tokens.inputBorder
                    }`,
                    boxShadow: isQickCashTheme
                      ? "0 12px 26px rgba(2,6,23,0.22), inset 0 1px 0 rgba(255,255,255,0.04)"
                      : `0 12px 26px rgba(2,6,23,0.32), 0 0 0 1px ${tokens.accent}40, inset 0 1px 0 rgba(255,255,255,0.04)`,
                  }}
                >
                  <div className="whitespace-pre-wrap break-words">
                    {resolvedWelcome}
                  </div>
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                <div className="flex flex-col gap-3">
                  {messages.map((message) => {
                    const isUser = message.role === "user";
                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                      >
                        <div
                          className="inline-block max-w-[84%] rounded-[18px] px-3.5 py-2.5 text-sm leading-6"
                          style={{
                            background: isUser
                              ? isQickCashTheme
                                ? "linear-gradient(180deg, #38E07A, #32CB6E)"
                                : `linear-gradient(180deg, ${tokens.userBubbleBg}, ${tokens.userBubbleBg})`
                              : isQickCashTheme
                                ? "linear-gradient(180deg, #2D3A31, #29382E)"
                                : `linear-gradient(180deg, ${tokens.aiBubbleBg}, ${tokens.aiBubbleBg})`,
                            color: isUser
                              ? tokens.userBubbleText
                              : tokens.aiBubbleText,
                            borderBottomRightRadius: isUser ? 6 : 18,
                            borderBottomLeftRadius: isUser ? 18 : 6,
                            border: `1px solid ${
                              isUser
                                ? isQickCashTheme
                                  ? "#2FC866"
                                  : tokens.inputBorder
                                : isQickCashTheme
                                  ? "#3D5245"
                                  : tokens.inputBorder
                            }`,
                            boxShadow: isUser
                              ? isQickCashTheme
                                ? "0 12px 28px rgba(56,224,122,0.18), inset 0 1px 0 rgba(255,255,255,0.14)"
                                : `0 12px 26px rgba(2,6,23,0.32), 0 0 0 1px ${tokens.userBubbleBg}55, inset 0 1px 0 rgba(255,255,255,0.04)`
                              : isQickCashTheme
                                ? "0 12px 26px rgba(2,6,23,0.22), inset 0 1px 0 rgba(255,255,255,0.04)"
                                : `0 12px 26px rgba(2,6,23,0.32), 0 0 0 1px ${tokens.accent}40, inset 0 1px 0 rgba(255,255,255,0.04)`,
                          }}
                        >
                          <div className="whitespace-pre-wrap break-words">
                            {message.text}
                          </div>
                        </div>
                        {message.timestamp ? (
                          <span className="mt-1 px-1 text-[10px] text-slate-400">
                            {message.timestamp}
                          </span>
                        ) : null}
                      </motion.div>
                    );
                  })}
                </div>
              </AnimatePresence>
            )}

            {isTyping ? (
              <div
                className="mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                style={{
                  color: tokens.typingTint,
                  borderColor: `${tokens.typingTint}4d`,
                }}
              >
                <span className="inline-flex gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current"
                    style={typingDotsStyle(0)}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current"
                    style={typingDotsStyle(120)}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current"
                    style={typingDotsStyle(240)}
                  />
                </span>
              </div>
            ) : null}
          </div>
          <div
            className={`flex shrink-0 flex-col gap-1 ${isPlainLayout ? "" : "mt-2"}`}
          >
            <p
              className={`m-0 min-h-4 px-1 text-[11px] ${errorText ? "text-rose-400" : "text-slate-400"}`}
            >
              {errorText || statusText || ""}
            </p>
            <form
              onSubmit={submit}
              className={`border p-2 ${isQickCashTheme ? "rounded-[26px]" : "rounded-[18px]"}`}
              style={{
                background: isQickCashTheme
                  ? "linear-gradient(180deg, #1C2621, #18211D)"
                  : tokens.inputBg,
                borderColor: isQickCashTheme ? "#2D3530" : tokens.inputBorder,
                boxShadow: isQickCashTheme
                  ? "0 14px 34px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255,255,255,0.02)"
                  : `0 10px 24px rgba(2, 6, 23, 0.28), 0 0 0 1px ${tokens.inputBorder}88`,
              }}
            >
              <div
                className={`flex items-center gap-2 border p-1.5 ${isQickCashTheme ? "rounded-[22px]" : "rounded-[14px]"}`}
                style={{
                  borderColor: isQickCashTheme
                    ? "#2D3530"
                    : `${tokens.inputBorder}cc`,
                  background: isQickCashTheme ? "#121714" : "transparent",
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onFocus={stabilizeViewport}
                  placeholder={resolvedPlaceholder}
                  className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-[16px] text-white outline-none placeholder:text-[#9EB8A8]"
                  style={{
                    background: isQickCashTheme
                      ? "#121714"
                      : `${tokens.shellBg}f2`,
                    borderColor: isQickCashTheme
                      ? "#2D3530"
                      : `${tokens.inputBorder}d9`,
                    color: isQickCashTheme ? "#FFFFFF" : "#e2e8f0",
                    boxShadow: `0 0 0 0 ${tokens.inputFocusRing}`,
                  }}
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex h-11 min-w-[112px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    background: isQickCashTheme
                      ? "#38E07A"
                      : `linear-gradient(180deg, ${tokens.sendButtonBg}, ${tokens.sendButtonBg})`,
                    color: tokens.sendButtonText,
                    boxShadow: isQickCashTheme
                      ? "none"
                      : `0 12px 24px ${tokens.sendButtonBg}66`,
                    border: `1px solid ${
                      isQickCashTheme ? "#38E07A" : tokens.sendButtonBg
                    }`,
                    fontFamily: "Inter, sans-serif",
                    letterSpacing: "0",
                  }}
                >
                  Send
                  <SendHorizontal size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
