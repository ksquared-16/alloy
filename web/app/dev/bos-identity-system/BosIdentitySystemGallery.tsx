"use client";

import { useState } from "react";

import {
    BosButton,
    BosHeader,
    BosHorizon,
    BosMark,
    BosNotification,
    BosRevealSequence,
    BosSmoke,
    BosWorkingState,
    BosWorkspaceShell,
} from "@/app/adminV2/components/bos/identity";

const STATES = [
    { id: "mark", label: "1 · BosMark" },
    { id: "horizon", label: "2 · BosHorizon" },
    { id: "smoke", label: "3 · BosSmoke" },
    { id: "reveal-working", label: "4 · BosRevealSequence · working" },
    { id: "reveal-workspace", label: "5 · BosRevealSequence · workspace" },
    { id: "working", label: "6 · BosWorkingState (static)" },
    { id: "button", label: "7 · BosButton" },
    { id: "header", label: "8 · BosHeader" },
    { id: "notification", label: "9 · BosNotification" },
    { id: "shell", label: "10 · BosWorkspaceShell" },
    { id: "applied", label: "11 · Applied examples" },
] as const;

function Frame({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
    return (
        <section
            id={id}
            className="rounded-2xl border border-alloy-stone/15 bg-white p-6 shadow-sm"
            data-bos-identity-gallery-frame={id}
        >
            <h2 className="mb-4 text-sm font-semibold text-alloy-midnight/70">{label}</h2>
            {children}
        </section>
    );
}

/** BOS identity gallery — frozen primitives + reveal motion integration. */
export default function BosIdentitySystemGallery() {
    const [workspaceReplay, setWorkspaceReplay] = useState(0);

    return (
        <div className="min-h-screen bg-[#F6F8FC] px-6 py-10" data-bos-identity-gallery="true">
            <div className="mx-auto max-w-4xl space-y-8">
                <header className="space-y-2">
                    <p className="font-mono text-xs text-alloy-midnight/45">/dev/bos-identity-system</p>
                    <h1 className="text-2xl font-bold text-alloy-midnight">BOS Identity System</h1>
                    <p className="text-sm text-alloy-midnight/60">
                        Frozen identity + final reveal motion — cloud condenses into BOS; workspace perimeter emerges on open.
                    </p>
                </header>

                <Frame id="mark" label={STATES[0].label}>
                    <div className="flex flex-wrap items-end gap-10">
                        <div className="flex flex-col items-center gap-1.5">
                            <BosMark size="sm" />
                            <span className="text-[10px] text-alloy-midnight/45">sm · mark only</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5">
                            <BosMark size="md" />
                            <span className="text-[10px] text-alloy-midnight/45">md · mark only</span>
                        </div>
                        <div className="flex flex-col items-center gap-1.5">
                            <BosMark size="lg" />
                            <span className="text-[10px] text-alloy-midnight/45">lg · mark only</span>
                        </div>
                        <div
                            className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#00A283]/25 bg-[#00A283]/[0.03] px-5 py-4"
                            data-bos-gallery-canonical-lockup="true"
                        >
                            <BosMark size="md" horizon />
                            <span className="text-[10px] font-medium text-[#007A63]">canonical lockup · md + horizon + wave</span>
                        </div>
                    </div>
                </Frame>

                <Frame id="horizon" label={STATES[1].label}>
                    <div className="flex flex-col gap-5">
                        <div>
                            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Primary + secondary wave (default)
                            </p>
                            <div className="flex flex-col gap-3">
                                <BosHorizon size="sm" />
                                <BosHorizon size="md" />
                                <BosHorizon size="lg" />
                            </div>
                        </div>
                        <div>
                            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Primary only
                            </p>
                            <BosHorizon size="md" showWave={false} />
                        </div>
                    </div>
                </Frame>

                <Frame id="smoke" label={STATES[2].label}>
                    <div className="grid gap-8 md:grid-cols-3">
                        <div className="rounded-xl border border-alloy-stone/10 bg-white px-4 py-6">
                            <p className="mb-3 text-xs font-medium text-alloy-midnight/50">thinking — broad uncertainty</p>
                            <BosSmoke state="thinking" />
                        </div>
                        <div className="rounded-xl border border-alloy-stone/10 bg-white px-4 py-6">
                            <p className="mb-3 text-xs font-medium text-alloy-midnight/50">converging — condensing toward mark</p>
                            <BosSmoke state="converging" />
                        </div>
                        <div className="rounded-xl border border-alloy-stone/10 bg-white px-4 py-6">
                            <p className="mb-3 text-xs font-medium text-alloy-midnight/50">complete — smoke fades</p>
                            <BosSmoke state="complete" />
                        </div>
                    </div>
                </Frame>

                <Frame id="reveal-working" label={STATES[3].label}>
                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="rounded-xl border border-alloy-stone/10 bg-white px-4 py-8">
                            <p className="mb-4 text-xs font-medium text-alloy-midnight/50">autoPlay — full working reveal</p>
                            <BosRevealSequence
                                mode="working"
                                message="Analyzing inquiry with BOS…"
                                autoPlay
                                markSize="md"
                            />
                        </div>
                        <div className="rounded-xl border border-alloy-stone/10 bg-white px-4 py-8">
                            <p className="mb-4 text-xs font-medium text-alloy-midnight/50">active loop — live analyze state</p>
                            <BosRevealSequence
                                mode="working"
                                message="Drafting communication…"
                                active
                                markSize="md"
                            />
                        </div>
                    </div>
                </Frame>

                <Frame id="reveal-workspace" label={STATES[4].label}>
                    <div className="rounded-xl border border-alloy-stone/10 bg-[#FAFBFC] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-alloy-midnight/50">workspace reveal — cloud opens into perimeter shell</p>
                            <button
                                type="button"
                                className="rounded-md border border-alloy-stone/20 px-2 py-1 text-[10px] font-semibold text-alloy-midnight/70 hover:bg-white"
                                onClick={() => setWorkspaceReplay((n) => n + 1)}
                            >
                                Replay
                            </button>
                        </div>
                        <div className="relative min-h-[16rem] overflow-hidden rounded-[1.35rem] border border-alloy-stone/10 bg-white">
                            {workspaceReplay >= 0 ?
                                <BosRevealSequence
                                    key={workspaceReplay}
                                    mode="workspace"
                                    autoPlay
                                    fill
                                    onComplete={() => {}}
                                />
                            :   null}
                        </div>
                    </div>
                </Frame>

                <Frame id="working" label={STATES[5].label}>
                    <div className="grid gap-6 md:grid-cols-2">
                        <BosWorkingState message="Analyzing enrollment pipeline…" state="thinking" />
                        <BosWorkingState message="Drafting communication…" state="converging" />
                    </div>
                </Frame>

                <Frame id="button" label={STATES[6].label}>
                    <div className="flex flex-wrap items-center gap-3">
                        <BosButton variant="primary" onClick={() => {}} />
                        <BosButton variant="secondary" onClick={() => {}} />
                        <BosButton variant="primary" size="sm" onClick={() => {}} />
                    </div>
                </Frame>

                <Frame id="header" label={STATES[7].label}>
                    <div className="grid gap-6">
                        <div className="grid gap-4 md:grid-cols-3">
                            <BosHeader size="sm" title="BOS Assist" subtitle="Enrollment context loaded" />
                            <BosHeader size="md" />
                            <BosHeader size="lg" title="BOS Assist" subtitle="Review recommendations before sending" />
                        </div>
                        <div className="rounded-xl bg-[#273F52] p-5">
                            <BosHeader onDark title="BOS Assist" subtitle="Midnight forge surface — no badge container" />
                        </div>
                    </div>
                </Frame>

                <Frame id="notification" label={STATES[8].label}>
                    <BosNotification message="3 recommendations identified." onAction={() => {}} />
                </Frame>

                <Frame id="shell" label={STATES[9].label}>
                    <BosWorkspaceShell title="BOS Assist" subtitle="Atmospheric perimeter — discovered, not illustrated">
                        <div className="px-5 py-8 text-sm text-alloy-midnight/70">
                            Workspace content slot — cloud perimeter + header lockup.
                        </div>
                    </BosWorkspaceShell>
                </Frame>

                <Frame id="applied" label={STATES[10].label}>
                    <ul className="space-y-2 text-sm text-alloy-midnight/70">
                        <li>
                            <span className="font-medium text-alloy-midnight">Working reveal</span> — Action Workspace paste analyze,
                            Forms review summary loading, Action Intake paste panel.
                        </li>
                        <li>
                            <span className="font-medium text-alloy-midnight">Workspace reveal</span> — Action Workspace BOS shell open,
                            Composer BOS enhance modal.
                        </li>
                        <li className="text-[12px] text-alloy-midnight/50">
                            Not applied to route transitions, drawer open, standard page loading, or button busy states.
                        </li>
                    </ul>
                </Frame>
            </div>
        </div>
    );
}
