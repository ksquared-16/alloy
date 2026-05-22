"use client";

import clsx from "clsx";
import { FormEngineRenderer } from "@/components/forms/engine/FormEngineRenderer";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { validateFormSchema } from "@/lib/forms/schema";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { formatShortDate } from "@/lib/forms/packets/documentProvenanceDisplay";
import { FormsArtifactBadge } from "@/components/forms/review/FormsArtifactBadge";
import {
    FORMS_CASE_FILE_SECTION,
    FORMS_REVIEW_EMPTY,
} from "@/lib/forms/review/formsReviewPresentation";
import {
    formsCaseFileActionLink,
    formsCaseFileAnswerSurface,
    formsCaseFileMetaText,
    formsCaseFileRegionDescription,
    formsCaseFileRegionTitle,
    formsCaseFileStepCard,
} from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    rollup: PacketReviewRollupV1;
};

export function PacketSubmittedFormsPanel({ rollup }: Props) {
    return (
        <section id={FORMS_CASE_FILE_SECTION.submittedForms}>
            <h2 className={formsCaseFileRegionTitle}>Submitted forms</h2>
            <p className={formsCaseFileRegionDescription}>
                Read-only answers from each packet step — artifacts are listed below.
            </p>
            {rollup.steps.length === 0 ?
                <p className={clsx("mt-2", formsCaseFileMetaText)}>{FORMS_REVIEW_EMPTY.noSteps}</p>
            :   <ul className="mt-3 space-y-3">
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

                        const showArtifactBadge =
                            step.artifact.kind === "generated_pdf" || step.artifact.kind === "submitted_record";

                        return (
                            <li key={step.session_item_id} className={formsCaseFileStepCard}>
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h3 className="text-sm font-medium text-alloy-midnight">
                                        Step {step.sequence_index + 1}: {step.form_name}
                                    </h3>
                                    {showArtifactBadge ?
                                        <FormsArtifactBadge kind={step.artifact.kind} />
                                    :   null}
                                </div>
                                <p className={clsx("mt-0.5", formsCaseFileMetaText)}>
                                    {step.submitted_at ?
                                        `Submitted ${formatShortDate(step.submitted_at)}`
                                    :   "Not submitted"}
                                    {step.version_number != null ? ` · Form version ${step.version_number}` : ""}
                                </p>

                                <div className="mt-2">
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
                                    : step.submission_status === "submitted" && step.artifact.admin_submission_path ?
                                        <p className={formsCaseFileMetaText}>
                                            Answers could not be rendered.{" "}
                                            <a
                                                href={step.artifact.admin_submission_path}
                                                className={formsCaseFileActionLink}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Open submission
                                            </a>
                                        </p>
                                    :   <p className={formsCaseFileMetaText}>Not submitted yet.</p>
                                    }
                                </div>
                            </li>
                        );
                    })}
                </ul>
            }
        </section>
    );
}
