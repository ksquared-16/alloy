import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

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
