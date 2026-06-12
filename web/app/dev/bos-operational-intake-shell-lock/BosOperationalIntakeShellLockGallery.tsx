"use client";

import { ActionWorkspaceBosShell } from "@/components/admin/actions/ActionWorkspaceBosShell";
import { ActionWorkspacePasteCanvas } from "@/components/admin/actions/ActionWorkspacePasteCanvas";
import {
    BOS_BACKDROP_STYLE,
    BOS_WORKSPACE_EMBEDDED_HEIGHT,
    BOS_WORKSPACE_WIDTH,
} from "@/lib/admin/actions/bosWorkspaceShell";

function ShellCapturePanel({
    shellVariant,
    label,
    mockupId,
}: {
    shellVariant: "locked" | "legacy-rect";
    label: string;
    mockupId: string;
}) {
    return (
        <div data-mockup={mockupId} className="relative overflow-hidden rounded-xl border border-alloy-midnight/10">
            <div className="absolute inset-0" style={BOS_BACKDROP_STYLE} aria-hidden />
            <div className="relative flex items-center justify-center p-6" style={{ minHeight: 860 }}>
                <div style={{ width: BOS_WORKSPACE_WIDTH, height: BOS_WORKSPACE_EMBEDDED_HEIGHT, maxWidth: "100%" }}>
                    <ActionWorkspaceBosShell
                        open
                        presentation="embedded"
                        shellVariant={shellVariant}
                        step="gather"
                        title="Create Lead"
                        onClose={() => {}}
                        data-testid={`shell-lock-${shellVariant}`}
                    >
                        <ActionWorkspacePasteCanvas
                            pasteText=""
                            onPasteTextChange={() => {}}
                            onAnalyze={() => {}}
                            analyzing={false}
                            sectionTitle="Create Lead"
                            hero
                        />
                    </ActionWorkspaceBosShell>
                </div>
            </div>
            <p className="border-t border-alloy-midnight/8 bg-white/80 px-4 py-2 text-[11px] font-semibold text-alloy-midnight">
                {label}
            </p>
        </div>
    );
}

/** Dev capture board — locked production shell + legacy before state. */
export default function BosOperationalIntakeShellLockGallery() {
    return (
        <div className="min-h-screen bg-[#d8dce3] px-4 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1920px]">
                <header className="mb-6 border-b border-alloy-midnight/10 pb-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Shell lock · production candidate · capture board
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        BOS Operational Intake — Locked Shell
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Horizontal stadium perimeter with restrained top-center swell. Interior workflow unchanged.
                        Silhouette exploration galleries are closed — this is the production geometry.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/bos-operational-intake-shell-lock</p>
                </header>

                <section
                    data-mockup="operational-intake-shell-before-after"
                    className="mb-8 grid gap-6 lg:grid-cols-2"
                >
                    <ShellCapturePanel
                        mockupId="shell-lock-before-legacy"
                        shellVariant="legacy-rect"
                        label="Before — rounded rectangle panel"
                    />
                    <ShellCapturePanel
                        mockupId="shell-lock-after-stadium"
                        shellVariant="locked"
                        label="After — locked stadium shell"
                    />
                </section>

                <section data-mockup="operational-intake-shell-lock-desktop" className="mb-8">
                    <ShellCapturePanel
                        mockupId="shell-lock-desktop"
                        shellVariant="locked"
                        label="Desktop — locked stadium shell"
                    />
                </section>

                <section data-mockup="operational-intake-shell-lock-laptop">
                    <ShellCapturePanel
                        mockupId="shell-lock-laptop"
                        shellVariant="locked"
                        label="Laptop — locked stadium shell"
                    />
                </section>
            </div>
        </div>
    );
}
