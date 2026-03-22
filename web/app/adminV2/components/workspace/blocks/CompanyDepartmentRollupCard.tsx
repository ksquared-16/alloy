"use client";

import type { CompanyDepartmentCardVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceActionHandler } from "@/lib/ui-v2/workspace-actions";

type Props = {
  card: CompanyDepartmentCardVm;
  onAction: WorkspaceActionHandler;
};

const MAX_SIGNALS = 3;

/** Subtle visual identity for tiles (CSS-tinted) — white base + ~3–4% hue */
type DeptTone = "pine" | "amber" | "blue" | "neutral";

function deptToneForKey(departmentKey: string): DeptTone {
  const m: Record<string, DeptTone> = {
    operations: "pine",
    revenue: "amber",
    growth: "blue",
    team: "neutral",
    finance: "neutral",
    systems: "neutral",
  };
  return m[departmentKey] ?? "neutral";
}

/**
 * Compact company-level department tile — summary density (not department rollup panels).
 */
export default function CompanyDepartmentRollupCard({ card, onAction }: Props) {
  const groups = (card.rollupGroups ?? []).slice(0, MAX_SIGNALS);
  const total = card.countBadge ?? groups.reduce((s, g) => s + g.count, 0);
  const desc = card.summaryLine?.trim();
  const tone = deptToneForKey(card.departmentKey);

  return (
    <button
      type="button"
      className="adminv2-ws-company-dept-tile"
      data-ws-company-dept-key={card.departmentKey}
      data-ws-company-dept-tone={tone}
      onClick={() => onAction({ type: "company.open_department", departmentKey: card.departmentKey })}
      aria-label={`Open ${card.label} department workspace`}
    >
      <div className="adminv2-ws-company-dept-tile-head">
        <h3 className="adminv2-ws-company-dept-tile-name">{card.label}</h3>
        {total > 0 ? (
          <span className="adminv2-ws-company-dept-tile-badge" aria-label={`${total} open items`}>
            {total}
          </span>
        ) : null}
      </div>
      {desc ? <p className="adminv2-ws-company-dept-tile-desc">{desc}</p> : null}
      {groups.length > 0 ? (
        <ul className="adminv2-ws-company-dept-tile-signals" role="list">
          {groups.map((g) => (
            <li key={g.id} className="adminv2-ws-company-dept-tile-signal" role="listitem">
              <span className="adminv2-ws-company-dept-tile-signal-label">{g.label}</span>
              <span className="adminv2-ws-company-dept-tile-signal-count">{g.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adminv2-ws-company-dept-tile-empty">No rollup</p>
      )}
    </button>
  );
}
