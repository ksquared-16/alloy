"use client";

import { FittedShellMockup } from "./FittedSignatureShellShared";

/** Fitted signature BOS shells — frame only, safe rectangular interior. Mockups only. */
export default function OperationalIntakeFittedShellGallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Fitted signature shell · mockups only · not production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Operational Intake Workspace — Fitted Signature Shell
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Same three-column workspace inside a Bend Pine signature frame. Shell shape is an outer
                        edge — not a clipping mask. Atmospheric smoke outside; white safe inset inside.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">
                        /dev/operational-intake-fitted-shell
                    </p>
                </header>

                <FittedShellMockup
                    mockupId="fitted-stadium"
                    label="Shell 1 · Production candidate"
                    title="Stadium shell"
                    summary="Horizontal stadium — straight top/bottom, large rounded ends. Bend Pine edge, faint smoke atmosphere, full safe-area columns inside."
                    variant="stadium"
                />

                <FittedShellMockup
                    mockupId="fitted-hybrid"
                    label="Shell 2 · Signature BOS"
                    title="Hybrid oval-trapezoid shell"
                    summary="Soft oval frame with subtle side taper accents on the edge only. More signature BOS without clipping usable UI."
                    variant="hybrid"
                />

                <FittedShellMockup
                    mockupId="fitted-trapezoid"
                    label="Shell 3 · Architectural"
                    title="Soft trapezoid shell"
                    summary="Premium architectural taper on the outer frame corners. Interior remains a full rectangular safe area."
                    variant="trapezoid"
                />

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Structure (all shells)</p>
                    <p className="mt-1">
                        Atmospheric field → signature Bend Pine shell → rectangular safe inset → BOS · material
                        stack · live findings. No clip masks on content. No blue header hybrid.
                    </p>
                </footer>
            </div>
        </div>
    );
}
