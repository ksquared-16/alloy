"use client";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosNotification } from "@/app/adminV2/components/bos/identity/BosNotification";
import { BosWorkspaceShell } from "@/app/adminV2/components/bos/identity/BosWorkspaceShell";
import { ActionWorkspaceStepRail } from "@/components/admin/actions/ActionWorkspaceStepRail";

import { SOURCE_INQUIRY } from "../action-workspace-v2-mockups/fixtures";
import {
    DocumentContentSurface,
    ForgeCarvedPanel,
    IntakeActionRail,
    IntakeWorkspaceHeader,
    MockupSection,
    PasteChannelChips,
    WorkspaceCloseButton,
    WorkspaceFogFrame,
} from "./IntakeMockupShared";

/**
 * Intake-first layout mockups — design sign-off only.
 * Uses frozen BOS identity primitives; no production wiring.
 */
export default function ActionWorkspaceIntakeMockupGallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Design sign-off · intake experience only · not production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Action Workspace V2 — Intake Experience Mockups
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Four layout directions for the first screen. Goal: feel like entering a BOS workspace —
                        not a modal form with a giant textarea. Workspace reveal on open is rejected; BOS reveal
                        belongs on Analyze → thinking only.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">
                        /dev/action-workspace-intake-mockups
                    </p>
                </header>

                <MockupSection
                    mockupId="option-a-cohesive-environment"
                    optionLabel="Option A · Preferred"
                    title="Cohesive BOS environment — carved workspace"
                    summary="Midnight Forge perimeter with white workspace carved from center. BosHeader lives on the content surface — no disconnected blue header bar above a white body."
                >
                    <WorkspaceFogFrame>
                        <ForgeCarvedPanel>
                            <div
                                className="bos-workspace-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.1rem] bg-white"
                                data-intake-white-workspace="true"
                            >
                                <div className="bos-workspace-shell__perimeter" aria-hidden />
                                <div className="bos-workspace-shell__atmosphere" aria-hidden />
                                <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
                                    <div className="shrink-0 px-6 pb-4 pt-5">
                                        <IntakeWorkspaceHeader onDark={false} />
                                        <p className="mt-4 text-[13px] text-alloy-midnight/50">
                                            Paste inquiry details below. BOS will review, identify what matters,
                                            and prepare a lead — you stay in control.
                                        </p>
                                        <div className="mt-3">
                                            <PasteChannelChips />
                                        </div>
                                    </div>
                                    <div className="flex min-h-0 flex-1 flex-col px-6 pb-0">
                                        <DocumentContentSurface empty />
                                    </div>
                                    <IntakeActionRail analyzeDisabled variant="light" />
                                </div>
                            </div>
                        </ForgeCarvedPanel>
                    </WorkspaceFogFrame>
                </MockupSection>

                <MockupSection
                    mockupId="option-b-document-workspace"
                    optionLabel="Option B"
                    title="Document workspace — content-first shell"
                    summary="Single BosWorkspaceShell on fog backdrop. Minimal chrome; the document surface is the hero. Analyze lives in an integrated document footer — not a lonely button below."
                >
                    <WorkspaceFogFrame>
                        <BosWorkspaceShell
                            className="flex h-full w-full max-w-[1080px] flex-col"
                            style={{ height: "100%", maxHeight: "100%" }}
                            showHeader={false}
                            data-testid="intake-mockup-option-b"
                        >
                            <div className="flex min-h-0 flex-1 flex-col px-6 pb-0 pt-5">
                                <IntakeWorkspaceHeader
                                    title="Work with BOS"
                                    subtitle="Review the inquiry — BOS prepares the lead for your approval."
                                    showStepRail={false}
                                />
                                <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.15rem] border border-alloy-stone/12 bg-[#FAFBFC]">
                                    <div className="shrink-0 border-b border-alloy-stone/10 px-5 py-3">
                                        <p className="text-[12px] font-medium text-alloy-midnight/55">
                                            Inquiry document
                                        </p>
                                        <div className="mt-2">
                                            <PasteChannelChips />
                                        </div>
                                    </div>
                                    <DocumentContentSurface empty minHeight={240} />
                                    <IntakeActionRail analyzeDisabled variant="document" />
                                </div>
                            </div>
                        </BosWorkspaceShell>
                    </WorkspaceFogFrame>
                </MockupSection>

                <MockupSection
                    mockupId="option-c-guidance-rail"
                    optionLabel="Option C"
                    title="BOS guidance rail + document canvas"
                    summary="Left column explains what BOS will do; right column is the document surface. Still one cohesive shell — no header/body split."
                >
                    <WorkspaceFogFrame>
                        <BosWorkspaceShell
                            className="flex h-full w-full max-w-[1120px] flex-col"
                            style={{ height: "100%", maxHeight: "100%" }}
                            header={
                                <IntakeWorkspaceHeader
                                    title="Create Lead"
                                    subtitle="BOS reads your source material and drafts fields — you approve every detail."
                                />
                            }
                            data-testid="intake-mockup-option-c"
                        >
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,32%)_1fr]">
                                    <aside className="flex flex-col gap-3 border-r border-alloy-stone/10 bg-[#F6F8FA] px-4 py-4">
                                        <BosNotification
                                            title="What BOS will do"
                                            message="Review pasted inquiry text, extract contact and family details, and surface findings for your approval."
                                        />
                                        <ul className="space-y-2 text-[12px] leading-relaxed text-alloy-midnight/60">
                                            <li>Identify contact information</li>
                                            <li>Extract parent and child names</li>
                                            <li>Flag anything uncertain</li>
                                            <li>Prepare lead fields — nothing created until you confirm</li>
                                        </ul>
                                    </aside>
                                    <div className="flex min-h-0 flex-col p-4">
                                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/40">
                                            Source material
                                        </p>
                                        <DocumentContentSurface
                                            empty={false}
                                            content={SOURCE_INQUIRY}
                                            minHeight={220}
                                        />
                                    </div>
                                </div>
                                <IntakeActionRail analyzeDisabled={false} variant="light" />
                            </div>
                        </BosWorkspaceShell>
                    </WorkspaceFogFrame>
                </MockupSection>

                <MockupSection
                    mockupId="option-d-forge-band"
                    optionLabel="Option D"
                    title="Forge band + inset document card"
                    summary="Step rail on Midnight Forge band only; document card floats as the workspace surface. Strong “carved from center” feel with integrated action rail on the card."
                >
                    <WorkspaceFogFrame>
                        <ForgeCarvedPanel>
                            <div className="flex min-h-0 flex-1 flex-col gap-3">
                                <div className="flex shrink-0 items-start justify-between gap-4 px-2 pt-1">
                                    <div className="min-w-0 flex-1">
                                        <ActionWorkspaceStepRail activeStep="gather" onDark />
                                        <p className="mt-2 text-[12px] text-white/45">
                                            Gather · paste inquiry · analyze with BOS
                                        </p>
                                    </div>
                                    <WorkspaceCloseButton onDark />
                                </div>
                                <div className="bos-workspace-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.1rem] bg-white shadow-[0_8px_32px_rgba(15,35,52,0.12)]">
                                    <div className="bos-workspace-shell__perimeter" aria-hidden />
                                    <div className="bos-workspace-shell__atmosphere" aria-hidden />
                                    <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
                                        <div className="shrink-0 px-6 pb-3 pt-5">
                                            <BosHeader
                                                title="Tell BOS about the family"
                                                subtitle="Paste email, call note, or web inquiry."
                                                size="md"
                                            />
                                        </div>
                                        <div className="flex min-h-0 flex-1 flex-col px-6">
                                            <PasteChannelChips />
                                            <div className="mt-3 min-h-0 flex-1">
                                                <DocumentContentSurface empty minHeight={200} />
                                            </div>
                                        </div>
                                        <IntakeActionRail analyzeDisabled variant="document" />
                                    </div>
                                </div>
                            </div>
                        </ForgeCarvedPanel>
                    </WorkspaceFogFrame>
                </MockupSection>

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Rejected baseline (current production)</p>
                    <p className="mt-1">
                        Blue Midnight Forge header bar + disconnected white body + giant textarea + lonely Analyze
                        button. No workspace reveal on empty open.
                    </p>
                </footer>
            </div>
        </div>
    );
}
