import { opportunityInquirySummaryRightPanelFromPrimaryOnly } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { opportunityInquiryTourDisplayFromPrimaryMetadata } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { parseInquirySummaryTaskPreview } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { drawerRelationshipsFullHydrateFailed } from "@/lib/adminV2/drawerPipeline/enrichmentState";
import {
    drawerFullBoundValuesReady,
    drawerOperationalStripReady,
} from "@/lib/adminV2/drawerPipeline/layoutLock";
import { overviewSectionsFromAboveFoldModel } from "@/lib/adminV2/drawerPipeline/overviewSections";
import {
    buildSectionRenderModels,
    stabilizeOverviewSectionsFromShell,
} from "@/lib/adminV2/drawerPipeline/sectionRenderModel";
import type {
    DrawerAboveFoldRenderModel,
    DrawerEnrichmentState,
    DrawerShellContract,
} from "@/lib/adminV2/drawerPipeline/types";
import { readOpportunityDrawerGeometry } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/geometry";
import { OPPORTUNITY_DEFERRED_OVERVIEW_SECTION_KEYS } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/deferredSections";
import { filterOpportunityOverviewSectionsForFirstPaint } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

export type BuildOpportunityAboveFoldInput = {
    shell: DrawerShellContract;
    record: Record<string, unknown>;
    enrichment: DrawerEnrichmentState;
    workflow_v1: boolean;
    above_fold_locked: boolean;
    first_paint_gates_active: boolean;
    enrichment_layout_ready: boolean;
    enrichment_held?: boolean;
    below_fold_enrichment_ready: boolean;
    task_assist_enabled: boolean;
    /** Layout includes family_contacts when shell not yet frozen (bootstrap race). */
    family_contacts_in_summary_fallback?: boolean;
};

function inquirySummaryColumnMode(show_right_column: boolean): "one" | "two" {
    return show_right_column ? "two" : "one";
}

function resolveShowRightColumn(
    geometry: ReturnType<typeof readOpportunityDrawerGeometry>,
    record: Record<string, unknown>,
    below_fold_enrichment_ready: boolean,
    enrichment: DrawerEnrichmentState,
    task_assist_enabled: boolean
): boolean {
    if (geometry.summary_right_column_reserved) return true;
    if (opportunityInquirySummaryRightPanelFromPrimaryOnly(record)) return true;
    return (
        below_fold_enrichment_ready &&
        enrichment.full_complete &&
        task_assist_enabled
    );
}

/**
 * Opportunity adapter: maps shell + record + enrichment → above-fold render model.
 * Generic drawer renderer reads this — no layout gates on hydrate in the adapter.
 */
export function buildOpportunityAboveFoldRenderModel(
    input: BuildOpportunityAboveFoldInput
): DrawerAboveFoldRenderModel {
    const geometry = readOpportunityDrawerGeometry(input.shell);
    const stabilized = stabilizeOverviewSectionsFromShell(
        input.shell,
        input.shell.overview_sections,
        input.enrichment,
        {
            above_fold_locked: input.above_fold_locked,
            pinned_expanded_section_key: "inquiry_children",
            deferred_section_keys: OPPORTUNITY_DEFERRED_OVERVIEW_SECTION_KEYS,
            filter_deferred_when_unlocked: filterOpportunityOverviewSectionsForFirstPaint,
            first_paint_gates_active: input.first_paint_gates_active,
            enrichment_layout_ready: input.enrichment_layout_ready,
            enrichment_held: input.enrichment_held,
        }
    );

    const sections = buildSectionRenderModels(
        input.shell,
        stabilized,
        input.enrichment,
        OPPORTUNITY_DEFERRED_OVERVIEW_SECTION_KEYS
    );

    if (!input.workflow_v1) {
        return { sections };
    }

    const family_in_summary =
        geometry.family_contacts_in_summary || input.family_contacts_in_summary_fallback === true;
    const show_right_column = resolveShowRightColumn(
        geometry,
        input.record,
        input.below_fold_enrichment_ready,
        input.enrichment,
        input.task_assist_enabled
    );
    const task_preview = parseInquirySummaryTaskPreview(input.record);
    const full_bound = drawerFullBoundValuesReady(input.below_fold_enrichment_ready, input.enrichment);

    return {
        sections,
        inquiry_summary: {
            column_mode: inquirySummaryColumnMode(show_right_column),
            show_right_column,
            family_contacts: {
                use_full_panel: family_in_summary,
                shell_reserved_additional_count: Math.max(
                    0,
                    Number(input.record._additional_contacts_shell_count ?? 0) || 0
                ),
                relationships_full_hydrate_failed: drawerRelationshipsFullHydrateFailed(input.enrichment),
                relationships_pending:
                    input.enrichment.full_pending && !drawerRelationshipsFullHydrateFailed(input.enrichment),
            },
            what_matters: {
                reserved: true,
                tour_from_metadata: opportunityInquiryTourDisplayFromPrimaryMetadata(input.record),
                show_tour_bookings_enrichment:
                    !input.above_fold_locked && input.below_fold_enrichment_ready,
            },
            task_preview: {
                confirmed: task_preview != null,
                open_count: task_preview?.open_count ?? 0,
                open_tasks: task_preview?.open_tasks ?? [],
                show_reminders_placeholder: !full_bound,
                show_operational_strip: drawerOperationalStripReady(
                    input.task_assist_enabled,
                    input.below_fold_enrichment_ready,
                    input.enrichment
                ),
            },
        },
    };
}

export { overviewSectionsFromAboveFoldModel };
