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

/** Sprint 01/02 identity gallery — all canonical BOS visual states. */
export default function BosIdentitySystemGallery() {
    return (
        <div className="min-h-screen bg-[#F6F8FC] px-6 py-10" data-bos-identity-gallery="true">
            <div className="mx-auto max-w-4xl space-y-8">
                <header className="space-y-2">
                    <p className="font-mono text-xs text-alloy-midnight/45">/dev/bos-identity-system</p>
                    <h1 className="text-2xl font-bold text-alloy-midnight">BOS Identity System</h1>
                    <p className="text-sm text-alloy-midnight/60">
                        Alloy Mark · Horizon · Smoke · Cloud Workspace — single visual language.
                    </p>
                </header>

                <Frame id="mark" label={STATES[0].label}>
                    <div className="flex flex-wrap items-end gap-8">
                        <BosMark size="sm" />
                        <BosMark size="md" />
                        <BosMark size="lg" />
                        <BosMark size="md" horizon />
                    </div>
                </Frame>

                <Frame id="horizon" label={STATES[1].label}>
                    <div className="flex flex-col gap-4">
                        <BosHorizon size="sm" />
                        <BosHorizon size="md" />
                        <BosHorizon size="lg" />
                    </div>
                </Frame>

                <Frame id="smoke" label={STATES[2].label}>
                    <div className="grid gap-8 md:grid-cols-2">
                        <div>
                            <p className="mb-2 text-xs font-medium text-alloy-midnight/50">thinking</p>
                            <BosSmoke state="thinking" />
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-medium text-alloy-midnight/50">converging</p>
                            <BosSmoke state="converging" />
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
                    <div className="flex flex-wrap gap-3">
                        <BosButton variant="primary" onClick={() => {}} />
                        <BosButton variant="secondary" onClick={() => {}} />
                    </div>
                </Frame>

                <Frame id="header" label={STATES[5].label}>
                    <div className="grid gap-4 md:grid-cols-2">
                        <BosHeader />
                        <div className="rounded-xl bg-[#273F52] p-4">
                            <BosHeader onDark />
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
                    <BosWorkspaceShell>
                        <div className="px-5 py-8 text-sm text-alloy-midnight/70">
                            Workspace content slot — cloud perimeter + horizon header.
                        </div>
                    </BosWorkspaceShell>
                </Frame>
            </div>
        </div>
    );
}
