"use client";

import { useCallback, useEffect, useState } from "react";

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
    kind: "workflow_virtual" | "field_section_ref" | "layout_static" | "injected_system";
    structural_provenance: string;
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

function kindBadgeClasses(kind: PreviewSection["kind"]): string {
    switch (kind) {
        case "workflow_virtual":
            return "bg-violet-100 text-violet-900 border-violet-200";
        case "field_section_ref":
            return "bg-sky-100 text-sky-900 border-sky-200";
        case "layout_static":
            return "bg-alloy-stone/25 text-alloy-forge border-alloy-forge/15";
        case "injected_system":
            return "bg-amber-100 text-amber-950 border-amber-200";
        default:
            return "bg-alloy-stone/20 text-alloy-forge border-admin-border";
    }
}

function layoutSourceLabel(source: LayoutResolution["source"]): string {
    return source === "org_drawer_override" ? "Org drawer override" : "Global template fallback";
}

export default function EffectiveDrawerLayoutPreviewPanel({ refreshToken = 0 }: { refreshToken?: number }) {
    const [entityType, setEntityType] = useState("opportunity");
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

    return (
        <section className="rounded-xl border border-alloy-forge/15 bg-white/75 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Effective drawer layout</h2>
                    <p className="mt-1 max-w-2xl text-[11px] leading-snug text-alloy-midnight/60">
                        Same resolution chain as runtime <code className="rounded bg-alloy-stone/12 px-1 text-[10px]">record_drawer_layouts</code>{" "}
                        → <code className="rounded bg-alloy-stone/12 px-1 text-[10px]">record_layouts</code>, then section ordering aligned with{" "}
                        <code className="rounded bg-alloy-stone/12 px-1 text-[10px]">AdminEntityDrawer</code> for opportunities. For workflow v1, use
                        the section order editor below; job/schedule use a presentation skeleton only.
                    </p>
                </div>
                <label className="flex flex-col gap-0.5 text-[11px] text-alloy-midnight/70">
                    <span className="font-medium">Entity</span>
                    <select
                        className="rounded-lg border border-admin-border bg-white px-2 py-1.5 text-xs text-alloy-midnight"
                        value={entityType}
                        onChange={(e) => setEntityType(e.target.value)}
                    >
                        {ENTITY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
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
                        <p className="mt-1 text-alloy-midnight/65">
                            <span className="font-medium text-alloy-midnight/80">inquiry_drawer_mode:</span>{" "}
                            <span className="font-mono text-[10px]">{data.workflow.inquiry_drawer_mode ?? "—"}</span>
                            {" · "}
                            <span className="font-medium text-alloy-midnight/80">workflow v1 configured:</span>{" "}
                            {data.workflow.workflow_v1_configured ? "yes" : "no"}
                            {" · "}
                            <span className="font-medium text-alloy-midnight/80">body transform:</span>{" "}
                            {data.workflow.workflow_v1_body_transform_active ? "active" : "inactive"}
                        </p>
                    </div>

                    <div>
                        <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-[11px] font-semibold text-alloy-midnight/80">Overview sections (resolved order)</span>
                            <span className="rounded border border-alloy-forge/15 bg-alloy-stone/10 px-1.5 py-0.5 text-[10px] text-alloy-midnight/60">
                                Fidelity: {data.preview_fidelity}
                            </span>
                        </div>
                        {data.preview_fidelity === "presentation_ordered_skeleton" && data.entity_type !== "opportunity" ? (
                            <p className="mt-1 text-[10px] leading-snug text-alloy-midnight/50">
                                Skeleton: presentation template + config ordering only — runtime job/schedule merges (pricing blocks, property rows,
                                etc.) may reorder further in the drawer.
                            </p>
                        ) : null}
                        {data.empty_reason ? (
                            <p className="mt-2 text-xs text-amber-800">{data.empty_reason}</p>
                        ) : (
                            <ol className="mt-3 space-y-2">
                                {data.sections.map((s) => (
                                    <li
                                        key={`${s.position}:${s.section_key}`}
                                        className="rounded-lg border border-admin-border/70 bg-white/90 px-3 py-2 text-xs"
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-alloy-midnight/45 font-mono text-[10px]">{s.position}.</span>
                                            <span className="font-semibold text-alloy-midnight">{s.title}</span>
                                            <span className="font-mono text-[10px] text-alloy-midnight/55">{s.section_key}</span>
                                            <span
                                                className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${kindBadgeClasses(s.kind)}`}
                                            >
                                                {s.kind.replace(/_/g, " ")}
                                            </span>
                                            <span className="text-[10px] text-alloy-midnight/45">{s.structural_provenance}</span>
                                        </div>
                                        {s.detail ? <p className="mt-1 text-[10px] leading-snug text-alloy-midnight/55">{s.detail}</p> : null}
                                        {s.field_keys?.length ? (
                                            <p className="mt-1 font-mono text-[10px] leading-relaxed text-alloy-midnight/50">
                                                Fields: {s.field_keys.join(", ")}
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
