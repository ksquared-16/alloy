import clsx from "clsx";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import type { PacketReviewInsightV1 } from "@/lib/forms/packets/packetReviewInsightTypes";
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
import { bosReviewAssistFromPacketInsight } from "@/lib/forms/review/packetReviewInsightPresentation";
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
    insight?: PacketReviewInsightV1 | null;
    submissionContext?: BosSubmissionReviewContext | null;
};

function checklistStatusLabel(status: "ok" | "attention" | "blocked"): string {
    if (status === "ok") return "OK";
    if (status === "blocked") return "Blocked";
    return "Review";
}

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
    const summaryBullets = model.summaryBullets?.filter(Boolean) ?? [];

    return (
        <div className={clsx("space-y-3", compact && "space-y-2.5")}>
            {summaryBullets.length > 1 ?
                <section data-testid="bos-review-summary">
                    <h3 className={formsBosAssistSubheading}>Summary</h3>
                    <ul className={formsBosAssistBulletList}>
                        {summaryBullets.map((item, i) => (
                            <li key={`summary-${i}`} className="flex gap-2">
                                <span className="text-alloy-midnight/35" aria-hidden>
                                    ·
                                </span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            :   <p
                    className={clsx("text-sm leading-snug text-alloy-midnight/85", compact && "text-[13px]")}
                    data-testid="bos-review-summary"
                >
                    {model.summary}
                </p>
            }

            {model.checklist && model.checklist.length > 0 ?
                <section data-testid="bos-review-checklist">
                    <h3 className={formsBosAssistSubheading}>Review confidence</h3>
                    <ul className={formsBosAssistBulletList}>
                        {model.checklist.map((item) => (
                            <li key={item.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span>{item.label}</span>
                                <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                    {checklistStatusLabel(item.status)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            : null}

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

            {model.confidenceNotes && model.confidenceNotes.length > 0 ?
                <AssistSubsection
                    testId="bos-confidence-notes"
                    title="Confidence notes"
                    items={model.confidenceNotes}
                />
            : null}

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
                {model.humanAuthorityNote ??
                    "Read-only guidance from submitted data. You approve, reject, or request correction — nothing applies automatically."}
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
    insight = null,
    submissionContext = null,
}: Props) {
    const model =
        insight ? bosReviewAssistFromPacketInsight(insight)
        : rollup ? deriveBosPacketReviewAssist(rollup)
        : submissionContext ? deriveBosSubmissionReviewAssist(submissionContext)
        : deriveBosEmptyReviewAssist();

    return (
        <aside
            id={FORMS_CASE_FILE_SECTION.bosSummary}
            data-testid="bos-review-summary-placeholder"
            data-bos-readiness={model.readinessKey}
            data-bos-source={insight ? "insight" : rollup ? "rollup" : submissionContext ? "submission" : "empty"}
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
