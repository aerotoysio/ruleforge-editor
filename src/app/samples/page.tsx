import Link from "next/link";
import { FlaskConical, ArrowUpRight, FileCog } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules, listSamples } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Sample } from "@/lib/types";

export default async function SamplesPage() {
  const root = await requireWorkspace();
  const rules = await listRules(root);
  const shared = await listSamples(root, null);
  const groups = await Promise.all(
    rules.map(async (r) => ({ rule: r, samples: await listSamples(root, r.id) })),
  );
  const populated = groups.filter((g) => g.samples.length > 0);
  const totalSamples = shared.length + populated.reduce((sum, g) => sum + g.samples.length, 0);

  return (
    <>
      <PageHeader
        title="Samples"
        description="Sample request payloads grouped by rule. The realtime test runner replays one of these against the rule and highlights the path it took through the graph."
      />
      <div className="flex-1 overflow-auto px-8 py-6 bg-muted/30">
        {totalSamples === 0 ? (
          <EmptyState
            icon={<FlaskConical className="w-8 h-8" />}
            title="No samples yet"
            description="Open a rule and use the Tests tab to capture a request payload — it'll be saved here for later replay. Shared samples (no specific rule) live alongside the per-rule ones."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {populated.map(({ rule, samples }) => (
              <SampleGroup
                key={rule.id}
                title={rule.name}
                subtitle={rule.id}
                href={`/rules/${encodeURIComponent(rule.id)}`}
                samples={samples}
              />
            ))}
            {shared.length > 0 ? (
              <SampleGroup
                title="Shared"
                subtitle="Not bound to a specific rule"
                samples={shared}
              />
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function SampleGroup({
  title,
  subtitle,
  href,
  samples,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  samples: Sample[];
}) {
  return (
    <section className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-muted/40">
        <div className="min-w-0 flex items-center gap-2">
          {href ? <FileCog className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.8} /> : null}
          {href ? (
            <Link href={href} className="text-[13px] font-semibold tracking-tight text-foreground hover:underline truncate">
              {title}
            </Link>
          ) : (
            <span className="text-[13px] font-semibold tracking-tight text-foreground truncate">
              {title}
            </span>
          )}
          {subtitle ? (
            <span className="text-[11px] font-mono text-muted-foreground/70 truncate">{subtitle}</span>
          ) : null}
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {samples.length} {samples.length === 1 ? "sample" : "samples"}
        </span>
      </header>
      <div className="divide-y">
        {samples.map((s) => (
          <SampleRow key={s.id} sample={s} />
        ))}
      </div>
    </section>
  );
}

function SampleRow({ sample }: { sample: Sample }) {
  const preview = previewLine(sample);
  return (
    <div className="grid grid-cols-[2.4fr_3fr_120px_24px] gap-3 px-4 py-3 items-center group/sample hover:bg-muted/30 transition-colors">
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate text-foreground">{sample.name}</div>
        <div className="text-[11px] font-mono truncate text-muted-foreground/70">{sample.id}</div>
      </div>
      <div className="text-[12px] truncate text-muted-foreground/90 font-mono" title={preview}>
        {preview}
      </div>
      <div className="text-[11px] text-right text-muted-foreground">
        {new Date(sample.updatedAt).toLocaleDateString()}
      </div>
      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover/sample:text-muted-foreground transition-colors" />
    </div>
  );
}

/**
 * Compact one-line preview of the sample's payload — top-level keys plus a
 * type hint, e.g. `booking{4} · pos{2}`. Better than `s.description` when
 * the description is empty (which it usually is for captured payloads).
 */
function previewLine(sample: Sample): string {
  if (sample.description) return sample.description;
  const payload = sample.payload as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "—";
  const obj = payload as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj).slice(0, 4)) {
    if (v == null) parts.push(`${k}: null`);
    else if (Array.isArray(v)) parts.push(`${k}[${v.length}]`);
    else if (typeof v === "object") parts.push(`${k}{${Object.keys(v).length}}`);
    else parts.push(`${k}: ${JSON.stringify(v).slice(0, 24)}`);
  }
  return parts.join(" · ");
}
