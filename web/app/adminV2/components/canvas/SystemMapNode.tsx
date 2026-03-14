"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { getNodeColor, type NodeType } from "@/lib/nodeColors";
import { neutral } from "@/styles/tokens/colors";

export type SystemMapNodeData = {
  label: string;
  nodeType?: NodeType;
};

const DEFAULT_NODE_TYPE: NodeType = "customer";

function SystemMapNodeComponent({ data, selected }: NodeProps<SystemMapNodeData>) {
  const nodeType = (data.nodeType ?? DEFAULT_NODE_TYPE) as NodeType;
  const fill = getNodeColor(nodeType);

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          backgroundColor: fill,
          color: neutral.surface,
          fontSize: 12,
          fontWeight: 500,
          minWidth: 80,
          border: selected ? `2px solid ${neutral.textPrimary}` : "none",
          boxSizing: "border-box",
        }}
      >
        {data.label ?? nodeType}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

export default memo(SystemMapNodeComponent);
