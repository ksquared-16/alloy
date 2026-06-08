import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { CaseFileSection } from "@/components/forms/review/CaseFileSection";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import {
    buildPacketNeedsAttentionItems,
    type NeedsAttentionItem,
} from "@/lib/forms/review/packetNeedsAttentionItems";
import {
    opActionLink,
    opAttentionRow,
    opGroupedSurface,
    opMetadata,
    opStackGroup,
} from "@/lib/operational/ui/operationalVisualTokens";

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
            <div className={opStackGroup}>
                <ul className={opGroupedSurface} data-testid="needs-attention-list">
                    {items.map((item) => (
                        <li key={item.key} className={opAttentionRow}>
                            <span className="min-w-0 flex-1 leading-snug">{item.message}</span>
                            {item.actionHref && item.actionLabel ?
                                <a
                                    href={item.actionHref}
                                    className={opActionLink}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {item.actionLabel}
                                </a>
                            : null}
                        </li>
                    ))}
                </ul>
                <p className={opMetadata}>Document generation may stay blocked until linkage is resolved.</p>
            </div>
        </CaseFileSection>
    );
}
