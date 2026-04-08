"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type {
    WorkspaceAttentionBlock,
    WorkspaceAttentionCategoryKey,
    WorkspaceRuntimeData,
} from "@/lib/workspace/types";
import { workspaceDeptQueueHref } from "@/lib/workspace/resolveWorkspaceActionHref";

export function AttentionBlock({
    block,
    runtime,
    departmentId,
    workspaceBasePath,
    presentation = "bridge",
}: {
    block: WorkspaceAttentionBlock;
    runtime: WorkspaceRuntimeData;
    departmentId: string;
    workspaceBasePath: string;
    presentation?: "bridge" | "flat";
}) {
    const [expanded, setExpanded] = useState<Partial<Record<WorkspaceAttentionCategoryKey, boolean>>>({});

    const toggle = useCallback((id: WorkspaceAttentionCategoryKey) => {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    }, []);

    const attention = runtime.attention ?? {};

    const stack = (
        <div className="adminv2-ws-attention-stack">
            {block.categories.map((cat) => {
                const data = attention[cat.id];
                const count = data?.count ?? 0;
                const previews = data?.previews ?? [];
                const isOpen = expanded[cat.id] === true;
                const href = workspaceDeptQueueHref(workspaceBasePath, departmentId, cat.target.deptRoute);

                return (
                    <div
                        key={cat.id}
                        className="adminv2-ws-attention-card"
                        style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8 }}
                    >
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(0, 1fr) auto",
                                gap: "10px 12px",
                                alignItems: "start",
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div className="adminv2-ws-attention-card-title">{cat.label}</div>
                                {cat.description ? (
                                    <div className="adminv2-ws-attention-card-sub">{cat.description}</div>
                                ) : null}
                                {previews.length > 0 ? (
                                    <button
                                        type="button"
                                        className="adminv2-ws-attention-card-flag"
                                        onClick={() => toggle(cat.id)}
                                        aria-expanded={isOpen}
                                    >
                                        {isOpen ? "Hide preview" : `Preview (${previews.length})`}
                                    </button>
                                ) : null}
                            </div>
                            <div className="adminv2-ws-attention-panel-meta">
                                <span className="adminv2-ws-attention-panel-count" aria-label={`${count} jobs`}>
                                    {count}
                                </span>
                                <Link href={href} className="adminv2-ws-attention-panel-viewall">
                                    Open queue
                                </Link>
                            </div>
                        </div>
                        {isOpen && previews.length > 0 ? (
                            <ul
                                className="space-y-1 border-l pl-2"
                                style={{
                                    listStyle: "none",
                                    margin: 0,
                                    paddingLeft: 10,
                                    borderColor: "color-mix(in srgb, #bc4300 28%, var(--d-border))",
                                }}
                            >
                                {previews.map((p) => (
                                    <li key={p.id} className="text-[11px] truncate" style={{ color: "var(--d-muted)" }}>
                                        {p.label}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );

    const header = (
        <header className="adminv2-ws-attention-panel-header">
            <div>
                <div className="adminv2-ws-attention-panel-kicker">Exception lane</div>
                <h3 className="adminv2-ws-attention-panel-title">{block.title ?? "Attention"}</h3>
                {block.subtitle ? (
                    <p className="adminv2-ws-attention-card-sub" style={{ marginTop: 6 }}>
                        {block.subtitle}
                    </p>
                ) : null}
            </div>
        </header>
    );

    if (presentation === "flat") {
        return (
            <section className="rounded-xl border border-admin-border bg-white p-5 shadow-sm" data-workspace-block="attention">
                <h2 className="text-sm font-semibold text-alloy-midnight">{block.title ?? "Attention"}</h2>
                {block.subtitle ? <p className="text-xs text-alloy-midnight/60 mt-1">{block.subtitle}</p> : null}
                <div className="mt-4 space-y-2">
                    {block.categories.map((cat) => {
                        const data = attention[cat.id];
                        const count = data?.count ?? 0;
                        const href = workspaceDeptQueueHref(workspaceBasePath, departmentId, cat.target.deptRoute);
                        return (
                            <div
                                key={cat.id}
                                className="flex items-center justify-between gap-2 text-sm border border-admin-border rounded-lg px-3 py-2"
                            >
                                <span className="text-alloy-forge">{cat.label}</span>
                                <span className="tabular-nums font-medium">{count}</span>
                                <Link href={href} className="text-alloy-blue text-xs font-medium hover:underline shrink-0">
                                    Open
                                </Link>
                            </div>
                        );
                    })}
                </div>
            </section>
        );
    }

    return (
        <section data-workspace-block="attention" aria-label={block.title ?? "Exceptions and attention"}>
            {header}
            {stack}
        </section>
    );
}
