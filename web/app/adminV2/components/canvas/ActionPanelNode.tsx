"use client";

import { memo } from "react";
import type { NodeProps } from "reactflow";
import { neutral, derived, brand } from "@/styles/tokens/colors";

const PANEL_WIDTH = 360;
const PANEL_PADDING = 20;
const BORDER_RADIUS = 14;
const SHADOW = "0 12px 32px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)";

export type ActionPanelNodeData = {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onClose: () => void;
};

function ActionPanelNodeComponent({ data }: NodeProps<ActionPanelNodeData>) {
  const { title, description, primaryLabel, secondaryLabel, onClose } = data;

  return (
    <div
      className="adminv2-action-panel"
      role="dialog"
      aria-label={title}
      style={{
        width: PANEL_WIDTH,
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
        style={{
          margin: 0,
          marginBottom: 16,
          fontSize: 14,
          fontWeight: 400,
          color: derived.textSecondary,
          lineHeight: 1.45,
        }}
      >
        {description}
      </p>
      <div
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
