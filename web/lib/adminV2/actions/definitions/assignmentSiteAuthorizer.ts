/**
 * BP V2 S4A — one site authority for every action that writes an operational assignment.
 * Binds an action key to `authorizeAssignmentCommandSites`; `runRegisteredAction` enforces it.
 */
import type { ActionHandlerDeps, ActionSiteVerdict } from "@/lib/adminV2/actions/actionTypes";
import { authorizeAssignmentCommandSites } from "@/lib/operationalAssignments/assignmentSiteAuthority";

export function assignmentSiteAuthorizer(actionKey: string): (deps: ActionHandlerDeps) => Promise<ActionSiteVerdict> {
    return (deps) =>
        authorizeAssignmentCommandSites({
            supabase: deps.supabase,
            orgId: deps.ctx.orgId,
            accessScope: deps.ctx.accessScope ?? null,
            actionKey,
            entityId: deps.invocation.entityId,
            payload: deps.payload,
        });
}
