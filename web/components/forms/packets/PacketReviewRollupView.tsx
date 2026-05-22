"use client";

import { useCallback, useState } from "react";
import clsx from "clsx";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { validateFormSchema } from "@/lib/forms/schema";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { formatShortDate } from "@/lib/forms/packets/documentProvenanceDisplay";
import {
    BosReviewSummaryPlaceholder,
    CaseFileSection,
    FormsArtifactBadge,
    FormsProvenanceLine,
    FormsReviewBadge,
    FormsTechnicalDetailStack,
    TechnicalDetailDisclosure,
    TechnicalDetailField,
    TechnicalDetailFieldList,
    TechnicalDetailJsonBlock,
    TechnicalDetailMonospaceValue,
} from "@/components/forms/review";
import { FORMS_TECHNICAL_DISCLOSURE } from "@/lib/forms/review/formsReviewTechnicalDisclosure";
import {
    FORMS_CASE_FILE_SECTION,
    FORMS_REVIEW_EMPTY,
    operatorReviewStatusLabel,
    operatorReviewStatusTone,
    packetSessionStatusLabel,
    packetSessionStatusTone,
} from "@/lib/forms/review/formsReviewPresentation";
import {
    formsCaseFileActionLink,
    formsCaseFileAnswerSurface,
    formsCaseFileGroupedRow,
    formsCaseFileGroupedSurface,
    formsCaseFileMetaText,
    formsCaseFileRegionTitle,
    formsCaseFileStack,
    formsCaseFileStackCompact,
} from "@/lib/forms/review/formsReviewClassTokens";

export type PacketReviewTechnicalDetails = {
    launch_context: unknown;
    crm_snapshot: unknown;
    shared_values: unknown;
    /** Operator-secondary identifiers (collapsed by default). */
    identifiers?: {
        packet_session_id?: string;
        opportunity_id?: string | null;
        customer_id?: string | null;
        recipient_person_id?: string | null;
        packet_definition_key?: string | null;
    };
};

type Props = {
    rollup: PacketReviewRollupV1;
    technicalDetails?: PacketReviewTechnicalDetails | null;
    /** `page` — full console; `modal` — denser spacing */
    placement?: "page" | "modal";
    /** Review actions slot (approve / reject / needs correction) rendered after case file */
    reviewActionsSlot?: React.ReactNode;
};

async function openDocumentSignedUrl(docId: string): Promise<string | null> {
    const res = await fetch(`/api/admin/documents/${encodeURIComponent(docId)}/signed-url`, {
        credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signedUrl?: string; error?: string };
    if (!res.ok || !json.ok || !json.signedUrl) {
        return json.error ?? `Could not open file (${res.status})`;
    }
    window.open(json.signedUrl, "_blank", "noopener,noreferrer");
    return null;
}

export function PacketReviewRollupView({
    rollup,
    technicalDetails,
    placement = "page",
    reviewActionsSlot,
}: Props) {
    const compact = placement === "modal";
    const [openingDocId, setOpeningDocId] = useState<string | null>(null);
    const [openDocErr, setOpenDocErr] = useState<string | null>(null);

    const onOpenPdf = useCallback(async (docId: string) => {
        setOpenDocErr(null);
        setOpeningDocId(docId);
        try {
            const err = await openDocumentSignedUrl(docId);
            if (err) setOpenDocErr(err);
        } catch (e) {
            setOpenDocErr(e instanceof Error ? e.message : "Failed to open document");
        } finally {
            setOpeningDocId(null);
        }
    }, []);

    const ctx = rollup.enrollment_context;
    const prog = rollup.progress;
    const hasLinkageAttention =
        rollup.linkage_summary.any_intake_needs_review || rollup.linkage_summary.steps_missing_crm_fk > 0;

    return (
        <div className={clsx(compact ? formsCaseFileStackCompact : formsCaseFileStack, compact && "text-[13px]")}>
            <CaseFileSection
                id={FORMS_CASE_FILE_SECTION.intakeContext}
                title="Intake context"
                variant="context"
                description="Who this packet is for and how it was launched."
            >
                <ul className="list-disc space-y-1 pl-5 text-sm text-alloy-midnight/85">
                    <li>
                        <span className="font-medium">Packet:</span> {rollup.packet_definition.name}
                        {rollup.packet_definition.key ?
                            <span className="text-alloy-midnight/55"> ({rollup.packet_definition.key})</span>
                        : null}
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">Session:</span>
                        <FormsReviewBadge
                            label={packetSessionStatusLabel(rollup.status)}
                            tone={packetSessionStatusTone(rollup.status)}
                        />
                        <span className="text-alloy-midnight/50">·</span>
                        <span className="font-medium">Review:</span>
                        <FormsReviewBadge
                            label={operatorReviewStatusLabel(rollup.operator_review.status)}
                            tone={operatorReviewStatusTone(rollup.operator_review.status)}
                        />
                    </li>
                    <li>
                        <span className="font-medium">Progress:</span> {prog.submitted_steps} of {prog.total_steps}{" "}
                        steps submitted
                    </li>
                    {ctx.launch_surface === "crm_opportunity" ?
                        <li>
                            <span className="font-medium">Launch:</span> CRM opportunity packet link
                        </li>
                    : null}
                    {ctx.opportunity_label ?
                        <li>
                            <span className="font-medium">Opportunity:</span> {ctx.opportunity_label}
                        </li>
                    : null}
                    {ctx.customer_label ?
                        <li>
                            <span className="font-medium">Customer:</span> {ctx.customer_label}
                        </li>
                    : null}
                </ul>
            </CaseFileSection>

            <BosReviewSummaryPlaceholder />

            {hasLinkageAttention ?
                <CaseFileSection
                    id={FORMS_CASE_FILE_SECTION.needsAttention}
                    title="Needs attention"
                    variant="attention"
                    description="Resolve linkage before treating review as complete."
                >
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                        {rollup.linkage_summary.any_intake_needs_review ?
                            <li>One or more steps need intake / linkage review.</li>
                        : null}
                        {rollup.linkage_summary.steps_missing_crm_fk > 0 ?
                            <li>
                                {rollup.linkage_summary.steps_missing_crm_fk} submitted step(s) missing CRM link on
                                submission.
                            </li>
                        : null}
                    </ul>
                    <ul className="mt-2 space-y-1 text-xs">
                        {rollup.linkage_summary.steps
                            .filter((s) => s.intake_needs_review || !s.has_crm_fk)
                            .map((s) => (
                                <li key={s.sequence_index}>
                                    Step {s.sequence_index + 1}: {s.form_name}
                                    {s.admin_submission_path ?
                                        <>
                                            {" — "}
                                            <a
                                                href={s.admin_submission_path}
                                                className={formsCaseFileActionLink}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Fix linkage
                                            </a>
                                        </>
                                    : null}
                                </li>
                            ))}
                    </ul>
                </CaseFileSection>
            : null}

            {rollup.operator_review.warnings.length > 0 ?
                <CaseFileSection
                    id={FORMS_CASE_FILE_SECTION.whatChanged}
                    title="What changed"
                    variant="attention"
                    description="Hints from submitted values vs known CRM context."
                >
                    <ul className="list-disc space-y-1 pl-5 text-sm text-alloy-midnight/85">
                        {rollup.operator_review.warnings.map((w, i) => (
                            <li key={i}>{w.message}</li>
                        ))}
                    </ul>
                </CaseFileSection>
            : null}

            <section id={FORMS_CASE_FILE_SECTION.submittedForms}>
                <h2 className={formsCaseFileRegionTitle}>Submitted forms</h2>
                {rollup.steps.length === 0 ?
                    <p className={clsx("mt-2", formsCaseFileMetaText)}>{FORMS_REVIEW_EMPTY.noSteps}</p>
                :   <ul className="mt-2 space-y-4">
                        {rollup.steps.map((step) => {
                            let schema = null;
                            let payload: FormPayload = { values: {}, groups: {}, signatures: {} };
                            if (step.answer_view) {
                                try {
                                    schema = validateFormSchema(step.answer_view.schema_json);
                                    const raw = step.answer_view.payload;
                                    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
                                        payload = raw as FormPayload;
                                    }
                                } catch {
                                    schema = null;
                                }
                            }

                            return (
                                <li
                                    key={step.session_item_id}
                                    className="rounded-lg border border-admin-border bg-white px-4 py-3"
                                >
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <h3 className="text-sm font-medium text-alloy-midnight">
                                            Step {step.sequence_index + 1}: {step.form_name}
                                        </h3>
                                        <FormsArtifactBadge
                                            kind={step.artifact.kind}
                                            label={
                                                step.artifact.kind === "generated_pdf" ||
                                                step.artifact.kind === "submitted_record" ?
                                                    undefined
                                                :   step.artifact.label
                                            }
                                        />
                                    </div>
                                    <p className={clsx("mt-1", formsCaseFileMetaText)}>
                                        {step.version_number != null ? `Version ${step.version_number}` : null}
                                        {step.submitted_at ?
                                            `${step.version_number != null ? " · " : ""}Submitted ${formatShortDate(step.submitted_at)}`
                                        :   null}
                                    </p>

                                    {step.intake_meta?.intake_needs_review ?
                                        <p className="mt-2 text-xs text-alloy-ember">
                                            Intake needs review
                                            {step.intake_meta.intake_review_reason ?
                                                `: ${step.intake_meta.intake_review_reason}`
                                            :   ""}
                                        </p>
                                    : null}

                                    <div className="mt-3">
                                        {schema ?
                                            <div className={formsCaseFileAnswerSurface}>
                                                <FormEngineRenderer
                                                    schema={schema}
                                                    payload={payload}
                                                    onChange={() => {}}
                                                    mode="readonly"
                                                    optionValuesByFieldId={step.answer_view?.option_values_by_field_id}
                                                />
                                            </div>
                                        : step.submission_status === "submitted" ?
                                            <p className={formsCaseFileMetaText}>
                                                Answers unavailable (schema could not be loaded).{" "}
                                                {step.artifact.admin_submission_path ?
                                                    <a
                                                        href={step.artifact.admin_submission_path}
                                                        className={formsCaseFileActionLink}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open submission
                                                    </a>
                                                : null}
                                            </p>
                                        :   <p className={formsCaseFileMetaText}>Not submitted yet.</p>
                                        }
                                    </div>

                                    {(step.artifact.kind === "generated_pdf" && step.artifact.documents.length > 0) ||
                                    (step.artifact.kind === "submitted_record" && step.artifact.admin_submission_path) ||
                                    step.artifact.kind === "pending" ||
                                    step.artifact.kind === "not_started" ?
                                        <div className="mt-3 border-t border-admin-border pt-3">
                                            {step.artifact.kind === "generated_pdf" && step.artifact.documents.length > 0 ?
                                                <ul className="space-y-1">
                                                    {step.artifact.documents.map((doc) => (
                                                        <li key={doc.id}>
                                                            <button
                                                                type="button"
                                                                className={clsx(
                                                                    formsCaseFileActionLink,
                                                                    "disabled:opacity-50"
                                                                )}
                                                                disabled={openingDocId === doc.id}
                                                                onClick={() => void onOpenPdf(doc.id)}
                                                            >
                                                                {openingDocId === doc.id ?
                                                                    "Opening…"
                                                                :   doc.name ?? "Open PDF"}
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            : step.artifact.kind === "submitted_record" && step.artifact.admin_submission_path ?
                                                <a
                                                    href={step.artifact.admin_submission_path}
                                                    className={formsCaseFileActionLink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    View submission record
                                                </a>
                                            : step.artifact.kind === "pending" || step.artifact.kind === "not_started" ?
                                                <p className={formsCaseFileMetaText}>{step.artifact.label}</p>
                                            :   null}
                                            <p className={clsx("mt-1.5", formsCaseFileMetaText)}>
                                                Provenance and artifact types are listed under Documents &amp; records.
                                            </p>
                                        </div>
                                    :   null}
                                </li>
                            );
                        })}
                    </ul>
                }
            </section>

            <section id={FORMS_CASE_FILE_SECTION.documents}>
                <h2 className={formsCaseFileRegionTitle}>Documents & records</h2>
                {rollup.documents_index.length === 0 ?
                    <p className={clsx("mt-2", formsCaseFileMetaText)}>{FORMS_REVIEW_EMPTY.noDocuments}</p>
                :   <ul className={clsx("mt-2", formsCaseFileGroupedSurface)}>
                        {rollup.documents_index.map((entry) => (
                            <li
                                key={`${entry.kind}-${entry.form_submission_id}-${entry.document_id ?? "rec"}`}
                                className={formsCaseFileGroupedRow}
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-alloy-midnight">{entry.title}</span>
                                    <FormsArtifactBadge kind={entry.kind} />
                                </div>
                                <FormsProvenanceLine provenance={entry.provenance} className="mt-1" />
                                <div className="mt-1.5 flex flex-wrap gap-2">
                                    <a
                                        href={entry.admin_links.submission_path}
                                        className={formsCaseFileActionLink}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Submission
                                    </a>
                                    {entry.document_id ?
                                        <button
                                            type="button"
                                            className={clsx(formsCaseFileActionLink, "disabled:opacity-50")}
                                            disabled={openingDocId === entry.document_id}
                                            onClick={() => void onOpenPdf(entry.document_id!)}
                                        >
                                            Open PDF
                                        </button>
                                    : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                }
            </section>

            {openDocErr ?
                <p className="text-xs text-alloy-ember" role="alert">
                    {openDocErr}
                </p>
            : null}

            {technicalDetails ?
                <FormsTechnicalDetailStack>
                    <TechnicalDetailDisclosure
                        title={FORMS_TECHNICAL_DISCLOSURE.technicalDetails.title}
                        helperText={FORMS_TECHNICAL_DISCLOSURE.technicalDetails.helper}
                    >
                        {technicalDetails.identifiers ?
                            <TechnicalDetailFieldList>
                                {technicalDetails.identifiers.packet_session_id ?
                                    <TechnicalDetailField label="Packet session id" fullWidth>
                                        <TechnicalDetailMonospaceValue>
                                            {technicalDetails.identifiers.packet_session_id}
                                        </TechnicalDetailMonospaceValue>
                                    </TechnicalDetailField>
                                : null}
                                {technicalDetails.identifiers.packet_definition_key ?
                                    <TechnicalDetailField label="Packet definition key">
                                        <TechnicalDetailMonospaceValue>
                                            {technicalDetails.identifiers.packet_definition_key}
                                        </TechnicalDetailMonospaceValue>
                                    </TechnicalDetailField>
                                : null}
                                {technicalDetails.identifiers.opportunity_id ?
                                    <TechnicalDetailField label="Opportunity id" fullWidth>
                                        <TechnicalDetailMonospaceValue>
                                            {technicalDetails.identifiers.opportunity_id}
                                        </TechnicalDetailMonospaceValue>
                                    </TechnicalDetailField>
                                : null}
                                {technicalDetails.identifiers.customer_id ?
                                    <TechnicalDetailField label="Customer id" fullWidth>
                                        <TechnicalDetailMonospaceValue>
                                            {technicalDetails.identifiers.customer_id}
                                        </TechnicalDetailMonospaceValue>
                                    </TechnicalDetailField>
                                : null}
                                {technicalDetails.identifiers.recipient_person_id ?
                                    <TechnicalDetailField label="Recipient person id" fullWidth>
                                        <TechnicalDetailMonospaceValue>
                                            {technicalDetails.identifiers.recipient_person_id}
                                        </TechnicalDetailMonospaceValue>
                                    </TechnicalDetailField>
                                : null}
                            </TechnicalDetailFieldList>
                        : null}
                        {rollup.steps.some((s) => s.item_status) ?
                            <div className="mt-3">
                                <TechnicalDetailJsonBlock
                                    title="Step item status"
                                    subtitle="Per-step execution state from packet session items."
                                    value={Object.fromEntries(
                                        rollup.steps.map((s) => [
                                            `step_${s.sequence_index + 1}`,
                                            { item_status: s.item_status, form_submission_id: s.form_submission_id },
                                        ])
                                    )}
                                />
                            </div>
                        : null}
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <TechnicalDetailJsonBlock title="Launch context" value={technicalDetails.launch_context} />
                            <TechnicalDetailJsonBlock title="CRM snapshot" value={technicalDetails.crm_snapshot} />
                        </div>
                        <TechnicalDetailJsonBlock title="Shared values" value={technicalDetails.shared_values} />
                    </TechnicalDetailDisclosure>
                </FormsTechnicalDetailStack>
            : null}

            {reviewActionsSlot ?
                <div id={FORMS_CASE_FILE_SECTION.reviewActions} className="border-t border-admin-border pt-4">
                    {reviewActionsSlot}
                </div>
            : null}
        </div>
    );
}
