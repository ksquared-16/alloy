import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { CaseFileSection } from "@/components/forms/review/CaseFileSection";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import {
    buildPacketNeedsAttentionItems,
    type NeedsAttentionItem,
} from "@/lib/forms/review/packetNeedsAttentionItems";
import { formsCaseFileActionLink, formsCaseFileMetaText } from "@/lib/forms/review/formsReviewClassTokens";

type Props = {
    rollup: PacketReviewRollupV1;
};

export type { NeedsAttentionItem };
export { buildPacketNeedsAttentionItems };

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
