"use client";

/**
 * Layout V2 Proof Harness — /adminV2/layout-proof
 *
 * Proves the adoption path end-to-end, WITHOUT any production cutover:
 *   1. Lists real opportunity records in the Lead Management lifecycle,
 *      filtered to the Qualification stage (status_key = "qualified" by default).
 *   2. Renders the list from the resolved Layout V2 QUEUE config.
 *   3. Clicking a record renders a config-driven drawer from the resolved
 *      Layout V2 DRAWER config, with real field values (placeholder otherwise).
 *   4. Resolution uses the fallback chain (org → default → registry) and the
 *      source actually used is shown as a badge.
 *
 * Everything here is isolated: it reads the existing entity-layouts resolve API
 * and a dedicated read-only proof query. It does not touch AdminEntityDrawer,
 * DataTable, work-unit runtime, bootstrap, VM perf code, or entityPresentation.
 */

import { useCallback, useEffect, useState } from "react";
import type { LayoutDoc, LayoutResolutionSource } from "@/lib/layout/layoutV2";
import { isLayoutV2PreviewEnabledClient } from "@/lib/layout/featureFlag";
import { entityTypeLabel, fetchEntityLabelMap, type EntityLabelMap } from "@/lib/layout/entityLabels";
import LayoutRecordView from "@/components/layout/LayoutRecordView";

const ENTITY_TYPE = "opportunities";

type Rec = Record<string, unknown> & { id: string };
type Stage = { statusKey: string; label: string; sortOrder: number };
type ProofData = {
    lifecycle: { key: string; label: string; note: string; stages: Stage[] };
    stage: string;
    counts: Record<string, number>;
    entityType: string;
    records: Rec[];
};
type ResolveResp = { resolved: LayoutDoc; source: LayoutResolutionSource };

const TEXT = "#31394d";
const MUTED = "#59678b";

function SourceBadge({ source }: { source: LayoutResolutionSource | null }) {
    if (!source) return <span className="text-xs text-[#9aa4bf]">—</span>;
    const map: Record<LayoutResolutionSource, { bg: string; fg: string; border: string; label: string }> = {
        org: { bg: "#ecfdf3", fg: "#067647", border: "#abefc6", label: "org layout" },
        default: { bg: "#eff8ff", fg: "#175cd3", border: "#b2ddff", label: "default layout" },
        registry: { bg: "#fffaeb", fg: "#b54708", border: "#fedf89", label: "registry fallback" },
    };
    const s = map[source];
    return (
        <span
            className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}
        >
            {s.label}
        </span>
    );
}

function DebugField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                {label}
            </span>
            <span className="text-sm" style={{ color: TEXT }}>
                {children}
            </span>
        </div>
    );
}

export default function LayoutProofClient() {
    const flagOnClient = isLayoutV2PreviewEnabledClient();

    const [stage, setStage] = useState("qualified");
    const [queue, setQueue] = useState<ResolveResp | null>(null);
    const [drawer, setDrawer] = useState<ResolveResp | null>(null);
    const [proof, setProof] = useState<ProofData | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [flagDisabled, setFlagDisabled] = useState(false);
    const [labelMap, setLabelMap] = useState<EntityLabelMap>({});

    const loadLayouts = useCallback(async () => {
        const fetchResolve = async (surface: "queue" | "drawer"): Promise<ResolveResp | null> => {
            const res = await fetch(`/api/admin/entity-layouts?entity_type=${ENTITY_TYPE}&surface=${surface}`);
            if (res.status === 404) {
                setFlagDisabled(true);
                return null;
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? `Failed to resolve ${surface} layout`);
            return json as ResolveResp;
        };
        const [q, d] = await Promise.all([fetchResolve("queue"), fetchResolve("drawer")]);
        setQueue(q);
        setDrawer(d);
    }, []);

    const loadRecords = useCallback(async (forStage: string) => {
        const res = await fetch(`/api/admin/layout-proof/opportunities?stage=${encodeURIComponent(forStage)}`);
        if (res.status === 404) {
            setFlagDisabled(true);
            return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load records");
        setProof(json as ProofData);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                fetchEntityLabelMap()
                    .then((m) => {
                        if (!cancelled) setLabelMap(m);
                    })
                    .catch(() => {});
                await loadLayouts();
                if (!cancelled) await loadRecords(stage);
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onStageChange = useCallback(
        async (next: string) => {
            setStage(next);
            setSelectedId(null);
            setLoading(true);
            setError(null);
            try {
                await loadRecords(next);
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setLoading(false);
            }
        },
        [loadRecords],
    );

    const records = proof?.records ?? [];
    const selectedRecord = records.find((r) => r.id === selectedId) ?? null;

    if (!flagOnClient) {
        return (
            <Shell>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Layout V2 preview is disabled on the client. Set{" "}
                    <code className="font-mono text-xs">NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED=1</code> (and{" "}
                    <code className="font-mono text-xs">LAYOUT_V2_PREVIEW_ENABLED=1</code> on the server), then reload.
                </div>
            </Shell>
        );
    }

    return (
        <Shell>
            {/* Debug / context bar */}
            <div className="mb-4 rounded-lg border border-[#e6e8ec] bg-white p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <DebugField label="Feature flag">
                        <span className="text-green-700">enabled</span>
                    </DebugField>
                    <DebugField label="Entity type">{entityTypeLabel(labelMap, ENTITY_TYPE, "singular")}</DebugField>
                    <DebugField label="Queue source">
                        <SourceBadge source={queue?.source ?? null} />
                    </DebugField>
                    <DebugField label="Drawer source">
                        <SourceBadge source={drawer?.source ?? null} />
                    </DebugField>
                    <DebugField label="Lifecycle">{proof?.lifecycle.label ?? "Lead Management"}</DebugField>
                    <DebugField label="Stage filter">
                        <select
                            value={stage}
                            onChange={(e) => onStageChange(e.target.value)}
                            className="rounded border border-[#e6e8ec] bg-white px-2 py-1 text-sm"
                        >
                            {(proof?.lifecycle.stages ?? [{ statusKey: "qualified", label: "Qualified", sortOrder: 0 }]).map(
                                (s) => (
                                    <option key={s.statusKey} value={s.statusKey}>
                                        {s.label} ({proof?.counts[s.statusKey] ?? 0})
                                    </option>
                                ),
                            )}
                        </select>
                    </DebugField>
                </div>
                {proof?.lifecycle.note && (
                    <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
                        {proof.lifecycle.note} Surfaces rendered: <strong>queue</strong> (list) + <strong>drawer</strong> (record).
                    </p>
                )}
            </div>

            {flagDisabled && (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    The server feature flag is OFF (API returned 404). Set{" "}
                    <code className="font-mono text-xs">LAYOUT_V2_PREVIEW_ENABLED=1</code> and reload.
                </div>
            )}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                {/* Left: work-unit-style queue list (Layout V2 queue config) */}
                <div className="rounded-lg border border-[#e6e8ec] bg-white">
                    <div className="flex items-center justify-between border-b border-[#e6e8ec] px-3 py-2">
                        <span className="text-sm font-semibold" style={{ color: TEXT }}>
                            {proof?.lifecycle.label ?? "Lead Management"} ·{" "}
                            {proof?.lifecycle.stages.find((s) => s.statusKey === stage)?.label ?? stage}
                        </span>
                        <span className="text-xs" style={{ color: MUTED }}>
                            {records.length} record{records.length === 1 ? "" : "s"}
                        </span>
                    </div>

                    {loading ? (
                        <p className="p-4 text-sm" style={{ color: MUTED }}>
                            Loading…
                        </p>
                    ) : records.length === 0 ? (
                        <p className="p-4 text-sm" style={{ color: MUTED }}>
                            No records in this stage for your org. Pick another stage above, or move an opportunity into{" "}
                            this stage. (The proof never injects demo records.)
                        </p>
                    ) : (
                        <div className="flex flex-col gap-2 p-2">
                            {records.map((rec) => (
                                <button
                                    key={rec.id}
                                    type="button"
                                    onClick={() => setSelectedId(rec.id)}
                                    className={`rounded-lg border p-1 text-left transition-colors ${
                                        selectedId === rec.id ? "border-[#2f6df6] bg-[#f5f8ff]" : "border-[#e6e8ec] bg-white hover:bg-[#f7f9fc]"
                                    }`}
                                >
                                    {queue?.resolved ? (
                                        <LayoutRecordView doc={queue.resolved} record={rec} />
                                    ) : (
                                        <span className="px-2 text-sm" style={{ color: MUTED }}>
                                            {String(rec["name"] ?? rec.id)}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right: config-driven drawer (Layout V2 drawer config) */}
                <div className="rounded-lg border border-[#e6e8ec] bg-[#fbfcfe] p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold" style={{ color: TEXT }}>
                            Drawer (config-driven)
                        </span>
                        <SourceBadge source={drawer?.source ?? null} />
                    </div>
                    {!selectedRecord ? (
                        <p className="p-4 text-sm" style={{ color: MUTED }}>
                            Select a record on the left to render its drawer from the resolved Layout V2 drawer config.
                        </p>
                    ) : !drawer?.resolved ? (
                        <p className="p-4 text-sm" style={{ color: MUTED }}>
                            No drawer layout resolved.
                        </p>
                    ) : (
                        <LayoutRecordView doc={drawer.resolved} record={selectedRecord} />
                    )}
                </div>
            </div>

            <p className="mt-4 text-[11px]" style={{ color: MUTED }}>
                Adoption path: open{" "}
                <a className="text-[#2f6df6] underline" href="/adminV2/layouts">
                    /adminV2/layouts
                </a>
                , create a draft for <code className="font-mono">opportunities</code> (queue + drawer) from the registry,
                edit, publish — then reload this page and the source badge flips to <strong>org layout</strong> and your
                edits appear here.
            </p>
        </Shell>
    );
}

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto max-w-[1200px] px-6 py-6">
            <header className="mb-5">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1d2433" }}>
                    Layout V2 — Proof Harness
                </h1>
                <p className="mt-1 text-sm" style={{ color: MUTED }}>
                    Isolated proof that Layout Config V2 can drive a work-unit-style list and a config-driven drawer.
                    Not connected to live drawers, queues, or AdminV2 runtime.
                </p>
            </header>
            {children}
        </div>
    );
}
