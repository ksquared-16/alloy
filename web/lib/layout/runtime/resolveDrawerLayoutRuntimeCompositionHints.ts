/**
 * Resolve layout-runtime composition hints by drawer surface / entity type.
 *
 * Person and child drawers must not fall back to lead hints — that bypasses
 * personConnectedChildrenCardList, compositionSectionSurface, and related polish.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    childOverviewCompositionHints,
    shouldUseChildOverviewComposition,
} from "@/lib/layout/runtime/childOverviewComposition";
import type { LayoutRuntimeCompositionHints } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import {
    leadOverviewCompositionHints,
    shouldUseLeadOverviewComposition,
} from "@/lib/layout/runtime/leadOverviewComposition";
import {
    personOverviewCompositionHints,
    shouldUsePersonOverviewComposition,
} from "@/lib/layout/runtime/personOverviewComposition";

export type DrawerLayoutRuntimeOverviewSurface =
    | "opportunity_drawer_overview"
    | "person_drawer_overview"
    | "child_drawer_overview"
    | string;

export type ResolveDrawerLayoutRuntimeCompositionHintsInput = {
    surface: DrawerLayoutRuntimeOverviewSurface;
    doc: LayoutDoc;
    honorLayoutDocBlocks?: boolean;
    summaryStripCompactRow?: boolean;
};

/** Stable QA marker for which hint profile is active in published runtime. */
export function layoutRuntimeCompositionHintsProfile(
    hints: LayoutRuntimeCompositionHints,
): string {
    if (hints.personOverviewComposition) return "person";
    if (hints.childOverviewComposition) return "child";
    if (hints.leadEnrollmentCardList != null || hints.suppressRelatedListPanelHeader != null) return "lead";
    return "none";
}

export function resolveDrawerLayoutRuntimeCompositionHints(
    input: ResolveDrawerLayoutRuntimeCompositionHintsInput,
): LayoutRuntimeCompositionHints {
    const honorLayoutDocBlocks = input.honorLayoutDocBlocks === true;

    if (input.surface === "person_drawer_overview" || input.doc.entityType === "person") {
        return personOverviewCompositionHints({ honorLayoutDocBlocks });
    }

    if (input.surface === "child_drawer_overview" || input.doc.entityType === "child") {
        return childOverviewCompositionHints();
    }

    if (
        input.surface === "opportunity_drawer_overview"
        || input.doc.entityType === "opportunities"
        || shouldUseLeadOverviewComposition(input.doc)
    ) {
        return leadOverviewCompositionHints({
            honorLayoutDocBlocks,
            summaryStripCompactRow: input.summaryStripCompactRow,
        });
    }

    if (shouldUsePersonOverviewComposition(input.doc)) {
        return personOverviewCompositionHints({ honorLayoutDocBlocks });
    }

    if (shouldUseChildOverviewComposition(input.doc)) {
        return childOverviewCompositionHints();
    }

    return {};
}
