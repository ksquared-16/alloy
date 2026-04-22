"use client";

import Link from "next/link";
import type { WorkspaceRuntimeData } from "@/lib/workspace/types";

function groupAttentionReasons(items: Array<{ _attention_reason_label?: string | null }>) {
    const m = new Map<string, number>();
    for (const it of items) {
        const label = String(it._attention_reason_label ?? "").trim() || "Needs attention";
        m.set(label, (m.get(label) ?? 0) + 1);
    }
    return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count }));
}

export function OpportunityAttentionLaneBlock({
    departmentId,
    runtime,
    workspaceBasePath,
    title = "Needs attention",
    subtitle = "Interventions needed right now, grouped by reason.",
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

    const total = oq?.total ?? 0;
    const groups = oq?.items ? groupAttentionReasons(oq.items as Array<{ _attention_reason_label?: string | null }>) : [];

    return (
        <section data-workspace-block="opportunity_attention_lane" aria-label={title}>
            <header className="adminv2-ws-attention-panel-header">
                <div>
                    <div className="adminv2-ws-attention-panel-kicker">Exception lane</div>
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
                            <div className="adminv2-ws-attention-card-title">Needs attention</div>
                            <div className="adminv2-ws-attention-card-sub">Stale or blocked inquiries requiring a next step.</div>
                        </div>
                        <div className="adminv2-ws-attention-panel-meta">
                            <span className="adminv2-ws-attention-panel-count" aria-label={`${total} records`}>
                                {total}
                            </span>
                            <Link href={href} className="adminv2-ws-attention-panel-viewall">
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
                            {groups.slice(0, 6).map((g) => (
                                <li key={g.label} className="text-[11px] truncate" style={{ color: "var(--d-muted)" }}>
                                    <span className="font-medium text-alloy-midnight/75">{g.count}</span> · {g.label}
                                </li>
                            ))}
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

