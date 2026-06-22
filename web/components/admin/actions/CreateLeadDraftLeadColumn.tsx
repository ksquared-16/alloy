"use client";

import { useMemo } from "react";
import { Check, Loader2 } from "lucide-react";

import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type {
    ActionWorkspaceBosSuggestion,
    ActionWorkspaceGatherField,
} from "@/lib/admin/actions/actionWorkspaceTypes";
import type { CreateLeadLiveFinding } from "@/lib/admin/actions/createLeadOperationalIntakeModel";
import {
    BOS_CONFIDENCE_STYLES,
    type BosFieldConfidenceDisplayLevel,
} from "@/lib/admin/actions/actionWorkspaceBosTheme";
import { missingRequiredLabelsForCreateLead } from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { ActionWorkspaceGatherFields } from "@/components/admin/actions/ActionWorkspaceGatherFields";
import { IntakeHouseholdCommitReviewPanel } from "@/components/admin/intake/IntakeHouseholdCommitReviewPanel";
import { IntakeHouseholdReviewPanel } from "@/components/admin/intake/IntakeHouseholdReviewPanel";
import { IntakeReviewWarningsBanner } from "@/components/admin/intake/IntakeReviewWarningsBanner";
import { CreateLeadCommitPreviewPanel } from "@/components/admin/actions/CreateLeadCommitPreviewPanel";
import { CreateLeadRequiredChecklistRow } from "@/components/admin/actions/CreateLeadRequiredChecklistRow";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import { resolveCreateLeadRequiredChecklist } from "@/lib/admin/actions/createLead/resolveCreateLeadRequiredChecklist";
import { useInquiryChildPlacementCascade } from "@/lib/admin/hooks/useInquiryChildPlacementCascade";
import {
    filterGlobalCreateLeadValidationIssues,
} from "@/lib/admin/actions/createLead/review/createLeadCommitCardHints";
import { partitionIntakeReviewWarnings } from "@/lib/intake/review/partitionIntakeReviewWarnings";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

type Props = {
    findings: CreateLeadLiveFinding[];
    suggestions: ActionWorkspaceBosSuggestion[];
    analyzing: boolean;
    manualMode: boolean;
    draftEditMode: boolean;
    sections: Array<{ key: string; label: string; fields: ActionWorkspaceGatherField[] }>;
    values: Record<string, string>;
    intakeSpec: ActionIntakeSpec | null;
    requiredPayloadKeys: readonly string[];
    onFieldChange: (payloadKey: string, value: string) => void;
    onSuggestionValueChange: (id: string, value: string) => void;
    onToggleSuggestion: (id: string) => void;
    onApplySuggestions: () => void;
    selectedSuggestionCount: number;
    analyzeError: string | null;
    validationIssues: string[];
    fieldConfidence?: Record<string, BosFieldConfidenceDisplayLevel>;
    household?: IntakeHouseholdCandidate | null;
    commitSelection?: CreateLeadCommitSelection | null;
    onCommitSelectionChange?: (next: CreateLeadCommitSelection) => void;
};

function DraftFieldCard({
    finding,
    onValueChange,
    onToggle,
}: {
    finding: CreateLeadLiveFinding;
    onValueChange?: (id: string, value: string) => void;
    onToggle?: (id: string) => void;
}) {
    const showSuggestionToggle = finding.source === "suggestion" && onToggle && finding.status !== "streaming";

    if (finding.status === "empty") {
        return (
            <div
                className="rounded-xl border border-dashed border-alloy-stone/15 bg-[#FAFBFC] px-3 py-2.5"
                data-finding={finding.payloadKey}
                data-draft-field={finding.payloadKey}
            >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/30">
                    {finding.entity}
                </p>
                <p className="mt-1 text-[12px] text-alloy-midnight/25">Waiting for material…</p>
            </div>
        );
    }

    if (finding.status === "streaming") {
        return (
            <div
                className="rounded-xl border border-[#00A283]/20 bg-[#00A283]/[0.05] px-3 py-2.5"
                data-finding={finding.payloadKey}
                data-draft-field={finding.payloadKey}
            >
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#007A63]">
                        {finding.entity}
                    </p>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-[#007A63]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Filling
                    </span>
                </div>
                <p className="mt-1 text-[14px] font-semibold text-alloy-midnight">{finding.value}</p>
            </div>
        );
    }

    const review = finding.status === "review";
    const confidenceStyle =
        finding.confidence ? BOS_CONFIDENCE_STYLES[finding.confidence] : null;

    return (
        <div
            className={`rounded-xl border px-3 py-2.5 shadow-[0_1px_0_rgba(15,35,52,0.03)] ${
                review ?
                    "border-amber-200/80 bg-amber-50/50"
                :   "border-alloy-stone/10 bg-white"
            } ${confidenceStyle?.border ?? ""}`}
            data-finding={finding.payloadKey}
            data-draft-field={finding.payloadKey}
        >
            <div className="flex items-start gap-2.5">
                {showSuggestionToggle ?
                    <input
                        type="checkbox"
                        checked={finding.selected ?? false}
                        onChange={() => onToggle(finding.id)}
                        className="mt-1"
                        data-testid={`action-workspace-bos-suggestion-checkbox-${finding.payloadKey}`}
                    />
                :   null}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            {finding.entity}
                        </p>
                        <span className="flex items-center gap-2">
                            {confidenceStyle ?
                                <span
                                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${confidenceStyle.badge}`}
                                >
                                    {confidenceStyle.label}
                                </span>
                            :   null}
                            {finding.status === "confirmed" ?
                                <Check className="h-3.5 w-3.5 text-[#00A283]" strokeWidth={2.5} />
                            :   review ?
                                <span className="text-[10px] font-semibold text-amber-800">Review</span>
                            :   null}
                        </span>
                    </div>
                    {finding.editable && onValueChange ?
                        <input
                            value={finding.value}
                            onChange={(e) => onValueChange(finding.id, e.target.value)}
                            className="mt-1.5 w-full rounded-md border border-alloy-stone/12 bg-white px-2 py-1.5 text-[13px] font-medium text-alloy-midnight focus:outline-none focus:ring-2 focus:ring-[#00A283]/12"
                            data-testid={
                                finding.source === "suggestion" ?
                                    `action-workspace-bos-suggestion-${finding.payloadKey}`
                                :   `create-lead-draft-${finding.payloadKey}`
                            }
                        />
                    :   <p className="mt-1.5 text-[14px] font-semibold text-alloy-midnight">{finding.value}</p>}
                    {finding.detail ?
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/45">{finding.detail}</p>
                    :   null}
                </div>
            </div>
        </div>
    );
}

/** Right column — draft lead answers as extraction fills them in. */
export function CreateLeadDraftLeadColumn({
    findings,
    suggestions,
    analyzing,
    manualMode,
    draftEditMode,
    sections,
    values,
    intakeSpec,
    requiredPayloadKeys,
    onFieldChange,
    onSuggestionValueChange,
    onToggleSuggestion,
    onApplySuggestions,
    selectedSuggestionCount,
    analyzeError,
    validationIssues,
    fieldConfidence,
    household,
    commitSelection,
    onCommitSelectionChange,
}: Props) {
    const showDraftForm = manualMode || draftEditMode;
    const householdCommitMode = Boolean(household && commitSelection && onCommitSelectionChange);
    const reviewSuggestions = suggestions.filter((s) => s.confidence !== "high");
    const locationCascade = useInquiryChildPlacementCascade({
        locationValue: values.location_id ?? "",
        programValue: values.child_program ?? "",
    });
    const requiredChecklist =
        householdCommitMode && commitSelection ?
            resolveCreateLeadRequiredChecklist({
                selection: commitSelection,
                values,
                intakeSpec,
                requiredPayloadKeys,
                reviewWarnings: household?.review_warnings,
                household,
            })
        :   [];
    const { globalWarnings, addressWarnings } = partitionIntakeReviewWarnings(household?.review_warnings ?? []);
    const globalBlockerMessages = useMemo(() => {
        if (!householdCommitMode) return globalWarnings.map((warning) => warning.message);
        const messages = filterGlobalCreateLeadValidationIssues(validationIssues);
        for (const warning of globalWarnings) {
            if (warning.code === "location_ambiguous" || warning.code === "location_unmatched") {
                if (!messages.includes(warning.message)) messages.push(warning.message);
            }
        }
        return messages;
    }, [globalWarnings, householdCommitMode, validationIssues]);
    const showApplyReview = reviewSuggestions.length > 0 && draftEditMode;
    const missing =
        intakeSpec && showDraftForm && !householdCommitMode ?
            missingRequiredLabelsForCreateLead(intakeSpec, values)
        :   [];
    const commitPreview =
        household && (draftEditMode || manualMode) ?
            buildCreateLeadCommitPreview({ values, household, selection: commitSelection })
        :   null;

    function renderHouseholdReview(className: string) {
        if (!household) return null;
        if (commitSelection && onCommitSelectionChange) {
            return (
                <IntakeHouseholdCommitReviewPanel
                    household={household}
                    selection={commitSelection}
                    onSelectionChange={onCommitSelectionChange}
                    addressWarnings={addressWarnings}
                    gatherFields={sections.flatMap((section) => section.fields)}
                    requiredPayloadKeys={requiredPayloadKeys}
                    contextValues={values}
                    className={className}
                />
            );
        }
        return <IntakeHouseholdReviewPanel household={household} className={className} />;
    }

    return (
        <section
            className="flex min-h-0 flex-col bg-white"
            data-create-lead-column="draft-lead"
            data-testid="create-lead-draft-lead"
        >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-alloy-stone/10 px-3 py-2">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/45">
                        Draft Lead
                    </p>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/45">
                        {manualMode ?
                            "Manual entry"
                        : analyzing ?
                            "Extracting lead details…"
                        : draftEditMode ?
                            "Edit missing or incorrect fields"
                        :   "Required fields appear after analyze"}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {showApplyReview ?
                        <button
                            type="button"
                            disabled={selectedSuggestionCount === 0}
                            onClick={onApplySuggestions}
                            className="rounded-lg border border-[#00A283]/25 bg-[#00A283]/10 px-3 py-1.5 text-[11px] font-semibold text-[#007A63] hover:bg-[#00A283]/15 disabled:opacity-50"
                            data-testid="action-workspace-bos-apply-button"
                        >
                            Review suggestions
                        </button>
                    :   null}
                    {analyzing ?
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#007A63]">
                            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                            Active
                        </span>
                    :   null}
                </div>
            </div>

            {globalBlockerMessages.length ?
                <div className="shrink-0 border-b border-alloy-stone/10 px-3 py-2">
                    <IntakeReviewWarningsBanner messages={globalBlockerMessages} />
                </div>
            :   null}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {analyzeError ?
                    <p
                        className="mb-3 rounded-xl border border-alloy-ember/20 bg-alloy-ember/5 px-3 py-2 text-[12px] text-alloy-ember"
                        role="alert"
                    >
                        {analyzeError}
                    </p>
                :   null}

                {missing.length > 0 ?
                    <div
                        className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950"
                        data-testid="action-workspace-bos-missing-hints"
                    >
                        <span className="font-semibold">Still needed: </span>
                        {missing.join(" · ")}
                    </div>
                :   null}

                {showDraftForm ?
                    <div
                        data-testid={
                            householdCommitMode ? "create-lead-household-review" : "create-lead-gather-fields"
                        }
                    >
                        {renderHouseholdReview("mb-3")}
                        {householdCommitMode && requiredChecklist.length ?
                            <CreateLeadRequiredChecklistRow
                                items={requiredChecklist}
                                className="mb-3"
                                locationPicker={{
                                    value: values.location_id ?? "",
                                    onChange: (next) => onFieldChange("location_id", next),
                                    options: locationCascade.siteOptions,
                                }}
                            />
                        :   null}
                        {commitPreview ?
                            <CreateLeadCommitPreviewPanel
                                preview={commitPreview}
                                className={householdCommitMode ? "mb-0" : "mb-3"}
                            />
                        :   null}
                        {!householdCommitMode && !household ?
                            <ActionWorkspaceGatherFields
                                sections={sections}
                                values={values}
                                onChange={onFieldChange}
                                platformRequiredKeys={requiredPayloadKeys}
                                fieldConfidence={fieldConfidence}
                                layout="unified"
                                dataTestIdPrefix="create-lead-gather"
                            />
                        :   null}
                    </div>
                :   <div className="space-y-2" data-testid="create-lead-draft-fields">
                        {household && !analyzing ?
                            <>
                                {renderHouseholdReview("mb-2")}
                                {commitPreview ?
                                    <CreateLeadCommitPreviewPanel preview={commitPreview} className="mb-2" />
                                :   null}
                            </>
                        :   null}
                        {findings.map((finding) => (
                            <DraftFieldCard
                                key={finding.id}
                                finding={finding}
                                onValueChange={
                                    finding.source === "suggestion" ? onSuggestionValueChange : undefined
                                }
                                onToggle={finding.source === "suggestion" ? onToggleSuggestion : undefined}
                            />
                        ))}
                    </div>
                }
            </div>

            {!householdCommitMode && validationIssues.length > 0 ?
                <div
                    className="shrink-0 border-t border-alloy-stone/10 px-3 py-2"
                    data-testid="create-lead-missing-required"
                    role="alert"
                >
                    <p className="text-[11px] text-amber-950">{validationIssues.join(" · ")}</p>
                </div>
            : householdCommitMode ? null : (
                <div className="shrink-0 border-t border-alloy-stone/8 px-3 py-2">
                    <p className="text-[11px] text-alloy-midnight/40">
                        {draftEditMode ?
                            "High-confidence values are applied automatically after analyze."
                        :   "Answers appear here as material is analyzed."}
                    </p>
                </div>
            )}
        </section>
    );
}
