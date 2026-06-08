"use client";

import type { PublicLinkIntakeDebug } from "@/lib/forms/submissionOutcomeSummary";
import type { FormLaunchContextFields } from "@/lib/forms/formContextMode";
import { TechnicalDetailDisclosure, TechnicalDetailJsonBlock } from "@/components/forms/review/TechnicalDetailDisclosure";
import {
    TechnicalDetailField,
    TechnicalDetailFieldList,
    TechnicalDetailMonospaceValue,
} from "@/components/forms/review/TechnicalDetailFieldList";
import { FormsTechnicalDetailStack } from "@/components/forms/review/FormsTechnicalDetailStack";
import { FORMS_TECHNICAL_DISCLOSURE } from "@/lib/forms/review/formsReviewTechnicalDisclosure";
import type { EntityConnectionRow } from "@/lib/forms/submissionOutcomeSummary";
import type { FormPayload } from "@/lib/forms/validateSubmission";

export type SubmissionReviewTechnicalPanelProps = {
    submissionId: string;
    formDefinitionId: string;
    formDefinitionVersionId: string;
    createdViaPublicLinkId: string | null;
    payload: FormPayload;
    launchContext: FormLaunchContextFields;
    hasLaunchContextDisplay: boolean;
    intakeDebug: PublicLinkIntakeDebug | null | undefined;
    entityRows: EntityConnectionRow[];
};

/**
 * Consolidated progressive disclosure for standalone submission review (UX-E).
 * Keeps operator warnings and answers primary; audit data remains one expand away.
 */
export function SubmissionReviewTechnicalPanel({
    submissionId,
    formDefinitionId,
    formDefinitionVersionId,
    createdViaPublicLinkId,
    payload,
    launchContext,
    hasLaunchContextDisplay,
    intakeDebug,
    entityRows,
}: SubmissionReviewTechnicalPanelProps) {
    const linkedRows = entityRows.filter((r) => r.recordId);

    return (
        <FormsTechnicalDetailStack className="mt-6">
            {hasLaunchContextDisplay || intakeDebug || createdViaPublicLinkId ?
                <TechnicalDetailDisclosure
                    title={FORMS_TECHNICAL_DISCLOSURE.reviewDiagnostics.title}
                    helperText={FORMS_TECHNICAL_DISCLOSURE.reviewDiagnostics.helper}
                    data-testid="forms-review-diagnostics-disclosure"
                >
                    {hasLaunchContextDisplay ?
                        <>
                            <p className="text-xs text-alloy-midnight/65">
                                Stamped at draft create from public link metadata (read-only).
                            </p>
                            <TechnicalDetailFieldList className="mt-2">
                                <TechnicalDetailField label="form_context_mode">
                                    <TechnicalDetailMonospaceValue>
                                        {launchContext.form_context_mode ?? "—"}
                                    </TechnicalDetailMonospaceValue>
                                </TechnicalDetailField>
                                <TechnicalDetailField label="source_entity_type">
                                    <TechnicalDetailMonospaceValue>
                                        {launchContext.source_entity_type ?? "—"}
                                    </TechnicalDetailMonospaceValue>
                                </TechnicalDetailField>
                                <TechnicalDetailField label="source_entity_id" fullWidth>
                                    <TechnicalDetailMonospaceValue>
                                        {launchContext.source_entity_id ?? "—"}
                                    </TechnicalDetailMonospaceValue>
                                </TechnicalDetailField>
                                <TechnicalDetailField label="prefill_enabled">
                                    {launchContext.prefill_enabled === undefined ?
                                        "—"
                                    : launchContext.prefill_enabled ?
                                        "Yes"
                                    :   "No"}
                                </TechnicalDetailField>
                                <TechnicalDetailField label="allow_auto_create">
                                    {launchContext.allow_auto_create === undefined ?
                                        "—"
                                    : launchContext.allow_auto_create ?
                                        "Yes"
                                    :   "No"}
                                </TechnicalDetailField>
                            </TechnicalDetailFieldList>
                        </>
                    : null}

                    {intakeDebug ?
                        <TechnicalDetailFieldList className={hasLaunchContextDisplay ? "mt-4" : undefined}>
                            <TechnicalDetailField label="Public link id" fullWidth>
                                <TechnicalDetailMonospaceValue>
                                    {intakeDebug.public_link_id ?? "—"}
                                </TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                            <TechnicalDetailField label="Lead capture / intake">
                                {intakeDebug.lead_capture ? "Yes" : "No"}
                            </TechnicalDetailField>
                            <TechnicalDetailField label="default_vertical_id" fullWidth>
                                <TechnicalDetailMonospaceValue>
                                    {intakeDebug.default_vertical_id ?? "Missing"}
                                </TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                            <TechnicalDetailField label="Auto-create flags" fullWidth>
                                person {intakeDebug.auto_create_person ? "on" : "off"}, customer{" "}
                                {intakeDebug.auto_create_customer ? "on" : "off"}, member{" "}
                                {intakeDebug.auto_create_customer_member ? "on" : "off"}, opp{" "}
                                {intakeDebug.auto_create_opportunity ? "on" : "off"}
                            </TechnicalDetailField>
                            {intakeDebug.link_label ?
                                <TechnicalDetailField label="Link label" fullWidth>
                                    {intakeDebug.link_label}
                                </TechnicalDetailField>
                            : null}
                            {intakeDebug.alloy_admin_preview ?
                                <TechnicalDetailField label="Preview link" fullWidth>
                                    Minted as Admin preview session
                                </TechnicalDetailField>
                            : null}
                            {intakeDebug.form_context_mode ?
                                <TechnicalDetailField label="form_context_mode (link)">
                                    <TechnicalDetailMonospaceValue>{intakeDebug.form_context_mode}</TechnicalDetailMonospaceValue>
                                </TechnicalDetailField>
                            : null}
                            {intakeDebug.source_entity_type ?
                                <TechnicalDetailField label="source_entity_type (link)">
                                    <TechnicalDetailMonospaceValue>
                                        {intakeDebug.source_entity_type}
                                    </TechnicalDetailMonospaceValue>
                                </TechnicalDetailField>
                            : null}
                            {intakeDebug.source_entity_id ?
                                <TechnicalDetailField label="source_entity_id (link)" fullWidth>
                                    <TechnicalDetailMonospaceValue>{intakeDebug.source_entity_id}</TechnicalDetailMonospaceValue>
                                </TechnicalDetailField>
                            : null}
                            {intakeDebug.prefill_enabled !== null && intakeDebug.prefill_enabled !== undefined ?
                                <TechnicalDetailField label="prefill_enabled (link)">
                                    {intakeDebug.prefill_enabled ? "Yes" : "No"}
                                </TechnicalDetailField>
                            : null}
                            {intakeDebug.allow_auto_create !== null && intakeDebug.allow_auto_create !== undefined ?
                                <TechnicalDetailField label="allow_auto_create (link)">
                                    {intakeDebug.allow_auto_create ? "Yes" : "No"}
                                </TechnicalDetailField>
                            : null}
                        </TechnicalDetailFieldList>
                    : createdViaPublicLinkId ?
                        <p className="text-xs text-alloy-midnight/65">
                            Public link on submission:{" "}
                            <TechnicalDetailMonospaceValue>{createdViaPublicLinkId}</TechnicalDetailMonospaceValue> — link
                            metadata could not be loaded.
                        </p>
                    : null}
                </TechnicalDetailDisclosure>
            : null}

            {linkedRows.length > 0 ?
                <TechnicalDetailDisclosure
                    title={FORMS_TECHNICAL_DISCLOSURE.linkageDetails.title}
                    helperText={FORMS_TECHNICAL_DISCLOSURE.linkageDetails.helper}
                    data-testid="forms-linkage-details-disclosure"
                >
                    <TechnicalDetailFieldList>
                        {linkedRows.map((r) => (
                            <TechnicalDetailField key={r.key} label={`${r.label} id`} fullWidth>
                                <TechnicalDetailMonospaceValue>{r.recordId}</TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                        ))}
                    </TechnicalDetailFieldList>
                </TechnicalDetailDisclosure>
            : null}

            <TechnicalDetailDisclosure
                title={FORMS_TECHNICAL_DISCLOSURE.technicalDetails.title}
                helperText={FORMS_TECHNICAL_DISCLOSURE.technicalDetails.helper}
            >
                <TechnicalDetailFieldList>
                    <TechnicalDetailField label="Submission id" fullWidth>
                        <TechnicalDetailMonospaceValue>{submissionId}</TechnicalDetailMonospaceValue>
                    </TechnicalDetailField>
                    <TechnicalDetailField label="Form definition id" fullWidth>
                        <TechnicalDetailMonospaceValue>{formDefinitionId}</TechnicalDetailMonospaceValue>
                    </TechnicalDetailField>
                    <TechnicalDetailField label="Version id" fullWidth>
                        <TechnicalDetailMonospaceValue>{formDefinitionVersionId}</TechnicalDetailMonospaceValue>
                    </TechnicalDetailField>
                    {createdViaPublicLinkId ?
                        <TechnicalDetailField label="Public link id (submission)" fullWidth>
                            <TechnicalDetailMonospaceValue>{createdViaPublicLinkId}</TechnicalDetailMonospaceValue>
                        </TechnicalDetailField>
                    : null}
                </TechnicalDetailFieldList>
                <div className="mt-3">
                    <TechnicalDetailJsonBlock
                        title="Submission payload"
                        subtitle="Raw JSON for support — submitted answers above remain authoritative."
                        value={payload}
                    />
                </div>
            </TechnicalDetailDisclosure>
        </FormsTechnicalDetailStack>
    );
}
