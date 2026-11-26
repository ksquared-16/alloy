"use client";

import { useMemo } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    ENROLLMENT_MILESTONES_REFERENCE_COMPOSITION,
    projectMilestonesCardVM,
    type MilestoneFact,
} from "@/lib/adminV2/runtime/focusPanel/milestones/milestonesCardBlueprint";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import { navigateFocusPanelCardLink } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardLinks";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

/**
 * Milestones card — summarizes meaningful completed / committed operational facts.
 * Facts come from registered adapters only; until adapters settle facts onto the
 * Operational Context, the card renders a real empty shell (never a ghost cell).
 */
export default function MilestonesCard({
    model,
    context,
    receded = false,
    coordination,
}: Props) {
    const facts = useMemo(() => readMilestoneFactsFromContext(context), [context]);
    const vm = useMemo(
        () =>
            projectMilestonesCardVM({
                facts,
                config: ENROLLMENT_MILESTONES_REFERENCE_COMPOSITION,
            }),
        [facts],
    );

    return (
        <UniversalCard
            title={model.title}
            insight={vm.answerLine}
            supportingInsight={
                vm.facts.length > 0 ? "Completed · committed · upcoming outcomes" : null
            }
            iconName={model.iconName}
            tier={model.tier}
            archetype={model.archetype}
            statusChip={model.statusChip}
            statusTone={model.statusTone}
            density={model.density}
            gridSpan={model.span}
            data-universal-card-key={model.key}
            receded={receded}
        >
            <div data-milestones-card="true">
                {vm.facts.length === 0 ?
                    <p className="alloy-os-household__row-detail" data-milestones-empty="true">
                        No milestones yet
                    </p>
                :   <ul
                        style={{
                            listStyle: "none",
                            margin: 0,
                            padding: 0,
                            display: "grid",
                            gap: 6,
                        }}
                        data-milestones-list="true"
                    >
                        {vm.facts.map((fact) => (
                            <li key={fact.id} data-milestone-id={fact.id}>
                                {fact.destinationCard && coordination ?
                                    <button
                                        type="button"
                                        data-milestone-open={fact.id}
                                        onClick={() => {
                                            navigateFocusPanelCardLink(
                                                coordination,
                                                {
                                                    fromCard: "milestones",
                                                    toCard: fact.destinationCard!,
                                                },
                                                fact.subjectId ?? null,
                                                null,
                                            );
                                        }}
                                        style={{
                                            display: "flex",
                                            width: "100%",
                                            alignItems: "baseline",
                                            justifyContent: "space-between",
                                            gap: 8,
                                            padding: "6px 8px",
                                            borderRadius: 8,
                                            border: "1px solid color-mix(in srgb, var(--alloy-os-border, #e5e7eb) 80%, transparent)",
                                            background: "#fff",
                                            cursor: "pointer",
                                            textAlign: "left",
                                        }}
                                    >
                                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                                            {fact.label}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 10.5,
                                                color: "var(--alloy-os-text-tertiary, #9ca3af)",
                                                textTransform: "capitalize",
                                            }}
                                        >
                                            {fact.bucket}
                                        </span>
                                    </button>
                                :   <div
                                        style={{
                                            display: "flex",
                                            alignItems: "baseline",
                                            justifyContent: "space-between",
                                            gap: 8,
                                            padding: "6px 8px",
                                            borderRadius: 8,
                                            border: "1px solid color-mix(in srgb, var(--alloy-os-border, #e5e7eb) 80%, transparent)",
                                        }}
                                    >
                                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                                            {fact.label}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 10.5,
                                                color: "var(--alloy-os-text-tertiary, #9ca3af)",
                                                textTransform: "capitalize",
                                            }}
                                        >
                                            {fact.bucket}
                                        </span>
                                    </div>
                                }
                            </li>
                        ))}
                        {vm.overflowCount > 0 ?
                            <li
                                className="alloy-os-household__row-detail"
                                data-milestones-overflow="true"
                            >
                                +{vm.overflowCount} more
                            </li>
                        :   null}
                    </ul>
                }
            </div>
        </UniversalCard>
    );
}

/** Soft read — adapters may later settle facts on truth; never invent milestones. */
function readMilestoneFactsFromContext(context: OperationalContext): MilestoneFact[] {
    const raw = (context.truth as { milestones?: unknown }).milestones;
    if (!Array.isArray(raw)) return [];
    const out: MilestoneFact[] = [];
    for (const row of raw) {
        if (!row || typeof row !== "object") continue;
        const fact = row as Partial<MilestoneFact>;
        if (!fact.id || !fact.typeKey || !fact.label || !fact.bucket || !fact.scope || !fact.sourceOwner) {
            continue;
        }
        out.push({
            id: String(fact.id),
            typeKey: String(fact.typeKey),
            label: String(fact.label),
            at: fact.at ?? null,
            bucket: fact.bucket,
            scope: fact.scope,
            subjectId: fact.subjectId ?? null,
            destinationCard: fact.destinationCard ?? null,
            sourceOwner: String(fact.sourceOwner),
        });
    }
    return out;
}
