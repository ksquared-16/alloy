"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { NeedsAttentionBucketConfig } from "@/lib/opportunities/needsAttentionBuckets";
import {
    attentionRulesRootFromMetadata,
    resolveNeedsAttentionBucketsWithPrecedence,
} from "@/lib/opportunities/needsAttentionBuckets";
import { CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED } from "@/lib/opportunities/attentionPlatformCatalog";

type DeptListRow = { id: string; name: string | null; key: string | null };

function cloneBuckets(rows: NeedsAttentionBucketConfig[]): NeedsAttentionBucketConfig[] {
    return rows.map((b) => ({
        ...b,
        reason_codes: [...b.reason_codes],
    }));
}

export default function AdminV2SettingsAttentionSlaRulesPage() {
    const [departments, setDepartments] = useState<DeptListRow[]>([]);
    const [departmentId, setDepartmentId] = useState<string>("");
    const [loadingList, setLoadingList] = useState(true);
    const [loadingDept, setLoadingDept] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedNote, setSavedNote] = useState<string | null>(null);
    const [deptMetadata, setDeptMetadata] = useState<Record<string, unknown> | null>(null);
    const [bucketsDraft, setBucketsDraft] = useState<NeedsAttentionBucketConfig[]>([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingList(true);
            setError(null);
            try {
                const res = await fetch("/api/admin/departments", workspaceDataFetchInit());
                const j = (await res.json().catch(() => ({}))) as { items?: DeptListRow[]; error?: string };
                if (!res.ok) throw new Error(j.error ?? "Failed to load departments");
                const items = j.items ?? [];
                if (!cancelled) {
                    setDepartments(items);
                    setDepartmentId((prev) => prev || items[0]?.id || "");
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load departments");
            } finally {
                if (!cancelled) setLoadingList(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!departmentId) return;
        let cancelled = false;
        (async () => {
            setLoadingDept(true);
            setError(null);
            setSavedNote(null);
            try {
                const res = await fetch(
                    `/api/admin/departments/${encodeURIComponent(departmentId)}`,
                    workspaceDataFetchInit()
                );
                const row = (await res.json().catch(() => ({}))) as {
                    error?: string;
                    metadata?: unknown;
                };
                if (!res.ok) throw new Error(row.error ?? "Failed to load department");
                const meta =
                    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                        ? (row.metadata as Record<string, unknown>)
                        : {};
                if (!cancelled) {
                    setDeptMetadata(meta);
                    const merged = resolveNeedsAttentionBucketsWithPrecedence(null, meta);
                    setBucketsDraft(cloneBuckets(merged));
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load department");
            } finally {
                if (!cancelled) setLoadingDept(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId]);

    const reasonLabelMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const c of CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED) m.set(c, c.replace(/_/g, " "));
        return m;
    }, []);

    const persist = useCallback(async () => {
        if (!departmentId || !deptMetadata) return;
        setSaving(true);
        setError(null);
        setSavedNote(null);
        try {
            const prevRules = attentionRulesRootFromMetadata(deptMetadata) ?? {};
            const nextMeta: Record<string, unknown> = {
                ...deptMetadata,
                opportunity_attention_rules: {
                    ...prevRules,
                    needs_attention_buckets: bucketsDraft.map((b) => ({
                        key: b.key.trim(),
                        label: b.label.trim(),
                        description: b.description,
                        enabled: b.enabled,
                        order: b.order,
                        reason_codes: [...b.reason_codes],
                    })),
                },
            };
            const res = await fetch(`/api/admin/departments/${encodeURIComponent(departmentId)}`, {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ metadata: nextMeta }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string; metadata?: unknown };
            if (!res.ok) throw new Error(j.error ?? "Save failed");
            setDeptMetadata(
                j.metadata && typeof j.metadata === "object" && !Array.isArray(j.metadata)
                    ? (j.metadata as Record<string, unknown>)
                    : nextMeta
            );
            setSavedNote("Saved department Needs attention buckets.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [departmentId, deptMetadata, bucketsDraft]);

    const addBucket = useCallback(() => {
        setBucketsDraft((prev) => [
            ...prev,
            {
                key: `custom_${Date.now().toString(36)}`,
                label: "New bucket",
                description: null,
                enabled: true,
                order: (prev.reduce((m, b) => Math.max(m, b.order), 0) || 0) + 10,
                reason_codes: [],
            },
        ]);
    }, []);

    return (
        <div className="w-full max-w-4xl space-y-4">
            <div>
                <h1 className="text-lg font-semibold text-alloy-midnight">Attention &amp; SLA Rules</h1>
                <p className="mt-1 text-sm text-alloy-midnight/70">
                    Configure <span className="font-medium">Needs attention</span> bucket definitions for a department.
                    Values persist under{" "}
                    <code className="rounded bg-alloy-stone/15 px-1 py-0.5 text-[11px]">
                        metadata.opportunity_attention_rules.needs_attention_buckets
                    </code>
                    . Work-unit overrides use the same path on the work unit and take precedence (documented next step).
                </p>
            </div>

            {error ? (
                <div className="rounded-lg border border-alloy-ember/40 bg-alloy-ember/10 px-3 py-2 text-sm text-alloy-ember">{error}</div>
            ) : null}
            {savedNote ? (
                <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-sm text-alloy-midnight/80">
                    {savedNote}
                </div>
            ) : null}

            <div className="rounded-xl border border-admin-border bg-white/90 p-4 shadow-sm">
                <label className="block text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">Department</label>
                <select
                    value={departmentId}
                    disabled={loadingList || !departments.length}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="mt-1 w-full max-w-md rounded-lg border border-admin-border px-2 py-2 text-sm"
                >
                    {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                            {d.name ?? d.key ?? d.id}
                        </option>
                    ))}
                </select>
            </div>

            {loadingDept ? (
                <div className="text-sm text-alloy-midnight/60">Loading bucket configuration…</div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={addBucket}
                            className="rounded-lg border border-admin-border bg-white px-3 py-1.5 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/10"
                        >
                            Add bucket
                        </button>
                        <button
                            type="button"
                            disabled={saving || !departmentId}
                            onClick={() => void persist()}
                            className="rounded-lg border border-alloy-blue bg-alloy-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-alloy-blue/90 disabled:opacity-50"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>

                    {bucketsDraft.map((b, idx) => (
                        <div key={`${b.key}-${idx}`} className="rounded-xl border border-admin-border bg-white/95 p-4 shadow-sm">
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="min-w-[8rem] flex-1">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Key</div>
                                    <input
                                        value={b.key}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setBucketsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, key: v } : x)));
                                        }}
                                        className="mt-1 w-full rounded-lg border border-admin-border px-2 py-1.5 font-mono text-[13px]"
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={b.enabled}
                                        onChange={(e) => {
                                            const v = e.target.checked;
                                            setBucketsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: v } : x)));
                                        }}
                                    />
                                    Enabled
                                </label>
                                <div className="w-24">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Order</div>
                                    <input
                                        type="number"
                                        value={b.order}
                                        onChange={(e) => {
                                            const v = Number(e.target.value);
                                            setBucketsDraft((prev) =>
                                                prev.map((x, i) => (i === idx ? { ...x, order: Number.isFinite(v) ? v : x.order } : x))
                                            );
                                        }}
                                        className="mt-1 w-full rounded-lg border border-admin-border px-2 py-1.5 text-[13px]"
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="ml-auto text-xs font-medium text-alloy-ember hover:underline"
                                    onClick={() => setBucketsDraft((prev) => prev.filter((_, i) => i !== idx))}
                                >
                                    Remove
                                </button>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Label</div>
                                    <input
                                        value={b.label}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setBucketsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, label: v } : x)));
                                        }}
                                        className="mt-1 w-full rounded-lg border border-admin-border px-2 py-1.5 text-[13px]"
                                    />
                                </div>
                                <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                        Description
                                    </div>
                                    <input
                                        value={b.description ?? ""}
                                        onChange={(e) => {
                                            const v = e.target.value.trim() ? e.target.value : null;
                                            setBucketsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                                        }}
                                        className="mt-1 w-full rounded-lg border border-admin-border px-2 py-1.5 text-[13px]"
                                    />
                                </div>
                            </div>
                            <div className="mt-3">
                                <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                    Reason codes (canonical)
                                </div>
                                <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-admin-border bg-alloy-stone/[0.04] p-2">
                                    <div className="grid gap-1 sm:grid-cols-2">
                                        {CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED.map((code) => {
                                            const on = b.reason_codes.includes(code);
                                            return (
                                                <label key={code} className="flex cursor-pointer items-center gap-2 text-[12px]">
                                                    <input
                                                        type="checkbox"
                                                        checked={on}
                                                        onChange={() => {
                                                            setBucketsDraft((prev) =>
                                                                prev.map((x, i) => {
                                                                    if (i !== idx) return x;
                                                                    const next = new Set(x.reason_codes);
                                                                    if (next.has(code)) next.delete(code);
                                                                    else next.add(code);
                                                                    return { ...x, reason_codes: [...next].sort((a, b) => a.localeCompare(b)) };
                                                                })
                                                            );
                                                        }}
                                                    />
                                                    <span title={code}>{reasonLabelMap.get(code) ?? code}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
