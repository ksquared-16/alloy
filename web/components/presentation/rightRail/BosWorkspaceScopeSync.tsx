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

    /**
     * Depend on the SETTER, not the whole assistant context.
     *
     * `setWorkspaceScope` is a `useCallback([])` and never changes identity. The context VALUE
     * does — it is memoised over `workspaceScope` among others, so writing the scope produces a
     * new context object by design.
     *
     * Two surfaces mount this at once during a soft navigation: the retained Workspace publishes
     * `work_unit_id: null` and the Work Unit publishes its id. With the whole context in the
     * dependency array, each write changed the context identity and re-ran the OTHER surface's
     * effect, which wrote its own scope back — an infinite update loop that pinned React at
     * "Maximum update depth exceeded" (~3,300 errors per entry, measured) and left the Work Unit
     * surface unable to commit at all.
     *
     * Selecting the stable setter means each sync re-runs only when ITS OWN scope props change,
     * so mount order decides the scope exactly as the unmount comment below always intended.
     */
    const setWorkspaceScope = assistant?.setWorkspaceScope ?? null;

    useEffect(() => {
        if (!setWorkspaceScope) return;
        if (!departmentId) {
            setWorkspaceScope(null);
            return;
        }
        setWorkspaceScope({
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
        setWorkspaceScope,
        departmentId,
        workUnitId,
        props.departmentName,
        props.workUnitName,
    ]);

    return null;
}
