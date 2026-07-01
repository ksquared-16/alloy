"use client";

import {
    BOS_EXECUTION_LOADER_PHASES_CREATE_LEAD,
    BosExecutionLoader,
} from "@/components/admin/actions/BosExecutionLoader";

/** @deprecated Import phases from BosExecutionLoader */
export const CREATE_LEAD_ASSEMBLY_PHASES = BOS_EXECUTION_LOADER_PHASES_CREATE_LEAD;

type Props = {
    title: string;
    subtitle?: string;
    /** @deprecated Prefer `subtitle` */
    detail?: string;
    steps?: readonly string[];
    /** @deprecated Prefer `steps` */
    assemblyPhases?: readonly string[];
};

/** Action workspace execute step — full-screen BOS assembly loader with phased progress. */
export function ActionWorkspaceExecuteState({
    title,
    subtitle,
    detail,
    steps,
    assemblyPhases = BOS_EXECUTION_LOADER_PHASES_CREATE_LEAD,
}: Props) {
    return (
        <BosExecutionLoader
            variant="fullscreen"
            title={title}
            subtitle={subtitle ?? detail}
            steps={steps ?? assemblyPhases}
            data-testid="action-workspace-execute-state"
        />
    );
}
