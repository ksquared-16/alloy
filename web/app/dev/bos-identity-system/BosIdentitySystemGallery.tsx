"use client";

import {
    BosButton,
    BosHeader,
    BosHorizon,
    BosMark,
    BosNotification,
    BosSmoke,
    BosWorkingState,
    BosWorkspaceShell,
} from "@/app/adminV2/components/bos/identity";

const STATES = [
    { id: "mark", label: "1 · BosMark" },
    { id: "horizon", label: "2 · BosHorizon" },
    { id: "smoke", label: "3 · BosSmoke" },
    { id: "working", label: "4 · BosWorkingState" },
    { id: "button", label: "5 · BosButton" },
    { id: "header", label: "6 · BosHeader" },
    { id: "notification", label: "7 · BosNotification" },
    { id: "shell", label: "8 · BosWorkspaceShell" },
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

/** Sprint 03 identity gallery — visual refinement baseline for screenshot review. */
export default function BosIdentitySystemGallery() {
    return (
        <div className="min-h-screen bg-[#F6F8FC] px-6 py-10" data-bos-identity-gallery="true">
            <div className="mx-auto max-w-4xl space-y-8">
                <header className="space-y-2">
                    <p className="font-mono text-xs text-alloy-midnight/45">/dev/bos-identity-system</p>
                    <h1 className="text-2xl font-bold text-alloy-midnight">BOS Identity System</h1>
                    <p className="text-sm text-alloy-midnight/60">
                        Sprint 03 refinement — mark + horizon + wave, visible smoke, atmospheric shell. Doctrine locked.
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
                            <p className="mb-3 text-xs font-medium text-alloy-midnight/50">thinking — branch, rise, recombine</p>
                            <BosSmoke state="thinking" />
                        </div>
                        <div className="rounded-xl border border-alloy-stone/10 bg-white px-4 py-6">
                            <p className="mb-3 text-xs font-medium text-alloy-midnight/50">converging — narrow toward mark</p>
                            <BosSmoke state="converging" />
                        </div>
                        <div className="rounded-xl border border-alloy-stone/10 bg-white px-4 py-6">
                            <p className="mb-3 text-xs font-medium text-alloy-midnight/50">complete — smoke fades, mark remains</p>
                            <BosSmoke state="complete" />
                        </div>
                    </div>
                </Frame>

                <Frame id="working" label={STATES[3].label}>
                    <div className="grid gap-6 md:grid-cols-2">
                        <BosWorkingState message="Analyzing enrollment pipeline…" state="thinking" />
                        <BosWorkingState message="Drafting communication…" state="converging" />
                    </div>
                </Frame>

                <Frame id="button" label={STATES[4].label}>
                    <div className="flex flex-wrap items-center gap-3">
                        <BosButton variant="primary" onClick={() => {}} />
                        <BosButton variant="secondary" onClick={() => {}} />
                        <BosButton variant="primary" size="sm" onClick={() => {}} />
                    </div>
                    <p className="mt-3 text-[11px] text-alloy-midnight/50">
                        Primary CTAs use white mark only; secondary uses mark + horizon lockup.
                    </p>
                </Frame>

                <Frame id="header" label={STATES[5].label}>
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

                <Frame id="notification" label={STATES[6].label}>
                    <BosNotification
                        message="3 recommendations identified."
                        onAction={() => {}}
                    />
                </Frame>

                <Frame id="shell" label={STATES[7].label}>
                    <BosWorkspaceShell title="BOS Assist" subtitle="Atmospheric perimeter — discovered, not illustrated">
                        <div className="px-5 py-8 text-sm text-alloy-midnight/70">
                            Workspace content slot — cloud perimeter + header lockup.
                        </div>
                    </BosWorkspaceShell>
                </Frame>
            </div>
        </div>
    );
}
