"use client";

import RecordLifecycleRail from "@/components/admin/drawer/RecordLifecycleRail";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import {
    resolvePersonDrawerChildLifecycleAction,
} from "@/lib/admin/person/personDrawerChildLifecycleActions";
import {
    PERSON_DRAWER_CHILD_LIFECYCLE_RAIL_KEYS,
    resolvePersonDrawerChildLifecycleRailModel,
} from "@/lib/admin/person/resolvePersonDrawerChildLifecycleRailModel";
import { resolveChildLifecycleSlotStates, type ChildLifecycleRoadmapSlotKey } from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import type { DrawerTabKey } from "@/lib/entityPresentation";

/** Child drawer lifecycle rail — shared RecordLifecycleRail visual with tab/context actions. */
export default function PersonDrawerChildLifecycleRail({
    record,
    chromeHint,
    onSelectTab,
    onOpenLeadOpportunity,
    onOpenOpportunityCommunications,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerChildChromeHint | null;
    onSelectTab: (tab: DrawerTabKey) => void;
    onOpenLeadOpportunity: (opportunityId: string) => void;
    onOpenOpportunityCommunications: (opportunityId: string) => void;
}) {
    if (!personDrawerChildChromeActive(record, chromeHint)) {
        return null;
    }

    const model = resolvePersonDrawerChildLifecycleRailModel(record);
    if (!model) return null;

    const primaryOpportunityId = resolvePersonDrawerChildSummaryModel(record).primary_opportunity_id;
    const slotsByKey = new Map<ChildLifecycleRoadmapSlotKey, (ReturnType<typeof resolveChildLifecycleSlotStates>[number])>(
        resolveChildLifecycleSlotStates(record)
            .filter((slot) =>
                PERSON_DRAWER_CHILD_LIFECYCLE_RAIL_KEYS.includes(
                    slot.key as (typeof PERSON_DRAWER_CHILD_LIFECYCLE_RAIL_KEYS)[number]
                )
            )
            .map((slot) => [slot.key, slot])
    );

    const handleStepClick = (stepKey: string) => {
        const slot = slotsByKey.get(stepKey as ChildLifecycleRoadmapSlotKey);
        if (!slot) return;
        const action = resolvePersonDrawerChildLifecycleAction(slot, primaryOpportunityId);
        if (!action) return;
        if (action.kind === "tab") {
            onSelectTab(action.tab);
            return;
        }
        if (action.kind === "open_opportunity") {
            onOpenLeadOpportunity(action.opportunity_id);
            return;
        }
        if (action.kind === "opportunity_communications") {
            onOpenOpportunityCommunications(action.opportunity_id);
        }
    };

    return (
        <RecordLifecycleRail
            model={model}
            interactive
            onStepClick={handleStepClick}
            data-testid="person-child-lifecycle-rail"
            aria-label="Child lifecycle"
        />
    );
}
