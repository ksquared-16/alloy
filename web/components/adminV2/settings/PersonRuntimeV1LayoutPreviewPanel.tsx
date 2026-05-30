"use client";

import type { PersonRuntimeLayoutSettingsPreview } from "@/lib/recordChrome/personDrawerLayoutSettingsPreview";

type LayoutResolution = {
    source?: "org_drawer_override" | "global_template" | "presentation_template";
    record_drawer_layout_id?: string | null;
    layout_key?: string;
};

function layoutSourceLabel(source: LayoutResolution["source"]): string {
    if (source === "org_drawer_override") return "Org drawer override";
    if (source === "global_template") return "Global template";
    if (source === "presentation_template") return "Presentation template (no layout row)";
    return "Unknown";
}

function provenanceLabel(source: "record_drawer_layouts" | "code_default"): string {
    return source === "record_drawer_layouts" ? "DB-backed layout" : "Code fallback";
}

export default function PersonRuntimeV1LayoutPreviewPanel({
    personRuntime,
    layoutResolution,
    previewFidelity,
    loading,
    error,
}: {
    personRuntime: PersonRuntimeLayoutSettingsPreview | null | undefined;
    layoutResolution?: LayoutResolution | null;
    previewFidelity?: string;
    loading?: boolean;
    error?: string | null;
}) {
    if (loading) {
        return (
            <section
                className="rounded-xl border border-alloy-pine/20 bg-white/85 p-4 shadow-sm"
                data-testid="person-runtime-v1-layout-preview"
            >
                <p className="text-xs text-alloy-midnight/55">Loading person layout preview…</p>
            </section>
        );
    }

    if (error) {
        return (
            <section
                className="rounded-xl border border-alloy-pine/20 bg-white/85 p-4 shadow-sm"
                data-testid="person-runtime-v1-layout-preview"
            >
                <p className="text-xs text-red-600">{error}</p>
            </section>
        );
    }

    const runtime = personRuntime ?? null;

    return (
        <section
            className="rounded-xl border border-alloy-pine/20 bg-white/85 p-4 shadow-sm"
            data-testid="person-runtime-v1-layout-preview"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Person drawer layouts (Runtime v1)</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                        Effective operating variants resolved from layout config at drawer open. Read-only — editing
                        deferred.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span
                        className="rounded-full border border-alloy-pine/30 bg-alloy-pine/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-pine"
                        data-testid="person-runtime-v1-badge"
                    >
                        Runtime v1
                    </span>
                    <span
                        className="rounded-full border border-alloy-forge/20 bg-alloy-stone/10 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70"
                        data-testid="person-layout-read-only-badge"
                    >
                        Read-only
                    </span>
                </div>
            </div>

            <div className="mt-4 rounded-lg border border-alloy-forge/12 bg-alloy-stone/5 p-3 text-[11px] leading-snug text-alloy-midnight/75">
                <div className="font-semibold text-alloy-midnight/85">Runtime mode</div>
                <ul className="mt-2 list-none space-y-1">
                    <li>
                        <span className="text-alloy-midnight/55">person_drawer_mode:</span>{" "}
                        <span className="font-mono text-[10px]">{runtime?.person_drawer_mode ?? "—"}</span>
                    </li>
                    <li>
                        <span className="text-alloy-midnight/55">Runtime v1 active:</span>{" "}
                        <span className="font-medium">{runtime?.runtime_v1_active ? "Yes" : "No (code fallback)"}</span>
                    </li>
                    <li>
                        <span className="text-alloy-midnight/55">Layout provenance:</span>{" "}
                        <span className="font-medium" data-testid="person-layout-provenance">
                            {runtime ? provenanceLabel(runtime.layout_provenance) : "—"}
                        </span>
                    </li>
                    {layoutResolution ? (
                        <li>
                            <span className="text-alloy-midnight/55">Layout row source:</span>{" "}
                            <span className="font-medium">{layoutSourceLabel(layoutResolution.source)}</span>
                            {layoutResolution.record_drawer_layout_id ? (
                                <span className="ml-1 font-mono text-[10px] text-alloy-midnight/50">
                                    · {layoutResolution.record_drawer_layout_id.slice(0, 8)}…
                                </span>
                            ) : null}
                        </li>
                    ) : null}
                    {previewFidelity ? (
                        <li>
                            <span className="text-alloy-midnight/55">Preview fidelity:</span>{" "}
                            <span className="font-mono text-[10px]">{previewFidelity}</span>
                        </li>
                    ) : null}
                </ul>
            </div>

            <div className="mt-4 space-y-3">
                {(runtime?.variants ?? []).map((variant) => (
                    <div
                        key={variant.variant_key}
                        className="rounded-lg border border-admin-border/70 bg-white/90 p-3"
                        data-testid={`person-layout-variant-${variant.variant_key}`}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-alloy-midnight">{variant.label}</span>
                            <span className="font-mono text-[10px] text-alloy-midnight/55">{variant.variant_key}</span>
                            <span className="rounded border border-alloy-forge/15 bg-alloy-stone/10 px-1.5 py-0.5 text-[10px] text-alloy-midnight/60">
                                {provenanceLabel(variant.variant_provenance)}
                            </span>
                        </div>
                        <p className="mt-1 text-[10px] text-alloy-midnight/55">
                            presentation_emphasis:{" "}
                            <span className="font-mono">{variant.presentation_emphasis}</span>
                        </p>

                        <div className="mt-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                Operating section order
                            </div>
                            {variant.operating_sections.length === 0 ? (
                                <p className="mt-1 text-[11px] text-alloy-midnight/55">No operating modules (config overview only).</p>
                            ) : (
                                <ol className="mt-2 space-y-1.5" data-testid={`person-variant-operating-${variant.variant_key}`}>
                                    {variant.operating_sections.map((section) => (
                                        <li
                                            key={section.section_key}
                                            className="flex items-center gap-2 rounded border border-alloy-forge/10 bg-alloy-stone/[0.03] px-2 py-1.5 text-xs"
                                        >
                                            <span className="font-mono text-[10px] text-alloy-midnight/45">
                                                {section.position}.
                                            </span>
                                            <span className="font-medium text-alloy-midnight">{section.label}</span>
                                            <span className="font-mono text-[10px] text-alloy-midnight/50">
                                                {section.section_key}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>

                        {variant.overview_section_order?.length ? (
                            <p className="mt-2 text-[10px] text-alloy-midnight/55">
                                Overview order:{" "}
                                <span className="font-mono">{variant.overview_section_order.join(" → ")}</span>
                            </p>
                        ) : null}
                        {variant.overview_suppressed_sections?.length ? (
                            <p className="mt-1 text-[10px] text-alloy-midnight/55">
                                Suppressed overview sections:{" "}
                                <span className="font-mono">{variant.overview_suppressed_sections.join(", ")}</span>
                            </p>
                        ) : null}
                    </div>
                ))}
            </div>
        </section>
    );
}
