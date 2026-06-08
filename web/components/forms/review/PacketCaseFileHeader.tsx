import clsx from "clsx";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { formatShortDate } from "@/lib/forms/packets/documentProvenanceDisplay";
import { FormsReviewBadge } from "@/components/forms/review/FormsReviewBadge";
import {
    FORMS_CASE_FILE_SECTION,
    isPacketReviewAwaitingDecision,
    operatorReviewStatusLabel,
    operatorReviewStatusTone,
    packetSessionStatusLabel,
    packetSessionStatusTone,
} from "@/lib/forms/review/formsReviewPresentation";
import {
    opCaseFileSubtitle,
    opCaseFileTitle,
    opMetadata,
    opOrientationSurface,
    opStackMeta,
} from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    rollup: PacketReviewRollupV1;
    className?: string;
};

function primarySubjectLabel(rollup: PacketReviewRollupV1): string | null {
    const ctx = rollup.enrollment_context;
    if (ctx.opportunity_label) return ctx.opportunity_label;
    if (ctx.customer_label) return ctx.customer_label;
    return null;
}

function lastSubmittedAt(rollup: PacketReviewRollupV1): string | null {
    let latest: string | null = null;
    for (const step of rollup.steps) {
        if (!step.submitted_at) continue;
        if (!latest || step.submitted_at > latest) latest = step.submitted_at;
    }
    return latest;
}

export function PacketCaseFileHeader({ rollup, className }: Props) {
    const subject = primarySubjectLabel(rollup);
    const lastSubmit = lastSubmittedAt(rollup);
    const awaiting = isPacketReviewAwaitingDecision(rollup.status, rollup.operator_review.status);
    const prog = rollup.progress;

    return (
        <header
            id={FORMS_CASE_FILE_SECTION.header}
            className={clsx(opOrientationSurface, className)}
            data-testid="packet-case-file-header"
        >
            <p className={opMetadata}>Packet review</p>
            <h1 className={clsx("mt-1", opCaseFileTitle)}>{rollup.packet_definition.name}</h1>
            {subject ?
                <p className={opCaseFileSubtitle}>{subject}</p>
            :   <p className={opCaseFileSubtitle}>Multi-step intake session</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <FormsReviewBadge
                    label={packetSessionStatusLabel(rollup.status)}
                    tone={packetSessionStatusTone(rollup.status)}
                />
                <FormsReviewBadge
                    label={operatorReviewStatusLabel(rollup.operator_review.status)}
                    tone={operatorReviewStatusTone(rollup.operator_review.status)}
                />
                {awaiting ?
                    <span className={opMetadata}>Awaiting your decision</span>
                : null}
            </div>
            <ul className={clsx("mt-3", opStackMeta, opMetadata)}>
                <li>
                    {prog.submitted_steps} of {prog.total_steps} steps submitted
                    {lastSubmit ? ` · Last submitted ${formatShortDate(lastSubmit)}` : ""}
                </li>
                {rollup.packet_definition.key ?
                    <li>Packet type: {rollup.packet_definition.key}</li>
                : null}
            </ul>
        </header>
    );
}
