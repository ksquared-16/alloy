"use client";

import { useMemo } from "react";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";

/** Default orientation band capacity (compact scorecard target). */
const KPI_ORIENTATION_MAX = 5;

type Props = {
  kpis: KPIVm[];
  /** Caps visible metrics — default aligns with orientation band (~4–5). */
  maxVisible?: number;
  /** @deprecated Presentation is unified single strip; lanes are ordered business then ai. Kept for call-site compat. */
  surface?: "default" | "department" | "company" | "work_unit" | "record";
  /** @deprecated Unused in unified compact strip — kept so existing call sites compile. */
  dualRailHeadings?: { business?: string; secondary?: string };
};

/**
 * Normalize metrics to a steady left-to-right read: business-lane KPIs first, then `lane: "ai"`, capped at `maxVisible`.
 */
function mergeKpisForOrientationStrip(kpis: KPIVm[], maxVisible: number): KPIVm[] {
  const cap = Math.max(0, Math.min(maxVisible, KPI_ORIENTATION_MAX));
  const business = kpis.filter((k) => (k.lane ?? "business") !== "ai");
  const ai = kpis.filter((k) => k.lane === "ai");
  return [...business, ...ai].slice(0, cap);
}

export default function KPIBlock({
  kpis,
  maxVisible = KPI_ORIENTATION_MAX,
  surface: _surface,
  dualRailHeadings: _dualRailHeadings,
}: Props) {
  void _surface;
  void _dualRailHeadings;

  const items = useMemo(() => mergeKpisForOrientationStrip(kpis, maxVisible), [kpis, maxVisible]);

  if (items.length === 0) return null;

  return (
    <div
      className="adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact"
      role="group"
      aria-label="Key metrics"
    >
      <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation" role="list">
        {items.map((k) => (
          <div
            key={k.id}
            className={[
              "adminv2-ws-kpi-cell",
              "adminv2-ws-kpi-cell--orientation",
              k.tone && k.tone !== "neutral" ? `adminv2-ws-kpi-cell--tone-${k.tone}` : "",
              k.lane === "ai" ? "adminv2-ws-kpi-cell--lane-ai" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="listitem"
          >
            <span className="adminv2-ws-kpi-label">{k.label}</span>
            <span className="adminv2-ws-kpi-value">
              {k.value}
              {k.unit ? <span className="adminv2-ws-kpi-unit">{k.unit}</span> : null}
            </span>
            {k.aiSummary ? <span className="adminv2-ws-kpi-ai">{k.aiSummary}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
