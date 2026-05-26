import type { OperatorReviewWarningV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { CaseFileSection } from "@/components/forms/review/CaseFileSection";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import {
    FORMS_CASE_FILE_SECTION,
    FORMS_REVIEW_EMPTY,
    warningKindPresentationLabel,
    warningPresentationTone,
} from "@/lib/forms/review/formsReviewPresentation";
import { opBody, opGroupedSurface, opReviewHintRow } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    warnings: OperatorReviewWarningV1[];
};

export function WhatChangedPanel({ warnings }: Props) {
    if (warnings.length === 0) {
        return (
            <CaseFileSection
                id={FORMS_CASE_FILE_SECTION.whatChanged}
                title="What changed"
                variant="subtle"
                description="Submitted answers compared with known CRM context at launch."
            >
                <p className={opBody}>{FORMS_REVIEW_EMPTY.noWarnings}</p>
            </CaseFileSection>
        );
    }

    return (
        <CaseFileSection
            id={FORMS_CASE_FILE_SECTION.whatChanged}
            title="What changed"
            variant="subtle"
            description="Submitted answers differ from what was already on file — review before approving."
        >
            <ul className={opGroupedSurface} data-testid="what-changed-list">
                {warnings.map((w, i) => (
                    <li key={`${w.kind}-${i}`} className={opReviewHintRow}>
                        <FormsReviewBadge
                            label={warningKindPresentationLabel(w.kind)}
                            tone={warningPresentationTone(w.kind)}
                            className="mt-0.5 shrink-0"
                        />
                        <span className="min-w-0 flex-1">{w.message}</span>
                    </li>
                ))}
            </ul>
        </CaseFileSection>
    );
}
