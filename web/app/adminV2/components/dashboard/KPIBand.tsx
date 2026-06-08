"use client";

import { neutral, derived, brand } from "@/styles/tokens/colors";
import KPIStatCard from "./KPIStatCard";
import { getAIKpiItems, getBusinessKpiItems, type KpiScope } from "./mockKpiData";

type Props = { scope: KpiScope };

export default function KPIBand({ scope }: Props) {
  const aiItems = getAIKpiItems(scope);
  const businessItems = getBusinessKpiItems(scope);
  const bCols = Math.max(businessItems.length, 1);
  const aCols = Math.max(aiItems.length, 1);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        minHeight: 102,
        borderBottom: `1px solid ${derived.border}`,
        backgroundColor: neutral.surface,
        backgroundImage: `linear-gradient(180deg, ${neutral.surface} 0%, ${derived.kpiRailWash} 100%)`,
        boxShadow: `${derived.kpiBandShadow}, inset 0 0 0 1px ${derived.adminV2BoundaryAmber}`,
        zIndex: 3,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "16px 20px 18px",
          background: `linear-gradient(142deg, ${derived.kpiBandBusinessLight} 0%, transparent 52%)`,
          borderRight: `1px solid ${derived.border}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: brand.secondary,
            textTransform: "none",
            letterSpacing: "0.11em",
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          Business metrics
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${bCols}, minmax(0, 1fr))`,
            gap: 10,
            alignItems: "stretch",
            flex: 1,
            minHeight: 0,
          }}
        >
          {businessItems.map((item) => (
            <div key={item.label} style={{ minWidth: 0, display: "flex" }}>
              <KPIStatCard
                label={item.label}
                value={item.value}
                variant="business"
              />
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: "16px 20px 18px",
          background: `linear-gradient(218deg, ${derived.kpiBandAiLight} 0%, transparent 50%)`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: brand.primary,
            textTransform: "none",
            letterSpacing: "0.11em",
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          AI metrics
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${aCols}, minmax(0, 1fr))`,
            gap: 10,
            alignItems: "stretch",
            flex: 1,
            minHeight: 0,
          }}
        >
          {aiItems.map((item) => (
            <div key={item.label} style={{ minWidth: 0, display: "flex" }}>
              <KPIStatCard label={item.label} value={item.value} variant="ai" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
