/**
 * Delete Lead — destructive preview/commit adapter (P4.S3).
 *
 * Domain authority: previewOpportunityLeadDeletion + executeDeleteOpportunityLead.
 * Shared destructive runtime does not query lead tables; this adapter does.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    executeDeleteOpportunityLead,
    previewOpportunityLeadDeletion,
    type OpportunityLeadDeletionPreview,
    type OpportunityLeadDeletionResult,
} from "@/lib/admin/opportunity/deleteOpportunityLead";
import type { InvocationDelegationGuard } from "@/lib/platform/commands/runtime/commandExecutionTypes";
import type { CommandImpactPreview } from "@/lib/platform/commands/runtime/destructive/commandImpactPreviewTypes";
import { assertDestructivePreviewInvariants } from "@/lib/platform/commands/runtime/destructive/destructiveCommandInvariants";
import { evaluateDestructivePermissionClass } from "@/lib/platform/commands/runtime/destructive/destructivePermissionSeam";
import {
    getDestructiveCommandPolicy,
    requireDestructiveCommandPolicy,
} from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";
import {
    issueDestructivePreviewToken,
    validateDestructivePreviewToken,
} from "@/lib/platform/commands/runtime/destructive/destructivePreviewToken";

function trim(v: unknown): string {
    return String(v ?? "").trim();
}

/** Operator-facing typed confirmation — never a full UUID. */
export function resolveDeleteLeadTypedValue(opportunityName: string | null | undefined): string {
    const label = trim(opportunityName).slice(0, 64);
    return label || "DELETE";
}

export function fingerprintsDeleteLeadImpact(preview: OpportunityLeadDeletionPreview): string {
    const payload = JSON.stringify({
        blocked: preview.blocked,
        will_delete: preview.will_delete,
        will_retain: preview.will_retain,
    });
    return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function buildDeleteLeadDomainVersion(preview: OpportunityLeadDeletionPreview): string {
    return [
        `opp:${preview.opportunity_id.trim()}`,
        `blocked:${preview.blocked ? "1" : "0"}`,
        `impact:${fingerprintsDeleteLeadImpact(preview)}`,
    ].join("|");
}

export function resolveDeleteLeadOpportunityId(input: {
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
}): string | { error: string } {
    const values = input.inputValues ?? {};
    const fromPayload =
        trim(values.opportunity_id) ||
        trim(values.opportunityId) ||
        trim(values.lead_id) ||
        trim(values.leadId);
    const entityType = trim(input.entityType).toLowerCase();
    const entityId = trim(input.entityId);
    if (
        entityType === "opportunity" ||
        entityType === "opportunities" ||
        entityType === "lead" ||
        entityType === "case"
    ) {
        return fromPayload || entityId || { error: "opportunity_id is required for Delete Lead." };
    }
    if (fromPayload) return fromPayload;
    return { error: "opportunity_id is required for Delete Lead." };
}

export type DeleteLeadPreviewState = {
    opportunityId: string;
    domainPreview: OpportunityLeadDeletionPreview;
    typedValue: string;
    domainVersion: string;
};

export function buildDeleteLeadImpactPreview(input: {
    orgId: string;
    state: DeleteLeadPreviewState;
}): CommandImpactPreview {
    const policy = requireDestructiveCommandPolicy("delete_lead");
    const { state } = input;
    const dp = state.domainPreview;
    const { previewId, token, claims } = issueDestructivePreviewToken({
        capabilityKey: policy.capabilityKey,
        subjectType: "opportunity",
        subjectId: state.opportunityId,
        orgId: input.orgId,
        impactClass: policy.impactClass,
        confirmation: policy.confirmation,
        version: state.domainVersion,
        ttlSeconds:
            policy.previewFreshness.mode === "ttl" ? policy.previewFreshness.seconds : 300,
    });

    const affectedRecords: Array<CommandImpactPreview["affectedRecords"][number]> = [
        {
            type: "opportunity",
            id: state.opportunityId,
            label: dp.opportunity_name ?? undefined,
            effect: "deleted",
        },
    ];

    if (dp.will_delete.enrollment_records > 0) {
        affectedRecords.push({
            type: "enrollment_participation",
            label: `${dp.will_delete.enrollment_records} enrollment record(s)`,
            effect: "deleted",
        });
    }
    if (dp.will_delete.communication_threads > 0 || dp.will_delete.communication_messages > 0) {
        affectedRecords.push({
            type: "communication",
            label: `${dp.will_delete.communication_threads} thread(s), ${dp.will_delete.communication_messages} message(s)`,
            effect: "deleted",
        });
    }
    if (dp.will_delete.documents > 0) {
        affectedRecords.push({
            type: "document",
            label: `${dp.will_delete.documents} document(s)`,
            effect: "deleted",
        });
    }
    if (dp.will_delete.form_submissions > 0) {
        affectedRecords.push({
            type: "form_submission",
            label: `${dp.will_delete.form_submissions} form submission(s)`,
            effect: "deleted",
        });
    }
    if (dp.will_delete.tasks > 0) {
        affectedRecords.push({
            type: "task",
            label: `${dp.will_delete.tasks} task(s)`,
            effect: "deleted",
        });
    }
    if (dp.will_delete.placement_candidates > 0) {
        affectedRecords.push({
            type: "tour_or_placement",
            label: `${dp.will_delete.placement_candidates} placement/tour-related record(s)`,
            effect: "deleted",
        });
    }
    if (dp.will_delete.persons > 0 || dp.will_delete.customers > 0) {
        affectedRecords.push({
            type: "identity",
            label: `${dp.will_delete.persons} person(s), ${dp.will_delete.customers} household(s) with no other refs`,
            effect: "deleted",
        });
    }

    const warnings: Array<{ code: string; message: string }> = [
        {
            code: "irreversible",
            message: "This permanently deletes the lead. There is no restore path.",
        },
        {
            code: "work_unit_retained",
            message: "Work units are not deleted by Delete Lead.",
        },
    ];
    if (dp.will_retain.persons > 0 || dp.will_retain.customers > 0) {
        warnings.push({
            code: "identity_retained",
            message: `${dp.will_retain.persons} person(s) and ${dp.will_retain.customers} household(s) remain because they are still referenced elsewhere.`,
        });
    }

    const blockers: Array<{ code: string; message: string }> = [];
    if (dp.blocked) {
        blockers.push({
            code: "deletion_blocked",
            message: dp.block_reason ?? "Deletion is blocked for this lead.",
        });
    }

    const preview: CommandImpactPreview = {
        previewId,
        capabilityKey: policy.capabilityKey,
        generatedAt: new Date(claims.iat * 1000).toISOString(),
        subject: {
            type: "opportunity",
            id: state.opportunityId,
            label: dp.opportunity_name ?? undefined,
        },
        impactClass: policy.impactClass,
        reversibility: policy.reversibility,
        affectedRecords,
        warnings,
        blockers,
        downstreamEffects: [
            {
                type: "hard_delete",
                description:
                    "Hard-deletes the opportunity and scoped dependents; does not soft-delete or archive.",
            },
            {
                type: "audit",
                description: "Console admin audit entry is recorded; no restore ledger is written.",
            },
        ],
        confirmation: {
            policy: policy.confirmation,
            typedValue: state.typedValue,
        },
        recovery: {
            kind: "none",
            description: "No supported restore path.",
        },
        freshness: {
            strategy:
                policy.previewFreshness.mode === "version_match"
                    ? "version_match"
                    : policy.previewFreshness.mode === "same_request"
                      ? "same_request"
                      : "ttl",
            version: state.domainVersion,
            expiresAt: new Date(claims.exp * 1000).toISOString(),
        },
        previewToken: token,
    };

    assertDestructivePreviewInvariants(preview, policy);
    return preview;
}

export type DeleteLeadReplacementResult = {
    kind: "destructive_delete";
    opportunity_id: string;
    deleted: Record<string, number>;
    orphans: Record<string, number>;
    audit_logged: boolean;
};

export type DeleteLeadAdapterDeps = {
    previewOpportunityLeadDeletion?: typeof previewOpportunityLeadDeletion;
    executeDeleteOpportunityLead?: typeof executeDeleteOpportunityLead;
};

export async function previewDeleteLeadViaAdapter(input: {
    orgId: string;
    supabase: SupabaseClient;
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
    trustedServerContext: boolean;
    deps?: DeleteLeadAdapterDeps;
}): Promise<
    | { ok: true; preview: CommandImpactPreview; state: DeleteLeadPreviewState }
    | { ok: false; code: string; operatorMessage: string }
> {
    const policy = getDestructiveCommandPolicy("delete_lead");
    if (!policy || policy.impactClass !== "delete") {
        return {
            ok: false,
            code: "missing_destructive_policy",
            operatorMessage: "This command is not available.",
        };
    }

    const permission = evaluateDestructivePermissionClass({
        capabilityKey: "delete_lead",
        trustedServerContext: input.trustedServerContext,
        clientPermissionClass: null,
    });
    if (!permission.allowed) {
        return {
            ok: false,
            code: permission.reasonCode ?? "permission_denied",
            operatorMessage: "You do not have permission to run this command.",
        };
    }

    const opportunityId = resolveDeleteLeadOpportunityId({
        entityType: input.entityType,
        entityId: input.entityId,
        inputValues: input.inputValues,
    });
    if (typeof opportunityId !== "string") {
        return { ok: false, code: "invalid_inputs", operatorMessage: opportunityId.error };
    }

    const runPreview =
        input.deps?.previewOpportunityLeadDeletion ?? previewOpportunityLeadDeletion;
    const domainPreview = await runPreview(input.supabase, input.orgId, opportunityId);
    if (!domainPreview) {
        return {
            ok: false,
            code: "lead_not_found",
            operatorMessage: "Lead not found.",
        };
    }

    const state: DeleteLeadPreviewState = {
        opportunityId,
        domainPreview,
        typedValue: resolveDeleteLeadTypedValue(domainPreview.opportunity_name),
        domainVersion: buildDeleteLeadDomainVersion(domainPreview),
    };
    const preview = buildDeleteLeadImpactPreview({ orgId: input.orgId, state });
    return { ok: true, preview, state };
}

export async function commitDeleteLeadViaAdapter(input: {
    orgId: string;
    userId?: string | null;
    actorRole?: string | null;
    supabase: SupabaseClient;
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
    previewToken: string;
    confirmation: { confirmed: boolean; confirmationValue?: string };
    trustedServerContext: boolean;
    clientPermissionClass?: string | null;
    clientImpactClass?: string | null;
    guard: InvocationDelegationGuard;
    deps?: DeleteLeadAdapterDeps;
}): Promise<
    | { ok: true; result: DeleteLeadReplacementResult; delegated: true }
    | { ok: false; code: string; operatorMessage: string; delegated: boolean }
> {
    void input.clientPermissionClass;
    void input.clientImpactClass;

    const policy = getDestructiveCommandPolicy("delete_lead");
    if (!policy || policy.impactClass !== "delete") {
        return {
            ok: false,
            code: "missing_destructive_policy",
            operatorMessage: "This command is not available.",
            delegated: false,
        };
    }

    const permission = evaluateDestructivePermissionClass({
        capabilityKey: "delete_lead",
        trustedServerContext: input.trustedServerContext,
        clientPermissionClass: input.clientPermissionClass,
    });
    if (!permission.allowed) {
        return {
            ok: false,
            code: permission.reasonCode ?? "permission_denied",
            operatorMessage: "You do not have permission to run this command.",
            delegated: false,
        };
    }

    if (input.confirmation.confirmed !== true) {
        return {
            ok: false,
            code: "confirmation_required",
            operatorMessage: "Confirm before continuing.",
            delegated: false,
        };
    }

    const opportunityId = resolveDeleteLeadOpportunityId({
        entityType: input.entityType,
        entityId: input.entityId,
        inputValues: input.inputValues,
    });
    if (typeof opportunityId !== "string") {
        return {
            ok: false,
            code: "invalid_inputs",
            operatorMessage: opportunityId.error,
            delegated: false,
        };
    }

    const runPreview =
        input.deps?.previewOpportunityLeadDeletion ?? previewOpportunityLeadDeletion;
    const domainPreview = await runPreview(input.supabase, input.orgId, opportunityId);
    if (!domainPreview) {
        return {
            ok: false,
            code: "lead_not_found",
            operatorMessage: "Lead not found.",
            delegated: false,
        };
    }

    if (domainPreview.blocked) {
        return {
            ok: false,
            code: "deletion_blocked",
            operatorMessage: domainPreview.block_reason ?? "Deletion is blocked for this lead.",
            delegated: false,
        };
    }

    const typedValue = resolveDeleteLeadTypedValue(domainPreview.opportunity_name);
    const provided = trim(input.confirmation.confirmationValue);
    if (provided !== typedValue) {
        return {
            ok: false,
            code: "typed_confirmation_mismatch",
            operatorMessage: "Typed confirmation does not match.",
            delegated: false,
        };
    }

    const domainVersion = buildDeleteLeadDomainVersion(domainPreview);
    const tokenValidation = validateDestructivePreviewToken({
        token: input.previewToken,
        expected: {
            capabilityKey: "delete_lead",
            subjectType: "opportunity",
            subjectId: opportunityId,
            orgId: input.orgId,
            impactClass: "delete",
            confirmation: "typed_confirm",
            version: domainVersion,
        },
    });
    if (!tokenValidation.ok) {
        return {
            ok: false,
            code:
                tokenValidation.code === "expired" || tokenValidation.code === "claim_mismatch"
                    ? "stale_preview"
                    : tokenValidation.code,
            operatorMessage:
                tokenValidation.code === "expired" || tokenValidation.code === "claim_mismatch"
                    ? "Preview is stale. Generate a new preview."
                    : "Preview token is invalid.",
            delegated: false,
        };
    }

    const actorUserId = trim(input.userId);
    if (!actorUserId) {
        return {
            ok: false,
            code: "missing_actor",
            operatorMessage: "Authenticated actor is required.",
            delegated: false,
        };
    }
    const actorRole = trim(input.actorRole) || "admin";

    input.guard.markDelegated();

    const runDelete = input.deps?.executeDeleteOpportunityLead ?? executeDeleteOpportunityLead;
    try {
        const writeResult: OpportunityLeadDeletionResult = await runDelete({
            supabase: input.supabase,
            orgId: input.orgId,
            opportunityId,
            actorUserId,
            actorRole,
        });

        const orphanTotal = Object.values(writeResult.orphans).reduce((sum, n) => sum + n, 0);
        if (orphanTotal > 0 && (writeResult.orphans.opportunities ?? 0) > 0) {
            return {
                ok: false,
                code: "delete_incomplete",
                operatorMessage:
                    "Delete failed — the opportunity still exists. Check linked records and try again.",
                delegated: true,
            };
        }

        return {
            ok: true,
            delegated: true,
            result: {
                kind: "destructive_delete",
                opportunity_id: opportunityId,
                deleted: writeResult.deleted,
                orphans: writeResult.orphans,
                audit_logged: writeResult.audit_logged,
            },
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Delete failed";
        return {
            ok: false,
            code: message.toLowerCase().includes("not found") ? "lead_not_found" : "domain_failure",
            operatorMessage: message,
            delegated: true,
        };
    }
}
