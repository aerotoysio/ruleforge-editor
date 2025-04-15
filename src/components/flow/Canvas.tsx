"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  useStore as useFlowStore,
  useStoreApi as useFlowStoreApi,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
} from "@xyflow/react";
import { useRuleStore } from "@/lib/store/rule-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { NodeView } from "./NodeView";
import { type PaletteDragPayload, PALETTE_DND_TYPE } from "./RightPalette";
import type { EdgeBranch, RuleNodeInstance } from "@/lib/types";

const nodeTypes = {
  ruleforgeNode: NodeView,
};

function edgeStyle(branch: EdgeBranch | undefined, traversed: boolean) {
  const color =
    branch === "pass" ? "var(--color-pass)" : branch === "fail" ? "var(--color-fail)" : "var(--color-default)";
  return {
    stroke: color,
    strokeWidth: traversed ? 2.5 : 1.5,
  } as const;
}

function CanvasInner() {
  const rule = useRuleStore((s) => s.rule);
  const trace = useRuleStore((s) => s.trace);
  const selection = useRuleStore((s) => s.selection);
  const setInstances = useRuleStore((s) => s.setInstances);
  const setEdges = useRuleStore((s) => s.setEdges);
  const select = useRuleStore((s) => s.select);
  const addEdge = useRuleStore((s) => s.addEdge);
  const addInstance = useRuleStore((s) => s.addInstance);
  const nodeDefs = useNodesStore((s) => s.nodes);
  const rfInstance = useReactFlow();
  const flowStoreApi = useFlowStoreApi();
  // Subscribe to the React Flow store's `domNode` — it's set in Pane's useEffect
  // and is what every handle-bounds scan actually requires (the action bails
  // out early if `domNode?.querySelector('.xyflow__viewport')` is null).
  const flowDomNode = useFlowStore((s) => s.domNode);

  // CRITICAL: handle-bounds bootstrap.
  //
  // React Flow scans handle DOM positions on three paths:
  //   1. Each NodeView calls `useUpdateNodeInternals(id)` in a useEffect
  //   2. Each NodeWrapper attaches a ResizeObserver to its node element
  //   3. updateNodeInternals dispatched directly via the store
  //
  // ALL three paths gate on `store.domNode` being set — the action's first
  // line is `domNode?.querySelector('.xyflow__viewport')` and it returns
  // immediately when that's null. `domNode` is set inside Pane's own useEffect.
  //
  // The race: NodeView's useEffect (deeper in the tree) fires FIRST in the
  // post-order traversal, BEFORE Pane's useEffect runs and sets `domNode`.
  // ResizeObserver's first callback also tends to fire before that. Both
  // calls are silent no-ops, and ResizeObserver doesn't re-fire unless the
  // element resizes. End result: every fresh page load opens with zero edges,
  // because handleBounds never gets populated.
  //
  // Fix: subscribe to `store.domNode` here. The instant it flips from null
  // to a real node, AND we have node DOM elements to work with, force a
  // bulk updateInternals across every instance. We dispatch the store action
  // SYNCHRONOUSLY (not via the `useUpdateNodeInternals` hook, which wraps in
  // requestAnimationFrame and was racing with subsequent re-renders that
  // overwrote the result). Idempotent and cheap.
  useEffect(() => {
    if (!flowDomNode || !rule || rule.instances.length === 0) return;
    function rescan() {
      type Update = { id: string; nodeElement: HTMLDivElement; force: true };
      const updates = new Map<string, Update>();
      for (const inst of rule!.instances) {
        const el = flowDomNode!.querySelector<HTMLDivElement>(
          `.react-flow__node[data-id="${inst.instanceId}"]`,
        );
        if (el) updates.set(inst.instanceId, { id: inst.instanceId, nodeElement: el, force: true });
      }
      if (updates.size === 0) return;
      // Dispatch the store action SYNCHRONOUSLY — `useUpdateNodeInternals`
      // wraps in requestAnimationFrame and races with the very re-render
      // that just changed the handle layout, leaving handleBounds populated
      // for the OLD layout (NV would scan with `sourceHandle: null` for a
      // node that had since gained named pass/fail handles).
      flowStoreApi.getState().updateNodeInternals(updates);
    }
    rescan();
    // Re-scan after the next paint too — handles for nodes whose def loaded
    // late (filter pass/fail) only mount on the SECOND render. Without this
    // second pass, edges with sourceHandle="pass"/"fail" can't find their
    // handle and silently disappear.
    const raf = requestAnimationFrame(rescan);
    return () => cancelAnimationFrame(raf);
  }, [flowDomNode, rule?.id, rule?.instances, nodeDefs, flowStoreApi]);

  const rfNodes: RFNode[] = useMemo(
    () =>
      (rule?.instances ?? []).map((inst) => {
        const def = nodeDefs.find((n) => n.id === inst.nodeId);
        const isTerminal = def?.category === "input" || def?.category === "output";
        // initialWidth/Height (NOT width/height) hint dimensions for the FIRST
        // render so the node isn't visibility:hidden, but still lets React Flow's
        // ResizeObserver replace them with actual measured DOM bounds — which
        // is what triggers handle-bounds scanning. Setting `width`/`height`
        // directly suppresses that and edges never compute endpoints.
        const initialWidth = isTerminal ? 140 : 220;
        const initialHeight = isTerminal ? 40 : 64;
        return {
          id: inst.instanceId,
          type: "ruleforgeNode",
          position: inst.position,
          data: { instance: inst, def, bindings: rule?.bindings[inst.instanceId] },
          draggable: true,
          selected: selection.kind === "node" && selection.id === inst.instanceId,
          initialWidth,
          initialHeight,
        };
      }),
    [rule?.instances, rule?.bindings, nodeDefs, selection],
  );

  const rfEdges: RFEdge[] = useMemo(
    () =>
      (rule?.edges ?? []).map((e) => {
        const traversed = trace?.traversedEdges.has(e.id) ?? false;
        const dim = trace !== null && !traversed;
        const branch = e.branch ?? "default";
        const colour = branch === "pass" ? "var(--color-pass)" : branch === "fail" ? "var(--color-fail)" : "var(--color-default)";
        // If the source node has per-branch handles (multiple non-default outputs)
        // pin the edge's sourceHandle to the matching branch — otherwise the
        // edge floats and may attach to the wrong handle.
        const sourceInst = rule?.instances.find((i) => i.instanceId === e.source);
        const sourceDef = sourceInst ? nodeDefs.find((n) => n.id === sourceInst.nodeId) : undefined;
        const branchedOutputs = (sourceDef?.ports.outputs ?? []).filter((o) => o.branch && o.branch !== "default");
        const sourceHandle = branchedOutputs.length >= 2 && (branch === "pass" || branch === "fail") ? branch : undefined;
        return {
          id: e.id,
          source: e.source,
          sourceHandle,
          target: e.target,
          // Show a pill label only for pass/fail (default edges stay clean).
          label: branch !== "default" ? branch.toUpperCase() : undefined,
          labelStyle: {
            fontSize: 9.5,
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            fill: "#fff",
          },
          labelBgStyle: { fill: colour },
          labelBgPadding: [6, 4] as [number, number],
          labelBgBorderRadius: 999,
          style: { ...edgeStyle(branch, traversed), opacity: dim ? 0.25 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: colour },
          data: { branch },
          selected: selection.kind === "edge" && selection.id === e.id,
        };
      }),
    [rule?.edges, rule?.instances, nodeDefs, trace, selection],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!rule) return;
      for (const change of changes) {
        if (change.type === "select" && change.selected) {
          select({ kind: "node", id: change.id });
        }
      }
      const next = applyNodeChanges(changes, rfNodes);
      const positions = new Map(next.map((n) => [n.id, n.position]));
      const moved = rule.instances.some((n) => {
        const pos = positions.get(n.instanceId);
        return pos && (pos.x !== n.position.x || pos.y !== n.position.y);
      });
      const removed = rule.instances.some((n) => !positions.has(n.instanceId));
      if (moved || removed) {
        setInstances(
          rule.instances
            .filter((n) => positions.has(n.instanceId))
            .map((n) => {
              const pos = positions.get(n.instanceId);
              return pos ? ({ ...n, position: pos } as RuleNodeInstance) : n;
            }),
        );
      }
    },
    [rule, rfNodes, setInstances, select],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!rule) return;
      for (const change of changes) {
        if (change.type === "select" && change.selected) {
          select({ kind: "edge", id: change.id });
        }
      }
      const next = applyEdgeChanges(changes, rfEdges);
      const ids = new Set(next.map((e) => e.id));
      const removed = rule.edges.some((e) => !ids.has(e.id));
      if (removed) setEdges(rule.edges.filter((e) => ids.has(e.id)));
    },
    [rule, rfEdges, setEdges, select],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      // The source handle's id is the output port name. For per-branch
      // handles (filter pass/fail), this is exactly the branch — derive it
      // automatically so users don't have to set the branch on the edge.
      const branch: "pass" | "fail" | "default" =
        conn.sourceHandle === "pass" ? "pass"
        : conn.sourceHandle === "fail" ? "fail"
        : "default";
      const id = addEdge(conn.source, conn.target, branch);
      if (id) select({ kind: "edge", id });
    },
    [addEdge, select],
  );

  const onPaneClick = useCallback(() => {
    select({ kind: "none" });
  }, [select]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const setBinding = useRuleStore((s) => s.setBinding);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw =
        e.dataTransfer.getData(PALETTE_DND_TYPE) ||
        e.dataTransfer.getData("text/plain");
      if (!raw) return;
      let payload: PaletteDragPayload;
      try {
        payload = JSON.parse(raw) as PaletteDragPayload;
      } catch {
        return;
      }
      const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const previousSelection = useRuleStore.getState().selection;

      let newId = "";
      if (payload.kind === "node") {
        const def = nodeDefs.find((n) => n.id === payload.nodeId);
        if (!def) return;
        newId = addInstance(payload.nodeId, position);
      } else if (payload.kind === "reference") {
        // Drop a reference: create a pre-wired lookup-node instance with
        // referenceId already bound. User just fills in target / valueColumn / matchOn.
        const lookupDef = nodeDefs.find((n) => n.id === "node-mutator-lookup");
        if (!lookupDef) return;
        newId = addInstance("node-mutator-lookup", position);
        if (newId) {
          setBinding(newId, "referenceId", { kind: "reference", referenceId: payload.referenceId });
        }
      }

      if (newId && previousSelection.kind === "node" && previousSelection.id !== newId) {
        addEdge(previousSelection.id, newId, "default");
      }
      if (newId) select({ kind: "node", id: newId });
    },
    [rfInstance, addInstance, addEdge, select, nodeDefs, setBinding],
  );

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <ReactFlow
        key={rule?.id ?? "loading"}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        minZoom={0.2}
        maxZoom={2}
        style={{ background: "var(--muted)" }}
      >
        <Background gap={16} size={1} color="rgba(0,0,0,0.05)" />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeStrokeColor={() => "transparent"}
          nodeColor={() => "#94a3b8"}
          style={{ background: "var(--background)" }}
        />
      </ReactFlow>

      {/* Onboarding hint — fade in when canvas is just Input → Output */}
      {rule && rule.instances.length <= 2 ? (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden
        >
          <div className="rounded-lg bg-background/80 backdrop-blur border border-dashed border-border px-5 py-4 max-w-sm text-center shadow-sm">
            <div className="text-[13px] font-medium text-foreground">Drag a node from the right →</div>
            <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Filters, references, calculations — drop them between Input and Output, then click each one to configure.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
