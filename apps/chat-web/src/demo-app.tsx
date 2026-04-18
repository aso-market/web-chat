import { ChatContainer } from "./components/chat/chat-container";
import { AIChatThemeName } from "./components/ui/ai-chat";

const themeOrder: AIChatThemeName[] = [
  "neon-blue",
  "violet-noir",
  "emerald-night",
  "crimson-carbon",
  "amber-obsidian",
];

const DEMO_CONVERSATIONS: Record<AIChatThemeName, string> = {
  "neon-blue": "demo-neon-blue",
  "violet-noir": "demo-violet-noir",
  "emerald-night": "demo-emerald-night",
  "crimson-carbon": "demo-crimson-carbon",
  "amber-obsidian": "demo-amber-obsidian",
};

function ThemeCard({ theme, apiBase }: { theme: AIChatThemeName; apiBase: string }) {
  const conversationId = DEMO_CONVERSATIONS[theme];

  return (
    <article className="min-h-0 rounded-2xl border border-slate-800/90 bg-slate-950/70 p-2 shadow-[0_20px_54px_rgba(2,6,23,0.48)]">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-slate-300">{theme}</h2>
      </div>
      <div className="h-[520px] min-h-0">
        <ChatContainer
          projectId="demo"
          apiBase={apiBase}
          themeOverride={theme}
          conversationIdOverride={conversationId}
          storageKeyOverride={`support_widget_conversation:demo:${conversationId}`}
          titleOverride="Support"
          subtitleOverride=""
          welcomeTextOverride=""
          placeholderOverride="Message"
          avatarOverride=""
        />
      </div>
    </article>
  );
}

export function DemoApp() {
  const params = new URLSearchParams(window.location.search);
  const apiBase =
    (params.get("apiBase") || import.meta.env.VITE_API_BASE || "http://localhost:8787").trim();

  return (
    <div className="min-h-full bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-[1400px]">
        <h1 className="m-0 text-2xl font-semibold">Theme Chats</h1>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {themeOrder.map((theme) => (
            <ThemeCard key={theme} theme={theme} apiBase={apiBase} />
          ))}
        </div>
      </div>
    </div>
  );
}
