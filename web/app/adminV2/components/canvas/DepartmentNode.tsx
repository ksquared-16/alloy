"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { neutral, derived, semantic } from "@/styles/tokens/colors";
import { getDepartmentColor, type DepartmentKey } from "@/lib/departmentColors";

export type DepartmentNodeData = {
  name: string;
  departmentKey: DepartmentKey;
  primaryKpi: string;
  primaryValue: string;
  secondaryKpi: string;
  secondaryValue: string;
  health: "good" | "attention" | "critical";
  alertCount: number;
};

const HEALTH_LABELS: Record<DepartmentNodeData["health"], string> = {
  good: "Good",
  attention: "Attention",
  critical: "Critical",
};

const HEALTH_COLOR: Record<DepartmentNodeData["health"], string> = {
  good: semantic.success,
  attention: semantic.warning,
  critical: semantic.warning,
};

function DepartmentNodeComponent({ data, selected }: NodeProps<DepartmentNodeData>) {
  const fill = getDepartmentColor(data.departmentKey);

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          width: 200,
          minHeight: 160,
          padding: 16,
          borderRadius: 12,
          backgroundColor: neutral.surface,
          border: `2px solid ${selected ? neutral.textPrimary : derived.border}`,
          boxSizing: "border-box",
          boxShadow: derived.cardShadow,
        }}
      >
        <div
          style={{
            height: 4,
            borderRadius: 2,
            marginBottom: 12,
            backgroundColor: fill,
          }}
        />
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: neutral.textPrimary,
            marginBottom: 12,
          }}
        >
          {data.name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: derived.textSecondary,
            marginBottom: 2,
          }}
        >
          {data.primaryKpi}: <strong style={{ color: neutral.textPrimary }}>{data.primaryValue}</strong>
        </div>
        <div
          style={{
            fontSize: 12,
            color: derived.textSecondary,
            marginBottom: 10,
          }}
        >
          {data.secondaryKpi}: <strong style={{ color: neutral.textPrimary }}>{data.secondaryValue}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: HEALTH_COLOR[data.health],
            }}
          >
            Health: {HEALTH_LABELS[data.health]}
          </span>
          {data.alertCount > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: semantic.warning,
                color: neutral.surface,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {data.alertCount}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

export default memo(DepartmentNodeComponent);
