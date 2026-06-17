# RuleForge — rule distribution architecture

**Status:** Accepted · 2026-06-17
**Decision:** Each engine runs a **local SQLite replica** that syncs from a central control plane over a read-only **HTTP sync API** — not a shared database file, and not a direct DB connection. The central store is SQLite today and can move to Postgres later **without engines changing**.

---

## Context

RuleForge is AI-authored, human-verified, **engine-executed** business rules, destined to be one module of a full airline PSS. The deterministic .NET engine evaluates compiled rules in the request path at sub-millisecond compute time, and we expect to run it as a **horizontally-scaled fleet (~20 instances)** behind a load balancer.

Today (dev / single box) the engine and editor share one `workspace.db` SQLite file (WAL mode: editor writes, engine reads). Perfect on one machine — but it **cannot scale across machines**. SQLite is an embedded, local-file database; a file on a network share (NFS/SMB/EFS) breaks its locking and WAL shared-memory index, causing corruption and stale reads. The fleet needs a real distribution model.

---

## Decision — two planes

**Control plane (authoring + distribution)** — the editor app:
- Owns the **central source of truth**: compiled rules, reference sets, API keys. (`workspace.db` now; Postgres later.)
- Exposes a read-only **sync API** over HTTP that engines pull from.
- On publish, signals the fleet to re-sync.

**Data plane (execution)** — the engine fleet (~20):
- Each instance keeps its **own local SQLite replica** + an in-memory cache.
- On boot and on a refresh signal, it pulls the latest from the sync API into its local replica, then serves from memory.
- The request hot path **never** touches the network or the central DB.

```
                ┌──────────────── Control plane ─────────────────┐
   author  ───► │  Editor (Next.js)  ──writes──►  Central store    │
                │       │                         (SQLite → Postgres)│
                │       └── Sync API (HTTP, read-only) ◄────────────┘
                └────────────────────│───────────────────────────┘
                          pull: poll + push │ over HTTP
        ┌───────────────┬───────────────┬───┴───────────┐
        ▼               ▼               ▼                ▼
    Engine #1       Engine #2       Engine #3   …     Engine #20
  local SQLite    local SQLite    local SQLite       local SQLite
  + mem cache     + mem cache     + mem cache         + mem cache
        └──────────── request hot path: sub-ms, local only ───────┘
```

---

## Why a sync **web service**, not a direct DB connection

This is the load-bearing choice. Engines pull from an HTTP API *in front of* the store, never from the database itself:

- **Storage independence** — the backing store can be SQLite or Postgres (or anything) with zero engine changes. The API contract is the stable interface.
- **No DB credentials in the fleet** — engines get a scoped, read-only HTTP surface, not database access. Smaller blast radius.
- **Scales trivially** — 20 (or 200) engines polling a tiny manifest and fetching immutable, **CDN-cacheable** artifacts beats 20 engines each holding DB connections.
- **Schema can evolve** — change the DB layout without breaking engines; only the API contract is load-bearing.
- **Precedent already in the codebase** — the engine has a `df` source (`DocumentForgeRuleSource`) that reads rules over HTTP with caching. The sync API formalizes that pattern as a first-class RuleForge surface.

---

## The sync API (contract)

Read-only, versioned, served by the control plane:

| Endpoint | Returns | Cacheability |
|---|---|---|
| `GET /sync/manifest` | current generation: `[{ ruleId, version, endpoint, method }]` + reference-set versions + `keysGeneration` | small, polled |
| `GET /sync/rules/{id}/{version}` | the **compiled** rule JSON | **immutable** — cache forever / CDN |
| `GET /sync/reference-sets/{id}/{version}` | a reference set | immutable per version |
| `GET /sync/api-keys` | active key-hash set for `X-AERO-Key` validation, tagged with `keysGeneration` | short TTL |

Authenticated with a control-plane service token (the engine is a trusted internal client).

---

## Sync mechanics

- **Delta, not full:** the engine compares the manifest to its local replica and fetches only changed/added `(id,version)` artifacts, deleting removed ones. Immutable artifacts are never re-fetched.
- **Atomic swap:** new artifacts land in local SQLite, then the in-memory cache is swapped — no torn state mid-request.
- **Two triggers:**
  - **Push** (low latency): on publish, the control plane calls each engine's existing `POST /admin/refresh` (or a pub/sub fan-out) → immediate pull.
  - **Poll** (safety net): each engine re-checks `/sync/manifest` every N seconds in case a push was missed.
- **Resilience:** if the control plane is unavailable, engines keep serving from their local replica. They degrade to *stale*, never to *down*.

---

## Central store: SQLite now, Postgres when

Because engines sync over HTTP, this is an **internal** control-plane decision, invisible to the fleet:

- **SQLite (today):** fine while the control plane is a single editor instance. Simple, zero-ops.
- **Postgres (later):** earns its keep when the control plane itself needs HA, multiple concurrent authors, or the DB decoupled from the editor process. Swapping it touches only the control plane's data layer — **engines don't change.**

> Recommendation: adopt Postgres on its own merits (control-plane HA), not as a prerequisite for the fleet. The sync layer lets us defer it with zero downstream cost.

---

## API-key revocation across the fleet

The single-box "instant revoke" becomes **fleet propagation at sync cadence**: with push, a revoked key is gone fleet-wide within the push latency (sub-second); with poll-only, within the poll interval. For a hard guarantee, the push payload can carry "key X revoked" so engines evict immediately. (Validating each call against a live central endpoint would be strictly consistent but puts the network back in the hot path — not recommended.) See the API-keys design for the single-box behaviour.

---

## Phasing

- **Phase 0 — today:** single box, shared `workspace.db`. ✅
- **Phase 1 — sync API + engine `sync` source:** editor serves `/sync/*`; the engine gains a `RemoteSyncRuleSource` that pulls into local SQLite on boot and on `POST /admin/refresh`. Unlocks running an engine on a *different box* from the editor. *(Mostly wiring over what exists: `IRuleSource`, the local SQLite reader, `/admin/refresh`.)*
- **Phase 2 — fan-out + push:** an engine registry (or pub/sub); publish notifies all replicas.
- **Phase 3 — Postgres central** *(if/when HA is needed)*: swap the control-plane store; engines unaffected.
- **Phase 4 — hardening:** CDN the immutable artifacts, authenticate the sync API, instant key-eviction push, fleet observability.

---

## Consequences

- ➕ Sub-ms hot path preserved at any fleet size; no shared-file hazards; resilient to control-plane blips; storage tech is swappable.
- ➖ Eventual consistency (bounded sync lag); a sync service and (eventually) a fan-out/registry to build and operate.
- **Maps onto existing code:** `IRuleSource` (local / sqlite / df → **+ sync**), the engine's in-memory caching + `POST /admin/refresh`, and the editor's compiled-rules write + debounced refresh (today → one engine; fleet → fan-out).
