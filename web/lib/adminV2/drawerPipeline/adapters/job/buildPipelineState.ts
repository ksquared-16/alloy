import { assembleDrawerPipelineState } from "@/lib/adminV2/drawerPipeline/assemblePipelineState";
import { compileJobDrawerShell } from "@/lib/adminV2/drawerPipeline/adapters/job/compileShell";
import { buildJobAboveFoldRenderModel } from "@/lib/adminV2/drawerPipeline/adapters/job/buildAboveFoldRenderModel";
import { JOB_PRIMARY_SHELL_ATTACHES } from "@/lib/adminV2/drawerPipeline/adapters/job/deferredSections";
import type { DrawerPipelineState, DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";

export type BuildJobDrawerPipelineInput = {
    shell?: DrawerShellContract;
    tabs: DrawerTabKey[];
    record: Record<string, unknown>;
    drawer_id: string;
    background_full_failed?: boolean;
    schedules: { start_at?: string }[];
    payment_status_label: string;
    payment_is_paid: boolean;
    payment_failed: boolean;
    cleaning_record_modal: boolean;
};

export function buildJobDrawerPipelineState(input: BuildJobDrawerPipelineInput): DrawerPipelineState {
    const shell = input.shell ?? compileJobDrawerShell({ tabs: input.tabs, variant: "adminV2" });

    return assembleDrawerPipelineState({
        shell,
        enrichment: {
            record: input.record,
            drawer_id: input.drawer_id,
            background_full_failed: input.background_full_failed === true,
        },
        hydration: {
            entity_type: "job",
            bootstrap_path: false,
            primary_shell_attaches: [...JOB_PRIMARY_SHELL_ATTACHES],
        },
        build_above_fold: (enrichment) =>
            buildJobAboveFoldRenderModel({
                shell,
                record: input.record,
                enrichment,
                schedules: input.schedules,
                payment_status_label: input.payment_status_label,
                payment_is_paid: input.payment_is_paid,
                payment_failed: input.payment_failed,
                cleaning_record_modal: input.cleaning_record_modal,
            }),
    });
}
