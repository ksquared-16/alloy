/**
 * Workflow Assist Cards 4–5 — structured propose/apply contracts (deterministic; no LLM).
 */

import { createHash } from "node:crypto";

import type { WorkflowAssistDraftReviewV1 } from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";
import {
    buildWorkflowAssistScopeDisplay,
    buildWorkflowMetadataWithScope,
    type WorkflowAssistDraftActionScaffoldV1,
    type WorkflowAssistScopeDisplayV1,
    type WorkflowAssistWorkflowMetadataV1,
} from "@/lib/workflows/workflowScopeMetadata";

export const WORKFLOW_ASSIST_AGENT_KEY = "workflow_assist" as const;

export type WorkflowAssistProposalKindV1 = "create_workflow" | "edit_workflow" | "pause_workflow";

/** Row shape for create — mirrors `POST /api/admin/workflows` safe fields. */
export type WorkflowAssistCreateDraftV1 = {
    name: string;
    description?: string | null;
    event_type: string;
    entity_type: string;
    /** Default false in builder when omitted. */
    enabled?: boolean;
    metadata?: WorkflowAssistWorkflowMetadataV1;
    draft_action_scaffolds?: WorkflowAssistDraftActionScaffoldV1[];
};

export type WorkflowAssistEditPatchV1 = Partial<{
    name: string;
    description: string | null;
    event_type: string;
    entity_type: string;
    enabled: boolean;
}>;

export type WorkflowAssistProposeRequestV1 =
    | {
          version: 1;
          proposal_kind: "create_workflow";
          draft: WorkflowAssistCreateDraftV1;
      }
    | {
          version: 1;
          proposal_kind: "edit_workflow";
          workflow_id: string;
          patch: WorkflowAssistEditPatchV1;
      }
    | {
          version: 1;
          proposal_kind: "pause_workflow";
          workflow_id: string;
          reason?: string | null;
      };

export type WorkflowAssistEditReviewRowV1 = {
    field: string;
    label: string;
    current: string;
    proposed: string;
};

export type WorkflowAssistSuggestionV1 = {
    version: 1;
    agent_key: typeof WORKFLOW_ASSIST_AGENT_KEY;
    suggestion_id: string;
    org_id: string;
    actor_user_id: string;
    generated_at_iso: string;
    proposal_kind: WorkflowAssistProposalKindV1;
    /** Target workflow for edit/pause; null for create. */
    target_workflow_id: string | null;
    /** Full row to insert on apply (create). */
    draft_row: (WorkflowAssistCreateDraftV1 & { enabled: boolean; metadata?: Record<string, unknown> }) | null;
    /** Partial update on apply (edit / pause uses { enabled: false }). */
    patch: WorkflowAssistEditPatchV1 | null;
    /** Inserted on apply when template provides scaffolds (e.g. tour reminder log step). */
    draft_action_scaffolds?: WorkflowAssistDraftActionScaffoldV1[] | null;
    scope_display?: WorkflowAssistScopeDisplayV1 | null;
    /** Current vs proposed values for edit/pause review cards. */
    edit_review?: WorkflowAssistEditReviewRowV1[] | null;
    /** Advisory create draft review (AI-assisted enrichment + normalization). */
    draft_review?: WorkflowAssistDraftReviewV1 | null;
    reasoning: { summary: string; warnings: string[] };
    approval_required: true;
};

export type WorkflowAssistEditBeforeRowV1 = {
    name?: string | null;
    description?: string | null;
    enabled?: boolean | null;
    event_type?: string | null;
    entity_type?: string | null;
};

export function buildWorkflowAssistEditReviewRows(input: {
    proposal_kind: "edit_workflow" | "pause_workflow";
    patch: WorkflowAssistEditPatchV1;
    before: WorkflowAssistEditBeforeRowV1 | null;
}): WorkflowAssistEditReviewRowV1[] {
    if (input.proposal_kind === "pause_workflow") {
        const enabled = input.before?.enabled;
        return [
            {
                field: "enabled",
                label: "Status",
                current: enabled === false ? "Disabled" : "Enabled",
                proposed: "Disabled",
            },
        ];
    }
    const before = input.before;
    const rows: WorkflowAssistEditReviewRowV1[] = [];
    const patch = input.patch;
    if (patch.name !== undefined) {
        rows.push({
            field: "name",
            label: "Name",
            current: (before?.name ?? "—").trim() || "—",
            proposed: patch.name,
        });
    }
    if (patch.description !== undefined) {
        const cur = before?.description;
        rows.push({
            field: "description",
            label: "Description",
            current: cur == null || String(cur).trim() === "" ? "—" : String(cur),
            proposed: patch.description == null || String(patch.description).trim() === "" ? "—" : String(patch.description),
        });
    }
    if (patch.enabled === false) {
        rows.push({
            field: "enabled",
            label: "Status",
            current: before?.enabled === false ? "Disabled" : "Enabled",
            proposed: "Disabled",
        });
    }
    if (patch.event_type !== undefined) {
        rows.push({
            field: "event_type",
            label: "Trigger event",
            current: before?.event_type ?? "—",
            proposed: patch.event_type,
        });
    }
    if (patch.entity_type !== undefined) {
        rows.push({
            field: "entity_type",
            label: "Entity type",
            current: before?.entity_type ?? "—",
            proposed: patch.entity_type,
        });
    }
    return rows;
}

export type WorkflowAssistApplyRequestV1 = {
    version: 1;
    /** Must match server-computed id for the embedded proposal. */
    suggestion_id: string;
    proposal: WorkflowAssistSuggestionV1;
    confirm: true;
};

export type WorkflowAssistApplySuccessV1 = {
    ok: true;
    suggestion_id: string;
    proposal_kind: WorkflowAssistProposalKindV1;
    workflow_id: string;
    workflow: Record<string, unknown>;
    audit: {
        source: "workflow_assist_apply_v1";
        actor_user_id: string;
        org_id: string;
    };
};

export type WorkflowAssistApplyFailureV1 = {
    ok: false;
    error: string;
    message?: string | null;
    validation_errors?: string[] | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidString(v: string): boolean {
    return UUID_RE.test(String(v).trim());
}

function stableJson(value: unknown): string {
    if (value == null) return JSON.stringify(value);
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return JSON.stringify(value);
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    const norm: Record<string, unknown> = {};
    for (const k of keys) norm[k] = o[k];
    return JSON.stringify(norm);
}

export function canonicalForWorkflowAssistSuggestionId(
    orgId: string,
    proposalKind: WorkflowAssistProposalKindV1,
    body: unknown
): string {
    const h = createHash("sha256");
    h.update(orgId);
    h.update("|");
    h.update(proposalKind);
    h.update("|");
    h.update(stableJson(body));
    return `wa-${h.digest("hex").slice(0, 32)}`;
}

export function canonicalCreateWorkflowAssistSuggestionBody(proposal: WorkflowAssistSuggestionV1): unknown {
    return {
        draft: proposal.draft_row,
        draft_action_scaffolds: proposal.draft_action_scaffolds ?? null,
        scope_display: proposal.scope_display ?? null,
    };
}

export function computeWorkflowAssistSuggestionId(
    orgId: string,
    proposalKind: WorkflowAssistProposalKindV1,
    draftRow: WorkflowAssistSuggestionV1["draft_row"],
    patch: WorkflowAssistSuggestionV1["patch"],
    targetWorkflowId: string | null,
    createExtras?: { draft_action_scaffolds?: unknown; scope_display?: unknown }
): string {
    const body =
        proposalKind === "create_workflow" ?
            {
                draft: draftRow,
                draft_action_scaffolds: createExtras?.draft_action_scaffolds ?? null,
                scope_display: createExtras?.scope_display ?? null,
            }
        : proposalKind === "pause_workflow" ?
            { workflow_id: targetWorkflowId, patch }
        : { workflow_id: targetWorkflowId, patch };
    return canonicalForWorkflowAssistSuggestionId(orgId, proposalKind, body);
}

export type ParseWorkflowAssistProposeResult =
    | { ok: true; value: WorkflowAssistProposeRequestV1 }
    | { ok: false; error: string; message: string; status: number };

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export function parseWorkflowAssistProposeRequest(body: unknown): ParseWorkflowAssistProposeResult {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON", message: "Body must be a JSON object.", status: 400 };
    }
    if (body.version !== 1) {
        return { ok: false, error: "UNSUPPORTED_VERSION", message: "version must be 1.", status: 400 };
    }
    const kind = body.proposal_kind;
    if (kind === "create_workflow") {
        const draft = body.draft;
        if (!isRecord(draft)) {
            return { ok: false, error: "INVALID_DRAFT", message: "draft object is required.", status: 400 };
        }
        const name = typeof draft.name === "string" ? draft.name.trim() : "";
        const event_type = typeof draft.event_type === "string" ? draft.event_type.trim() : "";
        const entity_type = typeof draft.entity_type === "string" ? draft.entity_type.trim() : "";
        if (!name) return { ok: false, error: "INVALID_DRAFT", message: "draft.name is required.", status: 400 };
        if (!event_type) return { ok: false, error: "INVALID_DRAFT", message: "draft.event_type is required.", status: 400 };
        if (!entity_type) return { ok: false, error: "INVALID_DRAFT", message: "draft.entity_type is required.", status: 400 };
        const description =
            draft.description === undefined || draft.description === null ?
                null
            : typeof draft.description === "string" ?
                draft.description
            : null;
        const enabled = draft.enabled === true;
        if (enabled) {
            return {
                ok: false,
                error: "UNSUPPORTED_ENABLED",
                message: "Creating an enabled workflow via Assist is not allowed; set draft.enabled false or omit.",
                status: 400,
            };
        }
        const metadataRaw = draft.metadata;
        let metadata: WorkflowAssistWorkflowMetadataV1 | undefined;
        if (metadataRaw != null && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)) {
            metadata = metadataRaw as WorkflowAssistWorkflowMetadataV1;
            const scope = metadata.scope;
            if (scope) {
                if (scope.department_id != null && !isUuidString(String(scope.department_id))) {
                    return { ok: false, error: "INVALID_DRAFT", message: "metadata.scope.department_id must be a UUID.", status: 400 };
                }
                if (scope.work_unit_id != null && !isUuidString(String(scope.work_unit_id))) {
                    return { ok: false, error: "INVALID_DRAFT", message: "metadata.scope.work_unit_id must be a UUID.", status: 400 };
                }
            }
        }
        let draft_action_scaffolds: WorkflowAssistDraftActionScaffoldV1[] | undefined;
        if (Array.isArray(draft.draft_action_scaffolds)) {
            draft_action_scaffolds = draft.draft_action_scaffolds
                .filter((a): a is WorkflowAssistDraftActionScaffoldV1 => a != null && typeof a === "object")
                .slice(0, 8);
        }
        return {
            ok: true,
            value: {
                version: 1,
                proposal_kind: "create_workflow",
                draft: {
                    name,
                    description,
                    event_type,
                    entity_type,
                    enabled: false,
                    ...(metadata ? { metadata } : {}),
                    ...(draft_action_scaffolds?.length ? { draft_action_scaffolds } : {}),
                },
            },
        };
    }
    if (kind === "pause_workflow") {
        const workflow_id = typeof body.workflow_id === "string" ? body.workflow_id.trim() : "";
        if (!isUuidString(workflow_id)) {
            return { ok: false, error: "INVALID_WORKFLOW_ID", message: "workflow_id must be a UUID.", status: 400 };
        }
        return {
            ok: true,
            value: {
                version: 1,
                proposal_kind: "pause_workflow",
                workflow_id,
                reason: typeof body.reason === "string" ? body.reason : null,
            },
        };
    }
    if (kind === "edit_workflow") {
        const workflow_id = typeof body.workflow_id === "string" ? body.workflow_id.trim() : "";
        if (!isUuidString(workflow_id)) {
            return { ok: false, error: "INVALID_WORKFLOW_ID", message: "workflow_id must be a UUID.", status: 400 };
        }
        const patchRaw = body.patch;
        if (!isRecord(patchRaw)) {
            return { ok: false, error: "INVALID_PATCH", message: "patch object is required.", status: 400 };
        }
        const patch: WorkflowAssistEditPatchV1 = {};
        const ordered = ["description", "enabled", "entity_type", "event_type", "name"] as const;
        for (const k of ordered) {
            if (patchRaw[k] === undefined) continue;
            if (k === "description") {
                const d = patchRaw[k];
                patch.description = d === null || typeof d === "string" ? (d as string | null) : null;
                continue;
            }
            if (k === "enabled") {
                if (typeof patchRaw[k] === "boolean") {
                    if (patchRaw[k] === true) {
                        return {
                            ok: false,
                            error: "UNSUPPORTED_ENABLED",
                            message: "Enabling workflows via Assist is not allowed.",
                            status: 400,
                        };
                    }
                    patch.enabled = patchRaw[k];
                }
                continue;
            }
            if (typeof patchRaw[k] === "string") {
                (patch as Record<string, unknown>)[k] = (patchRaw[k] as string).trim();
            }
        }
        if (Object.keys(patch).length === 0) {
            return { ok: false, error: "INVALID_PATCH", message: "patch must include at least one allowed field.", status: 400 };
        }
        return {
            ok: true,
            value: { version: 1, proposal_kind: "edit_workflow", workflow_id, patch },
        };
    }
    return {
        ok: false,
        error: "UNSUPPORTED_PROPOSAL_KIND",
        message: "proposal_kind must be create_workflow, edit_workflow, or pause_workflow.",
        status: 400,
    };
}

export function buildWorkflowAssistSuggestionV1(input: {
    orgId: string;
    actorUserId: string;
    parsed: WorkflowAssistProposeRequestV1;
    scope_labels?: { department_name?: string | null; work_unit_name?: string | null };
    edit_before?: WorkflowAssistEditBeforeRowV1 | null;
}): WorkflowAssistSuggestionV1 {
    const generated_at_iso = new Date().toISOString();
    const warnings: string[] = [];

    if (input.parsed.proposal_kind === "create_workflow") {
        const d = input.parsed.draft;
        const metadataRecord = buildWorkflowMetadataWithScope({
            scope: d.metadata?.scope ?? null,
            workflow_assist: d.metadata?.workflow_assist,
        });
        const draft_row = {
            name: d.name,
            description: d.description ?? null,
            event_type: d.event_type,
            entity_type: d.entity_type,
            enabled: false,
            ...(Object.keys(metadataRecord).length > 0 ? { metadata: metadataRecord } : {}),
        };
        const draft_action_scaffolds = d.draft_action_scaffolds?.length ? d.draft_action_scaffolds : null;
        const scope_display = buildWorkflowAssistScopeDisplay({
            scope: d.metadata?.scope ?? null,
            labels: input.scope_labels,
        });
        warnings.push("Workflow will be created disabled. Review in Automations before enabling.");
        if (d.name === "Tour Reminder Draft") {
            warnings.push("Action scaffold requires review.");
            warnings.push("Review message content before enabling.");
            warnings.push("Workflow remains disabled until enabled in Automations.");
        }
        if (d.name === "Status transition draft (review required)") {
            warnings.push("Form-complete trigger and target status must be configured manually.");
        }
        const suggestion_id = computeWorkflowAssistSuggestionId(
            input.orgId,
            "create_workflow",
            draft_row,
            null,
            null,
            { draft_action_scaffolds, scope_display }
        );
        return {
            version: 1,
            agent_key: WORKFLOW_ASSIST_AGENT_KEY,
            suggestion_id,
            org_id: input.orgId,
            actor_user_id: input.actorUserId,
            generated_at_iso,
            proposal_kind: "create_workflow",
            target_workflow_id: null,
            draft_row,
            patch: null,
            draft_action_scaffolds,
            scope_display,
            reasoning: {
                summary: `Create disabled workflow “${draft_row.name}” (${scope_display.label}) on ${draft_row.event_type} / ${draft_row.entity_type}.`,
                warnings,
            },
            approval_required: true,
        };
    }
    if (input.parsed.proposal_kind === "pause_workflow") {
        const patch = { enabled: false };
        const suggestion_id = computeWorkflowAssistSuggestionId(
            input.orgId,
            "pause_workflow",
            null,
            patch,
            input.parsed.workflow_id
        );
        warnings.push("Disables automation for this workflow until re-enabled in Automations.");
        const edit_review = buildWorkflowAssistEditReviewRows({
            proposal_kind: "pause_workflow",
            patch,
            before: input.edit_before ?? null,
        });
        return {
            version: 1,
            agent_key: WORKFLOW_ASSIST_AGENT_KEY,
            suggestion_id,
            org_id: input.orgId,
            actor_user_id: input.actorUserId,
            generated_at_iso,
            proposal_kind: "pause_workflow",
            target_workflow_id: input.parsed.workflow_id,
            draft_row: null,
            patch,
            edit_review,
            reasoning: {
                summary: `Disable (pause) workflow ${input.parsed.workflow_id}.`,
                warnings,
            },
            approval_required: true,
        };
    }
    const patch = input.parsed.patch;
    const suggestion_id = computeWorkflowAssistSuggestionId(
        input.orgId,
        "edit_workflow",
        null,
        patch,
        input.parsed.workflow_id
    );
    warnings.push("Applies only allowed workflow fields; conditions and actions are unchanged.");
    const edit_review = buildWorkflowAssistEditReviewRows({
        proposal_kind: "edit_workflow",
        patch,
        before: input.edit_before ?? null,
    });
    return {
        version: 1,
        agent_key: WORKFLOW_ASSIST_AGENT_KEY,
        suggestion_id,
        org_id: input.orgId,
        actor_user_id: input.actorUserId,
        generated_at_iso,
        proposal_kind: "edit_workflow",
        target_workflow_id: input.parsed.workflow_id,
        draft_row: null,
        patch,
        edit_review,
        reasoning: {
            summary: `Update workflow ${input.parsed.workflow_id} with ${Object.keys(patch).join(", ")}.`,
            warnings,
        },
        approval_required: true,
    };
}

export function verifyWorkflowAssistSuggestionId(proposal: WorkflowAssistSuggestionV1): boolean {
    const expected =
        proposal.proposal_kind === "create_workflow" ?
            canonicalForWorkflowAssistSuggestionId(
                proposal.org_id,
                "create_workflow",
                canonicalCreateWorkflowAssistSuggestionBody(proposal)
            )
        :   computeWorkflowAssistSuggestionId(
                proposal.org_id,
                proposal.proposal_kind,
                proposal.draft_row,
                proposal.patch,
                proposal.target_workflow_id
            );
    return expected === proposal.suggestion_id;
}

export function validateWorkflowAssistSuggestionSemantics(
    proposal: WorkflowAssistSuggestionV1
): { ok: true } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    if (proposal.version !== 1) errors.push("version must be 1");
    if (proposal.agent_key !== WORKFLOW_ASSIST_AGENT_KEY) errors.push("agent_key invalid");
    if (!verifyWorkflowAssistSuggestionId(proposal)) errors.push("suggestion_id mismatch");
    if (proposal.approval_required !== true) errors.push("approval_required must be true");

    if (proposal.proposal_kind === "create_workflow") {
        if (proposal.target_workflow_id != null) errors.push("create: target_workflow_id must be null");
        if (proposal.patch != null) errors.push("create: patch must be null");
        if (!proposal.draft_row) errors.push("create: draft_row required");
        else {
            if (!String(proposal.draft_row.name ?? "").trim()) errors.push("create: name required");
            if (!String(proposal.draft_row.event_type ?? "").trim()) errors.push("create: event_type required");
            if (!String(proposal.draft_row.entity_type ?? "").trim()) errors.push("create: entity_type required");
            if (proposal.draft_row.enabled !== false) errors.push("create: draft must be disabled");
        }
    } else if (proposal.proposal_kind === "pause_workflow") {
        if (proposal.draft_row != null) errors.push("pause: draft_row must be null");
        if (!proposal.target_workflow_id || !isUuidString(proposal.target_workflow_id)) {
            errors.push("pause: workflow id invalid");
        }
        if (!proposal.patch || proposal.patch.enabled !== false) {
            errors.push("pause: patch must set enabled to false");
        }
    } else if (proposal.proposal_kind === "edit_workflow") {
        if (proposal.draft_row != null) errors.push("edit: draft_row must be null");
        if (!proposal.target_workflow_id || !isUuidString(proposal.target_workflow_id)) {
            errors.push("edit: workflow id invalid");
        }
        if (!proposal.patch || Object.keys(proposal.patch).length === 0) {
            errors.push("edit: patch required");
        }
    }

    return errors.length ? { ok: false, errors } : { ok: true };
}

export type ParseWorkflowAssistApplyResult =
    | { ok: true; value: WorkflowAssistApplyRequestV1 }
    | { ok: false; error: string; message: string; status: number; validation_errors?: string[] };

export function parseWorkflowAssistApplyRequest(body: unknown): ParseWorkflowAssistApplyResult {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON", message: "Body must be a JSON object.", status: 400 };
    }
    if (body.version !== 1) {
        return { ok: false, error: "UNSUPPORTED_VERSION", message: "version must be 1.", status: 400 };
    }
    if (body.confirm !== true) {
        return { ok: false, error: "CONFIRM_REQUIRED", message: "confirm must be true.", status: 400 };
    }
    const suggestion_id = typeof body.suggestion_id === "string" ? body.suggestion_id.trim() : "";
    if (!suggestion_id) {
        return { ok: false, error: "MISSING_SUGGESTION_ID", message: "suggestion_id is required.", status: 400 };
    }
    const proposal = body.proposal;
    if (!isRecord(proposal)) {
        return { ok: false, error: "MISSING_PROPOSAL", message: "proposal object is required.", status: 400 };
    }
    const ve: string[] = [];
    if (proposal.version !== 1) ve.push("proposal.version must be 1");
    if (proposal.agent_key !== WORKFLOW_ASSIST_AGENT_KEY) ve.push("proposal.agent_key must be workflow_assist");
    if (typeof proposal.org_id !== "string" || !proposal.org_id.trim()) ve.push("proposal.org_id invalid");
    if (typeof proposal.actor_user_id !== "string" || !proposal.actor_user_id.trim()) ve.push("proposal.actor_user_id invalid");
    if (typeof proposal.generated_at_iso !== "string") ve.push("proposal.generated_at_iso invalid");
    const pk = proposal.proposal_kind;
    if (pk !== "create_workflow" && pk !== "edit_workflow" && pk !== "pause_workflow") {
        ve.push("proposal.proposal_kind invalid");
    }
    if (proposal.approval_required !== true) ve.push("proposal.approval_required must be true");
    if (ve.length) {
        return {
            ok: false,
            error: "INVALID_PROPOSAL",
            message: "Proposal failed structural validation.",
            status: 400,
            validation_errors: ve,
        };
    }
    const typed = proposal as unknown as WorkflowAssistSuggestionV1;
    if (!verifyWorkflowAssistSuggestionId(typed)) {
        return {
            ok: false,
            error: "SUGGESTION_ID_MISMATCH",
            message: "suggestion_id does not match proposal payload (tamper check).",
            status: 400,
        };
    }
    if (typed.suggestion_id !== suggestion_id) {
        return {
            ok: false,
            error: "SUGGESTION_ID_MISMATCH",
            message: "Top-level suggestion_id must match proposal.suggestion_id.",
            status: 400,
        };
    }
    return {
        ok: true,
        value: {
            version: 1,
            suggestion_id,
            proposal: typed,
            confirm: true,
        },
    };
}
