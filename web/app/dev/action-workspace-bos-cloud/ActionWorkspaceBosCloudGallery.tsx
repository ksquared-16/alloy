"use client";

import type { ReactNode } from "react";
import type { ActionWorkspaceStep } from "@/lib/admin/actions/actionWorkspaceTypes";
import { ActionWorkspaceBosCloudShell } from "@/components/admin/actions/ActionWorkspaceBosCloudShell";
import { ActionWorkspacePasteCanvas } from "@/components/admin/actions/ActionWorkspacePasteCanvas";
import { ActionWorkspaceBosSuggestions } from "@/components/admin/actions/ActionWorkspaceBosSuggestions";
import { ActionWorkspaceGatherFields } from "@/components/admin/actions/ActionWorkspaceGatherFields";
import { ActionWorkspaceBosGuidancePanel } from "@/components/admin/actions/ActionWorkspaceBosGuidancePanel";
import { ActionWorkspaceExecuteState } from "@/components/admin/actions/ActionWorkspaceExecuteState";
import { ActionWorkspaceSuccessState } from "@/components/admin/actions/ActionWorkspaceSuccessState";
import {
    CREATE_LEAD_PLATFORM_REQUIRED_KEYS,
    gatherSections,
} from "@/lib/admin/actions/createLeadPlatformGather";
import {
    resolveCreateLeadBosGuidance,
    resolveCreateLeadBosRecommendations,
} from "@/lib/admin/actions/createLeadBosGuidance";
import { SOURCE_INQUIRY } from "../action-workspace-v2-mockups/fixtures";
import { BOS_SUGGESTIONS, GATHER_VALUES_FILLED } from "../action-workspace-review/fixtures";

const SECTIONS = gatherSections();
const TITLE = "Tell BOS about the family";

function noop() {}

function Frame({
    id,
    label,
    step,
    children,
    footer,
}: {
    id: string;
    label: string;
    step: ActionWorkspaceStep;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <section data-bos-cloud-shot={id} className="mb-14 scroll-mt-6">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-alloy-muted">{label}</h2>
            <div className="rounded-xl bg-alloy-midnight/15 p-6">
                <ActionWorkspaceBosCloudShell
                    open
                    presentation="embedded"
                    onClose={noop}
                    title={TITLE}
                    step={step}
                    footer={footer}
                    data-testid={`bos-cloud-gallery-${id}`}
                >
                    {children}
                </ActionWorkspaceBosCloudShell>
            </div>
        </section>
    );
}

export default function ActionWorkspaceBosCloudGallery() {
    const guidanceReady = resolveCreateLeadBosGuidance(GATHER_VALUES_FILLED);
    const guidanceMissing = resolveCreateLeadBosGuidance({
        first_name: "Jordan",
        last_name: "",
        email: "",
        phone: "",
    });
    const bosRecommendations = resolveCreateLeadBosRecommendations(GATHER_VALUES_FILLED);

    const pasteFooter = (
        <>
            <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-alloy-muted">
                Cancel
            </button>
            <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-alloy-muted">
                Enter manually
            </button>
        </>
    );

    const applyFooter = (
        <>
            <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-alloy-muted">
                Back
            </button>
            <button type="button" className="rounded-lg bg-alloy-juniper px-4 py-2 text-sm font-semibold text-white">
                Apply findings
            </button>
        </>
    );

    const manualFooter = (
        <>
            <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-alloy-muted">
                Back
            </button>
            <button type="button" className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-semibold text-white">
                Review lead
            </button>
        </>
    );

    return (
        <div className="min-h-screen bg-[#c5c9d0] px-6 py-8">
            <div className="mx-auto max-w-[1500px]">
                <header className="mb-8 border-b border-alloy-midnight/10 pb-5">
                    <h1 className="text-2xl font-semibold text-alloy-midnight">Create Lead — BOS Workspace Shell v1</h1>
                    <p className="mt-2 text-sm text-alloy-muted">
                        Single atmospheric object. Cloud overlaps workspace perimeter. Ready for functional cutover.
                    </p>
                    <p className="mt-1 font-mono text-xs text-alloy-muted/60">/dev/action-workspace-bos-cloud</p>
                </header>

                <Frame id="initial-choice" label="1 · Initial BOS / manual choice" step="gather" footer={pasteFooter}>
                    <ActionWorkspacePasteCanvas
                        pasteText=""
                        onPasteTextChange={noop}
                        onAnalyze={noop}
                        sectionTitle={TITLE}
                        hero
                    />
                </Frame>

                <Frame id="paste-analyze" label="2 · Paste / analyze" step="gather" footer={pasteFooter}>
                    <ActionWorkspacePasteCanvas
                        pasteText={SOURCE_INQUIRY}
                        onPasteTextChange={noop}
                        onAnalyze={noop}
                        sectionTitle={TITLE}
                        hero
                    />
                </Frame>

                <Frame id="bos-findings" label="3 · BOS findings" step="gather" footer={applyFooter}>
                    <ActionWorkspaceBosSuggestions
                        suggestions={BOS_SUGGESTIONS}
                        onToggle={noop}
                        onToggleAll={noop}
                        onApply={noop}
                        onDismiss={noop}
                        onSuggestionValueChange={noop}
                    />
                </Frame>

                <Frame id="manual-entry" label="4 · Manual entry (ready)" step="gather" footer={manualFooter}>
                    <div className="flex h-full min-h-0 flex-col gap-3">
                        <ActionWorkspaceBosGuidancePanel guidance={guidanceReady} />
                        <ActionWorkspaceGatherFields
                            sections={SECTIONS}
                            values={GATHER_VALUES_FILLED}
                            onChange={noop}
                            platformRequiredKeys={CREATE_LEAD_PLATFORM_REQUIRED_KEYS}
                        />
                    </div>
                </Frame>

                <Frame id="manual-guidance" label="4b · Manual entry (missing fields)" step="gather" footer={manualFooter}>
                    <div className="flex h-full min-h-0 flex-col gap-3">
                        <ActionWorkspaceBosGuidancePanel guidance={guidanceMissing} />
                        <ActionWorkspaceGatherFields
                            sections={SECTIONS}
                            values={{ first_name: "Jordan", last_name: "", email: "", phone: "" }}
                            onChange={noop}
                            platformRequiredKeys={CREATE_LEAD_PLATFORM_REQUIRED_KEYS}
                        />
                    </div>
                </Frame>

                <Frame id="execute" label="5a · Execute" step="execute">
                    <ActionWorkspaceExecuteState
                        title="Creating Lead…"
                        detail="Saving person, household, and lead record."
                    />
                </Frame>

                <Frame id="success" label="5b · Success" step="success">
                    <ActionWorkspaceSuccessState
                        title="Lead Created"
                        detail="Opening Lead…"
                        householdLabel="Jordan Lee Household"
                        bosRecommendations={bosRecommendations}
                        suggestedActions={[
                            { id: "schedule-tour", label: "Schedule Tour", icon: "calendar", disabled: true },
                            { id: "send-welcome", label: "Send Welcome Email", icon: "mail", disabled: true },
                            { id: "open-lead", label: "Open Lead", icon: "open" },
                        ]}
                    />
                </Frame>
            </div>
        </div>
    );
}
