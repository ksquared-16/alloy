"use client";

import { useState } from "react";
import { neutral, derived, semantic, brand } from "@/styles/tokens/colors";

export type KPIStatCardProps = {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "neutral";
  /** Top accent: AI = Alloy Blue, Business = Bend Pine */
  variant?: "ai" | "business";
};

const CARD_MIN_HEIGHT = 62;

const accentColor = { ai: brand.primary, business: brand.secondary } as const;

export default function KPIStatCard({
  label,
  value,
  delta,
  trend = "neutral",
  variant = "ai",
}: KPIStatCardProps) {
  const [hover, setHover] = useState(false);
  const trendColor =
    trend === "up" ? semantic.success : trend === "down" ? semantic.warning : derived.textSecondary;
  const topAccent = accentColor[variant];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "12px 12px 10px",
        borderRadius: 8,
        backgroundColor: neutral.surface,
        border: `1px solid ${derived.border}`,
        borderTop: `3px solid ${topAccent}`,
        minWidth: 0,
        width: "100%",
        flex: 1,
        minHeight: CARD_MIN_HEIGHT,
        boxSizing: "border-box",
        transition: "border-color 160ms ease, box-shadow 160ms ease",
        boxShadow: hover ? derived.cardShadow : undefined,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: derived.textSecondary,
          marginBottom: 8,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: neutral.textPrimary,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      {delta != null && (
        <div style={{ fontSize: 11, color: trendColor, marginTop: 6 }}>{delta}</div>
      )}
    </div>
  );
}
