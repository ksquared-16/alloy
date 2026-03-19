"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { neutral, derived, semantic, brand } from "@/styles/tokens/colors";
import { getDepartmentColor, type DepartmentKey } from "@/lib/departmentColors";
import {
  COMPANY_GRID_DEPT_WIDTH,
  COMPANY_GRID_DEPT_HEIGHT,
} from "./canvasLayout";
import type { QuickAction, QuickActionIcon } from "./mockDepartmentActions";

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
  /** Mock: quick actions shown on hover/selection */
  quickActions?: QuickAction[];
  /** Mock: next step when this department is selected */
  nextBestAction?: string;
  /** Mock: highlight as priority on company canvas */
  isPriority?: boolean;
  /** Opens floating action panel (company view); event used for positioning */
  onQuickActionClick?: (nodeId: string, actionId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  /** Responsive: tile dimensions and padding (from canvas layout) */
  tileWidth?: number;
  tileHeight?: number;
  cardPad?: number;
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

const DEFAULT_W = COMPANY_GRID_DEPT_WIDTH;
const DEFAULT_H = COMPANY_GRID_DEPT_HEIGHT;
const DEFAULT_CARD_PAD = 32;

const ICON_SIZE = 14;
const ICON_GAP = 6;

function QuickActionIconSvg({ icon, size = ICON_SIZE }: { icon: QuickActionIcon; size?: number }) {
  const s = size;
  const common = { width: s, height: s, fill: "currentColor", stroke: "currentColor" };
  switch (icon) {
    case "gear":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5z" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "mail":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M22 6l-10 7L2 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "warning":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 9v4M12 17h.01" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "eye":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M20 6L9 17l-5-5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

function DepartmentNodeComponent({ id, data, selected }: NodeProps<DepartmentNodeData>) {
  const fill = getDepartmentColor(data.departmentKey);
  const zoomingOut = data.zoomingOut ?? false;
  const activating = data.activating ?? false;
  const quickActions = data.quickActions ?? [];
  const isPriority = data.isPriority ?? false;
  const onQuickActionClick = data.onQuickActionClick;
  const W = data.tileWidth ?? DEFAULT_W;
  const H = data.tileHeight ?? DEFAULT_H;
  const CARD_PAD = data.cardPad ?? DEFAULT_CARD_PAD;

  return (
    <div
      className={`adminv2-dept-node-fixed ${selected ? "adminv2-dept-selected" : ""} ${isPriority ? "adminv2-dept-priority" : ""}`}
      style={{
        position: "relative",
        width: W,
        height: H,
        flexShrink: 0,
        cursor: "pointer",
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
          className="adminv2-dept-title-clamp adminv2-dept-title"
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
          className="adminv2-dept-primary-value"
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
          className="adminv2-dept-secondary-value"
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
              className="adminv2-dept-compact-value"
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
              className="adminv2-dept-compact-value"
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
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <span
              className="adminv2-dept-health"
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
            {data.health !== "good" && (
              <span
                className="adminv2-dept-status-chip"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "4px 8px",
                  borderRadius: 6,
                  backgroundColor: data.health === "critical" ? semantic.warning : "rgba(245, 158, 11, 0.18)",
                  color: data.health === "critical" ? neutral.surface : semantic.warning,
                  flexShrink: 0,
                }}
              >
                Action needed
              </span>
            )}
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
        {quickActions.length > 0 && (
          <div className="adminv2-dept-actions-row" aria-hidden>
            {quickActions.map((a) => (
              <button
                key={a.id}
                type="button"
                className="adminv2-dept-quick-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickActionClick?.(id, a.id, e);
                }}
                style={{
                  border: `1px solid ${derived.border}`,
                  color: brand.primary,
                  backgroundColor: neutral.background,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: ICON_GAP,
                }}
              >
                <QuickActionIconSvg icon={a.icon} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(DepartmentNodeComponent);
