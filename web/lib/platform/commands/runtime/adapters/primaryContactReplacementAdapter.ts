/**
 * Make Primary Contact — replacement preview/commit adapter (P4.S2).
 *
 * Domain authority remains setHouseholdPrimaryContactForCustomer + event emit.
 * Shared destructive runtime does not query household tables; this adapter does.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitHouseholdPrimaryContactChangedEvent } from "@/lib/admin/person/emitHouseholdPrimaryContactChangedEvent";
import { resolveCustomerHouseholdPrimaryContactPersonId } from "@/lib/admin/person/householdPrimaryContact";
import { setHouseholdPrimaryContactForCustomer } from "@/lib/admin/person/setHouseholdPrimaryContact";
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

function personLabel(row: {
    first_name?: string | null;
    last_name?: string | null;
} | null): string | undefined {
    if (!row) return undefined;
    const label = `${trim(row.first_name)} ${trim(row.last_name)}`.trim();
    return label || undefined;
}

/** Stable fingerprint of opportunity impact (ids sorted) — no PII. */
export function fingerprintOpportunityImpact(opportunityIds: readonly string[]): string {
    const sorted = [...opportunityIds].map((id) => id.trim()).filter(Boolean).sort();
    return createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 32);
}

export function buildMakePrimaryDomainVersion(input: {
    customerId: string;
    selectedPersonId: string;
    currentPrimaryPersonId: string | null;
    opportunityIds: readonly string[];
}): string {
    const oppFp = fingerprintOpportunityImpact(input.opportunityIds);
    return [
        `customer:${input.customerId.trim()}`,
        `selected:${input.selectedPersonId.trim()}`,
        `current:${input.currentPrimaryPersonId?.trim() || "none"}`,
        `opp:${oppFp}`,
        `count:${input.opportunityIds.length}`,
    ].join("|");
}

export type MakePrimaryResolvedInputs = {
    customerId: string;
    selectedPersonId: string;
};

/**
 * Resolve customer + selected person from execution subject + payload.
 * Client cannot supply previous primary as authority.
 */
export function resolveMakePrimaryInputs(input: {
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
}): MakePrimaryResolvedInputs | { error: string } {
    const values = input.inputValues ?? {};
    const personFromPayload =
        trim(values.person_id) ||
        trim(values.personId) ||
        trim(values.selected_person_id) ||
        trim(values.selectedPersonId) ||
        trim(values.target_person_id) ||
        trim(values.targetPersonId);
    const customerFromPayload =
        trim(values.customer_id) ||
        trim(values.customerId) ||
        trim(values.household_id) ||
        trim(values.householdId);

    const entityType = trim(input.entityType).toLowerCase();
    const entityId = trim(input.entityId);

    let customerId = customerFromPayload;
    let selectedPersonId = personFromPayload;

    if (entityType === "customers" || entityType === "customer" || entityType === "household") {
        customerId = customerId || entityId;
    }
    if (entityType === "persons" || entityType === "person") {
        selectedPersonId = selectedPersonId || entityId;
    }

    if (!customerId) {
        return { error: "customer_id is required for Make Primary Contact." };
    }
    if (!selectedPersonId) {
        return { error: "person_id is required for Make Primary Contact." };
    }
    return { customerId, selectedPersonId };
}

export type MakePrimaryPreviewDomainState = {
    customerId: string;
    selectedPersonId: string;
    selectedLabel?: string;
    currentPrimaryPersonId: string | null;
    currentPrimaryLabel?: string;
    opportunityIds: string[];
    domainVersion: string;
    alreadyPrimary: boolean;
};

export async function readMakePrimaryPreviewDomainState(
    supabase: SupabaseClient,
    input: { orgId: string; customerId: string; selectedPersonId: string }
): Promise<MakePrimaryPreviewDomainState | { error: string; code: string }> {
    const orgId = trim(input.orgId);
    const customerId = trim(input.customerId);
    const selectedPersonId = trim(input.selectedPersonId);

    const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!customer) {
        return { error: "Customer not found", code: "customer_not_found" };
    }

    const { data: selectedPerson } = await supabase
        .from("persons")
        .select("id, first_name, last_name")
        .eq("id", selectedPersonId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!selectedPerson) {
        return { error: "Person not found", code: "person_not_found" };
    }

    const currentPrimaryPersonId = await resolveCustomerHouseholdPrimaryContactPersonId(
        supabase,
        orgId,
        customerId
    );

    let currentPrimaryLabel: string | undefined;
    if (currentPrimaryPersonId) {
        const { data: currentPerson } = await supabase
            .from("persons")
            .select("id, first_name, last_name")
            .eq("id", currentPrimaryPersonId)
            .eq("org_id", orgId)
            .maybeSingle();
        currentPrimaryLabel = personLabel(currentPerson);
    }

    const { data: oppRows, error: oppErr } = await supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    if (oppErr) {
        return {
            error: "Could not resolve opportunity impact for preview.",
            code: "opportunity_lookup_failed",
        };
    }

    const opportunityIds = (oppRows ?? [])
        .map((row) => trim((row as { id?: string }).id))
        .filter(Boolean);

    const alreadyPrimary = currentPrimaryPersonId === selectedPersonId;

    return {
        customerId,
        selectedPersonId,
        selectedLabel: personLabel(selectedPerson),
        currentPrimaryPersonId,
        currentPrimaryLabel,
        opportunityIds,
        domainVersion: buildMakePrimaryDomainVersion({
            customerId,
            selectedPersonId,
            currentPrimaryPersonId,
            opportunityIds,
        }),
        alreadyPrimary,
    };
}

export function buildMakePrimaryImpactPreview(input: {
    orgId: string;
    state: MakePrimaryPreviewDomainState;
}): CommandImpactPreview {
    const policy = requireDestructiveCommandPolicy("make_primary_contact");
    const { state } = input;
    const { previewId, token, claims } = issueDestructivePreviewToken({
        capabilityKey: policy.capabilityKey,
        subjectType: "customer",
        subjectId: state.customerId,
        orgId: input.orgId,
        impactClass: policy.impactClass,
        confirmation: policy.confirmation,
        version: state.domainVersion,
        ttlSeconds:
            policy.previewFreshness.mode === "ttl" ? policy.previewFreshness.seconds : 300,
    });

    const affectedRecords: Array<CommandImpactPreview["affectedRecords"][number]> = [
        {
            type: "person",
            id: state.selectedPersonId,
            label: state.selectedLabel,
            effect: "promoted",
        },
        {
            type: "customer",
            id: state.customerId,
            label: "Household primary designation",
            effect: "updated",
        },
    ];

    if (state.currentPrimaryPersonId && !state.alreadyPrimary) {
        affectedRecords.push({
            type: "person",
            id: state.currentPrimaryPersonId,
            label: state.currentPrimaryLabel ?? "Current primary contact",
            effect: "demoted",
        });
    } else if (!state.currentPrimaryPersonId) {
        affectedRecords.push({
            type: "person",
            label: "No current primary contact",
            effect: "updated",
        });
    }

    if (state.opportunityIds.length > 0) {
        affectedRecords.push({
            type: "opportunity_projection",
            label: `${state.opportunityIds.length} opportunity projection(s)`,
            effect: "updated",
        });
    }

    const blockers: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [
        {
            code: "prior_contact_remains_linked",
            message:
                "The previous primary contact remains linked as an additional household contact.",
        },
        {
            code: "non_effect_roles",
            message:
                "This does not change guardian, pickup, or billing roles, and does not remove household membership.",
        },
    ];

    if (state.alreadyPrimary) {
        blockers.push({
            code: "already_primary",
            message: "This person is already the household primary contact.",
        });
    }

    const preview: CommandImpactPreview = {
        previewId,
        capabilityKey: policy.capabilityKey,
        generatedAt: new Date(claims.iat * 1000).toISOString(),
        subject: {
            type: "customer",
            id: state.customerId,
            label: state.selectedLabel
                ? `Household → ${state.selectedLabel}`
                : "Household primary contact",
        },
        impactClass: policy.impactClass,
        reversibility: policy.reversibility,
        affectedRecords,
        warnings,
        blockers,
        downstreamEffects: [
            {
                type: "opportunity_primary_person",
                description: `${state.opportunityIds.length} opportunity row(s) will sync primary_person_id.`,
            },
            {
                type: "workflow_event",
                description: "household.primary_contact_changed will be emitted on commit.",
            },
        ],
        confirmation: { policy: policy.confirmation },
        recovery: {
            kind: "restore",
            description: "Reassign the previous person as primary.",
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

export type MakePrimaryReplacementResult = {
    kind: "replacement";
    customer_id: string;
    new_primary_person_id: string;
    previous_primary_person_id: string | null;
    opportunities_updated: number;
    opportunity_ids: string[];
    event: "household.primary_contact_changed";
};

export type PrimaryContactReplacementDeps = {
    setHouseholdPrimaryContactForCustomer?: typeof setHouseholdPrimaryContactForCustomer;
    emitHouseholdPrimaryContactChangedEvent?: typeof emitHouseholdPrimaryContactChangedEvent;
    readMakePrimaryPreviewDomainState?: typeof readMakePrimaryPreviewDomainState;
};

export async function previewMakePrimaryContactViaAdapter(input: {
    orgId: string;
    supabase: SupabaseClient;
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
    trustedServerContext: boolean;
    deps?: PrimaryContactReplacementDeps;
}): Promise<
    | { ok: true; preview: CommandImpactPreview; state: MakePrimaryPreviewDomainState }
    | { ok: false; code: string; operatorMessage: string }
> {
    const policy = getDestructiveCommandPolicy("make_primary_contact");
    if (!policy || policy.impactClass !== "replace") {
        return {
            ok: false,
            code: "missing_destructive_policy",
            operatorMessage: "This command is not available.",
        };
    }

    const permission = evaluateDestructivePermissionClass({
        capabilityKey: "make_primary_contact",
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

    const resolved = resolveMakePrimaryInputs({
        entityType: input.entityType,
        entityId: input.entityId,
        inputValues: input.inputValues,
    });
    if ("error" in resolved) {
        return { ok: false, code: "invalid_inputs", operatorMessage: resolved.error };
    }

    const read = input.deps?.readMakePrimaryPreviewDomainState ?? readMakePrimaryPreviewDomainState;
    const state = await read(input.supabase, {
        orgId: input.orgId,
        customerId: resolved.customerId,
        selectedPersonId: resolved.selectedPersonId,
    });
    if ("error" in state) {
        return { ok: false, code: state.code, operatorMessage: state.error };
    }

    const preview = buildMakePrimaryImpactPreview({ orgId: input.orgId, state });
    return { ok: true, preview, state };
}

export async function commitMakePrimaryContactViaAdapter(input: {
    orgId: string;
    userId?: string | null;
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
    deps?: PrimaryContactReplacementDeps;
}): Promise<
    | { ok: true; result: MakePrimaryReplacementResult; delegated: true }
    | { ok: false; code: string; operatorMessage: string; delegated: boolean }
> {
    void input.clientPermissionClass;
    void input.clientImpactClass;

    const policy = getDestructiveCommandPolicy("make_primary_contact");
    if (!policy || policy.impactClass !== "replace") {
        return {
            ok: false,
            code: "missing_destructive_policy",
            operatorMessage: "This command is not available.",
            delegated: false,
        };
    }

    const permission = evaluateDestructivePermissionClass({
        capabilityKey: "make_primary_contact",
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

    const resolved = resolveMakePrimaryInputs({
        entityType: input.entityType,
        entityId: input.entityId,
        inputValues: input.inputValues,
    });
    if ("error" in resolved) {
        return {
            ok: false,
            code: "invalid_inputs",
            operatorMessage: resolved.error,
            delegated: false,
        };
    }

    const read = input.deps?.readMakePrimaryPreviewDomainState ?? readMakePrimaryPreviewDomainState;
    const state = await read(input.supabase, {
        orgId: input.orgId,
        customerId: resolved.customerId,
        selectedPersonId: resolved.selectedPersonId,
    });
    if ("error" in state) {
        return {
            ok: false,
            code: state.code,
            operatorMessage: state.error,
            delegated: false,
        };
    }

    if (state.alreadyPrimary) {
        return {
            ok: false,
            code: "already_primary",
            operatorMessage: "This person is already the household primary contact.",
            delegated: false,
        };
    }

    const tokenValidation = validateDestructivePreviewToken({
        token: input.previewToken,
        expected: {
            capabilityKey: "make_primary_contact",
            subjectType: "customer",
            subjectId: state.customerId,
            orgId: input.orgId,
            impactClass: "replace",
            confirmation: "strong_confirm",
            version: state.domainVersion,
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

    input.guard.markDelegated();

    const previousPrimaryPersonId = state.currentPrimaryPersonId;
    const runSet =
        input.deps?.setHouseholdPrimaryContactForCustomer ?? setHouseholdPrimaryContactForCustomer;
    const runEmit =
        input.deps?.emitHouseholdPrimaryContactChangedEvent ??
        emitHouseholdPrimaryContactChangedEvent;

    try {
        const writeResult = await runSet(input.supabase, {
            orgId: input.orgId,
            customerId: state.customerId,
            personId: state.selectedPersonId,
        });

        try {
            await runEmit({
                orgId: input.orgId,
                customerId: state.customerId,
                previousPrimaryPersonId,
                newPrimaryPersonId: state.selectedPersonId,
                opportunityIds: writeResult.opportunity_ids,
                actorUserId: input.userId ?? null,
            });
        } catch (eventErr) {
            console.error(
                "[make_primary_contact] workflow event emit failed after domain write",
                eventErr
            );
        }

        return {
            ok: true,
            delegated: true,
            result: {
                kind: "replacement",
                customer_id: writeResult.customer_id,
                new_primary_person_id: writeResult.primary_person_id,
                previous_primary_person_id: previousPrimaryPersonId,
                opportunities_updated: writeResult.opportunities_updated,
                opportunity_ids: writeResult.opportunity_ids,
                event: "household.primary_contact_changed",
            },
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Update failed";
        return {
            ok: false,
            code: message.includes("not found") ? "not_found" : "domain_failure",
            operatorMessage: message,
            delegated: true,
        };
    }
}
