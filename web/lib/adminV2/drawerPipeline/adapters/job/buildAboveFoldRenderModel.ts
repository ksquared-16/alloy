import { deriveJobDrawerSignalLines } from "@/lib/admin/drawer/jobDrawerSignalLines";
import {
    buildSectionRenderModels,
    stabilizeOverviewSectionsFromShell,
} from "@/lib/adminV2/drawerPipeline/sectionRenderModel";
import type {
    DrawerAboveFoldRenderModel,
    DrawerEnrichmentState,
    DrawerShellContract,
} from "@/lib/adminV2/drawerPipeline/types";
import { JOB_DEFERRED_OVERVIEW_SECTION_KEYS } from "@/lib/adminV2/drawerPipeline/adapters/job/deferredSections";

export type BuildJobAboveFoldInput = {
    shell: DrawerShellContract;
    record: Record<string, unknown>;
    enrichment: DrawerEnrichmentState;
    schedules: { start_at?: string }[];
    payment_status_label: string;
    payment_is_paid: boolean;
    payment_failed: boolean;
    cleaning_record_modal: boolean;
};

function headerSignalsValuePhase(enrichment: DrawerEnrichmentState): "skeleton" | "value" {
    if (enrichment.primary_loaded || enrichment.full_complete) return "value";
    return "skeleton";
}

export function buildJobAboveFoldRenderModel(input: BuildJobAboveFoldInput): DrawerAboveFoldRenderModel {
    const stabilized = stabilizeOverviewSectionsFromShell(
        input.shell,
        input.shell.overview_sections,
        input.enrichment,
        {
            above_fold_locked: false,
            deferred_section_keys: JOB_DEFERRED_OVERVIEW_SECTION_KEYS,
        }
    );

    const sections = buildSectionRenderModels(
        input.shell,
        stabilized,
        input.enrichment,
        JOB_DEFERRED_OVERVIEW_SECTION_KEYS
    );

    const lines =
        headerSignalsValuePhase(input.enrichment) === "value"
            ? deriveJobDrawerSignalLines(
                  input.record,
                  input.schedules,
                  input.payment_status_label,
                  input.payment_is_paid,
                  input.payment_failed
              )
            : null;

    return {
        sections,
        header_signals: {
            reserved: input.shell.geometry.header_signals_reserved === true,
            presentation: input.cleaning_record_modal ? "cleaningRecordModal" : "default",
            value_phase: headerSignalsValuePhase(input.enrichment),
            lines,
        },
    };
}
