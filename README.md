# RuleForge Editor

A visual admin portal for authoring [RuleForge](https://github.com/aerotoysio/ruleforge) rule graphs.
Left navigation, full-page react-flow canvas, right node designer. Built with Next.js 16,
TypeScript, Tailwind 4, react-flow (`@xyflow/react`), and Zustand.

This is an **optional** companion tool for the engine — the engine stands alone and
consumes JSON rule files. The editor produces engine-compatible rule JSON, lets you author
input/output schemas, organize sample payloads, manage filter templates with path hints,
and run rules against samples in real time using the engine's own CLI for evaluation.

> **Phase 1**: local folder workspace (rules/schemas/samples/templates as JSON files).
> **Phase 2**: DocumentForge sync (sibling project).

## Layout

The editor expects the upstream engine to be cloned next to it:

```
your-folder/
├── ruleforge/          # cloned from https://github.com/aerotoysio/ruleforge
└── ruleforge-editor/   # this app
```

A workspace folder (separate from both) holds your authored content:

```
my-rules-workspace/
├── workspace.json
├── rules/
│   ├── _endpoint-bindings.json   # auto-maintained on save
│   └── *.v*.json
├── schemas/
│   ├── input/
│   ├── output/
│   └── context/
├── samples/
├── templates/
└── refs/
```

## Prerequisites

- Node 20+ (tested on 25)
- .NET SDK 9 (for the engine's CLI; the editor spawns it for live test runs)
- The upstream `ruleforge` repo cloned and built (`dotnet build` once)

## Setup

```bash
# 1. clone the engine alongside the editor
git clone https://github.com/aerotoysio/ruleforge.git ../ruleforge
(cd ../ruleforge && dotnet build)

# 2. install editor deps and run dev server
npm install
npm run dev
```

Visit `http://localhost:3000`. The first navigation lands on **Settings**:

1. **Workspace folder** — type or paste an absolute path. Click *Initialize workspace*
   if the folder doesn't exist yet — the editor will seed the directory tree.
2. **Engine CLI path** — absolute path to the cloned `ruleforge` repo. The realtime test
   runner spawns `dotnet run --no-build --project src/RuleForge.Cli` from there.

Save. The left nav now lists Rules / Schemas / Samples / Templates.

## Authoring a rule

1. **New schema** (`/schemas/new`) — author at least one input schema. Three tabs:
   *Visual* (click-add fields), *From sample* (paste JSON, infer schema), *Raw JSON*.
2. **New rule** (`/rules/new`) — pick metadata, paste/copy the input and output schemas
   into the rule (the rule embeds a snapshot, matching engine expectations).
3. **Rule editor** (`/rules/[id]`) — three regions:
   - **Top toolbar**: rule name, status, *Add node* palette (built-in node types **plus**
     filter templates), *Test*, and *Save*.
   - **Center canvas**: react-flow with category-colored nodes. Drag to reposition.
     Drag from the right handle to the left handle of another node to connect.
   - **Right designer**: contextual to the selection. Nothing selected → rule metadata.
     A node selected → category-aware form (filter, logic, mutator, calc, constant,
     iterator, merge, product, sub-rule). An edge selected → branch tag editor.
4. **Save** writes the rule to `<workspace>/rules/<id>.v<version>.json` and updates
   `_endpoint-bindings.json`.

### Filter templates

Templates encode operator/selector defaults plus a *path hint* (shape, name pattern,
field hint, expected types). They never hard-code a JSONPath, because every rule has
its own input schema. When you drop a template onto a rule, you get a standard filter
node with the template's defaults pre-filled — and the path picker uses the template's
hint to highlight likely matches in the rule's `inputSchema` tree. The serialized node
is identical to a hand-built filter; the engine doesn't need to know it came from a
template.

Six built-in templates (Pax, Cabin, Route, Amount, Time-window, Boolean flag) ship
out of the box. Define your own by writing `<workspace>/templates/<id>.json`.

### AI draft (local Ollama)

Click **✨ AI draft** in the rule editor toolbar to describe a rule in plain English and get a draft DAG back. Everything runs on your machine — your prompts and rule data never leave the box.

**Setup**

```bash
# 1. Install + start Ollama (https://ollama.com)
ollama serve   # leave running

# 2. Pull a JSON-savvy model (pick one)
ollama pull qwen2.5-coder:14b      # ~9 GB, runs on a 16 GB GPU
ollama pull qwen2.5-coder:32b      # ~20 GB, best quality on 24 GB
ollama pull phi-4                  # ~9 GB, lighter alternative
ollama pull llama3.3:70b           # ~40 GB, top-tier reasoning if you have it
```

**In the editor**

1. **Settings → Ollama**: confirm the URL (default `http://localhost:11434`), click *refresh* next to Model, pick the pulled model, **Save**.
2. Open any rule with input/output schemas defined (the better the schema, the better the draft).
3. Click **✨ AI draft** in the toolbar. Type the requirement, hit *Draft*. The model gets:
   - The current rule's `inputSchema` and `outputSchema` (for path grounding)
   - The list of available reference sets (id + columns) so lookups stay valid
   - Two compact fixture rules as few-shot examples
   - A JSON-Schema-constrained `format` option so output is always valid JSON
4. Review the rationale + node/edge preview. **Apply** replaces the current graph (keeping Start &amp; End), auto-laying out the new nodes left-to-right by topological depth.
5. Save via the toolbar. Run the test panel to verify behaviour.

**Endpoints**

- `GET  /api/ai/models` &mdash; proxies to Ollama's `/api/tags`
- `POST /api/ai/draft` &mdash; sends the prompt + system context, returns `{ draft: { nodes, edges, rationale }, stats }`

### Realtime test runner

Click **Test** in the toolbar. A panel slides up with:

- Left: request payload editor (auto-fills from `inputSchema` on first open).
- Right: envelope viewer with decision, result, per-node trace.

*Run* spawns the engine's CLI in-process (`dotnet run --project ruleforge/src/RuleForge.Cli`)
with `--fixtures <workspace>/rules`, `--debug`, and the rule's endpoint. The returned
envelope's trace marks every traversed node on the canvas (passing / failing / skipped /
errored) and dims edges that weren't taken.

## Architecture

| Piece | What it is |
|---|---|
| `src/app/`              | Next.js App Router pages + API routes |
| `src/app/api/workspace` | GET/POST workspace metadata + folder seed |
| `src/app/api/rules`     | List / create / read / update / delete rules |
| `src/app/api/schemas`   | Same, per kind (input/output/context) |
| `src/app/api/templates` | List custom templates + merge with seed |
| `src/app/api/test`      | Spawns the engine CLI, returns the parsed envelope |
| `src/components/flow`   | react-flow canvas, NodeView, Toolbar, TestPanel |
| `src/components/designer` | Right panel + per-category node forms + edge form |
| `src/components/path-picker` | Visual JSONPath picker driven by a rule's `inputSchema` |
| `src/components/schema-editor` | Visual / sample-infer / raw-JSON tabs |
| `src/components/refs`   | ReferenceTableEditor for tabular lookup data |
| `src/lib/server/workspace.ts` | All filesystem reads/writes + endpoint-binding sync |
| `src/lib/store/rule-store.ts` | Zustand store for the active rule + selection + trace |
| `src/lib/store/templates-store.ts` | Templates fetched once on rule editor mount |
| `src/lib/store/references-store.ts` | References cache for the mutator form's ref dropdown |
| `src/lib/schema/`       | infer, walk, empty-payload, ajv validate |
| `src/lib/ai/draft-prompt.ts` | System + user prompt builders + draft output schema |
| `src/lib/flow/auto-layout.ts` | Topological-level grid layout for AI-drafted nodes |

## Engine compatibility

Rule JSON written by the editor matches the engine's schema as emitted by
`dotnet run --project src/RuleForge.Cli -- schemas`. The 11 generated schemas are
copied into `src/lib/schemas/` as static reference. The TypeScript types in
`src/lib/types/` mirror the C# records in `src/RuleForge.Core/Models/`.

## Limitations / phase 2

- **Number filter** and **date filter** forms reuse the generic editor — typed forms
  for those categories are coming. Filter templates of those kinds work, but operator
  edits happen via the raw config.
- **Sub-rule input/output mappings** are currently raw — author the maps in the rule
  JSON for now.
- **Persisted per-rule samples** in the workspace exist in the API and folder layout,
  but the rule editor's test panel uses an ad-hoc payload. A sample picker is queued.
- **DocumentForge sync** is the phase-2 deliverable — `documentForgeUrl` setting is
  scaffolded but inert.

## License

MIT, matching the upstream ruleforge engine.
