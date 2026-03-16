"use client";

import { useState } from "react";
import { neutral, derived, semantic } from "@/styles/tokens/colors";

export type KPIStatCardProps = {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "neutral";
};

const CARD_MIN_HEIGHT = 56;

export default function KPIStatCard({ label, value, delta, trend = "neutral" }: KPIStatCardProps) {
  const [hover, setHover] = useState(false);
  const trendColor =
    trend === "up" ? semantic.success : trend === "down" ? semantic.warning : derived.textSecondary;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        backgroundColor: neutral.surface,
        border: `1px solid ${derived.border}`,
        minWidth: 0,
        minHeight: CARD_MIN_HEIGHT,
        boxSizing: "border-box",
        transition: "border-color 160ms ease, box-shadow 160ms ease",
        borderColor: hover ? derived.textSecondary : undefined,
        boxShadow: hover ? derived.cardShadow : undefined,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: derived.textSecondary,
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: neutral.textPrimary,
          letterSpacing: "-0.02em",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {delta != null && (
        <div style={{ fontSize: 11, color: trendColor, marginTop: 4 }}>{delta}</div>
      )}
    </div>
  );
}
