"use client";

import { useMemo } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildCommunicationsCardEvidence,
} from "@/lib/adminV2/runtime/focusPanel/communications/buildCommunicationsCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
};

/**
 * Communications card (Summary archetype). Answers "What is the current
 * outreach status for this family?".
 *
 * Summary: shows scheduled send count or next follow-up date, or an empty
 * state when no outreach is pending. Truth (message threads, contact preferences,
 * channel history) lives in the inbox — this card reports the operational signal
 * only. Pure over `context.signals.communications`. No edit, no focus depth.
 *
 * @see docs/platform/operator/universal-card-archetypes.md (Summary)
 */
export default function CommunicationsCard({ model, context, receded = false }: Props) {
    const evidence = useMemo(() => buildCommunicationsCardEvidence(context), [context]);

    return (
        <UniversalCard
            title={model.title}
            insight={evidence.answerLine}
            supportingInsight={evidence.supportingLine}
            iconName={model.iconName}
            tier={model.tier}
            archetype={model.archetype}
            statusChip={evidence.statusChip}
            statusTone={evidence.statusTone}
            density={model.density}
            gridSpan={model.span}
            data-universal-card-key={model.key}
            receded={receded}
        />
    );
}
