"use client";

import type { ReactNode } from "react";
import { WorkspaceInterior } from "../bos-workspace-shell-exploration/WorkspaceInterior";
import {
    AtmosphericBorderFrame,
    AtmosphericClosedEntry,
    RectangularShellHeader,
} from "./AtmosphericBorderFrame";
import {
    ALLOY_BLUE,
    ATMOSPHERIC_BORDER_SPECS,
    BEND_PINE,
    RIVER_STONE,
    type AtmosphericBorderVariant,
} from "./atmosphericBorderTokens";

function AlloyWorkspaceScene({
    children,
    dimmed = false,
    label,
}: {
    children: ReactNode;
    dimmed?: boolean;
    label: string;
}) {
    return (
        <div className="relative overflow-hidden rounded-xl border border-alloy-midnight/10" style={{ height: 440 }}>
            <div className="absolute inset-0" style={{ background: RIVER_STONE }}>
                <div className="flex h-9 items-center px-4" style={{ background: ALLOY_BLUE }}>
                    <span className="text-[11px] font-semibold text-white/90">Alloy Workspace</span>
                </div>
                <div className="space-y-2 p-4 opacity-60">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-8 rounded-lg border border-alloy-midnight/5 bg-white/80"
                            style={{ width: `${88 - i * 6}%` }}
                        />
                    ))}
                </div>
                <div
                    className="absolute inset-x-0 bottom-0 flex h-14 items-center justify-center border-t-2"
                    style={{
                        background: "linear-gradient(180deg, rgba(0,162,131,0.09) 0%, #fff 55%)",
                        borderColor: "rgba(0,162,131,0.35)",
                    }}
                >
                    <div
                        className="rounded-xl border-2 px-6 py-2 text-[11px] text-alloy-muted"
                        style={{ borderColor: "rgba(0,162,131,0.28)", background: "#fff" }}
                    >
                        Ask or command…
                    </div>
                </div>
            </div>
            {dimmed ?
                <div className="absolute inset-0 z-10 bg-alloy-midnight/22 backdrop-blur-[1px]" />
            :   null}
            <div className="absolute inset-0 z-20 flex flex-col">
                <div className="shrink-0 px-2 pt-2">
                    <span className="rounded bg-white/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-alloy-muted shadow-sm">
                        {label}
                    </span>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-16">{children}</div>
            </div>
        </div>
    );
}

function OpenAtmosphericWorkspace({ variant }: { variant: AtmosphericBorderVariant }) {
    return (
        <div className="flex h-full w-full max-w-[94%] flex-col" style={{ maxHeight: "90%" }}>
            <AtmosphericBorderFrame variant={variant} className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col">
                    <RectangularShellHeader />
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <WorkspaceInterior />
                    </div>
                </div>
            </AtmosphericBorderFrame>
        </div>
    );
}

function BorderExploration({ variant }: { variant: AtmosphericBorderVariant }) {
    const spec = ATMOSPHERIC_BORDER_SPECS[variant];

    return (
        <section data-atmospheric-border={variant} className="mb-16 scroll-mt-6">
            <header className="mb-4">
                <h2 className="text-[16px] font-semibold text-alloy-midnight">{spec.label}</h2>
                <p className="text-[13px] text-alloy-muted">{spec.tagline}</p>
                <p className="mt-1 text-[12px] text-alloy-muted/85">{spec.mechanism}</p>
                <p className="mt-2 text-[12px] italic text-alloy-muted">
                    User should think: &ldquo;{spec.userRead}&rdquo;
                </p>
            </header>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AlloyWorkspaceScene label="Closed — atmospheric entry hint">
                    <AtmosphericClosedEntry variant={variant} />
                </AlloyWorkspaceScene>
                <AlloyWorkspaceScene label="Open — full perimeter intelligence field (~80vw × 80vh)" dimmed>
                    <OpenAtmosphericWorkspace variant={variant} />
                </AlloyWorkspaceScene>
            </div>

            <div className="mt-3 grid gap-3 rounded-xl border border-alloy-midnight/8 bg-white p-4 text-[12px] md:grid-cols-2">
                <div>
                    <p className="font-semibold text-alloy-midnight">Atmosphere rules (Organic Contour #2 base)</p>
                    <ul className="mt-1 list-inside list-disc text-alloy-muted">
                        <li>Full border participates — all four sides</li>
                        <li>Rectangular enterprise structure preserved</li>
                        <li>Ripples reduced ~65% vs contour shell</li>
                        <li>Thick bend-pine border, low opacity</li>
                        <li>No cloud silhouette, blob, or cartoon</li>
                    </ul>
                </div>
                <div>
                    <p className="font-semibold text-alloy-midnight">Advantages</p>
                    <ul className="mt-1 list-inside list-disc text-alloy-muted">
                        {spec.advantages.map((a) => (
                            <li key={a}>{a}</li>
                        ))}
                    </ul>
                    <p className="mt-2 font-semibold text-alloy-midnight">Risks</p>
                    <ul className="mt-1 list-inside list-disc text-alloy-muted">
                        {spec.risks.map((r) => (
                            <li key={r}>{r}</li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}

export default function BosAtmosphericBorderGallery() {
    const variants: AtmosphericBorderVariant[] = [
        "soft-intelligence-field",
        "brainwave-border",
        "cloud-energy-border",
    ];

    return (
        <div className="min-h-screen px-6 py-8 text-alloy-midnight" style={{ background: "#c8ccd4" }}>
            <div className="mx-auto max-w-[1500px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: BEND_PINE }}>
                        Approved · Organic Contour #2 → atmospheric border
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold">BOS territory — atmosphere over shape</h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        The contour is not a silhouette. It is a soft intelligence field wrapping the full Action
                        Workspace. Interior layout, dimensions, and rectangular structure unchanged.
                    </p>
                    <ul className="mt-3 space-y-1 text-[12px] text-alloy-muted">
                        <li>· Goal: &ldquo;this surface feels different&rdquo; — not &ldquo;that&apos;s a cloud&rdquo;</li>
                        <li>· Bend Pine border: thicker, lower opacity, full perimeter</li>
                        <li>· Ripples reduced 60–70% from Organic Contour shell</li>
                    </ul>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/bos-atmospheric-border-exploration</p>
                </header>

                {variants.map((v) => (
                    <BorderExploration key={v} variant={v} />
                ))}
            </div>
        </div>
    );
}
