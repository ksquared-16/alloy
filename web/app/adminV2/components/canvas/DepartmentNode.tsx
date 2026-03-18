"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { neutral, derived, semantic, brand } from "@/styles/tokens/colors";
import { getDepartmentColor, type DepartmentKey } from "@/lib/departmentColors";
import {
  COMPANY_GRID_DEPT_WIDTH,
  COMPANY_GRID_DEPT_HEIGHT,
} from "./canvasLayout";

export type DepartmentNodeData = {
  name: string;
  departmentKey: DepartmentKey;
  primaryKpi: string;
  primaryValue: string;
  secondaryKpi: string;
  secondaryValue: string;
  compact1Label: string;
  compact1Value: string;
  compact2Label: string;
  compact2Value: string;
  health: "good" | "attention" | "critical";
  alertCount: number;
  zoomingOut?: boolean;
  activating?: boolean;
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

const W = COMPANY_GRID_DEPT_WIDTH;
const H = COMPANY_GRID_DEPT_HEIGHT;
const CARD_PAD = 32;

function DepartmentNodeComponent({ data, selected }: NodeProps<DepartmentNodeData>) {
  const fill = getDepartmentColor(data.departmentKey);
  const zoomingOut = data.zoomingOut ?? false;
  const activating = data.activating ?? false;

  return (
    <div
      className="adminv2-dept-node-fixed"
      style={{
        position: "relative",
        width: W,
        height: H,
        flexShrink: 0,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div
        className={`adminv2-dept-focus-ring ${activating ? "adminv2-dept-activating-soft" : ""}`}
        style={{
          width: W,
          height: H,
          boxSizing: "border-box",
          padding: CARD_PAD,
          borderRadius: 24,
          background: `linear-gradient(178deg, ${neutral.surface} 0%, ${neutral.surface} 42%, ${neutral.background} 100%)`,
          border: `1px solid ${selected || activating ? semantic.info : derived.border}`,
          boxShadow: `${activating || selected ? derived.nodeOnChamberShadowActive : derived.nodeOnChamberShadow}, 0 1px 0 ${derived.ambientLifeGlow}`,
          opacity: zoomingOut ? 0.52 : 1,
          transform: zoomingOut ? "scale(0.96)" : "scale(1)",
          transition:
            "opacity 420ms cubic-bezier(0.42, 0, 0.58, 1), transform 420ms cubic-bezier(0.42, 0, 0.58, 1), box-shadow 200ms ease, border-color 200ms ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 8,
            borderRadius: 4,
            marginBottom: 18,
            flexShrink: 0,
            background: `linear-gradient(90deg, ${fill} 0%, ${brand.secondary} 100%)`,
          }}
        />
        <div
          className="adminv2-dept-title-clamp"
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: neutral.textPrimary,
            marginBottom: 12,
            letterSpacing: "-0.036em",
            lineHeight: 1.08,
            flexShrink: 0,
            maxHeight: 120,
          }}
        >
          {data.name}
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 600,
            color: neutral.textPrimary,
            marginBottom: 6,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            flexShrink: 0,
          }}
        >
          {data.primaryValue}
        </div>
        <div
          style={{
            fontSize: 14,
            color: derived.textSecondary,
            marginBottom: 14,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            flexShrink: 0,
          }}
        >
          {data.primaryKpi}
        </div>
        <div
          style={{
            fontSize: 44,
            fontWeight: 600,
            color: neutral.textPrimary,
            marginBottom: 5,
            letterSpacing: "-0.024em",
            lineHeight: 1.06,
            flexShrink: 0,
          }}
        >
          {data.secondaryValue}
        </div>
        <div
          style={{
            fontSize: 14,
            color: derived.textSecondary,
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}
        >
          {data.secondaryKpi}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: "12px 0",
            borderTop: `1px solid ${derived.border}`,
            borderBottom: `1px solid ${derived.border}`,
            marginBottom: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                color: derived.textSecondary,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginBottom: 5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {data.compact1Label}
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 600,
                color: brand.secondary,
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {data.compact1Value}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                color: derived.textSecondary,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginBottom: 5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {data.compact2Label}
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 600,
                color: neutral.textPrimary,
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {data.compact2Value}
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: "auto",
            flexShrink: 0,
            minHeight: 42,
            paddingTop: 4,
          }}
        >
          <span
            style={{
              fontSize: 36,
              fontWeight: 600,
              color: HEALTH_COLOR[data.health],
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {HEALTH_LABELS[data.health]}
          </span>
          {data.alertCount > 0 ? (
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                minWidth: 44,
                height: 44,
                borderRadius: 22,
                flexShrink: 0,
                backgroundColor: semantic.warning,
                color: neutral.surface,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: `2px solid ${neutral.surface}`,
                boxShadow: derived.nodeOnCanvasShadow,
                letterSpacing: "-0.02em",
              }}
            >
              {data.alertCount}
            </span>
          ) : (
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: derived.textSecondary,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                flexShrink: 0,
              }}
            >
              No alerts
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(DepartmentNodeComponent);
