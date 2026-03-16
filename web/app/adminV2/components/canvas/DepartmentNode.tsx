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
  zoomingOut?: boolean;
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
  const zoomingOut = data.zoomingOut ?? false;

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          width: 200,
          minHeight: 168,
          padding: 20,
          borderRadius: 12,
          backgroundColor: neutral.surface,
          border: `2px solid ${selected ? neutral.textPrimary : derived.border}`,
          boxSizing: "border-box",
          boxShadow: selected ? derived.nodeElevation : derived.cardShadow,
          opacity: zoomingOut ? 0.5 : 1,
          transform: zoomingOut ? "scale(0.96)" : "scale(1)",
          transition: "opacity 280ms ease-out, transform 280ms ease-out, box-shadow 180ms ease-out",
        }}
      >
        <div
          style={{
            height: 4,
            borderRadius: 2,
            marginBottom: 14,
            backgroundColor: fill,
          }}
        />
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: neutral.textPrimary,
            marginBottom: 14,
            letterSpacing: "-0.01em",
          }}
        >
          {data.name}
        </div>
        <div
          style={{
            fontSize: 13,
            color: derived.textSecondary,
            marginBottom: 4,
          }}
        >
          {data.primaryKpi}: <strong style={{ color: neutral.textPrimary }}>{data.primaryValue}</strong>
        </div>
        <div
          style={{
            fontSize: 11,
            color: derived.textSecondary,
            marginBottom: 12,
          }}
        >
          {data.secondaryKpi}: <strong style={{ color: neutral.textPrimary }}>{data.secondaryValue}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: HEALTH_COLOR[data.health],
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {HEALTH_LABELS[data.health]}
          </span>
          {data.alertCount > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: semantic.warning,
                color: neutral.surface,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: derived.cardShadow,
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