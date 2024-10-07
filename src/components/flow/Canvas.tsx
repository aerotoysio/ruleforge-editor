"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
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

  const rfNodes: RFNode[] = useMemo(
    () =>
      (rule?.instances ?? []).map((inst) => {
        const def = nodeDefs.find((n) => n.id === inst.nodeId);
        const isTerminal = def?.category === "input" || def?.category === "output";
        const width = isTerminal ? 140 : 220;
        const height = isTerminal ? 40 : 64;
        return {
          id: inst.instanceId,
          type: "ruleforgeNode",
          position: inst.position,
          data: { instance: inst, def, bindings: rule?.bindings[inst.instanceId] },
          draggable: true,
          selected: selection.kind === "node" && selection.id === inst.instanceId,
          width,
          height,
          measured: { width, height },
        };
      }),
    [rule?.instances, rule?.bindings, nodeDefs, selection],
  );

  const rfEdges: RFEdge[] = useMemo(
    () =>
      (rule?.edges ?? []).map((e) => {
        const traversed = trace?.traversedEdges.has(e.id) ?? false;
        const dim = trace !== null && !traversed;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.branch && e.branch !== "default" ? e.branch : undefined,
          labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)" },
          labelBgStyle: { fill: "var(--background)" },
          style: { ...edgeStyle(e.branch, traversed), opacity: dim ? 0.25 : 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle(e.branch, traversed).stroke as string },
          data: { branch: e.branch ?? "default" },
          selected: selection.kind === "edge" && selection.id === e.id,
        };
      }),
    [rule?.edges, trace, selection],
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
      const id = addEdge(conn.source, conn.target, "default");
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
      if (payload.kind !== "node") return;
      const def = nodeDefs.find((n) => n.id === payload.nodeId);
      if (!def) return;
      const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const previousSelection = useRuleStore.getState().selection;
      const newId = addInstance(payload.nodeId, position);
      if (newId && previousSelection.kind === "node" && previousSelection.id !== newId) {
        addEdge(previousSelection.id, newId, "default");
      }
      if (newId) select({ kind: "node", id: newId });
    },
    [rfInstance, addInstance, addEdge, select, nodeDefs],
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
