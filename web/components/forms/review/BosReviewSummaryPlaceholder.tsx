import clsx from "clsx";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import type { PacketReviewInsightV1 } from "@/lib/forms/packets/packetReviewInsightTypes";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosRevealSequence } from "@/app/adminV2/components/bos/identity/BosRevealSequence";
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
    opAssistBodyOffset,
    opAttentionText,
    opAttentionTextCompact,
    opInsightAuthorityNote,
    opInsightBulletList,
    opInsightChecklistStatus,
    opInsightSummary,
    opInsightSummaryCompact,
    opInsightSupport,
    opIntelligenceSurface,
    opLabelCaps,
    opMetadata,
    opSectionTitle,
    opStackSection,
    opStackSectionCompact,
} from "@/lib/operational/ui/operationalVisualTokens";

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
            <h3 className={opLabelCaps}>{title}</h3>
            {items.length > 0 ?
                <ul className={opInsightBulletList}>
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
                <p className={clsx("mt-1", opMetadata)}>{emptyCopy}</p>
            :   null}
        </section>
    );
}

function AssistBody({ model, compact }: { model: BosReviewAssistModel; compact?: boolean }) {
    const summaryBullets = model.summaryBullets?.filter(Boolean) ?? [];

    return (
        <div className={clsx(compact ? opStackSectionCompact : opStackSection)}>
            {summaryBullets.length > 1 ?
                <section data-testid="bos-review-summary">
                    <h3 className={opLabelCaps}>Summary</h3>
                    <ul className={opInsightBulletList}>
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
                    className={clsx(compact ? opInsightSummaryCompact : opInsightSummary)}
                    data-testid="bos-review-summary"
                >
                    {model.summary}
                </p>
            }

            {model.checklist && model.checklist.length > 0 ?
                <section data-testid="bos-review-checklist">
                    <h3 className={opLabelCaps}>Review confidence</h3>
                    <ul className={opInsightBulletList}>
                        {model.checklist.map((item) => (
                            <li key={item.key} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span>{item.label}</span>
                                <span className={opInsightChecklistStatus}>
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
                <h3 className={opLabelCaps}>Suggested focus</h3>
                <p className={compact ? opAttentionTextCompact : opAttentionText}>{model.suggestedFocus}</p>
            </section>

            <section data-testid="bos-action-guidance">
                <h3 className={opLabelCaps}>Review paths</h3>
                <ul className={opInsightBulletList}>
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

            <p className={opInsightAuthorityNote} data-testid="bos-human-authority-note">
                {model.humanAuthorityNote ??
                    "Read-only guidance from submitted data. You approve, reject, or request correction — nothing applies automatically."}
            </p>
        </div>
    );
}

/**
 * BOS review assist region (UX-H) — operational framing slot for P2-5 deterministic insight.
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
            className={clsx(opIntelligenceSurface, className)}
            aria-label={BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE}
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <BosHeader
                    title={BOS_REVIEW_SUMMARY_PLACEHOLDER_TITLE}
                    subtitle="Operational guidance · read-only"
                    size="sm"
                />
                <span data-testid="bos-readiness-badge">
                    <FormsReviewBadge label={model.readinessLabel} tone={model.readinessTone} />
                </span>
            </div>

            {loading ?
                <BosRevealSequence
                    mode="working"
                    message="Preparing review summary…"
                    active={loading}
                    markSize="sm"
                    className="py-4"
                    data-testid="bos-review-loading"
                />
            :   <div className={opAssistBodyOffset}>
                    <AssistBody model={model} compact={compact} />
                </div>
            }
        </aside>
    );
}

export type { BosSubmissionReviewContext };
