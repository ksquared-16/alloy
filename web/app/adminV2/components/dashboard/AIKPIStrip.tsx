"use client";

import { neutral, derived } from "@/styles/tokens/colors";
import KPIStatCard from "./KPIStatCard";
import { getAIKpiItems, type KpiScope } from "./mockKpiData";

type Props = { scope: KpiScope };

export default function AIKPIStrip({ scope }: Props) {
  const items = getAIKpiItems(scope);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        borderBottom: `1px solid ${derived.border}`,
        backgroundColor: neutral.surface,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: derived.textSecondary,
          textTransform: "none",
          letterSpacing: "0.02em",
          flexShrink: 0,
        }}
      >
        AI
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, flex: 1 }}>
        {items.map((item) => (
          <KPIStatCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}
