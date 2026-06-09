"use client";

import type { ReactNode } from "react";
import { WorkspaceInterior } from "./WorkspaceInterior";
import { WorkspaceClosedEntry, WorkspaceTopCrest } from "./WorkspaceShellCrests";
import {
    ALLOY_BLUE,
    BEND_PINE,
    FORGE_DEEP,
    RIVER_STONE,
    WORKSPACE_SHELL_SPECS,
    type WorkspaceShellVariant,
} from "./workspaceShellTokens";

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
        <div className="relative overflow-hidden rounded-xl border border-alloy-midnight/10" style={{ height: 420 }}>
            <div className="absolute inset-0" style={{ background: RIVER_STONE }}>
                {/* Top bar */}
                <div className="h-9 px-4 flex items-center" style={{ background: ALLOY_BLUE }}>
                    <span className="text-[11px] font-semibold text-white/90">Alloy Workspace</span>
                    <span className="ml-4 text-[10px] text-white/50">Queue · Records · Operations</span>
                </div>
                {/* Fake queue */}
                <div className="p-4 space-y-2 opacity-70">
                    {[1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            className="h-8 rounded-lg bg-white/80 border border-alloy-midnight/5"
                            style={{ width: `${85 - i * 8}%` }}
                        />
                    ))}
                </div>
                {/* Command Center */}
                <div
                    className="absolute inset-x-0 bottom-0 h-14 border-t-2 flex items-center justify-center"
                    style={{
                        background: `linear-gradient(180deg, rgba(0,162,131,0.09) 0%, #fff 50%)`,
                        borderColor: "rgba(0,162,131,0.35)",
                    }}
                >
                    <div
                        className="rounded-xl border-2 px-6 py-2 text-[11px] text-alloy-muted"
                        style={{ borderColor: "rgba(0,162,131,0.3)", background: "#fff" }}
                    >
                        Ask or command…
                    </div>
                </div>
            </div>

            {dimmed ?
                <div className="absolute inset-0 z-10 bg-alloy-midnight/20 backdrop-blur-[1px]" />
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

function OpenWorkspaceShell({ variant }: { variant: WorkspaceShellVariant }) {
    const halo =
        variant === "intelligence-halo" ?
            {
                boxShadow: `0 0 0 1px rgba(0,162,131,0.35), 0 0 48px rgba(0,162,131,0.18), 0 24px 80px rgba(24,39,58,0.22)`,
            }
        : variant === "dynamic-island" ?
            {
                boxShadow: `0 12px 48px rgba(0,162,131,0.2), 0 24px 64px rgba(24,39,58,0.18)`,
            }
        :   {
                boxShadow: `0 0 0 1px rgba(39,63,82,0.12), 0 20px 60px rgba(24,39,58,0.2)`,
            };

    const useCrest =
        variant === "cloud" ||
        variant === "organic-contour" ||
        variant === "sculpted-alloy" ||
        variant === "dynamic-island";

    return (
        <div
            className="flex h-full w-full max-w-[92%] flex-col"
            style={{
                maxHeight: "88%",
                ...halo,
                borderRadius: variant === "dynamic-island" ? "28px 28px 12px 12px" : "0 0 12px 12px",
            }}
        >
            {/* Shell header — crest owns top edge only */}
            <div className="relative shrink-0">
                {useCrest ?
                    <div className="relative h-12 w-full overflow-visible">
                        <WorkspaceTopCrest variant={variant} className="absolute inset-0 h-full w-full" />
                        <div className="relative z-10 flex items-end justify-between px-5 pb-2 pt-4">
                            <div>
                                <h4 className="text-[13px] font-semibold text-white">Tell BOS about the family</h4>
                                <p className="text-[10px] text-white/45">Findings</p>
                            </div>
                            <span className="text-[10px] text-white/40">Close</span>
                        </div>
                    </div>
                :   <div className="px-5 py-3" style={{ background: FORGE_DEEP }}>
                        <h4 className="text-[13px] font-semibold text-white">Tell BOS about the family</h4>
                        <p className="text-[10px] text-white/45">Findings</p>
                    </div>
                }
                {variant === "intelligence-halo" ?
                    <div
                        className="pointer-events-none absolute -inset-x-4 -top-4 bottom-0 -z-10 rounded-t-2xl"
                        style={{
                            background: `radial-gradient(ellipse 90% 80% at 50% 0%, rgba(0,162,131,0.2) 0%, transparent 70%)`,
                        }}
                    />
                :   null}
            </div>

            {/* Rectangular body — normal sides, normal bottom */}
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden border-x border-b bg-white"
                style={{
                    borderColor: "rgba(39,63,82,0.1)",
                    borderRadius: variant === "dynamic-island" ? "0 0 12px 12px" : "0 0 8px 8px",
                }}
            >
                <WorkspaceInterior />
            </div>

            {/* Pine territory marker */}
            <div
                className="mx-auto mt-1 h-1 w-16 rounded-full"
                style={{ background: BEND_PINE, opacity: 0.6 }}
                aria-hidden
            />
        </div>
    );
}

function ShellExploration({ variant }: { variant: WorkspaceShellVariant }) {
    const spec = WORKSPACE_SHELL_SPECS[variant];

    return (
        <section data-workspace-shell={variant} className="mb-16 scroll-mt-6">
            <header className="mb-4">
                <h2 className="text-[16px] font-semibold text-alloy-midnight">{spec.label}</h2>
                <p className="text-[13px] text-alloy-muted">{spec.tagline}</p>
                <p className="mt-1 text-[12px] text-alloy-muted/80">{spec.crestStrategy}</p>
            </header>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AlloyWorkspaceScene label="Closed — BOS entry over workspace">
                    <WorkspaceClosedEntry variant={variant} />
                </AlloyWorkspaceScene>

                <AlloyWorkspaceScene label="Open — BOS territory (80vw × 80vh scale)" dimmed>
                    <OpenWorkspaceShell variant={variant} />
                </AlloyWorkspaceScene>
            </div>

            <div className="mt-3 grid gap-3 rounded-xl border border-alloy-midnight/8 bg-white p-4 text-[12px] md:grid-cols-2">
                <div>
                    <p className="font-semibold text-alloy-midnight">Emotional feel</p>
                    <p className="mt-1 text-alloy-muted">{spec.emotionalFeel}</p>
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

export default function BosWorkspaceShellGallery() {
    const variants: WorkspaceShellVariant[] = [
        "cloud",
        "organic-contour",
        "intelligence-halo",
        "sculpted-alloy",
        "dynamic-island",
    ];

    return (
        <div className="min-h-screen px-6 py-8 text-alloy-midnight" style={{ background: "#cfd3da" }}>
            <div className="mx-auto max-w-[1500px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: BEND_PINE }}>
                        BOS workspace shell exploration · outer container only
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold">Entering BOS territory</h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        The shape belongs to the Action Workspace container — not findings cards, chips, or
                        Command Center. Internal split-pane layout is unchanged. Explore top-edge crest: normal
                        sides, normal bottom, BOS identity across the top.
                    </p>
                    <ul className="mt-3 space-y-1 text-[12px] text-alloy-muted">
                        <li>· Shell wraps full modal at ~80vw × 80vh</li>
                        <li>· Interior content stays rectangular</li>
                        <li>· Bend Pine + Midnight Forge — no gold</li>
                        <li>· Closed and open states over Alloy workspace</li>
                    </ul>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/bos-workspace-shell-exploration</p>
                </header>

                {variants.map((v) => (
                    <ShellExploration key={v} variant={v} />
                ))}

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white p-5 text-[13px]">
                    <p className="font-semibold text-alloy-midnight">Design hypothesis (80 / 20)</p>
                    <p className="mt-2 text-alloy-muted">
                        Custom BOS crest across the <strong>top edge only</strong> — with normal sides and flat
                        bottom — may deliver most of the &ldquo;entering BOS territory&rdquo; feeling without
                        distorting the full modal into a gimmick. Organic Contour and Sculpted Alloy test this
                        hypothesis directly. Dynamic Island tests whether the closed→open ritual matters more than
                        static crest shape.
                    </p>
                </footer>
            </div>
        </div>
    );
}
