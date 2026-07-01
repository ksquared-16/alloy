"use client";

import OperationalProposalCardFrame from "@/app/adminV2/components/bos/OperationalProposalCardFrame";
import {
    buildJobLayoutDetailsBullets,
    JOB_LAYOUT_APPLIED_RECEIPT_COPY,
    JOB_LAYOUT_PROPOSAL_SCOPE_LABEL,
    JOB_LAYOUT_PROPOSAL_SOURCE_LABEL,
    JOB_LAYOUT_PROPOSAL_TYPE_LABEL,
    jobLayoutMutationBoundaryCopy,
    mapJobLayoutResponseKindToBosStatus,
    mapJobLayoutResponseKindToFrameVariant,
    safeJobLayoutJson,
} from "@/lib/adminV2/bos/jobLayoutOperationalProposalPresentation";
import { COMMAND_SURFACE_INTERACTIVE_CARD_CLASS } from "@/lib/adminV2/aiCommandSurface/commandSurfaceCardNavigation";
import type { ResponseKind } from "@/lib/adminV2/aiCommandSurface/aiCommandSurfaceModel";
import type { JobOverviewPlannerSuccess } from "@/lib/agent/planner/jobOverviewPlannerTypes";
import { brand, derived, neutral } from "@/styles/tokens/colors";

const CMD = {
    textBody: neutral.textPrimary,
    textSupporting: "rgba(39, 63, 82, 0.78)",
    textLabel: "rgba(39, 63, 82, 0.52)",
} as const;

export type JobLayoutCardUiState = {
    advancedOpen: boolean;
    detailsOpen: boolean;
    applyAnyway: boolean;
    applying: boolean;
};

export type JobLayoutOperationalProposalCardProps = {
    submittedCommand: string;
    headline: string;
    subline?: string;
    responseKind: ResponseKind;
    plannerOk: JobOverviewPlannerSuccess | null;
    structuredOverrideJson: string;
    expanded: boolean;
    panelMaxHeight?: string;
    ui: JobLayoutCardUiState;
    canApply: boolean;
    applyBlockedByNoop: boolean;
    onToggleExpand: () => void;
    onApply: () => void;
    onDismiss: () => void;
    onRefine: () => void;
    onToggleApplyAnyway: (v: boolean) => void;
    onToggleDetails: () => void;
    onToggleAdvanced: () => void;
};

function JobLayoutActionsRow(props: {
    kind: ResponseKind;
    canApply: boolean;
    applying: boolean;
    applyBlockedByNoop: boolean;
    applyAnyway: boolean;
    onToggleApplyAnyway: (v: boolean) => void;
    onApply: () => void;
    onDismiss: () => void;
    onRefine: () => void;
}) {
    const {
        kind,
        canApply,
        applying,
        applyBlockedByNoop,
        applyAnyway,
        onToggleApplyAnyway,
        onApply,
        onDismiss,
        onRefine,
    } = props;
    const showApplyAnyway = kind === "no_op" || kind === "unresolved_only";
    const showApply = kind !== "loading" && kind !== "applied_success" && kind !== "error";

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {showApply ?
                <button
                    type="button"
                    disabled={!canApply || applying}
                    onClick={onApply}
                    data-command-surface-job-layout-approve-apply="true"
                    className="rounded-md bg-alloy-midnight/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45 disabled:cursor-not-allowed"
                >
                    {applying ? "Applying…" : "Approve and apply"}
                </button>
            :   null}
            {kind !== "loading" ?
                <button
                    type="button"
                    onClick={onRefine}
                    className="rounded-md border border-alloy-stone/25 px-3 py-1.5 text-[11px] font-semibold text-alloy-midnight/85"
                >
                    Refine
                </button>
            :   null}
            {showApplyAnyway ?
                <label className="inline-flex cursor-pointer items-center gap-1 text-[10px]" style={{ color: CMD.textSupporting }}>
                    <input
                        type="checkbox"
                        className="h-3 w-3 shrink-0 rounded border border-alloy-stone/25"
                        checked={applyAnyway}
                        onChange={(e) => onToggleApplyAnyway(e.target.checked)}
                        aria-label="Apply without layout diff"
                    />
                    <span>
                        Apply anyway
                        {applyBlockedByNoop && !applyAnyway ? <span className="opacity-80"> · unlocks apply</span> : null}
                    </span>
                </label>
            :   null}
            {kind !== "loading" ?
                <button
                    type="button"
                    onClick={onDismiss}
                    className="text-[11px] font-medium underline-offset-2 hover:underline ml-auto sm:ml-0"
                    style={{ color: CMD.textSupporting }}
                    title="Collapse panel (Esc)"
                >
                    Collapse
                </button>
            :   null}
            <a
                href="/admin/ai-activity"
                className="text-[10px] underline-offset-2 hover:underline opacity-70"
                style={{ color: CMD.textSupporting }}
            >
                Full log
            </a>
        </div>
    );
}

export function JobLayoutOperationalProposalCard(props: JobLayoutOperationalProposalCardProps) {
    const {
        submittedCommand,
        headline,
        subline,
        responseKind,
        plannerOk,
        structuredOverrideJson,
        expanded,
        panelMaxHeight,
        ui,
        canApply,
        applyBlockedByNoop,
        onToggleExpand,
        onApply,
        onDismiss,
        onRefine,
        onToggleApplyAnyway,
        onToggleDetails,
        onToggleAdvanced,
    } = props;

    const bosStatus = mapJobLayoutResponseKindToBosStatus(responseKind);
    const frameVariant = mapJobLayoutResponseKindToFrameVariant(responseKind);
    const requiresApproval =
        responseKind === "action_preview" || responseKind === "no_op" || responseKind === "unresolved_only";
    const detailsBullets = buildJobLayoutDetailsBullets({
        kind: responseKind,
        planner: plannerOk,
        commandText: submittedCommand,
        errorSubline: responseKind === "error" ? subline : undefined,
    });

    const receipt =
        responseKind === "applied_success" ?
            <p>{JOB_LAYOUT_APPLIED_RECEIPT_COPY}</p>
        :   null;

    const collapsedFooter = (
        <button
            type="button"
            className="text-[11px] font-semibold underline-offset-2 hover:underline"
            style={{ color: brand.secondary }}
            data-command-surface-job-layout-toggle-expand="true"
            onClick={onToggleExpand}
        >
            Show layout preview
        </button>
    );

    const expandedFooter = (
        <JobLayoutActionsRow
            kind={responseKind}
            canApply={canApply}
            applying={ui.applying}
            applyBlockedByNoop={applyBlockedByNoop}
            applyAnyway={ui.applyAnyway}
            onToggleApplyAnyway={onToggleApplyAnyway}
            onApply={onApply}
            onDismiss={onDismiss}
            onRefine={onRefine}
        />
    );

    return (
        <div data-command-surface-job-layout-action-card="true">
            <OperationalProposalCardFrame
                proposalTitle={headline}
                proposalTypeLabel={JOB_LAYOUT_PROPOSAL_TYPE_LABEL}
                capabilityKey="job_overview_layout"
                status={bosStatus}
                presentationVariant={frameVariant}
                scope={JOB_LAYOUT_PROPOSAL_SCOPE_LABEL}
                sourceLabel={JOB_LAYOUT_PROPOSAL_SOURCE_LABEL}
                summary={subline ?? undefined}
                requiresApproval={requiresApproval}
                riskLevel="medium"
                mutationBoundaryCopy={jobLayoutMutationBoundaryCopy(responseKind)}
                footer={expanded ? expandedFooter : collapsedFooter}
                receipt={receipt}
                className={COMMAND_SURFACE_INTERACTIVE_CARD_CLASS}
            >
                {expanded ?
                    <div
                        className="space-y-2"
                        style={{ maxHeight: panelMaxHeight, overflowY: "auto" }}
                    >
                        {submittedCommand.trim() ?
                            <p className="text-[10px] leading-snug" style={{ color: CMD.textSupporting }}>
                                <span className="font-semibold" style={{ color: CMD.textLabel }}>
                                    Your request ·{" "}
                                </span>
                                {submittedCommand.trim()}
                            </p>
                        :   null}
                        {responseKind !== "loading" && responseKind !== "applied_success" && detailsBullets.length > 0 ?
                            <div className="border-t border-alloy-stone/12 pt-2">
                                <button
                                    type="button"
                                    onClick={onToggleDetails}
                                    className="flex w-full items-center justify-between text-left text-[11px] font-semibold"
                                    style={{ color: CMD.textLabel }}
                                >
                                    <span>Details</span>
                                    <span aria-hidden>{ui.detailsOpen ? "−" : "+"}</span>
                                </button>
                                {ui.detailsOpen ?
                                    <ul
                                        className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] leading-snug"
                                        style={{ color: CMD.textBody }}
                                        data-command-surface-job-layout-details="true"
                                    >
                                        {detailsBullets.map((b, i) => (
                                            <li key={i}>{b}</li>
                                        ))}
                                    </ul>
                                :   null}
                            </div>
                        :   null}
                        {plannerOk || structuredOverrideJson ?
                            <div className="border-t border-alloy-stone/12 pt-2">
                                <button
                                    type="button"
                                    onClick={onToggleAdvanced}
                                    className="flex w-full items-center justify-between rounded-md border border-dashed border-alloy-stone/25 px-2 py-1.5 text-[10px] font-medium"
                                    style={{ color: CMD.textSupporting }}
                                >
                                    <span>Advanced (JSON)</span>
                                    <span aria-hidden>{ui.advancedOpen ? "Hide" : "Show"}</span>
                                </button>
                                {ui.advancedOpen ?
                                    <div
                                        className="mt-2 grid max-h-[min(200px,35vh)] gap-2 overflow-y-auto pr-1"
                                        data-command-surface-job-layout-advanced="true"
                                    >
                                        {plannerOk ?
                                            <>
                                                <pre
                                                    className="rounded border border-alloy-stone/20 p-2 font-mono text-[10px] leading-relaxed"
                                                    style={{ color: CMD.textSupporting }}
                                                >
                                                    {safeJobLayoutJson(plannerOk.parsed_intent)}
                                                </pre>
                                                <pre
                                                    className="rounded border border-alloy-stone/20 p-2 font-mono text-[10px] leading-relaxed"
                                                    style={{ color: CMD.textSupporting }}
                                                >
                                                    {safeJobLayoutJson(plannerOk.diff_summary)}
                                                </pre>
                                            </>
                                        :   null}
                                        {structuredOverrideJson ?
                                            <pre
                                                className="rounded border border-alloy-stone/20 p-2 font-mono text-[10px] leading-relaxed"
                                                style={{ color: CMD.textSupporting }}
                                            >
                                                {structuredOverrideJson}
                                            </pre>
                                        :   null}
                                    </div>
                                :   null}
                            </div>
                        :   null}
                        {expanded ?
                            <button
                                type="button"
                                className="text-[11px] font-semibold underline-offset-2 hover:underline"
                                style={{ color: brand.secondary }}
                                onClick={onToggleExpand}
                            >
                                Hide details
                            </button>
                        :   null}
                    </div>
                :   null}
            </OperationalProposalCardFrame>
        </div>
    );
}
