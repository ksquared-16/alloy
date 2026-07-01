"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { neutral, derived, semantic, brand } from "@/styles/tokens/colors";
import { getDepartmentColor, type DepartmentKey } from "@/lib/departmentColors";

export type ManagerNodeData = {
  name: string;
  departmentKey: DepartmentKey;
  stat1Label: string;
  stat1Value: string;
  stat2Label: string;
  stat2Value: string;
  enterStaggerMs?: number;
};

/** Proof pass — hero cards; reduce for production */
export const MANAGER_CARD_WIDTH = 316;

function ManagerNodeComponent({ data, selected }: NodeProps<ManagerNodeData>) {
  const accent = getDepartmentColor(data.departmentKey);

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        className="adminv2-manager-node-shell-hero adminv2-manager-card-surface"
        style={{
          width: MANAGER_CARD_WIDTH,
          minHeight: 248,
          padding: 28,
          borderRadius: 16,
          backgroundColor: neutral.surface,
          border: `2px solid ${selected ? semantic.info : derived.border}`,
          boxSizing: "border-box",
          boxShadow: selected ? derived.nodeOnChamberShadowActive : derived.nodeOnChamberShadow,
          transition: "border-color 200ms ease, box-shadow 200ms ease",
          animationDelay: `${data.enterStaggerMs ?? 0}ms`,
        }}
      >
        <div
          style={{
            height: 4,
            borderRadius: 2,
            marginBottom: 16,
            backgroundColor: accent,
          }}
        />
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: neutral.textPrimary,
            marginBottom: 18,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {data.name}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 10,
              color: derived.textSecondary,
              textTransform: "none",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            {data.stat1Label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: brand.secondary, lineHeight: 1.1 }}>
            {data.stat1Value}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              color: derived.textSecondary,
              textTransform: "none",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            {data.stat2Label}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: neutral.textPrimary }}>
            {data.stat2Value}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}

export default memo(ManagerNodeComponent);
