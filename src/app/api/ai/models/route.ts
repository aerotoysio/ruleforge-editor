import { NextResponse } from "next/server";
import { readSettings } from "@/lib/server/workspace";

// Curated Claude models for the AI-draft picker. Kept roughly in sync with
// console.anthropic.com; the user can also type any model id in Settings.
const ANTHROPIC_MODELS = [
  { name: "claude-opus-4-8", label: "Claude Opus 4.8 — most capable (default)" },
  { name: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — fast + balanced" },
  { name: "claude-haiku-4-5", label: "Claude Haiku 4.5 — cheapest" },
];

export async function GET() {
  const settings = await readSettings();
  const provider = settings.aiProvider ?? "anthropic";

  if (provider === "anthropic") {
    return NextResponse.json({
      provider: "anthropic",
      currentModel: settings.anthropicModel ?? "claude-opus-4-8",
      hasKey: Boolean(settings.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim()),
      models: ANTHROPIC_MODELS,
    });
  }

  const url = (settings.ollamaUrl ?? "http://localhost:11434").replace(/\/+$/, "");
  try {
    const res = await fetch(`${url}/api/tags`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Ollama responded ${res.status} from ${url}/api/tags` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { models?: Array<{ name: string; size?: number; modified_at?: string }> };
    return NextResponse.json({
      provider: "ollama",
      url,
      currentModel: settings.ollamaModel ?? null,
      models: (data.models ?? []).map((m) => ({ name: m.name, size: m.size, modifiedAt: m.modified_at })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not reach Ollama at ${url}. Is it running? (\`ollama serve\`). Detail: ${(err as Error).message}`,
        url,
      },
      { status: 502 },
    );
  }
}
