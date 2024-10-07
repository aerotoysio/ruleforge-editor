import { NodeDefEditor } from "@/components/nodes/NodeDefEditor";

export default function NewNodePage() {
  return <NodeDefEditor mode={{ kind: "new" }} />;
}
