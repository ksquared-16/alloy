/**
 * Relationship Runtime adapter (P3.S1 / P3.S2 / P3.S3).
 *
 * Delegates exactly once to `executeRelationshipAction` — never writes relationship
 * rows, contacts, persons, or PCR/CMC tables directly. Relationship kind/role/scope
 * and identity creation remain Relationship Framework–owned.
 *
 * Exact facade keys:
 * - add_parent_guardian — fixed guardian; create or link person
 * - link_existing_person — existing person only (role from payload)
 * - add_emergency_contact / add_authorized_pickup / add_billing_contact — fixed roles
 * - add_child — create or link child identity (createChildDraft | selectedChildPersonId)
 * - link_existing_child — existing child person id only (no createChildDraft)
 *
 * Capabilities share this adapter and executor but remain distinct Command identities.
 * Adapter does not set enrollment status, schedule, program, or billing — any
 * opportunity participation side effects are owned solely by executeRelationshipAction.
 */

import { executeRelationshipAction } from "@/lib/admin/relationship/executeRelationshipAction";
import type {
    RelationshipActionCreateChildDraft,
    RelationshipActionCreatePersonDraft,
    RelationshipActionExecutionRequest,
    RelationshipActionExecutionResult,
    RelationshipActionKey,
    RelationshipActionScope,
    RelationshipActionSourceSurface,
} from "@/lib/admin/relationship/relationshipActionContract";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";
import { relationshipDefinitionCommandKeys } from "@/lib/fields/relationship/relationshipDefinitions";
import type { PlatformCapabilityDefinition } from "@/lib/platform/commands/capabilityTypes";
import type {
    CommandExecutionSubject,
    InvocationDelegationGuard,
} from "@/lib/platform/commands/runtime/commandExecutionTypes";
import { isRelationshipRuntimeFacadeSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { isDestructiveOrReplacementCapability } from "@/lib/platform/commands/runtime/destructive";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { CommandSnapshot } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RelationshipExecutionDeps = {
    executeRelationshipAction?: typeof executeRelationshipAction;
};

export type RelationshipExecutionInput = {
    snapshot: CommandSnapshot;
    capability: PlatformCapabilityDefinition;
    commandKey: string;
    invocation: CommandInvocationRequest;
    executionSubject: CommandExecutionSubject;
    mode: "preview" | "execute";
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    guard: InvocationDelegationGuard;
    deps?: RelationshipExecutionDeps;
};

export type RelationshipExecutionOutput = {
    relationshipResult: RelationshipActionExecutionResult;
    delegated: true;
    actionKey: RelationshipActionKey;
};

/**
 * Fixed-role relationship commands that may create or link a person.
 *
 * DERIVED: every definition-backed command (its role is fixed by the definition, so a client-supplied
 * role_key is ignored — the anti-spoof rule) plus `add_billing_contact`, which is fixed-role but has
 * no definition row. A new relationship definition joins this set with no edit here.
 */
const FIXED_ROLE_CREATE_OR_LINK_KEYS = new Set<string>([
    ...relationshipDefinitionCommandKeys(),
    "add_billing_contact",
]);

const CHILD_RELATIONSHIP_KEYS = new Set<string>(["add_child", "link_existing_child"]);

const SOURCE_ENTITY_TYPES = new Set(["child", "person", "opportunity"]);
const SURFACES = new Set([
    "child_drawer",
    "person_drawer",
    "opportunity_drawer",
    "bos_rail",
]);

function asString(value: unknown): string {
    return value != null ? String(value).trim() : "";
}

function readPayload(inputValues: Record<string, unknown> | undefined): Record<string, unknown> {
    return inputValues && typeof inputValues === "object" ? inputValues : {};
}

function normalizeSourceEntityType(raw: string): "child" | "person" | "opportunity" | null {
    const t = raw.trim().toLowerCase();
    if (t === "children") return "child";
    if (t === "people" || t === "persons") return "person";
    if (t === "opportunities") return "opportunity";
    if (SOURCE_ENTITY_TYPES.has(t)) return t as "child" | "person" | "opportunity";
    return null;
}

function normalizeSurface(
    raw: string | null | undefined,
    sourceEntityType: "child" | "person" | "opportunity"
): RelationshipActionSourceSurface {
    const s = (raw ?? "").trim();
    if (SURFACES.has(s)) return s as RelationshipActionSourceSurface;
    if (sourceEntityType === "child") return "child_drawer";
    if (sourceEntityType === "person") return "person_drawer";
    return "opportunity_drawer";
}

function normalizeScope(
    raw: unknown,
    actionKey: RelationshipActionKey
): RelationshipActionScope {
    const s = asString(raw);
    const entry = relationshipActionRegistryEntry(actionKey);
    if (s && entry?.allowedScopes.includes(s as RelationshipActionScope)) {
        return s as RelationshipActionScope;
    }
    // Domain-safe defaults from registry-allowed scopes (preserve registry preference order).
    if (entry?.allowedScopes.includes("this_child")) return "this_child";
    if (entry?.allowedScopes.includes("this_opportunity")) return "this_opportunity";
    if (entry?.allowedScopes.includes("household")) return "household";
    return entry?.allowedScopes[0] ?? "household";
}

function readCreatePersonDraft(
    payload: Record<string, unknown>
): RelationshipActionCreatePersonDraft | undefined {
    const draft =
        (payload.create_person_draft as Record<string, unknown> | undefined) ??
        (payload.createPersonDraft as Record<string, unknown> | undefined);
    if (!draft || typeof draft !== "object") return undefined;
    const first = asString(draft.first_name ?? draft.firstName);
    const last = asString(draft.last_name ?? draft.lastName);
    if (!first || !last) return undefined;
    return {
        first_name: first,
        last_name: last,
        email: asString(draft.email) || undefined,
        phone: asString(draft.phone) || undefined,
    };
}

function readCreateChildDraft(
    payload: Record<string, unknown>
): RelationshipActionCreateChildDraft | undefined {
    const draft =
        (payload.create_child_draft as Record<string, unknown> | undefined) ??
        (payload.createChildDraft as Record<string, unknown> | undefined);
    if (!draft || typeof draft !== "object") return undefined;
    const first = asString(draft.first_name ?? draft.firstName);
    const last = asString(draft.last_name ?? draft.lastName);
    if (!first || !last) return undefined;
    return {
        first_name: first,
        last_name: last,
        date_of_birth:
            asString(draft.date_of_birth ?? draft.dateOfBirth ?? draft.dob) || undefined,
    };
}

/**
 * Build RelationshipActionExecutionRequest from Command Runtime inputs.
 * Ignores client relationship_kind / execution_owner / org / actor spoof fields.
 * Fixed-role person commands use registry defaultRoleKey — client role_key is ignored.
 * Child commands use selectedChildPersonId / createChildDraft — never invent IDs.
 */
export function buildRelationshipExecutionRequest(input: {
    commandKey: string;
    executionSubject: CommandExecutionSubject;
    invocation: CommandInvocationRequest;
}): RelationshipActionExecutionRequest | { error: string } {
    const key = input.commandKey.trim();
    if (!isRelationshipRuntimeFacadeSupported(key)) {
        return { error: `Unsupported Relationship command "${key}".` };
    }
    const actionKey = key as RelationshipActionKey;
    const entry = relationshipActionRegistryEntry(actionKey);
    if (!entry) return { error: `Unregistered relationship action: ${actionKey}` };

    const payload = readPayload(input.invocation.inputValues);
    // Ignore spoofed relationship kind / direction / owner — registry owns fixed roles.
    void payload.relationship_kind;
    void payload.relationshipKind;
    void payload.relationship_type;
    void payload.relationship_direction;
    void payload.relationshipDirection;
    void payload.execution_owner;
    void payload.domain;
    void payload.org_id;
    void payload.actor;
    void payload.identity_strategy;
    void payload.identityStrategy;

    const sourceEntityType =
        normalizeSourceEntityType(asString(payload.source_entity_type ?? payload.sourceEntityType)) ??
        normalizeSourceEntityType(input.executionSubject.entityType);
    if (!sourceEntityType) {
        return {
            error: `Unsupported source entity type "${input.executionSubject.entityType}".`,
        };
    }

    const sourceRecordId =
        asString(payload.source_record_id ?? payload.sourceRecordId) ||
        input.executionSubject.entityId.trim();
    if (!sourceRecordId) return { error: "source record id is required." };

    const sourceCustomerId = asString(
        payload.source_customer_id ?? payload.sourceCustomerId ?? payload.customer_id
    );
    if (!sourceCustomerId) return { error: "sourceCustomerId is required." };

    const isChildRelationship = CHILD_RELATIONSHIP_KEYS.has(actionKey);
    const isFixedRoleCreateOrLink = FIXED_ROLE_CREATE_OR_LINK_KEYS.has(actionKey);

    const selectedChildPersonId = asString(
        payload.selected_child_person_id ??
            payload.selectedChildPersonId ??
            payload.selected_child_id ??
            payload.selectedChildId
    );
    const createChildDraft = readCreateChildDraft(payload);

    // Person-target selection (not used for child relationship commands).
    const selectedPersonId = isChildRelationship
        ? ""
        : asString(
              payload.selected_person_id ??
                  payload.selectedPersonId ??
                  payload.person_id ??
                  payload.target_entity_id ??
                  payload.targetEntityId
          );
    const createPersonDraft = isChildRelationship ? undefined : readCreatePersonDraft(payload);

    if (actionKey === "link_existing_child") {
        if (createChildDraft) {
            return {
                error: "link_existing_child cannot create a new identity.",
            };
        }
        if (!selectedChildPersonId) {
            return {
                error: "selectedChildPersonId is required to link an existing child.",
            };
        }
    }

    if (actionKey === "add_child" && !selectedChildPersonId && !createChildDraft) {
        return {
            error: "Provide selectedChildPersonId or createChildDraft for add_child.",
        };
    }

    if (actionKey === "link_existing_person") {
        if (createPersonDraft) {
            return {
                error: "link_existing_person cannot create a new identity.",
            };
        }
        if (!selectedPersonId) {
            return { error: "selectedPersonId is required to link an existing person." };
        }
    }

    if (isFixedRoleCreateOrLink && !selectedPersonId && !createPersonDraft) {
        return {
            error: `Provide selectedPersonId or createPersonDraft for ${actionKey}.`,
        };
    }

    // Fixed-role person commands: registry defaultRoleKey only.
    // link_existing_person: operator-selected role under domain rules.
    // Child commands: no role key (registry defaultRoleKey is null).
    const roleKey = isChildRelationship
        ? undefined
        : isFixedRoleCreateOrLink
          ? entry.defaultRoleKey ?? undefined
          : asString(payload.role_key ?? payload.roleKey) || undefined;

    if (actionKey === "link_existing_person" && !roleKey) {
        return { error: "roleKey is required for link_existing_person." };
    }

    const scope = normalizeScope(payload.scope, actionKey);
    const sourceSurface = normalizeSurface(
        asString(payload.source_surface ?? payload.sourceSurface) ||
            input.invocation.surface ||
            null,
        sourceEntityType
    );

    const selectedChildCustomerMemberIds = Array.isArray(
        payload.selected_child_customer_member_ids ?? payload.selectedChildCustomerMemberIds
    )
        ? ((payload.selected_child_customer_member_ids ??
              payload.selectedChildCustomerMemberIds) as unknown[])
              .map((v) => asString(v))
              .filter(Boolean)
        : undefined;

    const sourceOpportunityId =
        asString(payload.source_opportunity_id ?? payload.sourceOpportunityId) ||
        (sourceEntityType === "opportunity" ? sourceRecordId : "") ||
        null;

    return {
        actionKey,
        sourceSurface,
        sourceRecordId,
        sourceEntityType,
        sourceCustomerId,
        sourceOpportunityId,
        sourceChildPersonId:
            asString(payload.source_child_person_id ?? payload.sourceChildPersonId) || null,
        anchorCustomerMemberId:
            asString(payload.anchor_customer_member_id ?? payload.anchorCustomerMemberId) ||
            null,
        selectedPersonId: selectedPersonId || undefined,
        selectedChildPersonId: selectedChildPersonId || undefined,
        createPersonDraft: isFixedRoleCreateOrLink ? createPersonDraft : undefined,
        createChildDraft: actionKey === "add_child" ? createChildDraft : undefined,
        roleKey,
        scope,
        selectedChildCustomerMemberIds,
        confirmationRequired: true,
    };
}

export async function executeRelationshipViaAdapter(
    input: RelationshipExecutionInput
): Promise<RelationshipExecutionOutput> {
    if (input.snapshot.executionDestination.owner !== "relationship_runtime") {
        throw new Error(
            "[commandRuntime] Relationship adapter refused non-relationship_runtime destination"
        );
    }
    if (input.capability.executionOwner !== "relationship_runtime") {
        throw new Error(
            "[commandRuntime] Relationship adapter refused capability owner mismatch"
        );
    }
    if (!isRelationshipRuntimeFacadeSupported(input.commandKey)) {
        throw new Error(
            `[commandRuntime] Relationship adapter refused unsupported key "${input.commandKey}"`
        );
    }
    if (
        isDestructiveOrReplacementCapability(input.capability.canonicalCommandKey) ||
        isDestructiveOrReplacementCapability(input.commandKey)
    ) {
        throw new Error(
            "[commandRuntime] Relationship adapter refused destructive/replacement capability"
        );
    }
    if (input.mode === "preview") {
        throw new Error(
            "[commandRuntime] Relationship commands do not support preview through the facade."
        );
    }

    const built = buildRelationshipExecutionRequest({
        commandKey: input.commandKey,
        executionSubject: input.executionSubject,
        invocation: input.invocation,
    });
    if ("error" in built) {
        throw new Error(`[commandRuntime] ${built.error}`);
    }

    input.guard.markDelegated();

    const run = input.deps?.executeRelationshipAction ?? executeRelationshipAction;
    const relationshipResult = await run(input.supabase, {
        ...built,
        orgId: input.orgId,
        actorUserId: input.userId ?? null,
    });

    return {
        relationshipResult,
        delegated: true,
        actionKey: built.actionKey,
    };
}
