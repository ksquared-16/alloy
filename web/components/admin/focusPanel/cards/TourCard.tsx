"use client";

import { useMemo } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildTourCardEvidence,
} from "@/lib/adminV2/runtime/focusPanel/tour/buildTourCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
};

/**
 * Tour card (Summary archetype). Answers "Is a tour scheduled, and when?"
 *
 * Summary: shows the next scheduled tour datetime + status chip, or a
 * "No tour scheduled" empty state. No expand, no focus, no edit — the tour
 * block is owned by the booking side-panel. Pure over `context.signals.tour`.
 *
 * @see docs/platform/operator/universal-card-archetypes.md (Summary)
 */
export default function TourCard({ model, context, receded = false }: Props) {
    const evidence = useMemo(() => buildTourCardEvidence(context), [context]);

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
