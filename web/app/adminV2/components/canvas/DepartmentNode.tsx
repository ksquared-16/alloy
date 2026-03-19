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
  /** System-driven tile: primary signal, secondary context, agent summary (legacy) */
  primarySignal?: string;
  secondaryContext?: string;
  agentSummary?: string[];
  /** Manager/agent rollup: top-level KPI (dominant) */
  topKpi?: string;
  /** Compact system summary e.g. "3 agents active · 1 needs review" */
  agentRollup?: string;
  /** Agent name + status reporting up */
  agentStates?: { name: string; status: string }[];
  /** One short insight e.g. "Top performer: Scheduling Agent" */
  topPerformer?: string;
};

const HEALTH_LABELS: Record<DepartmentNodeData["health"], string> = {
  good: "Good",
  attention: "Attention",
  critical: "At risk",
};

const HEALTH_COLOR: Record<DepartmentNodeData["health"], string> = {
  good: semantic.success,
  attention: semantic.warning,
  critical: semantic.warning,
};

const DEFAULT_W = COMPANY_GRID_DEPT_WIDTH;
const DEFAULT_H = COMPANY_GRID_DEPT_HEIGHT;
const DEFAULT_CARD_PAD = 18;

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

function SystemTileContent({
  data,
  quickActions,
  id,
  onQuickActionClick,
  fill,
}: {
  data: DepartmentNodeData;
  quickActions: QuickAction[];
  id: string;
  onQuickActionClick: DepartmentNodeData["onQuickActionClick"];
  fill: string;
}) {
  const topKpi = data.primarySignal ?? data.primaryValue ?? "—";
  const agentRollup = data.agentRollup ?? "";
  const agentStates = data.agentStates ?? [];
  const topPerformer = data.topPerformer ?? "";
  const primaryAction = quickActions[0];
  const secondaryAction = quickActions[1];

  const hasRollup = agentRollup || agentStates.length > 0 || topPerformer;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Band 1: Status + Title (manager rollup header) */}
      <div
        style={{
          flexShrink: 0,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            height: 3,
            borderRadius: 2,
            marginBottom: 5,
            background: `linear-gradient(90deg, ${fill} 0%, ${brand.secondary} 100%)`,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: HEALTH_COLOR[data.health],
            }}
          >
            {HEALTH_LABELS[data.health]}
          </span>
        </div>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: neutral.textPrimary,
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            display: "block",
          }}
        >
          {data.name}
        </span>
      </div>

      {/* Band 2: Top-level KPI (one dominant) */}
      <div
        style={{
          flexShrink: 0,
          marginBottom: 6,
          paddingBottom: 6,
          borderBottom: `1px solid ${derived.border}`,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: neutral.textPrimary,
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
          }}
        >
          {topKpi}
        </span>
      </div>

      {/* Band 3: Agent rollup + states + insight + actions (legible, fills card) */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: 8,
        }}
      >
        {hasRollup && (
          <>
            {/* Agent rollup */}
            {agentRollup && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: derived.textSecondary,
                  marginBottom: 6,
                  lineHeight: 1.4,
                }}
              >
                {agentRollup}
              </div>
            )}
            {/* Agent states: reporting up (Name — Status) */}
            {agentStates.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginBottom: 6,
                }}
              >
                {agentStates.slice(0, 3).map((a, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: neutral.textPrimary,
                      lineHeight: 1.4,
                    }}
                  >
                    {a.name} — <span style={{ color: a.status === "Healthy" ? semantic.success : semantic.warning }}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Top performer / insight */}
            {topPerformer && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: derived.textSecondary,
                  marginBottom: 8,
                  lineHeight: 1.4,
                }}
              >
                {topPerformer}
              </div>
            )}
          </>
        )}
        {/* Actions row (two max) */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 8,
          }}
        >
          {primaryAction && (
            <button
              type="button"
              className="adminv2-dept-quick-action adminv2-dept-system-primary-action"
              onClick={(e) => {
                e.stopPropagation();
                onQuickActionClick?.(id, primaryAction.id, e);
              }}
              style={{
                minHeight: 34,
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${derived.border}`,
                color: neutral.surface,
                backgroundColor: brand.primary,
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: ICON_GAP,
              }}
            >
              <QuickActionIconSvg icon={primaryAction.icon} size={13} />
              <span>{primaryAction.label}</span>
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              className="adminv2-dept-quick-action adminv2-dept-system-secondary-action"
              onClick={(e) => {
                e.stopPropagation();
                onQuickActionClick?.(id, secondaryAction.id, e);
              }}
              style={{
                minHeight: 34,
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${derived.border}`,
                color: brand.primary,
                backgroundColor: "transparent",
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: ICON_GAP,
              }}
            >
              <QuickActionIconSvg icon={secondaryAction.icon} size={12} />
              <span>{secondaryAction.label}</span>
            </button>
          )}
        </div>
        <span
          className="adminv2-dept-view-details"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: brand.primary,
            cursor: "pointer",
            display: "inline-block",
          }}
          onClick={(e) => e.stopPropagation()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && e.stopPropagation()}
        >
          View details →
        </span>
      </div>
    </div>
  );
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
  /* Clean node primitive: rounded rect, thin border, no edge gimmicks */
  const shellRadius = 12;
  const focusRingStyle = {
    width: W,
    height: H,
    boxSizing: "border-box" as const,
    padding: CARD_PAD,
    borderRadius: shellRadius,
    background: `linear-gradient(180deg, ${neutral.surface} 0%, ${neutral.background} 100%)`,
    border: `1px solid ${selected || activating ? semantic.info : derived.border}`,
    boxShadow: activating || selected
      ? `0 0 0 2px rgba(0,69,140,0.24), 0 2px 8px rgba(39,63,82,0.05)`
      : `0 0 0 1px ${derived.border}`,
    opacity: zoomingOut ? 0.52 : 1,
    transform: zoomingOut ? "scale(0.96)" : "scale(1)",
    transition:
      "opacity 420ms cubic-bezier(0.42, 0, 0.58, 1), transform 420ms cubic-bezier(0.42, 0, 0.58, 1), box-shadow 200ms ease, border-color 200ms ease",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden" as const,
  };

  return (
    <div
      className={`adminv2-dept-node-fixed adminv2-dept-system-tile ${selected ? "adminv2-dept-selected" : ""} ${isPriority ? "adminv2-dept-priority" : ""}`}
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
        style={focusRingStyle}
      >
        <SystemTileContent
            data={data}
            quickActions={quickActions}
            id={id}
            onQuickActionClick={onQuickActionClick}
            fill={fill}
          />
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(DepartmentNodeComponent);
