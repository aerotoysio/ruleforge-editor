import { FlaskConical } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listRules, listSamples } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function SamplesPage() {
  const root = await requireWorkspace();
  const rules = await listRules(root);
  const shared = await listSamples(root, null);
  const groups = await Promise.all(
    rules.map(async (r) => ({ rule: r, samples: await listSamples(root, r.id) })),
  );
  const totalSamples = shared.length + groups.reduce((sum, g) => sum + g.samples.length, 0);

  return (
    <>
      <PageHeader
        title="Samples"
        description="Sample request payloads grouped by rule. Used by the realtime test runner."
      />
      <div className="flex-1 overflow-auto px-8 py-6 flex flex-col gap-6">
        {totalSamples === 0 ? (
          <EmptyState
            icon={<FlaskConical className="w-8 h-8" />}
            title="No samples yet"
            description="Open a rule and use the Samples tab to create or paste request payloads. They're used by the realtime test runner to highlight the traversed path."
          />
        ) : (
          <>
            {groups.filter((g) => g.samples.length > 0).map(({ rule, samples }) => (
              <section key={rule.id}>
                <h2 className="text-[12px] uppercase tracking-wider mb-2" style={{ color: "var(--color-fg-dim)" }}>
                  {rule.name} <span className="mono normal-case" style={{ color: "var(--color-fg-dim)" }}>· {rule.id}</span>
                </h2>
                <SampleList samples={samples} />
              </section>
            ))}
            {shared.length > 0 ? (
              <section>
                <h2 className="text-[12px] uppercase tracking-wider mb-2" style={{ color: "var(--color-fg-dim)" }}>Shared</h2>
                <SampleList samples={shared} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

import type { Sample } from "@/lib/types";

function SampleList({ samples }: { samples: Sample[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {samples.map((s) => (
        <div
          key={s.id}
          className="grid grid-cols-[2fr_3fr_auto] gap-3 px-3 py-2.5 rounded items-center"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
        >
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{s.name}</div>
            <div className="mono text-[11px] truncate" style={{ color: "var(--color-fg-muted)" }}>{s.id}</div>
          </div>
          <div className="text-[12px] truncate" style={{ color: "var(--color-fg-muted)" }}>{s.description ?? ""}</div>
          <div className="text-[11px] text-right" style={{ color: "var(--color-fg-muted)" }}>
            {new Date(s.updatedAt).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}
