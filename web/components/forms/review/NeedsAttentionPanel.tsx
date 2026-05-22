import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { CaseFileSection } from "@/components/forms/review/CaseFileSection";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import { formsCaseFileActionLink, formsCaseFileMetaText } from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    rollup: PacketReviewRollupV1;
};

export type NeedsAttentionItem = {
    key: string;
    message: string;
    actionHref?: string | null;
    actionLabel?: string;
};

export function buildPacketNeedsAttentionItems(rollup: PacketReviewRollupV1): NeedsAttentionItem[] {
    const items: NeedsAttentionItem[] = [];
    const { linkage_summary: link } = rollup;

    if (link.any_intake_needs_review) {
        items.push({
            key: "link-intake",
            message: "One or more steps need intake or linkage review before this packet is complete.",
        });
    }
    if (link.steps_missing_crm_fk > 0) {
        items.push({
            key: "link-fk",
            message: `${link.steps_missing_crm_fk} submitted step(s) are not linked to the expected CRM records.`,
        });
    }

    for (const s of link.steps) {
        if (!s.intake_needs_review && s.has_crm_fk) continue;
        items.push({
            key: `link-step-${s.sequence_index}`,
            message:
                !s.has_crm_fk ?
                    `Step ${s.sequence_index + 1} (${s.form_name}): missing CRM link on submission.`
                :   `Step ${s.sequence_index + 1} (${s.form_name}): intake needs review.`,
            actionHref: s.admin_submission_path,
            actionLabel: "Fix linkage",
        });
    }

    for (const step of rollup.steps) {
        if (!step.intake_meta?.intake_needs_review) continue;
        const already = items.some((i) => i.key === `link-step-${step.sequence_index}`);
        if (already) continue;
        items.push({
            key: `step-intake-${step.sequence_index}`,
            message: `Step ${step.sequence_index + 1} (${step.form_name})${
                step.intake_meta.intake_review_reason ? `: ${step.intake_meta.intake_review_reason}` : ""
            }`,
            actionHref: step.artifact.admin_submission_path ?? step.intake_meta.intake_resolution_path,
            actionLabel: "Review step",
        });
    }

    return items;
}

export function NeedsAttentionPanel({ rollup }: Props) {
    const items = buildPacketNeedsAttentionItems(rollup);
    if (items.length === 0) return null;

    return (
        <CaseFileSection
            id={FORMS_CASE_FILE_SECTION.needsAttention}
            title="Needs attention"
            variant="attention"
            description="Resolve these before approving — each item links to the right fix surface."
        >
            <ul className="space-y-2">
                {items.map((item) => (
                    <li
                        key={item.key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-alloy-ember/25 bg-white px-3 py-2 text-sm text-alloy-midnight"
                    >
                        <span className="min-w-0 flex-1 leading-snug">{item.message}</span>
                        {item.actionHref && item.actionLabel ?
                            <a
                                href={item.actionHref}
                                className={formsCaseFileActionLink}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {item.actionLabel}
                            </a>
                        : null}
                    </li>
                ))}
            </ul>
            <p className={formsCaseFileMetaText}>Document generation may stay blocked until linkage is resolved.</p>
        </CaseFileSection>
    );
}
