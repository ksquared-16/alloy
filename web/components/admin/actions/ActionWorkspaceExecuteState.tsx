"use client";

import {
    BOS_EXECUTION_LOADER_PHASES_CREATE_LEAD,
    BosExecutionLoader,
} from "@/components/admin/actions/BosExecutionLoader";

/** @deprecated Import phases from BosExecutionLoader */
export const CREATE_LEAD_ASSEMBLY_PHASES = BOS_EXECUTION_LOADER_PHASES_CREATE_LEAD;

type Props = {
    title: string;
    detail?: string;
    assemblyPhases?: readonly string[];
};

/** Create Lead execute step — delegates to canonical BosExecutionLoader. */
export function ActionWorkspaceExecuteState({
    title,
    detail,
    assemblyPhases = BOS_EXECUTION_LOADER_PHASES_CREATE_LEAD,
}: Props) {
    return (
        <BosExecutionLoader
            title={title}
            detail={detail}
            assemblyPhases={assemblyPhases}
            data-testid="action-workspace-execute-state"
        />
    );
}
