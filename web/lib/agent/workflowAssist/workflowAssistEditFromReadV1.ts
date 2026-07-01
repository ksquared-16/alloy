import type { WorkflowAssistEditPatchV1, WorkflowAssistProposeRequestV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

/** Fields Workflow Assist read cards may propose (no triggers, graph, or enable). */
export const WORKFLOW_ASSIST_NARROW_EDIT_FIELDS = ["name", "description"] as const;

export type WorkflowAssistNarrowEditFieldV1 = (typeof WORKFLOW_ASSIST_NARROW_EDIT_FIELDS)[number];

export function assertNarrowWorkflowAssistEditPatch(
    patch: WorkflowAssistEditPatchV1
): { ok: true } | { ok: false; error: string; message: string } {
    if (patch.enabled === true) {
        return {
            ok: false,
            error: "UNSUPPORTED_ENABLED",
            message: "Enabling workflows via Assist is not allowed.",
        };
    }
    if (patch.event_type !== undefined || patch.entity_type !== undefined) {
        return {
            ok: false,
            error: "UNSUPPORTED_PATCH_FIELD",
            message: "Trigger and entity changes are not supported from read cards.",
        };
    }
    if (patch.enabled === false && Object.keys(patch).length === 1) {
        return { ok: true };
    }
    const narrowKeys = Object.keys(patch).filter(
        (k) => (WORKFLOW_ASSIST_NARROW_EDIT_FIELDS as readonly string[]).includes(k) || k === "enabled"
    );
    if (narrowKeys.length !== Object.keys(patch).length) {
        return {
            ok: false,
            error: "UNSUPPORTED_PATCH_FIELD",
            message: "Only name and description edits are supported from read cards.",
        };
    }
    return { ok: true };
}

export function buildWorkflowAssistEditRenameProposeBody(input: {
    workflow_id: string;
    proposed_name: string;
}): WorkflowAssistProposeRequestV1 {
    return {
        version: 1,
        proposal_kind: "edit_workflow",
        workflow_id: input.workflow_id,
        patch: { name: input.proposed_name.trim() },
    };
}

export function buildWorkflowAssistEditDescriptionProposeBody(input: {
    workflow_id: string;
    proposed_description: string | null;
}): WorkflowAssistProposeRequestV1 {
    return {
        version: 1,
        proposal_kind: "edit_workflow",
        workflow_id: input.workflow_id,
        patch: { description: input.proposed_description },
    };
}

export function buildWorkflowAssistPauseProposeBody(workflow_id: string): WorkflowAssistProposeRequestV1 {
    return { version: 1, proposal_kind: "pause_workflow", workflow_id };
}

/** Deterministic suffix when the operator skips the rename prompt. */
export function workflowAssistRenameFallbackName(currentName: string): string {
    const base = currentName.trim() || "Workflow";
    return base.endsWith(" (review)") ? base : `${base} (review)`;
}

export const WORKFLOW_ASSIST_DESCRIPTION_NOTE_DEFAULT =
    "Reviewed via Workflow Assist — update details in Automations before enabling." as const;
