"use client";

/**
 * Create Lead — platform Command Surface host (Command Surface V3, Phase 2 + 4 + 5).
 *
 * This is the single platform-owned entry component every operator surface uses to run
 * Create Lead (Work Unit Actions, BOS-launched intake, manual rail). It hosts the existing,
 * protected `CreateLeadModal` as the intake **body** and owns the parts of the command
 * lifecycle that must be identical across entry points:
 *
 *   - **Execution** runs through the shared `executeCreateLeadCommand` adapter → the registered
 *     `create_lead` action via `POST /api/admin/actions/execute`. No forked mutation path.
 *   - **Success / refresh** is standardized through `buildCreateLeadSuccess`: created record id,
 *     entity type, open target, and refresh targets all derive from one descriptor.
 *
 * The rich intake (paste-parse, field confidence, multi-member commit, record resolution) and
 * the visible workspace shell remain owned by `CreateLeadModal` — this wrapper does NOT rewrite
 * modal internals. The literal visible swap of the modal chrome for `CommandSurfaceShell` is
 * intentionally deferred (see docs/sprints/06_2026/command_surface_v3.md) to avoid regressing
 * that intake.
 *
 * @see web/lib/platform/commands/createLead/executeCreateLeadCommand.ts
 * @see web/lib/platform/commands/createLead/createLeadSuccess.ts
 */

import {
    CreateLeadModal,
    type CreateLeadFormPayload,
} from "@/components/admin/opportunity/actions/CreateLeadModal";
import { executeCreateLeadCommand } from "@/lib/platform/commands/createLead/executeCreateLeadCommand";
import {
    buildCreateLeadSuccess,
    type CreateLeadSuccess,
} from "@/lib/platform/commands/createLead/createLeadSuccess";

export type CreateLeadCommandSurfaceProps = {
    open: boolean;
    departmentId: string | null;
    /** Work unit scope for audit/context, when launched from a work unit. */
    workUnitId?: string | null;
    /** Physical surface for audit/analytics (e.g. "right_rail", "work_unit", "workspace"). */
    surface?: string;
    title?: string;
    onClose: () => void;
    /** Open the created record (focus panel / drawer). Receives the authoritative created id. */
    onOpenCreatedRecord: (opportunityId: string) => void;
    /**
     * Standardized refresh hook. Called with the success descriptor so the host can invalidate
     * focus-panel/queue caches per `refreshTargets` instead of a full reload. Optional: when a
     * host prefers `router.refresh()`, it can do so in `onOpenCreatedRecord`.
     */
    onRefresh?: (success: CreateLeadSuccess) => void;
};

/**
 * Platform Command Surface host for Create Lead. Presentational composition only — all command
 * lifecycle (execution + success) is delegated to the shared platform command modules.
 */
export function CreateLeadCommandSurface(props: CreateLeadCommandSurfaceProps) {
    const {
        open,
        departmentId,
        workUnitId = null,
        surface,
        title,
        onClose,
        onOpenCreatedRecord,
        onRefresh,
    } = props;

    return (
        <CreateLeadModal
            open={open}
            departmentId={departmentId}
            title={title}
            onClose={onClose}
            onSubmit={async (payload: CreateLeadFormPayload) => {
                const result = await executeCreateLeadCommand({
                    payload,
                    departmentId,
                    workUnitId,
                    surface,
                });
                if (!result.ok) {
                    throw new Error(
                        result.error ||
                            "I couldn’t create the lead. Review the information and try again."
                    );
                }
                const success = buildCreateLeadSuccess({ result, knownInputs: payload });
                if (!success.createdRecordId) {
                    throw new Error("Lead was created but no opportunity id was returned.");
                }
                onRefresh?.(success);
                return { opportunity_id: success.createdRecordId };
            }}
            onCreated={(opportunityId) => onOpenCreatedRecord(opportunityId)}
        />
    );
}
