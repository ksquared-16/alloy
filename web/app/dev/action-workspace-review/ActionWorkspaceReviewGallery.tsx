"use client";

import type { ReactNode } from "react";
import type { ActionWorkspaceStep } from "@/lib/admin/actions/actionWorkspaceTypes";
import { ActionWorkspaceShell } from "@/components/admin/actions/ActionWorkspaceShell";
import { ActionWorkspacePasteCanvas } from "@/components/admin/actions/ActionWorkspacePasteCanvas";
import { ActionWorkspaceBosSuggestions } from "@/components/admin/actions/ActionWorkspaceBosSuggestions";
import { ActionWorkspaceGatherFields } from "@/components/admin/actions/ActionWorkspaceGatherFields";
import { ActionWorkspaceReviewSummary } from "@/components/admin/actions/ActionWorkspaceReviewSummary";
import { ActionWorkspaceExecuteState } from "@/components/admin/actions/ActionWorkspaceExecuteState";
import { ActionWorkspaceSuccessState } from "@/components/admin/actions/ActionWorkspaceSuccessState";
import {
    CREATE_LEAD_GATHER_FIELDS,
    CREATE_LEAD_PLATFORM_REQUIRED_KEYS,
    gatherSections,
} from "@/lib/admin/actions/createLeadPlatformGather";
import * as F from "./fixtures";

const SECTIONS = gatherSections();
const WORKSPACE_TITLE = "Tell BOS about the family";
const WORKSPACE_DESCRIPTION =
    "Describe the inquiry — BOS drafts the lead. You approve every detail before we create the record.";

function noop() {}

function GalleryFrame({
    reviewId,
    title,
    step,
    children,
    footer,
}: {
    reviewId: string;
    title: string;
    step: ActionWorkspaceStep;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <section
            data-action-workspace-review={reviewId}
            className="mb-16 scroll-mt-8"
        >
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/55">
                {title}
            </h2>
            <ActionWorkspaceShell
                open
                presentation="embedded"
                onClose={noop}
                title={WORKSPACE_TITLE}
                description={WORKSPACE_DESCRIPTION}
                step={step}
                footer={footer}
                data-testid={`action-workspace-review-${reviewId}`}
            >
                {children}
            </ActionWorkspaceShell>
        </section>
    );
}

export default function ActionWorkspaceReviewGallery() {
    const pasteFooter = (
        <>
            <button
                type="button"
                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75"
            >
                Cancel
            </button>
            <button
                type="button"
                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75"
            >
                Enter manually
            </button>
        </>
    );

    const detailsFastPathFooter = (
        <>
            <button
                type="button"
                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75"
            >
                Back
            </button>
            <button
                type="button"
                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/70"
            >
                Review first
            </button>
            <button
                type="button"
                className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-4 py-2 text-sm font-semibold text-white"
            >
                Create lead
            </button>
        </>
    );

    const detailsReviewFooter = (
        <>
            <button
                type="button"
                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75"
            >
                Back
            </button>
            <button
                type="button"
                className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white"
            >
                Review lead
            </button>
        </>
    );

    const reviewFooter = (
        <>
            <button
                type="button"
                className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75"
            >
                Back
            </button>
            <button
                type="button"
                className="rounded-lg border border-alloy-pine/30 bg-alloy-pine px-4 py-2 text-sm font-semibold text-white"
            >
                Confirm & create lead
            </button>
        </>
    );

    return (
        <div className="min-h-screen bg-alloy-stone/10 px-4 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1500px]">
                <header className="mb-10 border-b border-alloy-stone/20 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700/90">
                        Dev-only · not shipped in production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Action Workspace V1.1 — Create Lead fixture gallery
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm text-alloy-midnight/65">
                        BOS-first gather phases, gold visual identity, confidence colors, and conditional Review skip.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-midnight/50">/dev/action-workspace-review</p>
                </header>

                <GalleryFrame reviewId="bos-intake" title="1 · BOS intake (paste only)" step="gather" footer={pasteFooter}>
                    <ActionWorkspacePasteCanvas
                        pasteText={F.SAMPLE_PASTE}
                        onPasteTextChange={noop}
                        onAnalyze={noop}
                        hero
                    />
                </GalleryFrame>

                <GalleryFrame
                    reviewId="bos-suggestions"
                    title="2 · BOS suggestions (form hidden)"
                    step="gather"
                >
                    <ActionWorkspaceBosSuggestions
                        suggestions={F.BOS_SUGGESTIONS}
                        onToggle={noop}
                        onToggleAll={noop}
                        onApply={noop}
                        onDismiss={noop}
                        onSuggestionValueChange={noop}
                    />
                </GalleryFrame>

                <GalleryFrame
                    reviewId="gather-details"
                    title="3 · Gather details (after Apply)"
                    step="gather"
                    footer={detailsFastPathFooter}
                >
                    <ActionWorkspaceGatherFields
                        sections={SECTIONS}
                        values={F.GATHER_VALUES_FILLED}
                        onChange={noop}
                        platformRequiredKeys={CREATE_LEAD_PLATFORM_REQUIRED_KEYS}
                    />
                </GalleryFrame>

                <GalleryFrame
                    reviewId="gather-details-review-path"
                    title="3b · Gather details (Review path — medium confidence)"
                    step="gather"
                    footer={detailsReviewFooter}
                >
                    <ActionWorkspaceGatherFields
                        sections={SECTIONS}
                        values={F.GATHER_VALUES_WITH_MEDIUM_CONFIDENCE}
                        onChange={noop}
                        platformRequiredKeys={CREATE_LEAD_PLATFORM_REQUIRED_KEYS}
                    />
                </GalleryFrame>

                <GalleryFrame reviewId="review" title="4 · Review (conditional)" step="review" footer={reviewFooter}>
                    <ActionWorkspaceReviewSummary fields={CREATE_LEAD_GATHER_FIELDS} values={F.GATHER_VALUES_FILLED} />
                </GalleryFrame>

                <GalleryFrame reviewId="execute" title="5 · Execute" step="execute">
                    <ActionWorkspaceExecuteState
                        title="Creating Lead…"
                        detail="Saving person, household, and lead record."
                    />
                </GalleryFrame>

                <GalleryFrame reviewId="success" title="6 · Success / Continue" step="success">
                    <ActionWorkspaceSuccessState title="Lead Created" detail="Opening Lead…" />
                </GalleryFrame>
            </div>
        </div>
    );
}
