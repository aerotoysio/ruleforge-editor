# RuleForge editor — roadmap & agent handoff

> Handoff for the next agent/developer. Latest milestone: the **AI-core pivot (Phases 1–2)** shipped. This file is the to-do for what's next + the context to not regress the design.

## What RuleForge is
**AI-authored, human-verified, engine-executed** business rules.
- **Editor** (this repo, Next.js 16): the authoring UI. AI drafts rules; humans review / correct / approve.
- **Engine** (`../ruleforge`, .NET): deterministic DAG evaluator. Runs the compiled rule in the request hot path. **The LLM is never in the request path** — it only authors offline.
- **Workspace** (`../ruleforge-sample-workspace`): the rules, node defs, reference tables, templates, assets.

## Architecture keystones (do not regress)
1. **LLM authors; engine executes.** Claude runs only at author/review time and emits a normal rule JSON, validated against the node schemas, then executed deterministically.
2. **Nodes are the AI's typed target vocabulary** (~20 generic engine categories — see `src/lib/rule/compile-to-engine.ts`). Domain specificity = reference *data*, not new node types. This is what keeps AI output auditable + runnable.
3. **Editability is layered:** read (explanations) → NL-correct → precise form-edit → raw JSON. Don't remove the manual editors; they're the correction layer.
4. **Rule persistence spreads** (`writeRule`/`readRule` in `src/lib/server/workspace.ts`), so new top-level `Rule` fields round-trip automatically — that's how `groups` and `aiMeta` were added.

## Done (current state)
- **Phase 1 — AI front door:** guided new-rule **wizard** (`src/app/rules/new/NewRuleClient.tsx`) → **`/api/ai/author`** (policy text/PDF → input+output schemas + graph + per-node explanations + narrative + citations + tests; validate-then-repair via `compileRuleForEngine`).
- **Phase 2 — review-first:** nodes show `aiMeta.nodeExplanations` (`src/components/flow/NodeView.tsx`); **Summary tab** (`src/components/flow/RuleSummaryTab.tsx`) with clickable policy citations.
- AI = **Claude** (Anthropic SDK), prompt-cached catalog. Settings has a Claude provider (key + model), defaults to Claude. Key resolves `settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY`.
- Editor/nav overhaul: rules **category tree** + row menu (Edit/Test/Duplicate/Delete); node **grouping** boxes; **asset-from-library** picker; **calc** (NCalc) expression builder; unified node config dialog; `/test` page removed (testing lives on the rule row + in the editor).
- Engine: **multi-field Set mutator** (`../ruleforge` `MutatorConfig.Sets`).

## TO-DO (next, priority order)
1. **Phase 3 — AI verify loop.** New `/api/ai/scenarios` (Claude generates test payloads from `inputSchema` + the policy) → "Generate scenarios" button in `src/components/flow/RuleTestsTab.tsx` → run each via `/api/test` → per-scenario pass/fail review. Extend `RuleTest` (`src/lib/types/rule.ts`) with `aiGenerated` / `status` / `expectedDecision`.
2. **Phase 3b — Performance / load test (data-driven).** Recurse a scenario (or N data rows / AI-varied payloads) ×K against the engine; aggregate p50/p95/p99 latency + throughput from the `/api/test` timing fields; flag the slowest nodes from the trace. Perf-test the engine, not just correctness.
3. **References category view.** Group `/references` by category (mirror the rules tree) + add a category field to the new/edit reference forms. (Last open item from the nav punch-list.)
4. **Phase 4 — NL correction.** Per-node / rule-level "ask AI to change X" → patch only the targeted node(s) → show a diff → apply. Manual forms stay for precision.
5. **Phase 5 — Approve + audit.** Make `draft → review → published` a gated, audited action (who/when/what + diff). The compliance moat for insurance/airline buyers.
6. **Optional cleanup.** Collapse the 4 domain "veneer" filters (`node-filter-cabin/markets/pax-type/loyalty-tier`) into generic `node-filter-string-in` + a reference-list picker. Low priority.

## Run / verify
- Editor: `npm run dev` → http://localhost:3000.
- Engine: run `../ruleforge` `RuleForge.Api` (port 5050) — or it falls back to the CLI. `/api/test` compiles the editor rule → engine → returns `{ decision, result, trace, timing }`.
- **Claude key:** Settings → AI provider: Claude → paste key (saved to `~/.ruleforge-editor.json`, *outside* the repo), or set `ANTHROPIC_API_KEY`.
- `../ruleforge-sample-workspace/rules/aimeta-demo.json` shows the review-first UI without a key.
- There's no separate typecheck step wired — **compile-check by hitting a route** (e.g. `GET /rules/<id>`) and watching the dev-server log.

## Gotchas
- **Next.js 16** differs from training data — read `node_modules/next/dist/docs/` before using Next-specific APIs (plain client React + `@xyflow/react` is fine).
- The approved plan doc is at `~/.claude/plans/gentle-coalescing-lobster.md` (local, not committed).
- Scratch files in the workspace (`rules/test.json`, `rules/test-rule.json`, `rules/aimeta-demo.json`, `assets/asset-tt.json`) — delete if unwanted.

## Key files
- **AI:** `src/app/api/ai/{author,draft,models}/route.ts` · `src/components/flow/AiDraftBar.tsx` · `src/app/rules/new/NewRuleClient.tsx`
- **Review UX:** `src/components/flow/NodeView.tsx` · `src/components/flow/RuleSummaryTab.tsx` · `src/app/rules/[id]/RuleEditorClient.tsx`
- **Core:** `src/lib/rule/compile-to-engine.ts` · `src/lib/store/rule-store.ts` · `src/lib/types/rule.ts` · `src/lib/server/workspace.ts`
