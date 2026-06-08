import type { DrawerHydrationPlan } from "@/lib/adminV2/drawerPipeline/types";

export type BuildDrawerHydrationPlanInput = {
    entity_type: string;
    bootstrap_path: boolean;
    primary_shell_attaches?: string[];
    hold_full_until_interaction?: boolean;
};

/** Standard AdminV2 staged entity GET plan — adapters extend attach list only. */
export function buildDrawerHydrationPlan(input: BuildDrawerHydrationPlanInput): DrawerHydrationPlan {
    const attaches = input.primary_shell_attaches ?? [];
    return {
        entity_type: input.entity_type,
        surfaces: {
            visible: {
                enabled: input.bootstrap_path,
                owner: "bootstrap",
            },
            primary: {
                enabled: true,
                skip_field_registry: input.bootstrap_path,
                parallel_shell_attaches: attaches,
            },
            full: {
                enabled: true,
                deferred: input.hold_full_until_interaction === true,
            },
        },
    };
}
