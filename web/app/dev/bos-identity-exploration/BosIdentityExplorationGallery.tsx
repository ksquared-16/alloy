"use client";

import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";

import { BosGenieLampIcon } from "@/app/adminV2/components/bos/BosGenieLampIcon";
import { FINDINGS_FULL, SOURCE_INQUIRY } from "../action-workspace-v2-mockups/fixtures";
import { BosContourMark } from "./BosContourMark";
import { BOS_IDENTITY_THEMES, type BosIdentityVariant } from "./bosIdentityThemes";

const JUNIPER = "#00A283";
const PINE = "#273F52";
const GOLD = "#d0ad50";

function PlatformRecognitionStrip({ variant }: { variant: BosIdentityVariant }) {
    const pineWash = "rgba(0, 162, 131, 0.09)";
    const pineBorder = "rgba(0, 162, 131, 0.38)";

    return (
        <div className="mt-4 rounded-xl border border-alloy-midnight/8 bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-muted">
                Platform recognition — same BOS language across surfaces
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {/* Command Center */}
                <MiniSurface label="Command Center" variant={variant} type="command">
                    <div
                        className="rounded-lg border-2 px-3 py-2"
                        style={{
                            background: variant === "intelligence-surface" ?
                                `linear-gradient(180deg, ${PINE} 0%, #1e3344 100%)`
                            :   `linear-gradient(180deg, ${pineWash} 0%, #fff 60%)`,
                            borderColor: variant === "intelligence-surface" ? "rgba(0,162,131,0.45)" : pineBorder,
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <BosMark variant={variant} size="sm" />
                            <span
                                className="text-[11px] font-medium"
                                style={{ color: variant === "intelligence-surface" ? "rgba(255,255,255,0.9)" : PINE }}
                            >
                                Ask or command…
                            </span>
                        </div>
                    </div>
                </MiniSurface>

                {/* Action Workspace finding */}
                <MiniSurface label="Action Workspace" variant={variant} type="finding">
                    <div
                        className="rounded-lg border px-2.5 py-2"
                        style={findingCardStyle(variant, "confirmed")}
                    >
                        <p className="text-[11px] font-semibold text-alloy-midnight">Found Contact Information</p>
                        <p className="text-[10px] text-alloy-muted">jordan@example.com</p>
                    </div>
                </MiniSurface>

                {/* Drawer BOS assist */}
                <MiniSurface label="Drawer BOS" variant={variant} type="drawer">
                    <div
                        className="rounded-lg px-2.5 py-2"
                        style={drawerBosStyle(variant)}
                    >
                        <div className="flex items-center gap-1.5">
                            <BosMark variant={variant} size="sm" />
                            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: bosLabelColor(variant) }}>
                                BOS
                            </span>
                            <span className="text-[10px] text-alloy-muted">Needs attention on tour follow-up</span>
                        </div>
                    </div>
                </MiniSurface>
            </div>
        </div>
    );
}

function MiniSurface({
    label,
    children,
}: {
    label: string;
    variant: BosIdentityVariant;
    type: string;
    children: ReactNode;
}) {
    return (
        <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-alloy-muted/80">{label}</p>
            {children}
        </div>
    );
}

function bosLabelColor(variant: BosIdentityVariant): string {
    if (variant === "intelligence-surface") return "rgba(255,255,255,0.85)";
    if (variant === "contour") return JUNIPER;
    return PINE;
}

function drawerBosStyle(variant: BosIdentityVariant): CSSProperties {
    if (variant === "intelligence-surface") {
        return { background: PINE, border: `1px solid rgba(0,162,131,0.35)` };
    }
    if (variant === "contour") {
        return {
            background: "rgba(0,162,131,0.06)",
            border: `1px solid rgba(0,162,131,0.22)`,
            position: "relative",
        };
    }
    return {
        background: "rgba(0,162,131,0.07)",
        border: `1px solid rgba(0,162,131,0.2)`,
    };
}

function findingCardStyle(variant: BosIdentityVariant, status: "confirmed" | "review"): CSSProperties {
    if (variant === "intelligence-surface") {
        return {
            background: "rgba(255,255,255,0.96)",
            border: `1px solid ${status === "review" ? "rgba(251,191,36,0.5)" : "rgba(0,162,131,0.35)"}`,
            borderLeft: `3px solid ${status === "review" ? "#f59e0b" : JUNIPER}`,
        };
    }
    if (variant === "contour") {
        return {
            background: "#fff",
            border: "1px solid rgba(39,63,82,0.1)",
            borderLeft: `3px solid ${status === "review" ? "#f59e0b" : JUNIPER}`,
            boxShadow: "inset 0 0 0 1px rgba(0,162,131,0.04)",
        };
    }
    return {
        background: "#fff",
        border: "1px solid rgba(39,63,82,0.12)",
        borderLeft: `3px solid ${status === "review" ? "#f59e0b" : JUNIPER}`,
    };
}

function BosMark({ variant, size = "md" }: { variant: BosIdentityVariant; size?: "sm" | "md" }) {
    const dim = size === "sm" ? "h-5 w-5" : "h-7 w-7";
    if (variant === "contour") {
        return (
            <div className={`relative ${dim} shrink-0 text-alloy-juniper`}>
                <BosContourMark variant="badge" className="h-full w-full" accentGold />
            </div>
        );
    }
    return (
        <div
            className={`${dim} flex shrink-0 items-center justify-center rounded-lg`}
            style={{
                background: variant === "intelligence-surface" ? "rgba(0,162,131,0.25)" : "rgba(0,162,131,0.14)",
                border: `1px solid ${variant === "pine-first" ? "rgba(0,162,131,0.3)" : "rgba(0,162,131,0.4)"}`,
            }}
        >
            <BosGenieLampIcon size="xs" color={variant === "pine-first" ? GOLD : JUNIPER} />
        </div>
    );
}

function ConceptBFindingsMockup({ variant }: { variant: BosIdentityVariant }) {
    const theme = BOS_IDENTITY_THEMES.find((t) => t.id === variant)!;
    const dividerColor = variant === "pine-first" ? JUNIPER : variant === "contour" ? JUNIPER : "rgba(0,162,131,0.5)";

    const rightPaneStyle: CSSProperties =
        variant === "intelligence-surface" ?
            {
                background: `linear-gradient(165deg, ${PINE} 0%, #1a2d3d 55%, #152535 100%)`,
            }
        : variant === "contour" ?
            {
                background: "#eef1f5",
                position: "relative",
            }
        :   { background: "rgba(244,246,249,0.85)" };

    return (
        <section data-identity={variant} className="mb-16 scroll-mt-6">
            <div className="mb-3">
                <h2 className="text-[15px] font-semibold text-alloy-midnight">{theme.label}</h2>
                <p className="mt-0.5 text-[13px] text-alloy-muted">{theme.tagline}</p>
            </div>

            {/* Concept B layout — unchanged */}
            <div
                className="overflow-hidden rounded-2xl border border-alloy-midnight/10"
                style={{ height: "min(72vh, 640px)" }}
            >
                <header className="bg-alloy-midnight px-5 py-3 text-white">
                    <h3 className="text-[16px] font-semibold">Tell BOS about the family</h3>
                    <p className="text-[11px] text-white/50">Intake · Findings · Fill Gaps · Ready To Create</p>
                </header>

                <div className="flex" style={{ height: "calc(100% - 48px - 44px)" }}>
                    {/* Source — neutral, human */}
                    <aside
                        className="flex w-[38%] flex-col border-r bg-[#e8ebf0]"
                        style={{ borderColor: dividerColor }}
                    >
                        <div className="border-b border-alloy-midnight/6 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-alloy-muted">
                            Source Material
                        </div>
                        <pre className="flex-1 overflow-hidden p-3 text-[12px] leading-relaxed text-alloy-forge/90 whitespace-pre-wrap font-sans">
                            {SOURCE_INQUIRY}
                        </pre>
                    </aside>

                    {/* BOS Findings — identity varies */}
                    <main className="relative flex min-w-0 flex-1 flex-col" style={rightPaneStyle}>
                        {variant === "contour" ?
                            <BosContourMark
                                variant="frame"
                                className="pointer-events-none absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)] text-alloy-juniper"
                                accentGold
                            />
                        :   null}
                        {variant === "intelligence-surface" ?
                            <div
                                className="pointer-events-none absolute inset-0 opacity-40"
                                style={{
                                    background: `radial-gradient(ellipse 80% 60% at 70% 20%, rgba(0,162,131,0.22) 0%, transparent 65%),
                                                 radial-gradient(ellipse 50% 40% at 20% 80%, rgba(0,69,140,0.12) 0%, transparent 70%)`,
                                }}
                            />
                        :   null}

                        <BosFindingsHeader variant={variant} />
                        <div className="relative min-h-0 flex-1 overflow-hidden px-3 pb-2">
                            <p
                                className="mb-2 rounded-lg px-3 py-2 text-[12px]"
                                style={bosNarrativeStyle(variant)}
                            >
                                <span className="font-semibold">BOS · </span>
                                I read the inquiry. Contact and family names look solid. Please confirm the source.
                            </p>
                            <div className="space-y-1.5">
                                {FINDINGS_FULL.slice(0, 4).map((f) => (
                                    <FindingRow key={f.id} variant={variant} finding={f} />
                                ))}
                            </div>
                        </div>
                    </main>
                </div>

                <footer className="flex items-center justify-between border-t border-alloy-midnight/8 bg-white px-4 py-2">
                    <span className="text-[12px] text-alloy-muted">Back</span>
                    <button
                        type="button"
                        className="rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white"
                        style={{ background: JUNIPER }}
                    >
                        Apply findings
                    </button>
                </footer>
            </div>

            <PlatformRecognitionStrip variant={variant} />

            <IdentitySpecCard theme={theme} />
        </section>
    );
}

function bosNarrativeStyle(variant: BosIdentityVariant): CSSProperties {
    if (variant === "intelligence-surface") {
        return {
            background: "rgba(0,162,131,0.12)",
            border: "1px solid rgba(0,162,131,0.25)",
            color: "rgba(255,255,255,0.92)",
        };
    }
    if (variant === "contour") {
        return {
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,162,131,0.15)",
            color: PINE,
        };
    }
    return {
        background: "rgba(0,162,131,0.07)",
        border: "1px solid rgba(0,162,131,0.18)",
        color: PINE,
    };
}

function BosFindingsHeader({ variant }: { variant: BosIdentityVariant }) {
    if (variant === "contour") {
        return (
            <div className="relative z-10 px-3 pt-3">
                <div className="relative overflow-hidden rounded-t-xl px-3 py-2" style={{ background: "rgba(0,162,131,0.08)" }}>
                    <BosContourMark variant="crest" className="absolute inset-x-0 top-0 h-10 w-full text-alloy-juniper" accentGold />
                    <div className="relative flex items-center gap-2">
                        <BosMark variant={variant} />
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: JUNIPER }}>
                                BOS Findings
                            </div>
                            <div className="text-[11px] text-alloy-muted">5 findings · 1 needs review</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (variant === "intelligence-surface") {
        return (
            <div className="relative z-10 border-b px-3 py-2.5" style={{ borderColor: "rgba(0,162,131,0.3)" }}>
                <div className="flex items-center gap-2">
                    <BosMark variant={variant} />
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-alloy-juniper">
                            BOS Findings
                        </div>
                        <div className="text-[11px] text-white/55">5 findings · 1 needs review</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="border-b px-3 py-2.5"
            style={{
                background: "rgba(0,162,131,0.09)",
                borderColor: "rgba(0,162,131,0.28)",
            }}
        >
            <div className="flex items-center gap-2">
                <BosMark variant={variant} />
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: PINE }}>
                        BOS Findings
                    </div>
                    <div className="text-[11px] text-alloy-muted">5 findings · 1 needs review</div>
                </div>
            </div>
        </div>
    );
}

function FindingRow({
    variant,
    finding,
}: {
    variant: BosIdentityVariant;
    finding: (typeof FINDINGS_FULL)[number];
}) {
    const isReview = finding.status === "review";
    const textColor = variant === "intelligence-surface" ? "text-alloy-midnight" : "text-alloy-midnight";

    return (
        <div className="rounded-lg px-2.5 py-2" style={findingCardStyle(variant, finding.status === "confirmed" ? "confirmed" : "review")}>
            <div className="flex items-start gap-2">
                {isReview ?
                    <span className="mt-0.5 text-[12px] font-bold text-amber-600">!</span>
                :   <Check className="mt-0.5 h-3.5 w-3.5 text-alloy-juniper" strokeWidth={2.5} />}
                <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-semibold ${textColor}`}>{finding.headline}</p>
                    <p className="text-[11px] text-alloy-muted">{finding.bosLine}</p>
                    {!isReview ?
                        <p className="mt-0.5 text-[11px] font-medium text-alloy-juniper">
                            {finding.details.map((d) => d.value).join(" · ")}
                        </p>
                    :   <div className="mt-1 rounded border border-amber-200/80 bg-white/90 px-2 py-1 text-[11px]">
                            <span className="text-alloy-muted">Source · </span>
                            <span className="font-medium">Website inquiry</span>
                        </div>
                    }
                </div>
            </div>
        </div>
    );
}

function IdentitySpecCard({ theme }: { theme: (typeof BOS_IDENTITY_THEMES)[number] }) {
    return (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-alloy-midnight/8 bg-alloy-stone/40 p-4 text-[12px] md:grid-cols-2">
            <div>
                <p className="font-semibold text-alloy-midnight">Emotional feel</p>
                <p className="mt-1 text-alloy-muted">{theme.emotionalFeel}</p>
                <p className="mt-2 font-semibold text-alloy-midnight">Dominant colors</p>
                <p className="mt-1 text-alloy-muted">{theme.dominantColors}</p>
                <p className="mt-2 font-semibold text-alloy-midnight">Gold role</p>
                <p className="mt-1 text-alloy-muted">{theme.goldRole}</p>
            </div>
            <div>
                <p className="font-semibold text-alloy-midnight">Contour / signature</p>
                <p className="mt-1 text-alloy-muted">{theme.contourUsage}</p>
                <p className="mt-2 font-semibold text-alloy-midnight">Advantages</p>
                <ul className="mt-1 list-inside list-disc text-alloy-muted">
                    {theme.advantages.map((a) => (
                        <li key={a}>{a}</li>
                    ))}
                </ul>
                <p className="mt-2 font-semibold text-alloy-midnight">Risks</p>
                <ul className="mt-1 list-inside list-disc text-alloy-muted">
                    {theme.risks.map((r) => (
                        <li key={r}>{r}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default function BosIdentityExplorationGallery() {
    return (
        <div className="min-h-screen bg-[#d5d9e0] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Brand & design exercise · layout fixed (Concept B)
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold">BOS Identity Exploration</h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Three visual identity systems applied to the approved split-pane Action Workspace.
                        Pine / Juniper dominant. Gold accent only. Signature contour explored in B.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-alloy-muted">
                        <span>
                            <span className="inline-block h-2 w-2 rounded-full bg-[#00A283]" /> Juniper — BOS primary
                        </span>
                        <span>
                            <span className="inline-block h-2 w-2 rounded-full bg-[#273F52]" /> Pine — structure
                        </span>
                        <span>
                            <span className="inline-block h-2 w-2 rounded-full bg-[#d0ad50]" /> Gold — accent only
                        </span>
                    </div>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/bos-identity-exploration</p>
                </header>

                <ConceptBFindingsMockup variant="pine-first" />
                <ConceptBFindingsMockup variant="contour" />
                <ConceptBFindingsMockup variant="intelligence-surface" />
            </div>
        </div>
    );
}
