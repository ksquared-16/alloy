import type { WorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { parseLifecycleWorkUnitNavChipKey } from "@/lib/lifecycle/lifecycleWorkUnitShellPills";

/** Operator-facing business process label on lifecycle work-unit banners. */
export const LIFECYCLE_COMMAND_PROCESS_LABEL = "Enrollment";

function hasLifecycleStagePills(aboveFold: WorkUnitAboveFoldRenderModel): boolean {
    return aboveFold.header.sections.some((section) =>
        section.chips.some(
            (chip) =>
                Boolean(chip.lifecycle_work_unit_nav_id) ||
                parseLifecycleWorkUnitNavChipKey(chip.key) != null
        )
    );
}

/** Map shell model fields to the command-banner business process title. */
export function resolveWorkUnitCommandProcessName(args: {
    aboveFold: WorkUnitAboveFoldRenderModel;
    processName: string | null;
}): string | null {
    if (hasLifecycleStagePills(args.aboveFold)) {
        return LIFECYCLE_COMMAND_PROCESS_LABEL;
    }
    return args.processName?.trim() || null;
}
