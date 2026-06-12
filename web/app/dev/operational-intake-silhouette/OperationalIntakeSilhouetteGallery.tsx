"use client";

import {
    SilCarvedShell,
    SilCloudPerimeterShell,
    SilCommandWellShell,
    SilFloatingStackLayout,
    SilFloatingStackShell,
    SilMockupSection,
    SilThreeColumnsDefault,
    SilViewportFrame,
    SilWorkspaceHeader,
} from "./OperationalIntakeSilhouetteShared";

/**
 * Operational Intake — silhouette exploration.
 * Fixed three-column + stacked material content; outer geometry varies.
 */
export default function OperationalIntakeSilhouetteGallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Silhouette exploration · mockups only · not production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Operational Intake Workspace — Silhouette
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Three-column model locked (BOS · stacked material · live findings). Content frozen
                        to Mockup 3. Only outer workspace geometry changes. Single BOS lockup in header.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">
                        /dev/operational-intake-silhouette
                    </p>
                </header>

                <SilMockupSection
                    mockupId="silhouette-carved-workspace"
                    label="Silhouette 1"
                    title="Carved workspace"
                    summary="Midnight Forge frame with white workspace carved inward. Visible forge ring — workspace cut from environment, not a modal box on a page."
                >
                    <SilViewportFrame>
                        <SilCarvedShell>
                            <SilWorkspaceHeader />
                            <SilThreeColumnsDefault />
                        </SilCarvedShell>
                    </SilViewportFrame>
                </SilMockupSection>

                <SilMockupSection
                    mockupId="silhouette-command-well"
                    label="Silhouette 2"
                    title="Command well"
                    summary="Workspace sinks into a recessed command well — circular top, operational depth. Columns live inside the well, not on a flat CRM panel."
                >
                    <SilViewportFrame>
                        <SilCommandWellShell>
                            <SilWorkspaceHeader />
                            <SilThreeColumnsDefault />
                        </SilCommandWellShell>
                    </SilViewportFrame>
                </SilMockupSection>

                <SilMockupSection
                    mockupId="silhouette-floating-stack"
                    label="Silhouette 3"
                    title="Floating material stack"
                    summary="Material cards float above the operational tray. BOS and findings anchor below — asymmetric silhouette, not a uniform three-column grid box."
                >
                    <SilViewportFrame>
                        <SilFloatingStackShell>
                            <SilFloatingStackLayout />
                        </SilFloatingStackShell>
                    </SilViewportFrame>
                </SilMockupSection>

                <SilMockupSection
                    mockupId="silhouette-cloud-perimeter"
                    label="Silhouette 4"
                    title="Cloud-inspired perimeter"
                    summary="Soft asymmetric shell with atmospheric perimeter — organic edge, not rectangular CRM chrome. bos-workspace-shell perimeter as the container shape."
                >
                    <SilViewportFrame>
                        <SilCloudPerimeterShell>
                            <SilWorkspaceHeader />
                            <SilThreeColumnsDefault />
                        </SilCloudPerimeterShell>
                    </SilViewportFrame>
                </SilMockupSection>

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Frozen inner model</p>
                    <p className="mt-1">
                        Stacked material cards · live findings column · in-place analysis · single BOS lockup
                        · no wizard · no forms · no giant textarea.
                    </p>
                </footer>
            </div>
        </div>
    );
}
