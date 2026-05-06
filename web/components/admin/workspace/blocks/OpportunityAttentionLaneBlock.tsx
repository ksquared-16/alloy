"use client";

import Link from "next/link";
import type { WorkspaceRuntimeData } from "@/lib/workspace/types";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

function groupAttentionReasons(
    items: Array<{ _attention_reason?: string | null; _attention_reason_label?: string | null }>
) {
    type Row = { reason_key: string; label: string; count: number };
    const m = new Map<string, Row>();
    for (const it of items) {
        const code = String(it._attention_reason ?? "").trim();
        const label = String(it._attention_reason_label ?? "").trim() || "Needs attention";
        const key = code || `label:${label}`;
        const cur = m.get(key);
        if (cur) cur.count += 1;
        else m.set(key, { reason_key: code, label, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function OpportunityAttentionLaneBlock({
    departmentId,
    runtime,
    workspaceBasePath,
    title = "Needs attention",
    subtitle = "Operational prioritization — drill into the execution queue by reason code.",
}: {
    departmentId: string;
    runtime: WorkspaceRuntimeData;
    workspaceBasePath: string;
    title?: string;
    subtitle?: string;
}) {
    const base = `${workspaceBasePath.replace(/\/$/, "")}/dept/${departmentId}`;
    const wu = (runtime.workUnits ?? []).find((w) => String(w.key ?? "").trim().toLowerCase() === "needs_attention");
    const oq = runtime.opportunityQueues?.needs_attention;
    const href = wu ? `${base}/work-unit/${encodeURIComponent(wu.id)}` : `${base}`;
    const pf = (u: string) => (shouldDisableAdminV2LinkPrefetch(u) ? false : undefined);

    const total = oq?.total ?? 0;
    const groups = oq?.items
        ? groupAttentionReasons(
              oq.items as Array<{ _attention_reason?: string | null; _attention_reason_label?: string | null }>
          )
        : [];

    return (
        <section
            data-workspace-block="opportunity_attention_lane"
            aria-label={title}
            className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel"
        >
            <header className="adminv2-ws-attention-panel-header">
                <div>
                    <div className="adminv2-ws-attention-panel-kicker">Operational lane</div>
                    <h3 className="adminv2-ws-attention-panel-title">{title}</h3>
                    {subtitle ? (
                        <p className="adminv2-ws-attention-card-sub" style={{ marginTop: 6 }}>
                            {subtitle}
                        </p>
                    ) : null}
                </div>
            </header>

            <div className="adminv2-ws-attention-stack">
                <div className="adminv2-ws-attention-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: "10px 12px",
                            alignItems: "start",
                        }}
                    >
                        <div style={{ minWidth: 0 }}>
                            <div className="adminv2-ws-attention-card-title">Needs attention queue</div>
                            <div className="adminv2-ws-attention-card-sub">
                                Same resolver as work-unit execution — counts are reason-level in the preview window.
                            </div>
                        </div>
                        <div className="adminv2-ws-attention-panel-meta">
                            <span className="adminv2-ws-attention-panel-count" aria-label={`${total} records`}>
                                {total}
                            </span>
                            <Link href={href} prefetch={pf(href)} className="adminv2-ws-attention-panel-viewall">
                                Open queue
                            </Link>
                        </div>
                    </div>

                    {groups.length > 0 ? (
                        <ul
                            className="space-y-1 border-l pl-2"
                            style={{
                                listStyle: "none",
                                margin: 0,
                                paddingLeft: 10,
                                borderColor: "color-mix(in srgb, #bc4300 28%, var(--d-border))",
                            }}
                        >
                            {groups.slice(0, 6).map((g) => {
                                const qs =
                                    g.reason_key !== ""
                                        ? `queue=needs_attention&attention_reason_code=${encodeURIComponent(g.reason_key)}`
                                        : `queue=needs_attention&attention_reason=${encodeURIComponent(g.label)}`;
                                const reasonHref = wu ? `${base}/work-unit/${encodeURIComponent(wu.id)}?${qs}` : href;
                                return (
                                    <li key={`${g.reason_key || "nocode"}:${g.label}`} className="text-[11px] truncate">
                                        <Link
                                            href={reasonHref}
                                            prefetch={pf(reasonHref)}
                                            className="text-alloy-midnight/75 hover:text-alloy-blue hover:underline"
                                        >
                                            <span className="font-medium text-alloy-midnight/75">{g.count}</span> · {g.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <p className="text-[11px]" style={{ color: "var(--d-muted)" }}>
                            Nothing needs intervention right now.
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}

