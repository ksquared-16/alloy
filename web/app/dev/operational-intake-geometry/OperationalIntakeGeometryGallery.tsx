"use client";

import {
    BaselineWorkspaceBody,
    GEOMETRY_SHELLS,
    GeoMockupSection,
    GeometryShell,
    GeoViewport,
} from "./OperationalIntakeGeometryShared";

const GEOMETRIES = [
    {
        id: "geometry-superellipse",
        label: "Geometry 1",
        title: "Superellipse workspace",
        summary: "iPhone-class continuous curvature — soft superellipse replaces visible rectangular corners. Full-size three-column layout unchanged inside.",
        key: "superellipse" as const,
        filename: "01-superellipse",
    },
    {
        id: "geometry-oval",
        label: "Geometry 2",
        title: "Horizontal oval workspace",
        summary: "Stretched oval silhouette fills the available area. Columns intact; oval contains the full operational experience without empty margins.",
        key: "oval" as const,
        filename: "02-oval",
    },
    {
        id: "geometry-stadium",
        label: "Geometry 3",
        title: "Stadium workspace",
        summary: "Straight top and bottom with massive radiused ends — cockpit display / premium dashboard. Safest production candidate.",
        key: "stadium" as const,
        filename: "03-stadium",
    },
    {
        id: "geometry-soft-trapezoid",
        label: "Geometry 4",
        title: "Soft trapezoid workspace",
        summary: "Subtle architectural taper — top slightly narrower, bottom slightly wider. Premium and intentional, not sci-fi.",
        key: "softTrapezoid" as const,
        filename: "04-soft-trapezoid",
    },
    {
        id: "geometry-offset-capsule",
        label: "Geometry 5",
        title: "Offset capsule workspace",
        summary: "Purpose-built silhouette — primary workspace with one chamfered offset edge. Custom without sacrificing usability.",
        key: "offsetCapsule" as const,
        filename: "05-offset-capsule",
    },
    {
        id: "geometry-hybrid",
        label: "Geometry 6",
        title: "Hybrid oval + trapezoid",
        summary: "Elongated oval with subtle side taper — organic but controlled. Closest to a signature BOS workspace silhouette.",
        key: "hybridOvalTrapezoid" as const,
        filename: "06-hybrid-oval-trapezoid",
    },
];

export default function OperationalIntakeGeometryGallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Geometry V2 · silhouette only · mockups · not production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Operational Intake Workspace — Geometry Exploration V2
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Frozen content: BOS · material stack · live findings. Only outer shape changes.
                        Full workspace size — no floating mini-objects, no metaphor scenes, no layout redesign.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/operational-intake-geometry</p>
                </header>

                {GEOMETRIES.map((g) => {
                    const { shellStyle, dataGeometry } = GEOMETRY_SHELLS[g.key];
                    return (
                        <GeoMockupSection
                            key={g.id}
                            mockupId={g.id}
                            label={g.label}
                            title={g.title}
                            summary={g.summary}
                        >
                            <GeoViewport>
                                <GeometryShell shellStyle={shellStyle} data-geometry={dataGeometry}>
                                    <BaselineWorkspaceBody />
                                </GeometryShell>
                            </GeoViewport>
                        </GeoMockupSection>
                    );
                })}

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Unchanged inside every geometry</p>
                    <p className="mt-1">
                        Three-column operational model · stacked material · live findings · in-place analysis ·
                        single header lockup.
                    </p>
                </footer>
            </div>
        </div>
    );
}
