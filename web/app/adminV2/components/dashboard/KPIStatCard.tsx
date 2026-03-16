"use client";

import { neutral, derived, semantic } from "@/styles/tokens/colors";

export type KPIStatCardProps = {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "neutral";
};

export default function KPIStatCard({ label, value, delta, trend = "neutral" }: KPIStatCardProps) {
  const trendColor =
    trend === "up" ? semantic.success : trend === "down" ? semantic.warning : derived.textSecondary;

  return (
    <div
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        backgroundColor: neutral.surface,
        border: `1px solid ${derived.border}`,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: derived.textSecondary, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: neutral.textPrimary }}>{value}</div>
      {delta != null && (
        <div style={{ fontSize: 11, color: trendColor, marginTop: 2 }}>{delta}</div>
      )}
    </div>
  );
}
