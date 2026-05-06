import { NextResponse } from "next/server";
import { readSettings } from "@/lib/server/workspace";

export async function GET() {
  const settings = await readSettings();
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
