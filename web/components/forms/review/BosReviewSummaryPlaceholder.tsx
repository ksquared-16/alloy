import {
    BOS_REVIEW_SUMMARY_PLACEHOLDER_BODY,
    BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE,
    FORMS_CASE_FILE_SECTION,
} from "@/lib/forms/review/formsReviewPresentation";
import {
    formsCaseFileMetaText,
    formsCaseFileRegionDescription,
    formsCaseFileRegionTitle,
} from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    className?: string;
};

/**
 * Reserved read-only region for P2-5 deterministic insight (no AI calls in UX-G).
 * Calm operational assistant tone — not a chatbot block.
 */
export function BosReviewSummaryPlaceholder({ className }: Props) {
    return (
        <aside
            id={FORMS_CASE_FILE_SECTION.bosSummary}
            data-testid="bos-review-summary-placeholder"
            className={
                className ??
                "rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.04] px-3.5 py-3"
            }
            aria-label={BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE}
        >
            <p className={formsCaseFileRegionTitle}>{BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE}</p>
            <p className={formsCaseFileRegionDescription}>Read-only · no CRM changes</p>
            <p className={`mt-2 ${formsCaseFileMetaText}`}>{BOS_REVIEW_SUMMARY_PLACEHOLDER_BODY}</p>
        </aside>
    );
}
