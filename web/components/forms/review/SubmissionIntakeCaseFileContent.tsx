"use client";

import clsx from "clsx";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import PrimaryButton from "@/components/PrimaryButton";
import SecondaryButton from "@/components/SecondaryButton";
import CrmEntitySearchPicker from "@/components/forms/admin/CrmEntitySearchPicker";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import {
    BosReviewSummaryPlaceholder,
    CaseFileSection,
    IntakeCaseFileLayout,
    SubmissionCaseFileHeader,
    SubmissionReviewTechnicalPanel,
} from "@/components/forms/review";
import type { BosSubmissionReviewContext } from "@/components/forms/review/BosReviewSummaryPlaceholder";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormLaunchContextFields } from "@/lib/forms/formContextMode";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import type {
    EntityConnectionRow,
    PublicLinkIntakeDebug,
    SubmissionIntakeSection,
} from "@/lib/forms/submissionOutcomeSummary";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import {
    opActionLink,
    opAnswerSurface,
    opBody,
    opContextLabel,
    opContextValue,
    opDivider,
    opGroupedRowInner,
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opTechnicalSurface,
} from "@/lib/operational/ui/operationalVisualTokens";

export type SubmissionIntakeLinkedDoc = {
    role: string;
    junction_created_at: string;
    document: {
        id: string;
        name: string | null;
        original_filename: string | null;
        document_type: string | null;
        status: string | null;
        created_at: string | null;
    };
};

export type SubmissionIntakeCaseFileRow = {
    id: string;
    form_definition_id: string;
    form_definition_version_id: string;
    status: string;
    payload: FormPayload;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    created_via_public_link_id: string | null;
    created_at: string;
    submitted_at: string | null;
    linked_documents: SubmissionIntakeLinkedDoc[];
    public_link_intake_debug?: PublicLinkIntakeDebug | null;
};

type CrmEntityPick = { id: string; label: string } | null;

export type SubmissionIntakeCaseFileContentProps = {
    row: SubmissionIntakeCaseFileRow;
    schema: FormSchemaV1 | null;
    viewerTimezone: string;
    canMutate: boolean;
    lifecycle: { headline: string; notes: string[] };
    entityRows: EntityConnectionRow[];
    intakeSection: SubmissionIntakeSection | null;
    intakeNeedsAttention: boolean;
    intakeReviewedAt: string | null;
    linkageCalloutVisible: boolean;
    linkageCalloutReasons: string[];
    showLinkageWorkflowSection: boolean;
    needsConfirmLinkage: boolean;
    docGenBlocked: { blocked: boolean; reason?: string };
    documentOutcome: { headline: string; bullets: string[] };
    nextSteps: string[];
    bosSubmissionContext: BosSubmissionReviewContext | null;
    launchContext: FormLaunchContextFields;
    hasLaunchContextDisplay: boolean;
    confirmBusy: boolean;
    confirmErr: string | null;
    onConfirmLinkage: () => void;
    manualBusy: boolean;
    manualErr: string | null;
    onApplyManualLinks: () => void;
    manualPerson: string;
    onManualPersonChange: (value: string) => void;
    manualCustomer: string;
    onManualCustomerChange: (value: string) => void;
    manualMember: string;
    onManualMemberChange: (value: string) => void;
    manualOpp: string;
    onManualOppChange: (value: string) => void;
    pickPerson: CrmEntityPick;
    onPickPerson: (pick: CrmEntityPick) => void;
    pickCustomer: CrmEntityPick;
    onPickCustomer: (pick: CrmEntityPick) => void;
    pickMember: CrmEntityPick;
    onPickMember: (pick: CrmEntityPick) => void;
    pickOpp: CrmEntityPick;
    onPickOpp: (pick: CrmEntityPick) => void;
    genBusy: boolean;
    genErr: string | null;
    genMsg: string | null;
    onGenerateDocument: () => void;
    onOpenDrawer: (params: { type: AdminDrawerEntityType; id: string }) => void;
};

function ConnectionRow({
    row,
    onOpen,
}: {
    row: EntityConnectionRow;
    onOpen?: () => void;
}) {
    const linked = row.recordId != null;
    return (
        <div
            className={clsx(
                "flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
                opGroupedRowInner
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={opContextLabel}>{row.label}</span>
                    <span className={linked ? "font-medium text-alloy-pine" : opMetadata}>
                        {linked ? "Linked" : "Not linked"}
                    </span>
                </div>
                <p className={clsx("mt-0.5", opMutedMeta)}>{row.hint}</p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                {linked && onOpen ?
                    <button type="button" className={opActionLink} onClick={onOpen}>
                        Open
                    </button>
                : null}
            </div>
        </div>
    );
}

function entityRowOpenHandler(
    key: string,
    recordId: string | null,
    onOpenDrawer: SubmissionIntakeCaseFileContentProps["onOpenDrawer"]
): (() => void) | undefined {
    if (!recordId) return undefined;
    switch (key) {
        case "person":
            return () => onOpenDrawer({ type: "persons", id: recordId });
        case "customer":
            return () => onOpenDrawer({ type: "customers", id: recordId });
        case "customer_member":
            return () => onOpenDrawer({ type: "customer_members", id: recordId });
        case "opportunity":
            return () => onOpenDrawer({ type: "opportunities", id: recordId });
        default:
            return undefined;
    }
}

export function SubmissionIntakeCaseFileContent({
    row,
    schema,
    viewerTimezone,
    canMutate,
    lifecycle,
    entityRows,
    intakeSection,
    intakeNeedsAttention,
    intakeReviewedAt,
    linkageCalloutVisible,
    linkageCalloutReasons,
    showLinkageWorkflowSection,
    needsConfirmLinkage,
    docGenBlocked,
    documentOutcome,
    nextSteps,
    bosSubmissionContext,
    launchContext,
    hasLaunchContextDisplay,
    confirmBusy,
    confirmErr,
    onConfirmLinkage,
    manualBusy,
    manualErr,
    onApplyManualLinks,
    manualPerson,
    onManualPersonChange,
    manualCustomer,
    onManualCustomerChange,
    manualMember,
    onManualMemberChange,
    manualOpp,
    onManualOppChange,
    pickPerson,
    onPickPerson,
    pickCustomer,
    onPickCustomer,
    pickMember,
    onPickMember,
    pickOpp,
    onPickOpp,
    genBusy,
    genErr,
    genMsg,
    onGenerateDocument,
    onOpenDrawer,
}: SubmissionIntakeCaseFileContentProps) {
    return (
        <IntakeCaseFileLayout
            header={
                <SubmissionCaseFileHeader
                    formName={schema?.title ?? "Form submission"}
                    submissionStatus={row.status}
                    lifecycleHeadline={lifecycle.headline}
                    submittedAt={row.submitted_at}
                    createdAt={row.created_at}
                    viewerTimezone={viewerTimezone}
                />
            }
            intakeContext={
                <CaseFileSection
                    id={FORMS_CASE_FILE_SECTION.intakeContext}
                    title="Intake & records"
                    variant={intakeNeedsAttention ? "attention" : "default"}
                >
                    {lifecycle.notes.length ?
                        <ul className={clsx("list-disc space-y-1 pl-5", opBody)}>
                            {lifecycle.notes.map((n, i) => (
                                <li key={`lc-${i}`}>{n}</li>
                            ))}
                        </ul>
                    : null}
                    {intakeReviewedAt ?
                        <p className={clsx(lifecycle.notes.length ? "mt-3" : undefined, opMetadata)}>
                            Intake review recorded{" "}
                            {formatDateTimeForUserDisplay(intakeReviewedAt, viewerTimezone)}
                        </p>
                    : null}

                    {intakeSection ?
                        <div
                            className={clsx(
                                "space-y-2",
                                lifecycle.notes.length || intakeReviewedAt ? "mt-4" : undefined,
                                intakeNeedsAttention &&
                                    "rounded-lg bg-alloy-ember/[0.04] px-3 py-3 ring-1 ring-inset ring-alloy-ember/15 sm:px-4"
                            )}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={opMetadata}>Intake &amp; record linking</span>
                                <StatusBadge
                                    label={intakeSection.statusLabel}
                                    variant={
                                        intakeSection.statusLabel === "Linked"
                                            ? "success"
                                            : intakeSection.statusLabel === "Skipped"
                                              ? "neutral"
                                              : intakeSection.statusLabel === "Error"
                                                ? "error"
                                                : intakeSection.statusLabel === "No record"
                                                  ? "neutral"
                                                  : "warning"
                                    }
                                />
                            </div>
                            <p className={clsx("font-medium", opContextValue)}>{intakeSection.strategyLabel}</p>
                            <ul className={clsx("list-disc space-y-1 pl-5", opBody)}>
                                {intakeSection.detailLines.map((n, i) => (
                                    <li key={`intake-${i}`}>{n}</li>
                                ))}
                            </ul>
                            {intakeNeedsAttention ?
                                <p className="text-sm font-medium text-alloy-ember">
                                    Needs review — check this section before using Generate document. Link configuration
                                    and launch routing are under Review diagnostics below.
                                </p>
                            : null}
                        </div>
                    : null}

                    <div className={clsx(intakeSection ? "mt-4" : undefined, "space-y-2")}>
                        <p className={opMetadata}>Records connected</p>
                        <p className={opMutedMeta}>
                            CRM links appear when intake or other flows attach them. “Not linked” is normal for early
                            drafts.
                        </p>
                        <div className={opGroupedSurface}>
                            {entityRows.map((er) => (
                                <ConnectionRow
                                    key={er.key}
                                    row={er}
                                    onOpen={entityRowOpenHandler(er.key, er.recordId, onOpenDrawer)}
                                />
                            ))}
                        </div>
                    </div>
                </CaseFileSection>
            }
            bosSummary={<BosReviewSummaryPlaceholder submissionContext={bosSubmissionContext} />}
            needsAttention={
                linkageCalloutVisible ?
                    <CaseFileSection
                        id={FORMS_CASE_FILE_SECTION.needsAttention}
                        title="Needs attention"
                        variant="attention"
                        description="Resolve linkage before generating documents or closing this review."
                    >
                        <p className={opBody}>
                            Record linkage needs review. Confirm or correct CRM links below — document generation stays
                            blocked until Alloy can attach safely.
                        </p>
                        {linkageCalloutReasons.length ?
                            <ul className={clsx("mt-3 list-disc space-y-1.5 pl-5", opBody)}>
                                {linkageCalloutReasons.map((line, i) => (
                                    <li key={`lr-${i}`}>{line}</li>
                                ))}
                            </ul>
                        : null}
                    </CaseFileSection>
                : null
            }
            submittedForms={
                <CaseFileSection
                    id={FORMS_CASE_FILE_SECTION.submittedForms}
                    title="Submitted form"
                    description="Read-only view of what was submitted (fields depend on published schema)."
                >
                    {!schema ?
                        <p className={opMetadata}>
                            Schema unavailable — expand Technical details below for the raw payload.
                        </p>
                    :   <div className={opAnswerSurface}>
                            <FormEngineRenderer
                                schema={schema}
                                payload={row.payload}
                                onChange={() => {}}
                                mode="readonly"
                            />
                        </div>
                    }
                </CaseFileSection>
            }
            documents={
                <CaseFileSection id={FORMS_CASE_FILE_SECTION.documents} title="Outputs">
                    <p className={clsx("font-medium", opContextValue)}>{documentOutcome.headline}</p>
                    <ul className={clsx("mt-2 list-disc space-y-1 pl-5", opBody)}>
                        {documentOutcome.bullets.map((b, i) => (
                            <li key={`doc-outcome-${i}`}>{b}</li>
                        ))}
                    </ul>

                    {row.linked_documents.length === 0 ?
                        <p className={clsx("mt-3", opMetadata)}>No generated documents yet.</p>
                    :   <ul className={clsx("mt-3 space-y-2", opBody)}>
                            {row.linked_documents.map((L) => (
                                <li key={`${L.role}-${L.document.id}`} className="flex flex-wrap items-center gap-2">
                                    <StatusBadge label={L.role} variant="neutral" />
                                    <span>
                                        {L.document.name?.trim() ||
                                            L.document.original_filename?.trim() ||
                                            "Untitled"}
                                    </span>
                                    <button
                                        type="button"
                                        className={opActionLink}
                                        onClick={() => onOpenDrawer({ type: "documents", id: L.document.id })}
                                    >
                                        Open
                                    </button>
                                </li>
                            ))}
                        </ul>
                    }

                    {row.status === "submitted" ?
                        <div className={clsx("mt-4 pt-4", opDivider)}>
                            {!canMutate ?
                                <p className={opMutedMeta}>Admin role required to generate PDF.</p>
                            :   <>
                                    {docGenBlocked.blocked && docGenBlocked.reason ?
                                        <p className="mb-3 rounded-md border border-alloy-ember/25 bg-alloy-ember/[0.06] px-3 py-2 text-sm text-alloy-ember">
                                            {docGenBlocked.reason}
                                        </p>
                                    : null}
                                    <PrimaryButton
                                        type="button"
                                        className="!px-3 !py-2 text-sm"
                                        disabled={genBusy || docGenBlocked.blocked}
                                        onClick={onGenerateDocument}
                                    >
                                        {genBusy ? "Generating…" : "Generate document (PDF stub)"}
                                    </PrimaryButton>
                                    {genErr ? <p className="mt-2 text-sm text-alloy-ember">{genErr}</p> : null}
                                    {genMsg ? <p className={clsx("mt-2", opBody)}>{genMsg}</p> : null}
                                    <p className={clsx("mt-2", opMutedMeta)}>
                                        Creates or reuses a documents row using this version&apos;s{" "}
                                        <code className="font-mono text-[11px]">pdf_mapping_json</code>, then links it to
                                        this submission.
                                    </p>
                                    <p className={clsx("mt-3 leading-relaxed", opMutedMeta)}>
                                        Generated documents live in the Documents system and attach to the selected CRM
                                        parent (person, customer, child member, or opportunity). Future document type /
                                        category controls will decide how they surface across those records — today, open
                                        linked files from this submission or from the Documents drawer.
                                    </p>
                                </>
                            }
                        </div>
                    :   <p className={clsx("mt-3", opMutedMeta)}>Submit the form before generating a document.</p>}
                </CaseFileSection>
            }
            reviewActions={
                <>
                    {showLinkageWorkflowSection ?
                        <CaseFileSection
                            id={FORMS_CASE_FILE_SECTION.reviewActions}
                            title="Record linkage review"
                        >
                            <div data-testid="linkage-workflow-section">
                            <p className={opMetadata}>
                                Use <strong className={opContextLabel}>Confirm</strong> when the CRM rows in &quot;Records
                                connected&quot; are already correct. Use{" "}
                                <strong className={opContextLabel}>Correct linked records</strong> when intake attached
                                the wrong person, household, child, or opportunity.
                            </p>

                            {needsConfirmLinkage ?
                                <div className={clsx("mt-4 px-3 py-3 sm:px-4", opTechnicalSurface)}>
                                    <p className={clsx("font-medium", opContextValue)}>Confirm current linked records</p>
                                    <p className={clsx("mt-1", opMetadata)}>
                                        Intake linked CRM rows but asked for a human check (for example after
                                        auto-creating a child member). If everything above matches the family you expect,
                                        confirm so document generation can continue when a CRM attach parent exists.
                                    </p>
                                    {confirmErr ?
                                        <p className="mt-2 text-sm text-alloy-ember">{confirmErr}</p>
                                    : null}
                                    <div className="mt-3">
                                        <PrimaryButton
                                            type="button"
                                            className="!px-3 !py-2 text-sm"
                                            disabled={confirmBusy}
                                            onClick={onConfirmLinkage}
                                            data-testid="confirm-linkage-primary"
                                        >
                                            {confirmBusy ? "Confirming…" : "Confirm record linkage"}
                                        </PrimaryButton>
                                    </div>
                                </div>
                            : null}

                            <div className={clsx("mt-4 px-3 py-3 sm:px-4", opGroupedSurface)}>
                                <p className={clsx("font-medium", opContextValue)}>Correct linked records</p>
                                <p className={clsx("mt-1 leading-relaxed", opMetadata)}>
                                    Use this if the submission linked to the wrong person, customer, child member, or
                                    opportunity. Search below (org-scoped), then apply. If you already have UUIDs, use
                                    Advanced paste — pasted IDs override search picks for that slot.
                                </p>
                                <p className={clsx("mt-2 leading-relaxed", opMetadata)}>
                                    If <strong className={opContextLabel}>no existing CRM row</strong> is correct,
                                    create the family, child, or opportunity in CRM first, then return here and link this
                                    submission. Alloy does not create new CRM records from this screen yet — see{" "}
                                    <code className="rounded bg-alloy-stone/40 px-1 font-mono text-[11px]">
                                        docs/forms/linkage-review-operator-flow.md
                                    </code>
                                    .
                                </p>

                                {canMutate ?
                                    <>
                                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                            <CrmEntitySearchPicker
                                                label="Person"
                                                entityType="person"
                                                picked={pickPerson}
                                                onPick={(h) => onPickPerson({ id: h.id, label: h.label })}
                                                onClear={() => onPickPerson(null)}
                                                disabled={manualBusy}
                                            />
                                            <CrmEntitySearchPicker
                                                label="Customer (household)"
                                                entityType="customer"
                                                picked={pickCustomer}
                                                onPick={(h) => onPickCustomer({ id: h.id, label: h.label })}
                                                onClear={() => onPickCustomer(null)}
                                                disabled={manualBusy}
                                            />
                                            <CrmEntitySearchPicker
                                                label="Customer member (child)"
                                                entityType="customer_member"
                                                picked={pickMember}
                                                onPick={(h) => onPickMember({ id: h.id, label: h.label })}
                                                onClear={() => onPickMember(null)}
                                                disabled={manualBusy}
                                            />
                                            <CrmEntitySearchPicker
                                                label="Opportunity"
                                                entityType="opportunity"
                                                picked={pickOpp}
                                                onPick={(h) => onPickOpp({ id: h.id, label: h.label })}
                                                onClear={() => onPickOpp(null)}
                                                disabled={manualBusy}
                                            />
                                        </div>

                                        <details className="mt-4 rounded-md border border-dashed border-alloy-midnight/15 bg-alloy-stone/20 px-3 py-2">
                                            <summary className={clsx("cursor-pointer", opActionLink)}>
                                                Advanced — manual CRM record IDs (UUID paste)
                                            </summary>
                                            <p className={clsx("mt-2", opMutedMeta)}>
                                                Overrides search selection for the same row when this field is non-empty.
                                                Leave blank to keep the current link (or use search pick only). Clearing a
                                                link still requires sending{" "}
                                                <code className="font-mono text-[11px]">null</code> via the API.
                                            </p>
                                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                <label className={clsx("block", opMutedMeta)}>
                                                    Person id
                                                    <input
                                                        className="mt-1 w-full rounded border border-alloy-midnight/15 px-2 py-1.5 font-mono text-xs text-alloy-midnight"
                                                        value={manualPerson}
                                                        onChange={(e) => onManualPersonChange(e.target.value)}
                                                        placeholder={row.person_id ?? "leave blank to keep"}
                                                        autoComplete="off"
                                                        data-testid="manual-link-person"
                                                    />
                                                </label>
                                                <label className={clsx("block", opMutedMeta)}>
                                                    Customer id
                                                    <input
                                                        className="mt-1 w-full rounded border border-alloy-midnight/15 px-2 py-1.5 font-mono text-xs text-alloy-midnight"
                                                        value={manualCustomer}
                                                        onChange={(e) => onManualCustomerChange(e.target.value)}
                                                        placeholder={row.customer_id ?? "leave blank to keep"}
                                                        autoComplete="off"
                                                    />
                                                </label>
                                                <label className={clsx("block", opMutedMeta)}>
                                                    Customer member (child) id
                                                    <input
                                                        className="mt-1 w-full rounded border border-alloy-midnight/15 px-2 py-1.5 font-mono text-xs text-alloy-midnight"
                                                        value={manualMember}
                                                        onChange={(e) => onManualMemberChange(e.target.value)}
                                                        placeholder={row.customer_member_id ?? "leave blank to keep"}
                                                        autoComplete="off"
                                                    />
                                                </label>
                                                <label className={clsx("block", opMutedMeta)}>
                                                    Opportunity id
                                                    <input
                                                        className="mt-1 w-full rounded border border-alloy-midnight/15 px-2 py-1.5 font-mono text-xs text-alloy-midnight"
                                                        value={manualOpp}
                                                        onChange={(e) => onManualOppChange(e.target.value)}
                                                        placeholder={row.opportunity_id ?? "leave blank to keep"}
                                                        autoComplete="off"
                                                    />
                                                </label>
                                            </div>
                                        </details>

                                        {manualErr ?
                                            <p className="mt-3 text-sm text-alloy-ember">{manualErr}</p>
                                        : null}
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <SecondaryButton
                                                type="button"
                                                className="!px-3 !py-2 text-sm"
                                                disabled={manualBusy}
                                                onClick={onApplyManualLinks}
                                                data-testid="apply-manual-links"
                                            >
                                                {manualBusy ? "Applying…" : "Apply corrected CRM links"}
                                            </SecondaryButton>
                                        </div>
                                    </>
                                :   <p className={clsx("mt-3", opMutedMeta)}>
                                        Admin role is required to paste CRM IDs and correct foreign keys. Ask an admin if
                                        linkage needs to change.
                                    </p>
                                }
                            </div>
                            </div>
                        </CaseFileSection>
                    : null}

                    <CaseFileSection title="Recommended next steps">
                        <ol className={clsx("list-decimal space-y-1.5 pl-5", opBody)}>
                            {nextSteps.map((line, i) => (
                                <li key={`next-${i}`}>{line}</li>
                            ))}
                        </ol>
                    </CaseFileSection>
                </>
            }
            technical={
                <SubmissionReviewTechnicalPanel
                    submissionId={row.id}
                    formDefinitionId={row.form_definition_id}
                    formDefinitionVersionId={row.form_definition_version_id}
                    createdViaPublicLinkId={row.created_via_public_link_id}
                    payload={row.payload}
                    launchContext={launchContext}
                    hasLaunchContextDisplay={hasLaunchContextDisplay}
                    intakeDebug={row.public_link_intake_debug}
                    entityRows={entityRows}
                />
            }
        />
    );
}
