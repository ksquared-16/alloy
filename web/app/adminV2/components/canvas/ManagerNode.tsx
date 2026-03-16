"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { neutral, derived } from "@/styles/tokens/colors";
import { getDepartmentColor, type DepartmentKey } from "@/lib/departmentColors";

export type ManagerNodeData = {
  name: string;
  departmentKey: DepartmentKey;
};

function ManagerNodeComponent({ data, selected }: NodeProps<ManagerNodeData>) {
  const accent = getDepartmentColor(data.departmentKey);

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          width: 160,
          padding: 12,
          borderRadius: 10,
          backgroundColor: neutral.surface,
          border: `2px solid ${selected ? neutral.textPrimary : derived.border}`,
          boxSizing: "border-box",
          boxShadow: derived.cardShadow,
        }}
      >
        <div
          style={{
            height: 3,
            borderRadius: 2,
            marginBottom: 8,
            backgroundColor: accent,
          }}
        />
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: neutral.textPrimary,
          }}
        >
          {data.name}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

export default memo(ManagerNodeComponent);