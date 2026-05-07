"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { NeedsAttentionBucketConfig } from "@/lib/opportunities/needsAttentionBuckets";
import {
    attentionRulesRootFromMetadata,
    resolveNeedsAttentionBucketsWithPrecedence,
} from "@/lib/opportunities/needsAttentionBuckets";
import {
    ATTENTION_REASON_CRITERIA_CATALOG,
    criteriaValueSourceLabel,
    departmentExplicitlySetsStaleHighValueDays,
    departmentExplicitlySetsStaleMidFunnelDays,
    departmentExplicitlySetsThresholdHour,
    departmentExplicitlySetsSlaWaitBucket,
    departmentExplicitlySetsPriorityWeights,
    departmentExplicitlySetsAuxiliarySignals,
} from "@/lib/opportunities/attentionReasonCriteriaCatalog";
import { CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED } from "@/lib/opportunities/attentionPlatformCatalog";
import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import type { OpportunityAttentionReason } from "@/lib/workspace/opportunityAttentionRules";
import { DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1 } from "@/lib/workspace/opportunityAttentionRules";
import {
    createDefaultOpportunityAttentionResolvedConfig,
    resolveOpportunityAttentionConfigFromMetadata,
} from "@/lib/opportunities/opportunityAttentionConfig";
import { effectiveWaitBucketSlaThresholds } from "@/lib/opportunities/attentionSla";
import {
    DEFAULT_ATTENTION_PRIORITY_SCORE_WEIGHTS,
    type PriorityScoreDimension,
} from "@/lib/opportunities/attentionPriorityScore";

type DeptListRow = { id: string; name: string | null; key: string | null };

const THRESHOLD_HOUR_KEYS = [
    "stale_new_inquiry",
    "stale_qualified",
    "missing_quote_after_execution",
    "stale_quote_followup",
] as const satisfies readonly OpportunityAttentionReason[];

const SLA_BUCKET_KEYS = [
    "waiting_on_staff",
    "blocked_internal",
    "waiting_on_family",
    "waiting_on_documents",
    "waiting_on_payment",
    "blocked_external",
] as const;

const PRIORITY_DIMS: PriorityScoreDimension[] = ["severity", "sla", "value", "multi_reason", "commitment"];

function cloneBuckets(rows: NeedsAttentionBucketConfig[]): NeedsAttentionBucketConfig[] {
    return rows.map((b) => ({
        ...b,
        reason_codes: [...b.reason_codes],
    }));
}

function SourceBadge({ explicit }: { explicit: boolean }) {
    const label = criteriaValueSourceLabel(explicit);
    return (
        <span
            className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                explicit ? "bg-alloy-honey/25 text-alloy-forge/90" : "bg-alloy-stone/15 text-alloy-midnight/55"
            }`}
        >
            {label}
        </span>
    );
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

    const [thresholdsDraft, setThresholdsDraft] = useState<Record<(typeof THRESHOLD_HOUR_KEYS)[number], number>>(() => ({
        ...DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1.thresholdsHours,
    }));
    const [staleHighValueDays, setStaleHighValueDays] = useState(2);
    const [staleMidFunnelDays, setStaleMidFunnelDays] = useState(7);
    const [slaDraft, setSlaDraft] = useState<
        Record<(typeof SLA_BUCKET_KEYS)[number], { warning_hours: number; critical_hours: number }>
    >(() => {
        const plat = createDefaultOpportunityAttentionResolvedConfig();
        const o = {} as Record<(typeof SLA_BUCKET_KEYS)[number], { warning_hours: number; critical_hours: number }>;
        for (const b of SLA_BUCKET_KEYS) o[b] = effectiveWaitBucketSlaThresholds(b, plat);
        return o;
    });
    const [reasonEnabled, setReasonEnabled] = useState<Record<OpportunityAttentionReasonCode, boolean>>(() =>
        Object.fromEntries(CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED.map((c) => [c, true])) as Record<
            OpportunityAttentionReasonCode,
            boolean
        >
    );
    const [priorityDraft, setPriorityDraft] = useState<Record<PriorityScoreDimension, number>>(() => ({
        ...DEFAULT_ATTENTION_PRIORITY_SCORE_WEIGHTS,
    }));
    const [auxiliarySignals, setAuxiliarySignals] = useState(false);

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
                    setBucketsDraft(cloneBuckets(resolveNeedsAttentionBucketsWithPrecedence(null, meta)));

                    const eff = resolveOpportunityAttentionConfigFromMetadata(meta);
                    setThresholdsDraft({
                        stale_new_inquiry: eff.thresholdsHours.stale_new_inquiry,
                        stale_qualified: eff.thresholdsHours.stale_qualified,
                        missing_quote_after_execution: eff.thresholdsHours.missing_quote_after_execution,
                        stale_quote_followup: eff.thresholdsHours.stale_quote_followup,
                    });
                    setStaleHighValueDays(eff.highValueStaleDays);
                    setStaleMidFunnelDays(eff.midFunnelStaleDays);
                    const sla: Record<(typeof SLA_BUCKET_KEYS)[number], { warning_hours: number; critical_hours: number }> =
                        {} as Record<(typeof SLA_BUCKET_KEYS)[number], { warning_hours: number; critical_hours: number }>;
                    for (const b of SLA_BUCKET_KEYS) sla[b] = effectiveWaitBucketSlaThresholds(b, eff);
                    setSlaDraft(sla);
                    setReasonEnabled(
                        Object.fromEntries(
                            CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED.map((c) => [
                                c,
                                eff.policies[c]?.enabled !== false,
                            ])
                        ) as Record<OpportunityAttentionReasonCode, boolean>
                    );
                    setPriorityDraft({
                        severity: eff.priority_score_weights?.severity ?? DEFAULT_ATTENTION_PRIORITY_SCORE_WEIGHTS.severity,
                        sla: eff.priority_score_weights?.sla ?? DEFAULT_ATTENTION_PRIORITY_SCORE_WEIGHTS.sla,
                        value: eff.priority_score_weights?.value ?? DEFAULT_ATTENTION_PRIORITY_SCORE_WEIGHTS.value,
                        multi_reason:
                            eff.priority_score_weights?.multi_reason ??
                            DEFAULT_ATTENTION_PRIORITY_SCORE_WEIGHTS.multi_reason,
                        commitment:
                            eff.priority_score_weights?.commitment ?? DEFAULT_ATTENTION_PRIORITY_SCORE_WEIGHTS.commitment,
                    });
                    setAuxiliarySignals(eff.auxiliary_signals_enabled);
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

    const platCfg = useMemo(() => createDefaultOpportunityAttentionResolvedConfig(), []);

    const persist = useCallback(async () => {
        if (!departmentId || !deptMetadata) return;
        setSaving(true);
        setError(null);
        setSavedNote(null);
        try {
            const prevRules = attentionRulesRootFromMetadata(deptMetadata) ?? {};

            const thresholdsHoursObj = {
                ...DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1.thresholdsHours,
                ...thresholdsDraft,
            };

            const sla_wait_hours: Record<string, { warning_hours: number; critical_hours: number }> = {};
            for (const b of SLA_BUCKET_KEYS) {
                const plat = effectiveWaitBucketSlaThresholds(b, platCfg);
                const cur = slaDraft[b];
                if (cur.warning_hours !== plat.warning_hours || cur.critical_hours !== plat.critical_hours) {
                    sla_wait_hours[b] = {
                        warning_hours: Math.max(0, Math.floor(cur.warning_hours)),
                        critical_hours: Math.max(0, Math.floor(cur.critical_hours)),
                    };
                }
            }

            const pwPartial: Partial<Record<PriorityScoreDimension, number>> = {};
            for (const d of PRIORITY_DIMS) {
                if (Math.abs(priorityDraft[d] - DEFAULT_ATTENTION_PRIORITY_SCORE_WEIGHTS[d]) > 1e-6) {
                    pwPartial[d] = priorityDraft[d];
                }
            }

            const prevRoRaw = prevRules.reason_overrides;
            const prevRo =
                prevRoRaw != null && typeof prevRoRaw === "object" && !Array.isArray(prevRoRaw)
                    ? ({ ...(prevRoRaw as Record<string, unknown>) } as Record<string, Record<string, unknown>>)
                    : ({} as Record<string, Record<string, unknown>>);

            for (const code of CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED) {
                const want = reasonEnabled[code];
                const prev = prevRo[code];
                if (!want) {
                    prevRo[code] = {
                        ...(prev && typeof prev === "object" ? prev : {}),
                        enabled: false,
                    };
                } else if (prev && typeof prev === "object" && prev.enabled === false) {
                    const next = { ...prev };
                    delete next.enabled;
                    if (Object.keys(next).length) prevRo[code] = next;
                    else delete prevRo[code];
                }
            }

            const nextRules: Record<string, unknown> = {
                ...prevRules,
                version: 1,
                thresholdsHours: thresholdsHoursObj,
                stale_high_value_days: Math.max(1, Math.floor(staleHighValueDays)),
                stale_mid_funnel_days: Math.max(1, Math.floor(staleMidFunnelDays)),
                needs_attention_buckets: bucketsDraft.map((b) => ({
                    key: b.key.trim(),
                    label: b.label.trim(),
                    description: b.description,
                    enabled: b.enabled,
                    order: b.order,
                    reason_codes: [...b.reason_codes],
                })),
                auxiliary_signals_enabled: auxiliarySignals,
                reason_overrides: prevRo,
            };

            if (Object.keys(sla_wait_hours).length) nextRules.sla_wait_hours = sla_wait_hours;
            else delete nextRules.sla_wait_hours;

            if (Object.keys(pwPartial).length) nextRules.priority_score_weights = pwPartial;
            else delete nextRules.priority_score_weights;

            const nextMeta: Record<string, unknown> = {
                ...deptMetadata,
                opportunity_attention_rules: nextRules,
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
            setSavedNote("Saved department attention rules (types, thresholds, and policies).");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [
        departmentId,
        deptMetadata,
        bucketsDraft,
        thresholdsDraft,
        staleHighValueDays,
        staleMidFunnelDays,
        slaDraft,
        reasonEnabled,
        priorityDraft,
        auxiliarySignals,
        platCfg,
    ]);

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

    const catalogSorted = useMemo(
        () =>
            [...CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED].sort((a, b) =>
                ATTENTION_REASON_CRITERIA_CATALOG[a].title.localeCompare(ATTENTION_REASON_CRITERIA_CATALOG[b].title)
            ),
        []
    );

    return (
        <div className="w-full max-w-4xl space-y-6">
            <div>
                <h1 className="text-lg font-semibold text-alloy-midnight">Attention &amp; SLA Rules</h1>
                <p className="mt-1 text-sm text-alloy-midnight/70">
                    Configure <span className="font-medium text-alloy-midnight/85">department</span> buckets, thresholds, and SLA.
                    Work-unit metadata still overrides at runtime.
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
                <div className="text-sm text-alloy-midnight/60">Loading configuration…</div>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={saving || !departmentId}
                            onClick={() => void persist()}
                            className="rounded-lg border border-alloy-blue bg-alloy-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-alloy-blue/90 disabled:opacity-50"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>

                    {/* 1. Needs Attention Types */}
                    <section className="space-y-3 rounded-xl border border-admin-border bg-white/95 p-4 shadow-sm">
                        <h2 className="text-base font-semibold text-alloy-midnight">1. Needs Attention types</h2>
                        <p className="text-sm text-alloy-midnight/70">
                            Labels, order, and reason membership only — resolver math is unchanged.
                        </p>
                        <button
                            type="button"
                            onClick={addBucket}
                            className="rounded-lg border border-admin-border bg-white px-3 py-1.5 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/10"
                        >
                            Add bucket
                        </button>

                        {bucketsDraft.map((b, idx) => (
                            <div key={`${b.key}-${idx}`} className="rounded-lg border border-alloy-stone/20 bg-white p-4">
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="min-w-[8rem] flex-1">
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                            Key
                                        </div>
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
                                                setBucketsDraft((prev) =>
                                                    prev.map((x, i) => (i === idx ? { ...x, enabled: v } : x))
                                                );
                                            }}
                                        />
                                        Enabled
                                    </label>
                                    <div className="w-24">
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                            Order
                                        </div>
                                        <input
                                            type="number"
                                            value={b.order}
                                            onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setBucketsDraft((prev) =>
                                                    prev.map((x, i) =>
                                                        i === idx ? { ...x, order: Number.isFinite(v) ? v : x.order } : x
                                                    )
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
                                        <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                            Label
                                        </div>
                                        <input
                                            value={b.label}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setBucketsDraft((prev) =>
                                                    prev.map((x, i) => (i === idx ? { ...x, label: v } : x))
                                                );
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
                                                setBucketsDraft((prev) =>
                                                    prev.map((x, i) => (i === idx ? { ...x, description: v } : x))
                                                );
                                            }}
                                            className="mt-1 w-full rounded-lg border border-admin-border px-2 py-1.5 text-[13px]"
                                        />
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                        Reason codes in this bucket
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                                        Toggle membership; expand a code for detail. Thresholds are in section 2.
                                    </p>
                                    <div className="mt-2 max-h-56 space-y-1 overflow-auto rounded-lg border border-admin-border bg-alloy-stone/[0.04] p-2">
                                        {CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED.map((code) => {
                                            const on = b.reason_codes.includes(code);
                                            const cat = ATTENTION_REASON_CRITERIA_CATALOG[code];
                                            return (
                                                <details key={code} className="rounded-md border border-alloy-stone/15 bg-white/80 px-2 py-1">
                                                    <summary className="cursor-pointer select-none text-[12px] font-medium text-alloy-midnight/90 [&::-webkit-details-marker]:hidden">
                                                        <div className="flex items-start gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={on}
                                                                className="mt-0.5"
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={() => {
                                                                    setBucketsDraft((prev) =>
                                                                        prev.map((x, i) => {
                                                                            if (i !== idx) return x;
                                                                            const next = new Set(x.reason_codes);
                                                                            if (next.has(code)) next.delete(code);
                                                                            else next.add(code);
                                                                            return {
                                                                                ...x,
                                                                                reason_codes: [...next].sort((a, b) =>
                                                                                    a.localeCompare(b)
                                                                                ),
                                                                            };
                                                                        })
                                                                    );
                                                                }}
                                                            />
                                                            <span>
                                                                {cat.title}{" "}
                                                                <span className="font-mono text-[10px] font-normal text-alloy-midnight/45">
                                                                    {code}
                                                                </span>
                                                            </span>
                                                        </div>
                                                    </summary>
                                                    <div className="mt-2 space-y-1 border-t border-alloy-stone/10 pt-2 text-[11px] leading-snug text-alloy-midnight/72">
                                                        <p>
                                                            <span className="font-semibold text-alloy-midnight/80">Meaning · </span>
                                                            {cat.meaning}
                                                        </p>
                                                        <p>
                                                            <span className="font-semibold text-alloy-midnight/80">Config source · </span>
                                                            {cat.configSource}
                                                        </p>
                                                        {cat.platformNote ? (
                                                            <p className="text-alloy-midnight/65">
                                                                <span className="font-semibold">Platform note · </span>
                                                                {cat.platformNote}
                                                            </p>
                                                        ) : null}
                                                        {cat.metadataKeys.length ? (
                                                            <p className="font-mono text-[10px] text-alloy-midnight/50">
                                                                Keys: {cat.metadataKeys.join(", ")}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </details>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </section>

                    {/* 2. Trigger criteria */}
                    <section className="space-y-4 rounded-xl border border-admin-border bg-white/95 p-4 shadow-sm">
                        <h2 className="text-base font-semibold text-alloy-midnight">2. Trigger criteria &amp; thresholds</h2>
                        <p className="text-sm text-alloy-midnight/70">
                            Effective values for this department (merged with platform defaults). Persists as{" "}
                            <code className="rounded bg-alloy-stone/12 px-1 text-[11px]">opportunity_attention_rules</code>.
                        </p>

                        <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.06] p-3">
                            <h3 className="text-sm font-semibold text-alloy-midnight">Lifecycle idle thresholds (hours)</h3>
                            <p className="mt-1 text-[11px] text-alloy-midnight/60">
                                Idle time by lifecycle stage before time-based attention reasons apply.
                            </p>
                            <details className="mt-2 rounded-md border border-alloy-stone/15 bg-white/45 px-2 py-1.5">
                                <summary className="cursor-pointer select-none text-[11px] font-medium text-alloy-midnight/55 [&::-webkit-details-marker]:hidden">
                                    Resolver detail
                                </summary>
                                <p className="mt-2 text-[11px] leading-relaxed text-alloy-midnight/58">
                                    Parsed when <code className="font-mono">opportunity_attention_rules.version === 1</code>. Uses{" "}
                                    <code className="font-mono">updated_at</code> / <code className="font-mono">created_at</code> as the idle
                                    clock per lifecycle stage (see resolver +{" "}
                                    <code className="font-mono">computeOpportunityAttentionReason</code>).
                                </p>
                            </details>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {THRESHOLD_HOUR_KEYS.map((key) => (
                                    <label key={key} className="block text-[12px]">
                                        <span className="flex items-center font-medium text-alloy-midnight/85">
                                            {ATTENTION_REASON_CRITERIA_CATALOG[key].title}
                                            <SourceBadge explicit={departmentExplicitlySetsThresholdHour(deptMetadata, key)} />
                                        </span>
                                        <input
                                            type="number"
                                            min={1}
                                            value={thresholdsDraft[key]}
                                            onChange={(e) => {
                                                const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                                                setThresholdsDraft((prev) => ({ ...prev, [key]: v }));
                                            }}
                                            className="mt-1 w-full rounded-lg border border-admin-border px-2 py-1.5 font-mono text-[13px]"
                                        />
                                        <span className="mt-0.5 block font-mono text-[10px] text-alloy-midnight/45">
                                            thresholdsHours.{key}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.06] p-3">
                            <h3 className="text-sm font-semibold text-alloy-midnight">Pipeline stale windows (calendar days)</h3>
                            <p className="mt-1 text-[11px] text-alloy-midnight/60">
                                How long certain pipeline statuses may age before stale attention applies.
                            </p>
                            <details className="mt-2 rounded-md border border-alloy-stone/15 bg-white/45 px-2 py-1.5">
                                <summary className="cursor-pointer select-none text-[11px] font-medium text-alloy-midnight/55 [&::-webkit-details-marker]:hidden">
                                    Resolver detail
                                </summary>
                                <p className="mt-2 text-[11px] leading-relaxed text-alloy-midnight/58">
                                    Compared against <code className="font-mono">updated_at</code> for fixed status groups in the resolver
                                    (high-value vs mid-funnel sets are platform-defined).
                                </p>
                            </details>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <label className="block text-[12px]">
                                    <span className="flex items-center font-medium text-alloy-midnight/85">
                                        High-value funnel stale
                                        <SourceBadge explicit={departmentExplicitlySetsStaleHighValueDays(deptMetadata)} />
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={staleHighValueDays}
                                        onChange={(e) => setStaleHighValueDays(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                                        className="mt-1 w-full rounded-lg border border-admin-border px-2 py-1.5 font-mono text-[13px]"
                                    />
                                    <span className="mt-0.5 block font-mono text-[10px] text-alloy-midnight/45">stale_high_value_days</span>
                                </label>
                                <label className="block text-[12px]">
                                    <span className="flex items-center font-medium text-alloy-midnight/85">
                                        Mid-funnel stale
                                        <SourceBadge explicit={departmentExplicitlySetsStaleMidFunnelDays(deptMetadata)} />
                                    </span>
                                    <input
                                        type="number"
                                        min={1}
                                        value={staleMidFunnelDays}
                                        onChange={(e) => setStaleMidFunnelDays(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                                        className="mt-1 w-full rounded-lg border border-admin-border px-2 py-1.5 font-mono text-[13px]"
                                    />
                                    <span className="mt-0.5 block font-mono text-[10px] text-alloy-midnight/45">stale_mid_funnel_days</span>
                                </label>
                            </div>
                        </div>

                        <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.06] p-3">
                            <h3 className="text-sm font-semibold text-alloy-midnight">Wait-bucket SLA hours</h3>
                            <p className="mt-1 text-[11px] text-alloy-midnight/60">
                                SLA escalation when the record&apos;s wait bucket is set (overrides platform defaults per bucket).
                            </p>
                            <div className="mt-3 space-y-3">
                                {SLA_BUCKET_KEYS.map((bk) => (
                                    <div key={bk} className="rounded-md border border-white/60 bg-white/70 p-2">
                                        <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold capitalize text-alloy-midnight/85">
                                            {bk.replace(/_/g, " ")}
                                            <SourceBadge explicit={departmentExplicitlySetsSlaWaitBucket(deptMetadata, bk)} />
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-3">
                                            <label className="text-[11px]">
                                                Warning (h)
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={slaDraft[bk].warning_hours}
                                                    onChange={(e) => {
                                                        const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                                        setSlaDraft((prev) => ({ ...prev, [bk]: { ...prev[bk], warning_hours: v } }));
                                                    }}
                                                    className="ml-1 w-20 rounded border border-admin-border px-1 py-0.5 font-mono"
                                                />
                                            </label>
                                            <label className="text-[11px]">
                                                Critical (h)
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={slaDraft[bk].critical_hours}
                                                    onChange={(e) => {
                                                        const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                                        setSlaDraft((prev) => ({ ...prev, [bk]: { ...prev[bk], critical_hours: v } }));
                                                    }}
                                                    className="ml-1 w-20 rounded border border-admin-border px-1 py-0.5 font-mono"
                                                />
                                            </label>
                                        </div>
                                        <p className="mt-1 font-mono text-[10px] text-alloy-midnight/45">sla_wait_hours.{bk}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <details className="rounded-lg border border-alloy-stone/22 bg-alloy-stone/[0.05] p-3">
                            <summary className="cursor-pointer select-none text-sm font-semibold text-alloy-midnight/88 [&::-webkit-details-marker]:hidden">
                                Advanced — priority weights, auxiliary signals, policies, reference
                            </summary>
                            <div className="mt-4 space-y-4">
                        <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.06] p-3">
                            <h3 className="text-sm font-semibold text-alloy-midnight">Priority score weights</h3>
                            <p className="mt-1 text-[11px] text-alloy-midnight/60">
                                Optional <code className="font-mono">priority_score</code> tuning (positive values; resolver normalizes).
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                                <span className="font-medium">Source</span>
                                <SourceBadge explicit={departmentExplicitlySetsPriorityWeights(deptMetadata)} />
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {PRIORITY_DIMS.map((d) => (
                                    <label key={d} className="text-[11px] capitalize">
                                        {d.replace(/_/g, " ")}
                                        <input
                                            type="number"
                                            step={0.05}
                                            min={0.05}
                                            max={1}
                                            value={priorityDraft[d]}
                                            onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setPriorityDraft((prev) => ({
                                                    ...prev,
                                                    [d]: Number.isFinite(v) ? Math.min(1, Math.max(0.05, v)) : prev[d],
                                                }));
                                            }}
                                            className="mt-0.5 w-full rounded-lg border border-admin-border px-2 py-1 font-mono text-[13px]"
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>

                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-alloy-stone/20 bg-white/80 p-3 text-[13px]">
                            <input
                                type="checkbox"
                                checked={auxiliarySignals}
                                onChange={(e) => setAuxiliarySignals(e.target.checked)}
                                className="mt-0.5"
                            />
                            <span>
                                <span className="font-semibold text-alloy-midnight/90">Auxiliary activity signals</span>
                                <SourceBadge explicit={departmentExplicitlySetsAuxiliarySignals(deptMetadata)} />
                                <span className="mt-1 block text-[11px] text-alloy-midnight/60">
                                    Surfaces activity-stale payloads when enabled.{" "}
                                    <code className="font-mono">auxiliary_signals_enabled</code>
                                </span>
                            </span>
                        </label>

                        <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.06] p-3">
                            <h3 className="text-sm font-semibold text-alloy-midnight">Reason code policies (enable / disable)</h3>
                            <p className="mt-1 text-[11px] text-alloy-midnight/60">
                                Filter reasons after evaluation (<code className="font-mono">reason_overrides.&lt;code&gt;.enabled</code>).
                            </p>
                            <div className="mt-2 grid max-h-64 gap-1 overflow-auto sm:grid-cols-2">
                                {CANONICAL_OPPORTUNITY_ATTENTION_REASON_CODES_SORTED.map((code) => (
                                    <label key={code} className="flex items-center gap-2 text-[11px]">
                                        <input
                                            type="checkbox"
                                            checked={reasonEnabled[code]}
                                            onChange={(e) =>
                                                setReasonEnabled((prev) => ({ ...prev, [code]: e.target.checked }))
                                            }
                                        />
                                        <span className="truncate" title={code}>
                                            {ATTENTION_REASON_CRITERIA_CATALOG[code].title}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <details className="rounded-lg border border-admin-border bg-white p-3">
                            <summary className="cursor-pointer select-none text-sm font-semibold text-alloy-midnight [&::-webkit-details-marker]:hidden">
                                Canonical reason reference (full list)
                            </summary>
                            <div className="mt-3 max-h-72 space-y-2 overflow-auto text-[12px]">
                                {catalogSorted.map((code) => {
                                    const c = ATTENTION_REASON_CRITERIA_CATALOG[code];
                                    return (
                                        <div key={code} className="rounded-md border border-alloy-stone/12 bg-alloy-stone/[0.04] p-2">
                                            <div className="font-semibold text-alloy-midnight/90">
                                                {c.title}{" "}
                                                <span className="font-mono text-[10px] font-normal text-alloy-midnight/45">{code}</span>
                                            </div>
                                            <p className="mt-1 text-[11px] text-alloy-midnight/72">{c.meaning}</p>
                                            <p className="mt-1 text-[11px] text-alloy-midnight/65">
                                                <span className="font-medium text-alloy-midnight/75">Source · </span>
                                                {c.configSource}
                                            </p>
                                            {c.platformNote ? (
                                                <p className="mt-1 text-[11px] text-alloy-midnight/60">
                                                    <span className="font-medium">Read-only / platform · </span>
                                                    {c.platformNote}
                                                </p>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </details>
                            </div>
                        </details>
                    </section>
                </>
            )}
        </div>
    );
}
