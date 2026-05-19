"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

type SeedResult = {
  schemasWritten: string[];
  templatesWritten: string[];
  rulesWritten: string[];
  errors: string[];
};

/**
 * Triggers POST /api/seed/demo to drop a curated set of schemas + templates
 * + rules into the workspace. Confirms first when the workspace already has
 * schemas — re-seeding overwrites the demo files (idempotent) but leaves
 * unrelated work alone.
 */
export function SeedDemoButton({ hasSchemas }: { hasSchemas: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (hasSchemas) {
      const ok = confirm(
        "Re-seed the demo data? This overwrites any existing demo schemas/templates/rules with ids starting `schema-`, `tmpl-`, or `demo-`. Your other work is left alone.",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/seed/demo", { method: "POST" });
      const data = (await res.json()) as SeedResult & { error?: string };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "Seed failed");
        return;
      }
      const counts = `${data.schemasWritten.length} schemas · ${data.templatesWritten.length} templates · ${data.rulesWritten.length} rules`;
      if (data.errors.length > 0) {
        toast.warning(`Seeded with ${data.errors.length} warnings — ${counts}`);
      } else {
        toast.success(`Demo seeded — ${counts}`);
      }
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn ghost sm"
      onClick={run}
      disabled={busy}
      title="Drop a curated demo set into this workspace: two input schemas (offer + order), tax/product templates, and a handful of rules wiring them together."
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      {busy ? "Seeding…" : "Seed demo"}
    </button>
  );
}
