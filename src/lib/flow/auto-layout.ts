import type { NodePosition } from "@/lib/types";

type LayoutNode = { id: string };
type LayoutEdge = { source: string; target: string };

export function autoLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: { startX?: number; startY?: number; columnGap?: number; rowGap?: number } = {},
): Map<string, NodePosition> {
  const startX = options.startX ?? 80;
  const startY = options.startY ?? 200;
  const columnGap = options.columnGap ?? 260;
  const rowGap = options.rowGap ?? 110;

  const ids = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    outgoing.get(e.source)!.push(e.target);
  }

  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      level.set(n.id, 0);
      queue.push(n.id);
    }
  }
  while (queue.length) {
    const id = queue.shift()!;
    const myLevel = level.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      const nextLevel = myLevel + 1;
      const cur = level.get(target);
      if (cur === undefined || nextLevel > cur) {
        level.set(target, nextLevel);
        queue.push(target);
      }
    }
  }

  let nextLevel = 0;
  for (const n of nodes) {
    if (!level.has(n.id)) level.set(n.id, nextLevel++);
  }

  const byLevel = new Map<number, string[]>();
  for (const n of nodes) {
    const l = level.get(n.id) ?? 0;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(n.id);
  }

  const positions = new Map<string, NodePosition>();
  for (const [l, ids] of byLevel) {
    const total = ids.length;
    ids.forEach((id, idx) => {
      const offset = (idx - (total - 1) / 2) * rowGap;
      positions.set(id, { x: startX + l * columnGap, y: startY + offset });
    });
  }
  return positions;
}
