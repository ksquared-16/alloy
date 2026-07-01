"use client";

import { useCallback, useEffect, useState } from "react";
import { drawerSectionTypeLabel } from "@/lib/adminV2/layouts/sectionTypePresentation";

type LayoutResolution = {
    source: "org_drawer_override" | "global_template";
    record_drawer_layout_id: string | null;
    record_layout_id: string | null;
    layout_key: string;
    global_template_count: number | null;
};

type PreviewSection = {
    position: number;
    section_key: string;
    title: string;
    kind: string;
    structural_provenance?: string;
    detail?: string;
    field_keys?: string[];
};

type PreviewResponse = {
    entity_type: string;
    surface: string;
    layout_resolution: LayoutResolution;
    workflow: {
        inquiry_drawer_mode: string | null;
        workflow_v1_configured: boolean;
        workflow_v1_body_transform_active: boolean;
    };
    preview_fidelity: string;
    sections: PreviewSection[];
    empty_reason?: string;
    error?: string;
};

const ENTITY_OPTIONS: { value: string; label: string }[] = [
    { value: "opportunity", label: "Opportunity" },
    { value: "job", label: "Job" },
    { value: "schedule", label: "Schedule" },
];

function layoutSourceLabel(source: LayoutResolution["source"]): string {
    return source === "org_drawer_override" ? "Org drawer override" : "Global template fallback";
}

export default function EffectiveDrawerLayoutPreviewPanel({
    refreshToken = 0,
    entityType: entityTypeProp,
    hideEntitySelect = false,
    developerMode = false,
}: {
    refreshToken?: number;
    entityType?: string;
    hideEntitySelect?: boolean;
    /** When false, panel is omitted from operator surfaces (use inside Developer details). */
    developerMode?: boolean;
}) {
    const [entityTypeInternal, setEntityTypeInternal] = useState("opportunity");
    const entityType = entityTypeProp ?? entityTypeInternal;
    const [data, setData] = useState<PreviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (et: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/record-layouts/effective-preview?entity_type=${encodeURIComponent(et)}`);
            const json = (await res.json().catch(() => ({}))) as PreviewResponse & { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to load preview");
            setData(json);
        } catch (e) {
            setError((e as Error).message);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(entityType);
    }, [entityType, load, refreshToken]);

    if (!developerMode) {
        return null;
    }

    return (
        <section className="rounded-xl border border-alloy-forge/15 bg-white/75 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Resolved drawer layout (debug)</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                        Internal provenance and section resolution — not shown to operators in the main layout editor.
                    </p>
                </div>
                {!hideEntitySelect ? (
                    <label className="flex flex-col gap-0.5 text-[11px] text-alloy-midnight/70">
                        <span className="font-medium">Entity</span>
                        <select
                            className="rounded-lg border border-alloy-forge/12 bg-white px-2 py-1.5 text-xs text-alloy-midnight"
                            value={entityType}
                            onChange={(e) => setEntityTypeInternal(e.target.value)}
                        >
                            {ENTITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
            </div>

            {loading ? (
                <p className="mt-4 text-xs text-alloy-midnight/55">Loading preview…</p>
            ) : error ? (
                <p className="mt-4 text-xs text-red-600">{error}</p>
            ) : data ? (
                <div className="mt-4 space-y-4">
                    <div className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/5 p-3 text-[11px] leading-snug text-alloy-midnight/75">
                        <div className="font-semibold text-alloy-midnight/85">Layout provenance</div>
                        <ul className="mt-2 list-none space-y-1">
                            <li>
                                <span className="text-alloy-midnight/55">Source:</span>{" "}
                                <span className="font-medium">{layoutSourceLabel(data.layout_resolution.source)}</span>
                            </li>
                            <li>
                                <span className="text-alloy-midnight/55">Surface / key:</span>{" "}
                                <span className="font-mono text-[10px]">
                                    {data.surface} · {data.layout_resolution.layout_key}
                                </span>
                            </li>
                            {data.layout_resolution.record_drawer_layout_id ? (
                                <li>
                                    <span className="text-alloy-midnight/55">record_drawer_layouts.id:</span>{" "}
                                    <span className="font-mono text-[10px]">{data.layout_resolution.record_drawer_layout_id}</span>
                                </li>
                            ) : null}
                            {data.layout_resolution.record_layout_id ? (
                                <li>
                                    <span className="text-alloy-midnight/55">record_layouts.id:</span>{" "}
                                    <span className="font-mono text-[10px]">{data.layout_resolution.record_layout_id}</span>
                                </li>
                            ) : null}
                            {data.layout_resolution.global_template_count != null ? (
                                <li>
                                    <span className="text-alloy-midnight/55">Global templates (active rows):</span>{" "}
                                    <span className="font-medium">{data.layout_resolution.global_template_count}</span>
                                </li>
                            ) : null}
                        </ul>
                    </div>

                    <div className="rounded-lg border border-alloy-forge/12 bg-white/80 p-3 text-[11px]">
                        <div className="font-semibold text-alloy-midnight/85">Workflow mode (opportunity)</div>
                        <p className="mt-1 font-mono text-[10px] text-alloy-midnight/65">
                            inquiry_drawer_mode={data.workflow.inquiry_drawer_mode ?? "—"} · workflow_v1=
                            {data.workflow.workflow_v1_configured ? "yes" : "no"} · body_transform=
                            {data.workflow.workflow_v1_body_transform_active ? "active" : "inactive"}
                        </p>
                    </div>

                    <div>
                        <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-[11px] font-semibold text-alloy-midnight/80">Resolved sections</span>
                            <span className="rounded border border-alloy-forge/15 bg-alloy-stone/10 px-1.5 py-0.5 font-mono text-[10px] text-alloy-midnight/60">
                                fidelity={data.preview_fidelity}
                            </span>
                        </div>
                        {data.empty_reason ? (
                            <p className="mt-2 text-xs text-amber-800">{data.empty_reason}</p>
                        ) : (
                            <ol className="mt-3 space-y-2">
                                {data.sections.map((s) => (
                                    <li
                                        key={`${s.position}:${s.section_key}`}
                                        className="rounded-lg border border-alloy-forge/12 bg-white/90 px-3 py-2 text-xs"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-[10px] text-alloy-midnight/45">{s.position}.</span>
                                            <span className="font-semibold text-alloy-midnight">{s.title}</span>
                                            <span className="font-mono text-[10px] text-alloy-midnight/55">{s.section_key}</span>
                                            <span className="rounded border border-alloy-forge/15 bg-alloy-stone/10 px-1.5 py-0.5 text-[10px]">
                                                {drawerSectionTypeLabel(s.kind)}
                                            </span>
                                            {s.structural_provenance ? (
                                                <span className="font-mono text-[10px] text-alloy-midnight/45">
                                                    {s.structural_provenance}
                                                </span>
                                            ) : null}
                                        </div>
                                        {s.detail ? (
                                            <p className="mt-1 text-[10px] leading-snug text-alloy-midnight/55">{s.detail}</p>
                                        ) : null}
                                        {s.field_keys?.length ? (
                                            <p className="mt-1 font-mono text-[10px] leading-relaxed text-alloy-midnight/50">
                                                field_keys: {s.field_keys.join(", ")}
                                            </p>
                                        ) : null}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
