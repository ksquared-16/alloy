"use client";

import { Check } from "lucide-react";
import { FINDINGS_FULL, SOURCE_INQUIRY } from "../action-workspace-v2-mockups/fixtures";
import { BosShapeBadge, BosShapeMark } from "./BosShapeMarks";
import {
    AMBER_REVIEW,
    BEND_PINE,
    BOS_BORDER,
    BOS_SHAPE_SPECS,
    BOS_WASH,
    FORGE_DEEP,
    MIDNIGHT_FORGE,
    RED_RISK,
    type BosShapeVariant,
} from "./bosShapeTokens";

function ShapeExploration({ variant }: { variant: BosShapeVariant }) {
    const spec = BOS_SHAPE_SPECS[variant];

    return (
        <section data-bos-shape={variant} className="mb-20 scroll-mt-6">
            <header className="mb-3">
                <h2 className="text-[16px] font-semibold text-alloy-midnight">{spec.label}</h2>
                <p className="text-[13px] text-alloy-muted">{spec.tagline}</p>
            </header>

            <ConceptBWorkspace variant={variant} />
            <PlatformSurfaces variant={variant} />
            <ShapeSpecCard spec={spec} />
        </section>
    );
}

function ConceptBWorkspace({ variant }: { variant: BosShapeVariant }) {
    return (
        <div
            className="overflow-hidden rounded-2xl border"
            style={{ height: "min(68vh, 600px)", borderColor: "rgba(39,63,82,0.14)" }}
        >
            <header style={{ background: FORGE_DEEP }} className="px-5 py-3 text-white">
                <h3 className="text-[16px] font-semibold">Tell BOS about the family</h3>
                <p className="text-[11px] text-white/45">Intake · Findings · Fill Gaps · Ready To Create</p>
            </header>

            <div className="flex bg-[#e8ebf0]" style={{ height: "calc(100% - 48px - 44px)" }}>
                <aside
                    className="flex w-[38%] flex-col border-r bg-[#e8ebf0]"
                    style={{ borderColor: "rgba(39,63,82,0.12)" }}
                >
                    <div
                        className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em]"
                        style={{ color: MIDNIGHT_FORGE, opacity: 0.55 }}
                    >
                        Source Material
                    </div>
                    <pre className="flex-1 overflow-hidden whitespace-pre-wrap p-3 font-sans text-[12px] leading-relaxed text-alloy-forge/90">
                        {SOURCE_INQUIRY}
                    </pre>
                </aside>

                <BosFindingsPane variant={variant} />
            </div>

            <footer className="flex items-center justify-between border-t bg-white px-4 py-2">
                <span className="text-[12px] text-alloy-muted">Back</span>
                <button
                    type="button"
                    className="rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white"
                    style={{ background: BEND_PINE }}
                >
                    Apply findings
                </button>
            </footer>
        </div>
    );
}

function BosFindingsPane({ variant }: { variant: BosShapeVariant }) {
    const findings = FINDINGS_FULL.slice(0, 4);

    return (
        <main className="relative flex min-w-0 flex-1 flex-col" style={{ background: "#eef1f5" }}>
            <ShapePaneDecoration variant={variant} />
            <BosFindingsHeader variant={variant} />
            <div className="relative z-10 min-h-0 flex-1 overflow-hidden px-3 pb-2">
                <p
                    className="mb-2 rounded-lg px-3 py-2 text-[12px]"
                    style={{
                        background: BOS_WASH,
                        border: `1px solid ${BOS_BORDER}`,
                        color: MIDNIGHT_FORGE,
                    }}
                >
                    <span className="font-semibold" style={{ color: BEND_PINE }}>
                        BOS ·{" "}
                    </span>
                    I read the inquiry. Contact and family names look solid. Please confirm the source.
                </p>
                <div className="space-y-1.5">
                    {findings.map((f) => (
                        <FindingCard key={f.id} finding={f} variant={variant} />
                    ))}
                </div>
            </div>
        </main>
    );
}

function ShapePaneDecoration({ variant }: { variant: BosShapeVariant }) {
    if (variant === "halo") {
        return (
            <BosShapeMark
                variant="halo"
                scale="pane"
                className="pointer-events-none absolute inset-0 h-full w-full"
            />
        );
    }
    if (variant === "cloud" || variant === "contour" || variant === "intelligence-frame") {
        return (
            <BosShapeMark
                variant={variant}
                scale="pane"
                className="pointer-events-none absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)]"
            />
        );
    }
    return null;
}

function BosFindingsHeader({ variant }: { variant: BosShapeVariant }) {
    const useCrest = variant === "cloud" || variant === "contour" || variant === "intelligence-frame";

    return (
        <div className="relative z-10">
            {useCrest ?
                <div className="relative px-3 pt-2">
                    <BosShapeMark
                        variant={variant}
                        scale="crest"
                        className="absolute inset-x-2 top-0 h-9 w-[calc(100%-16px)]"
                    />
                    <div className="relative flex items-center gap-2 px-1 py-2">
                        <BosShapeBadge variant={variant} size={30} />
                        <HeaderCopy />
                    </div>
                </div>
            :   <div
                    className="flex items-center gap-2 border-b px-3 py-2.5"
                    style={{ background: BOS_WASH, borderColor: BOS_BORDER }}
                >
                    <BosShapeBadge variant={variant} size={30} />
                    <HeaderCopy />
                </div>
            }
        </div>
    );
}

function HeaderCopy() {
    return (
        <div>
            <div
                className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: BEND_PINE }}
            >
                BOS Findings
            </div>
            <div className="text-[11px] text-alloy-muted">5 findings · 1 needs review</div>
        </div>
    );
}

function FindingCard({
    finding,
    variant,
}: {
    finding: (typeof FINDINGS_FULL)[number];
    variant: BosShapeVariant;
}) {
    const review = finding.status === "review";
    const uncertain = finding.status === "uncertain";
    const rail = uncertain ? RED_RISK.rail : review ? AMBER_REVIEW.rail : BEND_PINE;
    const panelBg = uncertain ? RED_RISK.bg : review ? AMBER_REVIEW.bg : "#fff";
    const panelBorder = uncertain ? RED_RISK.border : review ? AMBER_REVIEW.border : "rgba(39,63,82,0.1)";

    return (
        <div
            className="relative rounded-lg px-2.5 py-2"
            style={{
                background: panelBg,
                border: `1px solid ${panelBorder}`,
                borderLeft: `3px solid ${rail}`,
            }}
        >
            {variant === "intelligence-frame" && !review && !uncertain ?
                <div
                    className="pointer-events-none absolute right-2 top-2 h-3 w-3 opacity-30"
                    aria-hidden
                >
                    <BosShapeMark variant="intelligence-frame" scale="badge" className="h-full w-full" />
                </div>
            :   null}
            <div className="flex items-start gap-2">
                {review || uncertain ?
                    <span
                        className="mt-0.5 text-[12px] font-bold"
                        style={{ color: uncertain ? RED_RISK.rail : AMBER_REVIEW.rail }}
                    >
                        !
                    </span>
                :   <Check className="mt-0.5 h-3.5 w-3.5" style={{ color: BEND_PINE }} strokeWidth={2.5} />}
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold" style={{ color: FORGE_DEEP }}>
                        {finding.headline}
                    </p>
                    <p className="text-[11px] text-alloy-muted">{finding.bosLine}</p>
                    {!review && !uncertain ?
                        <p className="mt-0.5 text-[11px] font-medium" style={{ color: BEND_PINE }}>
                            {finding.details.map((d) => d.value).join(" · ")}
                        </p>
                    :   <div
                            className="mt-1 rounded border bg-white/90 px-2 py-1 text-[11px]"
                            style={{ borderColor: AMBER_REVIEW.border }}
                        >
                            <span className="text-alloy-muted">Source · </span>
                            <span className="font-medium">Website inquiry</span>
                        </div>
                    }
                </div>
            </div>
        </div>
    );
}

function PlatformSurfaces({ variant }: { variant: BosShapeVariant }) {
    return (
        <div className="mt-4 rounded-xl border border-alloy-midnight/8 bg-white p-3">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-muted">
                Same BOS shape — Command Center · Action Workspace · Drawer
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <CommandCenterMock variant={variant} />
                <WorkspaceChipMock variant={variant} />
                <DrawerBosMock variant={variant} />
            </div>
        </div>
    );
}

function CommandCenterMock({ variant }: { variant: BosShapeVariant }) {
    return (
        <div>
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-muted">Command Center</p>
            <div
                className="relative overflow-hidden rounded-xl border-2 px-3 py-2.5"
                style={{
                    background: `linear-gradient(180deg, ${BOS_WASH} 0%, #fff 55%)`,
                    borderColor: BOS_BORDER,
                }}
            >
                {(variant === "cloud" || variant === "contour" || variant === "intelligence-frame") && (
                    <BosShapeMark variant={variant} scale="crest" className="absolute inset-x-0 top-0 h-6 w-full opacity-80" />
                )}
                {variant === "halo" && (
                    <BosShapeMark variant="halo" scale="pane" className="absolute inset-0 h-full w-full opacity-60" />
                )}
                <div className="relative flex items-center gap-2">
                    <BosShapeBadge variant={variant} size={26} />
                    <span className="text-[11px] font-medium" style={{ color: MIDNIGHT_FORGE }}>
                        Ask or command…
                    </span>
                </div>
            </div>
        </div>
    );
}

function WorkspaceChipMock({ variant }: { variant: BosShapeVariant }) {
    return (
        <div>
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-muted">
                Action Workspace
            </p>
            <div
                className="relative overflow-hidden rounded-lg border px-2.5 py-2"
                style={{ borderLeft: `3px solid ${BEND_PINE}`, background: "#fff" }}
            >
                {variant === "halo" ?
                    <BosShapeMark variant="halo" scale="badge" className="absolute right-1 top-1 h-8 w-8 opacity-70" />
                :   null}
                <div className="flex items-center gap-1.5">
                    <BosShapeBadge variant={variant} size={22} />
                    <p className="text-[11px] font-semibold" style={{ color: FORGE_DEEP }}>
                        Found Contact Information
                    </p>
                </div>
                <p className="mt-0.5 pl-7 text-[10px]" style={{ color: BEND_PINE }}>
                    jordan@example.com
                </p>
            </div>
        </div>
    );
}

function DrawerBosMock({ variant }: { variant: BosShapeVariant }) {
    return (
        <div>
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-muted">Drawer BOS Card</p>
            <div
                className="relative overflow-hidden rounded-lg px-2.5 py-2"
                style={{
                    background: BOS_WASH,
                    border: `1px solid ${BOS_BORDER}`,
                }}
            >
                {variant !== "halo" ?
                    <BosShapeMark
                        variant={variant}
                        scale="badge"
                        className="absolute right-2 top-2 h-6 w-6 opacity-25"
                    />
                :   <BosShapeMark variant="halo" scale="badge" className="absolute inset-0 m-auto h-12 w-12 opacity-50" />
                }
                <div className="relative flex items-center gap-1.5">
                    <BosShapeBadge variant={variant} size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: BEND_PINE }}>
                        BOS
                    </span>
                    <span className="text-[10px] text-alloy-muted">Tour follow-up needs attention</span>
                </div>
            </div>
        </div>
    );
}

function ShapeSpecCard({ spec }: { spec: (typeof BOS_SHAPE_SPECS)[BosShapeVariant] }) {
    return (
        <div className="mt-3 grid gap-3 rounded-xl border border-alloy-midnight/8 bg-alloy-stone/50 p-4 text-[12px] md:grid-cols-2">
            <div>
                <p className="font-semibold text-alloy-midnight">Recognition</p>
                <p className="mt-1 text-alloy-muted">{spec.recognition}</p>
                <p className="mt-2 font-semibold text-alloy-midnight">Emotional feel</p>
                <p className="mt-1 text-alloy-muted">{spec.emotionalFeel}</p>
                <p className="mt-3 flex flex-wrap gap-3 text-[11px]">
                    <span>
                        <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: MIDNIGHT_FORGE }} />
                        Midnight Forge
                    </span>
                    <span>
                        <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: BEND_PINE }} />
                        Bend Pine
                    </span>
                    <span>
                        <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: AMBER_REVIEW.rail }} />
                        Amber
                    </span>
                    <span>
                        <i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: RED_RISK.rail }} />
                        Red
                    </span>
                </p>
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
    );
}

export default function BosShapeExplorationGallery() {
    const shapes: BosShapeVariant[] = ["cloud", "contour", "halo", "intelligence-frame"];

    return (
        <div className="min-h-screen px-6 py-8 text-alloy-midnight" style={{ background: "#d2d6dc" }}>
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: BEND_PINE }}>
                        BOS identity reset · no gold · layout fixed (Concept B)
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold">What does BOS look like?</h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Four signature shape explorations. Bend Pine = BOS. Midnight Forge = platform structure.
                        Amber = review. Red = risk. Gold removed from all concepts.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/bos-shape-exploration</p>
                </header>

                {shapes.map((s) => (
                    <ShapeExploration key={s} variant={s} />
                ))}

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white p-5 text-[13px] text-alloy-muted">
                    <p className="font-semibold text-alloy-midnight">Color doctrine (binding)</p>
                    <ul className="mt-2 list-inside list-disc space-y-1">
                        <li>
                            <strong>Midnight Forge</strong> — structure, records, authority, OS chrome
                        </li>
                        <li>
                            <strong>Bend Pine</strong> — BOS intelligence, assistance, confirmed findings
                        </li>
                        <li>
                            <strong>Amber</strong> — human attention, review, confirmation needed
                        </li>
                        <li>
                            <strong>Red</strong> — low confidence, blocking issues, incorrect extraction
                        </li>
                        <li>
                            <strong>Gold</strong> — removed from BOS identity (optional future accent only)
                        </li>
                    </ul>
                </footer>
            </div>
        </div>
    );
}
