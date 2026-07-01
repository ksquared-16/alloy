"use client";

/**
 * Read-only effective layout inspector — validates source of truth when
 * LAYOUT_RUNTIME_ENABLED is on but Layout V2 preview/editor is off.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    isLayoutRuntimeEnabledClient,
    isLayoutV2PreviewEnabledClient,
} from "@/lib/layout/featureFlag";
import type { LayoutSurface } from "@/lib/layout/layoutV2";

type EffectiveResponse = {
    resolved?: unknown;
    source?: string;
    layoutKey?: string | null;
    matchTier?: string | null;
    matchedQueueContext?: Record<string, string | undefined> | null;
    runtimeReadPathEnabled?: boolean;
    error?: string;
};

const ENTITIES = [
    { value: "opportunities", label: "Opportunity (Lead)" },
    { value: "placement_candidate", label: "Waitlist candidate" },
] as const;

const SURFACES: { value: LayoutSurface; label: string }[] = [
    { value: "drawer", label: "Drawer" },
    { value: "queue", label: "Queue row" },
];

type Props = {
    initialEntityType?: string;
    initialSurface?: LayoutSurface;
    initialOpportunityId?: string;
};

export default function EffectiveLayoutInspectorClient({
    initialEntityType = "opportunities",
    initialSurface = "drawer",
    initialOpportunityId,
}: Props) {
    const runtimeOn = isLayoutRuntimeEnabledClient();
    const previewOn = isLayoutV2PreviewEnabledClient();

    const [entityType, setEntityType] = useState(initialEntityType);
    const [surface, setSurface] = useState<LayoutSurface>(initialSurface);
    const [lifecycleKey, setLifecycleKey] = useState("");
    const [stageKey, setStageKey] = useState("");
    const [workUnitKey, setWorkUnitKey] = useState("");
    const [queueType, setQueueType] = useState("");
    const [grain, setGrain] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<EffectiveResponse | null>(null);

    const queryString = useMemo(() => {
        const qs = new URLSearchParams({ entity_type: entityType, surface });
        if (surface === "queue") {
            if (lifecycleKey.trim()) qs.set("lifecycle_key", lifecycleKey.trim());
            if (stageKey.trim()) qs.set("stage_key", stageKey.trim());
            if (workUnitKey.trim()) qs.set("work_unit_key", workUnitKey.trim());
            if (queueType.trim()) qs.set("queue_type", queueType.trim());
            if (grain.trim()) qs.set("grain", grain.trim());
        }
        return qs.toString();
    }, [entityType, surface, lifecycleKey, stageKey, workUnitKey, queueType, grain]);

    const load = useCallback(async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch(`/api/admin/entity-layouts/effective?${queryString}`);
            const json = (await res.json()) as EffectiveResponse;
            if (!res.ok) {
                setResult({ error: json.error ?? `http_${res.status}` });
            } else {
                setResult(json);
            }
        } catch (e) {
            setResult({ error: e instanceof Error ? e.message : String(e) });
        } finally {
            setLoading(false);
        }
    }, [queryString]);

    useEffect(() => {
        if (runtimeOn || previewOn) void load();
    }, [runtimeOn, previewOn, load]);

    if (!runtimeOn && !previewOn) {
        return (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Enable <code className="text-xs">LAYOUT_RUNTIME_ENABLED</code> or{" "}
                <code className="text-xs">LAYOUT_V2_PREVIEW_ENABLED</code> to inspect effective layouts.
            </div>
        );
    }

    return (
        <div className="space-y-3 rounded-lg border border-alloy-stone/25 bg-white p-4" data-effective-layout-inspector="true">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Effective layout inspector</h2>
                    <p className="text-xs text-alloy-midnight/60">
                        Read-only resolution via <code>/api/admin/entity-layouts/effective</code>.{" "}
                        {previewOn ?
                            <Link href="/settings/surfaces" className="text-alloy-pine underline">
                                Open surface editor
                            </Link>
                        :   "Editor requires preview flag."}
                    </p>
                </div>
                {initialOpportunityId ?
                    <span className="text-[11px] text-alloy-midnight/55">
                        Context opportunity: {initialOpportunityId.slice(0, 8)}…
                    </span>
                :   null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs">
                    <span className="mb-0.5 block font-medium">Entity</span>
                    <select
                        className="w-full rounded border border-alloy-stone/30 px-2 py-1"
                        value={entityType}
                        onChange={(e) => setEntityType(e.target.value)}
                    >
                        {ENTITIES.map((e) => (
                            <option key={e.value} value={e.value}>{e.label}</option>
                        ))}
                    </select>
                </label>
                <label className="text-xs">
                    <span className="mb-0.5 block font-medium">Surface</span>
                    <select
                        className="w-full rounded border border-alloy-stone/30 px-2 py-1"
                        value={surface}
                        onChange={(e) => setSurface(e.target.value as LayoutSurface)}
                    >
                        {SURFACES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                    </select>
                </label>
                {surface === "queue" ?
                    <>
                        <label className="text-xs">
                            <span className="mb-0.5 block font-medium">queue_type</span>
                            <input className="w-full rounded border px-2 py-1" value={queueType} onChange={(e) => setQueueType(e.target.value)} placeholder="pipeline | waitlist" />
                        </label>
                        <label className="text-xs">
                            <span className="mb-0.5 block font-medium">work_unit_key</span>
                            <input className="w-full rounded border px-2 py-1" value={workUnitKey} onChange={(e) => setWorkUnitKey(e.target.value)} />
                        </label>
                        <label className="text-xs">
                            <span className="mb-0.5 block font-medium">stage_key</span>
                            <input className="w-full rounded border px-2 py-1" value={stageKey} onChange={(e) => setStageKey(e.target.value)} />
                        </label>
                        <label className="text-xs">
                            <span className="mb-0.5 block font-medium">grain</span>
                            <input className="w-full rounded border px-2 py-1" value={grain} onChange={(e) => setGrain(e.target.value)} placeholder="case | candidate" />
                        </label>
                    </>
                :   null}
            </div>

            <button
                type="button"
                className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                disabled={loading}
                onClick={() => void load()}
            >
                {loading ? "Resolving…" : "Resolve effective layout"}
            </button>

            {result?.error ?
                <p className="text-sm text-alloy-ember">{result.error}</p>
            :   result ?
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="font-semibold">Source</dt>
                    <dd data-effective-layout-source={result.source ?? ""}>{result.source ?? "—"}</dd>
                    <dt className="font-semibold">Layout key</dt>
                    <dd>{result.layoutKey ?? "—"}</dd>
                    <dt className="font-semibold">Match tier</dt>
                    <dd>{result.matchTier ?? "—"}</dd>
                    {result.matchedQueueContext ?
                        <>
                            <dt className="font-semibold">Queue context</dt>
                            <dd>
                                <pre className="whitespace-pre-wrap text-[10px]">
                                    {JSON.stringify(result.matchedQueueContext, null, 2)}
                                </pre>
                            </dd>
                        </>
                    :   null}
                </dl>
            :   null}

            {result?.resolved ?
                <details className="text-xs">
                    <summary className="cursor-pointer font-medium">Resolved doc JSON</summary>
                    <pre className="mt-2 max-h-96 overflow-auto rounded bg-alloy-stone/5 p-2 text-[10px]">
                        {JSON.stringify(result.resolved, null, 2)}
                    </pre>
                </details>
            :   null}
        </div>
    );
}
