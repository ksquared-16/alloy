"use client";

import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";

type Props = {
  kpis: KPIVm[];
  /** Spec: 4–6 in top band max */
  maxVisible?: number;
  surface?: "default" | "department" | "company" | "work_unit" | "record";
  /** When `surface` uses the dual strip, override default "Business metrics" / "AI metrics" headings. */
  dualRailHeadings?: { business?: string; secondary?: string };
};

const KPI_DEPT_PER_RAIL = 3;

function KpiCells({ items, minCells = KPI_DEPT_PER_RAIL }: { items: KPIVm[]; minCells?: number }) {
  const shown = items.slice(0, minCells);
  const placeholders = Math.max(0, minCells - shown.length);

  if (shown.length === 0 && placeholders === 0) {
    return (
      <div className="adminv2-ws-dept-v2-kpi-empty" aria-hidden>
        —
      </div>
    );
  }

  return (
    <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded">
      {shown.map((k) => (
        <div
          key={k.id}
          className={[
            "adminv2-ws-kpi-cell",
            k.tone && k.tone !== "neutral" ? `adminv2-ws-kpi-cell--tone-${k.tone}` : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="adminv2-ws-kpi-label">{k.label}</span>
          <span className="adminv2-ws-kpi-value">
            {k.value}
            {k.unit ? <span className="adminv2-ws-kpi-unit">{k.unit}</span> : null}
          </span>
          {k.aiSummary ? <span className="adminv2-ws-kpi-ai">{k.aiSummary}</span> : null}
        </div>
      ))}
      {Array.from({ length: placeholders }).map((_, i) => (
        <div key={`kpi-ph-${i}`} className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder" aria-hidden>
          <span className="adminv2-ws-kpi-label"> </span>
          <span className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder">—</span>
        </div>
      ))}
    </div>
  );
}

export default function KPIBlock({
  kpis,
  maxVisible = 6,
  surface = "default",
  dualRailHeadings,
}: Props) {
  const items = kpis.slice(0, maxVisible);
  if (items.length === 0) return null;

  if (surface === "department" || surface === "company" || surface === "work_unit" || surface === "record") {
    const business = items.filter((k) => (k.lane ?? "business") === "business").slice(0, KPI_DEPT_PER_RAIL);
    const ai = items.filter((k) => k.lane === "ai").slice(0, KPI_DEPT_PER_RAIL);
    const businessHeading = dualRailHeadings?.business ?? "Business metrics";
    const secondaryHeading = dualRailHeadings?.secondary ?? "AI metrics";

    return (
      <div className="adminv2-ws-dept-v2-kpi-measurement-strip" role="group" aria-label="Key metrics">
        <div className="adminv2-ws-dept-v2-kpi-dual">
          <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business">
            <div className="adminv2-ws-dept-v2-kpi-rail-heading">{businessHeading}</div>
            <KpiCells items={business} minCells={KPI_DEPT_PER_RAIL} />
          </div>
          <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--ai">
            <div className="adminv2-ws-dept-v2-kpi-rail-heading">{secondaryHeading}</div>
            <KpiCells items={ai} minCells={KPI_DEPT_PER_RAIL} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="adminv2-ws-kpi-strip" style={{ padding: "12px 16px 14px" }}>
      {items.map((k) => (
        <div
          key={k.id}
          className="adminv2-ws-zone"
          style={{
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minHeight: 72,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: derived.textSecondary, textTransform: "uppercase" }}>
            {k.label}
          </span>
          <span style={{ fontSize: 20, fontWeight: 700, color: neutral.textPrimary, letterSpacing: "-0.02em" }}>
            {k.value}
            {k.unit ? <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2 }}>{k.unit}</span> : null}
          </span>
          {k.aiSummary && (
            <span style={{ fontSize: 10, color: brand.secondary, lineHeight: 1.3 }}>{k.aiSummary}</span>
          )}
        </div>
      ))}
    </div>
  );
}
