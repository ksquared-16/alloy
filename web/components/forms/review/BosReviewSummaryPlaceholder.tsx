import clsx from "clsx";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import {
    BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE,
    FORMS_CASE_FILE_SECTION,
} from "@/lib/forms/review/formsReviewPresentation";
import {
    type BosReviewAssistModel,
    type BosSubmissionReviewContext,
    deriveBosEmptyReviewAssist,
    deriveBosPacketReviewAssist,
    deriveBosSubmissionReviewAssist,
} from "@/lib/forms/review/bosReviewAssistPresentation";
import {
    formsBosAssistAuthorityNote,
    formsBosAssistBulletList,
    formsBosAssistSubheading,
    formsBosAssistSurface,
    formsCaseFileMetaText,
    formsCaseFileRegionDescription,
    formsCaseFileRegionTitle,
} from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    className?: string;
    compact?: boolean;
    loading?: boolean;
    rollup?: PacketReviewRollupV1 | null;
    submissionContext?: BosSubmissionReviewContext | null;
};

function AssistSubsection({
    testId,
    title,
    items,
    emptyCopy,
}: {
    testId: string;
    title: string;
    items: string[];
    emptyCopy?: string;
}) {
    return (
        <section data-testid={testId}>
            <h3 className={formsBosAssistSubheading}>{title}</h3>
            {items.length > 0 ?
                <ul className={formsBosAssistBulletList}>
                    {items.map((item, i) => (
                        <li key={`${testId}-${i}`} className="flex gap-2">
                            <span className="text-alloy-midnight/35" aria-hidden>
                                ·
                            </span>
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            : emptyCopy ?
                <p className={clsx("mt-1", formsCaseFileMetaText)}>{emptyCopy}</p>
            :   null}
        </section>
    );
}

function AssistBody({ model, compact }: { model: BosReviewAssistModel; compact?: boolean }) {
    return (
        <div className={clsx("space-y-3", compact && "space-y-2.5")}>
            <p className={clsx("text-sm leading-snug text-alloy-midnight/85", compact && "text-[13px]")} data-testid="bos-review-summary">
                {model.summary}
            </p>

            <AssistSubsection
                testId="bos-key-changes"
                title="Key changes"
                items={model.keyChanges}
                emptyCopy="No differences flagged from known records."
            />

            <AssistSubsection
                testId="bos-attention-items"
                title="Attention"
                items={model.attentionItems}
                emptyCopy="No linkage or intake flags need action."
            />

            <section data-testid="bos-suggested-focus">
                <h3 className={formsBosAssistSubheading}>Suggested focus</h3>
                <p className={clsx("mt-1 text-xs leading-snug text-alloy-midnight/80", compact && "text-[11px]")}>
                    {model.suggestedFocus}
                </p>
            </section>

            <section data-testid="bos-action-guidance">
                <h3 className={formsBosAssistSubheading}>Review paths</h3>
                <ul className={formsBosAssistBulletList}>
                    {model.reviewPaths.map((path, i) => (
                        <li key={`path-${i}`} className="flex gap-2">
                            <span className="text-alloy-midnight/35" aria-hidden>
                                ·
                            </span>
                            <span>{path}</span>
                        </li>
                    ))}
                </ul>
            </section>

            <p className={formsBosAssistAuthorityNote} data-testid="bos-human-authority-note">
                Read-only guidance from submitted data. You approve, reject, or request correction — nothing applies
                automatically.
            </p>
        </div>
    );
}

/**
 * BOS review assist region (UX-H) — operational framing slot for P2-5 deterministic insight.
 *
 * P2-5 implementer contract:
 * - Keep `id={FORMS_CASE_FILE_SECTION.bosSummary}` and `data-testid="bos-review-summary-placeholder"`.
 * - Replace bullet content via `deriveBosPacketReviewAssist` or pass enriched model props — do not add LLM calls here.
 * - Preserve human-authority footer; max ~3 bullets per subsection; no chat transcript layout.
 * - Parent owns any future network fetch; this component stays presentational.
 */
export function BosReviewSummaryPlaceholder({
    className,
    compact = false,
    loading = false,
    rollup = null,
    submissionContext = null,
}: Props) {
    const model =
        rollup ? deriveBosPacketReviewAssist(rollup)
        : submissionContext ? deriveBosSubmissionReviewAssist(submissionContext)
        : deriveBosEmptyReviewAssist();

    return (
        <aside
            id={FORMS_CASE_FILE_SECTION.bosSummary}
            data-testid="bos-review-summary-placeholder"
            data-bos-readiness={model.readinessKey}
            className={clsx(formsBosAssistSurface, className)}
            aria-label={BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE}
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className={formsCaseFileRegionTitle}>{BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE}</p>
                    <p className={formsCaseFileRegionDescription}>Operational guidance · read-only</p>
                </div>
                <span data-testid="bos-readiness-badge">
                    <FormsReviewBadge label={model.readinessLabel} tone={model.readinessTone} />
                </span>
            </div>

            {loading ?
                <p className={clsx("mt-3", formsCaseFileMetaText)} data-testid="bos-review-loading">
                    Preparing review summary…
                </p>
            :   <div className="mt-3">
                    <AssistBody model={model} compact={compact} />
                </div>
            }
        </aside>
    );
}

export type { BosSubmissionReviewContext };
