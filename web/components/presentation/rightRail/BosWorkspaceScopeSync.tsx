"use client";

/**
 * Publishes Workspace / Work Unit department scope into GlobalAssistant so BOS
 * slash commands (Create Lead) resolve the same department as header Actions.
 * Without this, slash Create Lead falls back to the Person-only platform floor.
 */

import { useEffect } from "react";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";

type Props = {
    departmentId: string | null | undefined;
    workUnitId?: string | null;
    departmentName?: string | null;
    workUnitName?: string | null;
};

export function BosWorkspaceScopeSync(props: Props) {
    const assistant = useGlobalAssistantOptional();
    const departmentId = props.departmentId?.trim() || null;
    const workUnitId = props.workUnitId?.trim() || null;

    useEffect(() => {
        if (!assistant) return;
        if (!departmentId) {
            assistant.setWorkspaceScope(null);
            return;
        }
        assistant.setWorkspaceScope({
            department_id: departmentId,
            department_name: props.departmentName ?? null,
            work_unit_id: workUnitId,
            work_unit_name: props.workUnitName ?? null,
        });
        return () => {
            // Leave scope in place on unmount so slash still works during soft navigations;
            // the next surface will overwrite.
        };
    }, [
        assistant,
        departmentId,
        workUnitId,
        props.departmentName,
        props.workUnitName,
    ]);

    return null;
}
