"use client";

import { memo } from "react";
import type { NodeProps } from "reactflow";
import { neutral, derived, brand } from "@/styles/tokens/colors";

const PANEL_PADDING = 20;
const BORDER_RADIUS = 14;
const SHADOW = "0 12px 32px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)";

export type ActionPanelNodeData = {
  title: string;
  description: string;
  records: string[];
  primaryLabel: string;
  secondaryLabel?: string;
  panelWidth: number;
  onClose: () => void;
};

function ActionPanelNodeComponent({ data }: NodeProps<ActionPanelNodeData>) {
  const { title, description, records, primaryLabel, secondaryLabel, panelWidth, onClose } = data;
  const hasRecords = Array.isArray(records) && records.length > 0;

  return (
    <div
      className="adminv2-action-panel"
      role="dialog"
      aria-label={title}
      style={{
        width: panelWidth,
        minWidth: 280,
        maxWidth: "min(420px, 92vw)",
        padding: PANEL_PADDING,
        borderRadius: BORDER_RADIUS,
        backgroundColor: neutral.surface,
        border: `1px solid ${derived.border}`,
        boxShadow: SHADOW,
        animation: "adminv2-action-panel-in 180ms ease-out forwards",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h3
        className="adminv2-action-panel-title"
        style={{
          margin: 0,
          marginBottom: 8,
          fontSize: 16,
          fontWeight: 600,
          color: neutral.textPrimary,
          letterSpacing: "-0.01em",
          lineHeight: 1.3,
        }}
      >
        {title}
      </h3>
      <p
        className="adminv2-action-panel-desc"
        style={{
          margin: 0,
          marginBottom: hasRecords ? 12 : 16,
          fontSize: 14,
          fontWeight: 400,
          color: derived.textSecondary,
          lineHeight: 1.45,
        }}
      >
        {description}
      </p>
      {hasRecords && (
        <div
          className="adminv2-action-panel-records"
          style={{
            marginBottom: 16,
            paddingTop: 12,
            paddingBottom: 12,
            borderTop: `1px solid ${derived.border}`,
            borderBottom: `1px solid ${derived.border}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: derived.textSecondary,
              textTransform: "none",
              letterSpacing: "0.06em",
              marginBottom: 8,
            }}
          >
            Records / context
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              fontWeight: 500,
              color: neutral.textPrimary,
              lineHeight: 1.5,
            }}
          >
            {records.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="adminv2-action-panel-view-records">
        <button
          type="button"
          onClick={() => onClose()}
          className="adminv2-action-panel-view-records-link"
          style={{
            background: "none",
            border: "none",
            padding: 0,
            marginBottom: 14,
            fontSize: 13,
            fontWeight: 500,
            color: brand.primary,
            cursor: "pointer",
            textDecoration: "none",
            letterSpacing: "0.01em",
          }}
        >
          View related records
        </button>
      </div>
      <div
        className="adminv2-action-panel-actions"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={() => onClose()}
          style={{
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 600,
            color: neutral.surface,
            backgroundColor: brand.primary,
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            letterSpacing: "0.02em",
          }}
        >
          {primaryLabel}
        </button>
        {secondaryLabel && (
          <button
            type="button"
            onClick={() => onClose()}
            style={{
              padding: "10px 16px",
              fontSize: 14,
              fontWeight: 600,
              color: brand.primary,
              backgroundColor: "transparent",
              border: `1px solid ${derived.border}`,
              borderRadius: 10,
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(ActionPanelNodeComponent);
