/**
 * Registered semantic identity command handlers (D0).
 *
 * Each handler is real and functional: `execute` performs its supported operation
 * through the injected ports (which own physical mapping). All handlers validate
 * org context, reject cross-tenant references, and produce deterministic result
 * metadata + semantic record references.
 */

import {
    type CommandContext,
    type CommandPreview,
    type CommandRecordRef,
    type CommandResult,
    type ProcessingIdentityCommand,
    type ValidationIssue,
    type ValidationResult,
    invalid,
    ok,
} from "./commandContracts";
import { IDENTITY_COMMAND_KEYS, IDENTITY_COMMAND_VERSION } from "./commandKeys";
import type { PortContext, RecordOrgTable } from "./ports";
import type {
    AttachDocumentPayload,
    CreateChildPayload,
    CreateHouseholdPayload,
    CreateLeadPayload,
    CreatePersonPayload,
    CreateProcessParticipationPayload,
    LinkChildToHouseholdPayload,
    LinkPersonToHouseholdPayload,
    LinkPersonToLeadPayload,
    ProposeMergePayload,
    UpdateChildPayload,
    UpdateCommunicationPreferencesPayload,
    UpdateLeadPayload,
    UpdatePersonPayload,
    UpdateProcessParticipationPayload,
} from "./commandPayloads";
import { ensureStageEntryWorkForCreatedLead } from "@/lib/lifecycle/ensureStageEntryWorkForCreatedLead";

function portCtx(context: CommandContext): PortContext {
    return { supabase: context.supabase, orgId: context.orgId, actorId: context.actorId };
}

function requireString(
    value: unknown,
    field: string,
    issues: ValidationIssue[],
): void {
    if (typeof value !== "string" || !value.trim()) {
        issues.push({ code: "missing_field", message: `${field} is required`, severity: "error", field });
    }
}

/** Cross-tenant guard: every referenced record must belong to the command's org. */
async function assertSameOrg(
    context: CommandContext,
    refs: { table: RecordOrgTable; id: string | null | undefined; field: string }[],
): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    for (const ref of refs) {
        if (!ref.id) continue;
        const org = await context.ports.readRecordOrg(portCtx(context), { table: ref.table, id: ref.id });
        if (org === null) {
            issues.push({
                code: "reference_not_found",
                message: `${ref.field} references a record that does not exist`,
                severity: "error",
                field: ref.field,
            });
        } else if (org !== context.orgId) {
            issues.push({
                code: "cross_tenant_reference",
                message: `${ref.field} references a record in a different organization`,
                severity: "error",
                field: ref.field,
            });
        }
    }
    return issues;
}

function refResult<T extends Record<string, unknown>>(
    refs: CommandRecordRef[],
    result: T,
    idempotentReplay = false,
): CommandResult<T> {
    return { ok: true, refs, result, idempotentReplay };
}

// ---------------------------------------------------------------------------
// create_person
// ---------------------------------------------------------------------------
const createPerson: ProcessingIdentityCommand<CreatePersonPayload, { person_id: string }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.createPerson,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "person",
        atomicity: "atomic",
        reversibility: "compensatable",
        idempotency: "natural_key",
        downstreamEvents: ["person_created"],
        sensitiveFields: ["email", "phone", "first_name", "last_name"],
        executableInV1: true,
    },
    validate(input) {
        const issues: ValidationIssue[] = [];
        const hasContact = Boolean(input.email?.trim() || input.phone?.trim());
        const hasName = Boolean(input.first_name?.trim() && input.last_name?.trim());
        // Name-only guardians are valid household members (legacy Create Lead allowed this).
        // Contact is preferred for match quality but must not silently drop a second parent.
        if (!hasContact && !hasName) {
            issues.push({
                code: "insufficient_identity",
                message: "create_person requires a name (first + last) or an email/phone signal",
                severity: "error",
            });
        }
        return ok(issues);
    },
    preview(input) {
        return {
            targetType: "person",
            summary: `Create person ${input.first_name ?? ""} ${input.last_name ?? ""}`.trim(),
            before: null,
            after: {
                first_name: input.first_name ?? null,
                last_name: input.last_name ?? null,
                email: input.email ?? null,
                phone: input.phone ?? null,
            },
            effects: ["person_created"],
        } satisfies CommandPreview;
    },
    async execute(input, context) {
        const res = await context.ports.createPerson(portCtx(context), {
            first_name: input.first_name ?? null,
            last_name: input.last_name ?? null,
            email: input.email ?? null,
            phone: input.phone ?? null,
            status_key_on_create: input.status_key_on_create ?? null,
        });
        if (!res) return { ok: false, refs: [], result: { person_id: "" }, idempotentReplay: false, error: "create_person_failed" };
        return refResult(
            [{ targetType: "person", recordId: res.id, created: res.created }],
            { person_id: res.id },
            !res.created,
        );
    },
};

// ---------------------------------------------------------------------------
// update_person
// ---------------------------------------------------------------------------
const updatePerson: ProcessingIdentityCommand<UpdatePersonPayload, { person_id: string }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.updatePerson,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "person",
        atomicity: "dependent",
        reversibility: "reversible",
        idempotency: "operation_key",
        downstreamEvents: ["person_updated"],
        sensitiveFields: ["email", "phone", "first_name", "last_name"],
        executableInV1: true,
    },
    validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.person_id, "person_id", issues);
        if (issues.length) return { ok: false, issues };
        return assertSameOrg(context, [{ table: "persons", id: input.person_id, field: "person_id" }]).then(ok);
    },
    preview(input) {
        return {
            targetType: "person",
            targetRef: input.person_id,
            summary: `Update person ${input.person_id}`,
            after: {
                first_name: input.first_name,
                last_name: input.last_name,
                email: input.email,
                phone: input.phone,
                status_key: input.status_key,
            },
            effects: ["person_updated"],
        };
    },
    async execute(input, context) {
        const patch: Record<string, unknown> = {};
        for (const k of ["first_name", "last_name", "email", "phone", "status_key"] as const) {
            if (input[k] !== undefined) patch[k] = input[k];
        }
        const res = await context.ports.updatePerson(portCtx(context), {
            person_id: input.person_id,
            patch,
            expected_version: input.expected_version ?? null,
        });
        if (!res.ok) {
            return { ok: false, refs: [], result: { person_id: input.person_id }, idempotentReplay: false, error: res.error };
        }
        return refResult([{ targetType: "person", recordId: input.person_id, created: false }], {
            person_id: input.person_id,
        });
    },
};

// ---------------------------------------------------------------------------
// create_household
// ---------------------------------------------------------------------------
const createHousehold: ProcessingIdentityCommand<CreateHouseholdPayload, { household_id: string }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.createHousehold,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "household",
        atomicity: "atomic",
        reversibility: "compensatable",
        idempotency: "natural_key",
        downstreamEvents: ["household_created"],
        sensitiveFields: ["household_name"],
        executableInV1: true,
    },
    validate(input) {
        const issues: ValidationIssue[] = [];
        requireString(input.household_name, "household_name", issues);
        return ok(issues);
    },
    preview(input) {
        return {
            targetType: "household",
            summary: `Create household ${input.household_name}`,
            after: { name: input.household_name },
            effects: ["household_created"],
        };
    },
    async execute(input, context) {
        const res = await context.ports.createHousehold(portCtx(context), {
            household_name: input.household_name,
            vertical_id: input.vertical_id ?? null,
        });
        return refResult([{ targetType: "household", recordId: res.id, created: res.created }], {
            household_id: res.id,
        });
    },
};

// ---------------------------------------------------------------------------
// link_person_to_household
// ---------------------------------------------------------------------------
const linkPersonToHousehold: ProcessingIdentityCommand<
    LinkPersonToHouseholdPayload,
    { household_id: string; person_id: string }
> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.linkPersonToHousehold,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "household",
        atomicity: "atomic",
        reversibility: "reversible",
        idempotency: "natural_key",
        downstreamEvents: ["person_linked_to_household"],
        sensitiveFields: [],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.person_id, "person_id", issues);
        requireString(input.household_id, "household_id", issues);
        if (issues.length) return { ok: false, issues };
        const crossOrg = await assertSameOrg(context, [
            { table: "persons", id: input.person_id, field: "person_id" },
            { table: "customers", id: input.household_id, field: "household_id" },
        ]);
        return ok(crossOrg);
    },
    preview(input) {
        return {
            targetType: "household",
            targetRef: input.household_id,
            summary: `Link person ${input.person_id} to household ${input.household_id}`,
            effects: ["person_linked_to_household"],
        };
    },
    async execute(input, context) {
        const res = await context.ports.linkPersonToHousehold(portCtx(context), {
            person_id: input.person_id,
            household_id: input.household_id,
            role_type: input.role_type ?? "primary_contact",
        });
        return refResult(
            [{ targetType: "household", recordId: input.household_id, created: false }],
            { household_id: input.household_id, person_id: input.person_id },
            !res.created,
        );
    },
};

// ---------------------------------------------------------------------------
// create_child
// ---------------------------------------------------------------------------
const createChild: ProcessingIdentityCommand<CreateChildPayload, { child_id: string }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.createChild,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "child",
        atomicity: "atomic",
        reversibility: "compensatable",
        idempotency: "natural_key",
        downstreamEvents: ["child_created"],
        sensitiveFields: ["first_name", "last_name", "dob", "display_name"],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.household_id, "household_id", issues);
        requireString(input.display_name, "display_name", issues);
        if (issues.length) return { ok: false, issues };
        const crossOrg = await assertSameOrg(context, [
            { table: "customers", id: input.household_id, field: "household_id" },
            { table: "persons", id: input.person_id, field: "person_id" },
        ]);
        return ok(crossOrg);
    },
    preview(input) {
        return {
            targetType: "child",
            summary: `Create child ${input.display_name} in household ${input.household_id}`,
            after: { display_name: input.display_name, dob: input.dob ?? null },
            effects: ["child_created"],
        };
    },
    async execute(input, context) {
        const res = await context.ports.createChild(portCtx(context), {
            household_id: input.household_id,
            person_id: input.person_id ?? null,
            display_name: input.display_name,
            first_name: input.first_name ?? null,
            last_name: input.last_name ?? null,
            dob: input.dob ?? null,
            relationship: input.relationship ?? "child",
            gender: input.gender ?? null,
        });
        return refResult([{ targetType: "child", recordId: res.id, created: res.created }], {
            child_id: res.id,
        });
    },
};

// ---------------------------------------------------------------------------
// update_child
// ---------------------------------------------------------------------------
const updateChild: ProcessingIdentityCommand<UpdateChildPayload, { child_id: string }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.updateChild,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "child",
        atomicity: "dependent",
        reversibility: "reversible",
        idempotency: "operation_key",
        downstreamEvents: ["child_updated"],
        sensitiveFields: ["first_name", "last_name", "dob", "display_name"],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.child_id, "child_id", issues);
        if (issues.length) return { ok: false, issues };
        return ok(await assertSameOrg(context, [{ table: "customer_members", id: input.child_id, field: "child_id" }]));
    },
    preview(input) {
        return {
            targetType: "child",
            targetRef: input.child_id,
            summary: `Update child ${input.child_id}`,
            after: { display_name: input.display_name, dob: input.dob },
            effects: ["child_updated"],
        };
    },
    async execute(input, context) {
        const patch: Record<string, unknown> = {};
        for (const k of ["display_name", "first_name", "last_name", "dob"] as const) {
            if (input[k] !== undefined) patch[k] = input[k];
        }
        const res = await context.ports.updateChild(portCtx(context), {
            child_id: input.child_id,
            patch,
            expected_version: input.expected_version ?? null,
        });
        if (!res.ok) {
            return { ok: false, refs: [], result: { child_id: input.child_id }, idempotentReplay: false, error: res.error };
        }
        return refResult([{ targetType: "child", recordId: input.child_id, created: false }], {
            child_id: input.child_id,
        });
    },
};

// ---------------------------------------------------------------------------
// link_child_to_household (shared custody: same person, another household)
// ---------------------------------------------------------------------------
const linkChildToHousehold: ProcessingIdentityCommand<
    LinkChildToHouseholdPayload,
    { child_id: string; household_id: string }
> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.linkChildToHousehold,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "child",
        atomicity: "dependent",
        reversibility: "reversible",
        idempotency: "natural_key",
        downstreamEvents: ["child_linked_to_household"],
        sensitiveFields: ["display_name", "dob"],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.person_id, "person_id", issues);
        requireString(input.household_id, "household_id", issues);
        requireString(input.display_name, "display_name", issues);
        if (issues.length) return { ok: false, issues };
        return ok(
            await assertSameOrg(context, [
                { table: "persons", id: input.person_id, field: "person_id" },
                { table: "customers", id: input.household_id, field: "household_id" },
            ]),
        );
    },
    preview(input) {
        return {
            targetType: "child",
            targetRef: input.household_id,
            summary: `Link child (person ${input.person_id}) to household ${input.household_id}`,
            effects: ["child_linked_to_household"],
        };
    },
    async execute(input, context) {
        const res = await context.ports.createChild(portCtx(context), {
            household_id: input.household_id,
            person_id: input.person_id,
            display_name: input.display_name,
            first_name: null,
            last_name: null,
            dob: input.dob ?? null,
            relationship: input.relationship ?? "child",
        });
        return refResult([{ targetType: "child", recordId: res.id, created: res.created }], {
            child_id: res.id,
            household_id: input.household_id,
        });
    },
};

// ---------------------------------------------------------------------------
// create_lead
// ---------------------------------------------------------------------------
const createLead: ProcessingIdentityCommand<CreateLeadPayload, { lead_id: string }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.createLead,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "lead",
        atomicity: "dependent",
        reversibility: "compensatable",
        idempotency: "natural_key",
        downstreamEvents: ["lead_created", "status_changed"],
        sensitiveFields: [],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.household_id, "household_id", issues);
        requireString(input.primary_person_id, "primary_person_id", issues);
        requireString(input.name, "name", issues);
        if (issues.length) return { ok: false, issues };
        return ok(
            await assertSameOrg(context, [
                { table: "customers", id: input.household_id, field: "household_id" },
                { table: "persons", id: input.primary_person_id, field: "primary_person_id" },
            ]),
        );
    },
    preview(input) {
        return {
            targetType: "lead",
            summary: `Create lead ${input.name}`,
            after: { name: input.name, status_key: input.status_key ?? "new", stage_key: input.stage_key ?? "lead" },
            effects: ["lead_created"],
        };
    },
    async execute(input, context) {
        const stageKey = input.stage_key ?? "lead";
        const res = await context.ports.createLead(portCtx(context), {
            household_id: input.household_id,
            primary_person_id: input.primary_person_id,
            name: input.name,
            status_key: input.status_key ?? "new",
            stage_key: stageKey,
            work_unit_id: input.work_unit_id ?? null,
            location_id: input.location_id ?? null,
        });
        // Initial stage-entry work (e.g. Contact Family) is owned by the published Lead plan.
        // Create Lead writes durable stage membership but historically skipped the spawn seam
        // that outcome-driven stage moves already use — Current Work then had nothing to match.
        try {
            const spawned = await ensureStageEntryWorkForCreatedLead({
                supabase: context.supabase,
                orgId: context.orgId,
                userId: context.actorId ?? null,
                opportunityId: res.id,
                stageKey,
            });
            if (
                spawned.action === "skipped" &&
                spawned.reason &&
                spawned.reason !== "terminal_or_workless_stage" &&
                spawned.reason !== "no_entry_work_template" &&
                spawned.reason !== "no_destination_plan"
            ) {
                console.warn("[create_lead] stage entry work skipped", spawned);
            }
        } catch (e) {
            console.warn(
                "[create_lead] ensureStageEntryWorkForCreatedLead",
                e instanceof Error ? e.message : e,
            );
        }
        return refResult([{ targetType: "lead", recordId: res.id, created: res.created }], {
            lead_id: res.id,
        });
    },
};

// ---------------------------------------------------------------------------
// update_lead
// ---------------------------------------------------------------------------
const updateLead: ProcessingIdentityCommand<UpdateLeadPayload, { lead_id: string }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.updateLead,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "lead",
        atomicity: "dependent",
        reversibility: "reversible",
        idempotency: "operation_key",
        downstreamEvents: ["lead_updated"],
        sensitiveFields: [],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.lead_id, "lead_id", issues);
        if (issues.length) return { ok: false, issues };
        return ok(await assertSameOrg(context, [{ table: "opportunities", id: input.lead_id, field: "lead_id" }]));
    },
    preview(input) {
        return {
            targetType: "lead",
            targetRef: input.lead_id,
            summary: `Update lead ${input.lead_id}`,
            after: { name: input.name, status_key: input.status_key },
            effects: ["lead_updated"],
        };
    },
    async execute(input, context) {
        const patch: Record<string, unknown> = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.status_key !== undefined) patch.status_key = input.status_key;
        const res = await context.ports.updateLead(portCtx(context), {
            lead_id: input.lead_id,
            patch,
            expected_version: input.expected_version ?? null,
        });
        if (!res.ok) {
            return { ok: false, refs: [], result: { lead_id: input.lead_id }, idempotentReplay: false, error: res.error };
        }
        return refResult([{ targetType: "lead", recordId: input.lead_id, created: false }], {
            lead_id: input.lead_id,
        });
    },
};

// ---------------------------------------------------------------------------
// link_person_to_lead
// ---------------------------------------------------------------------------
const linkPersonToLead: ProcessingIdentityCommand<
    LinkPersonToLeadPayload,
    { lead_id: string; person_id: string }
> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.linkPersonToLead,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "lead",
        atomicity: "dependent",
        reversibility: "reversible",
        idempotency: "natural_key",
        downstreamEvents: ["person_linked_to_lead"],
        sensitiveFields: [],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.person_id, "person_id", issues);
        requireString(input.lead_id, "lead_id", issues);
        if (issues.length) return { ok: false, issues };
        return ok(
            await assertSameOrg(context, [
                { table: "persons", id: input.person_id, field: "person_id" },
                { table: "opportunities", id: input.lead_id, field: "lead_id" },
            ]),
        );
    },
    preview(input) {
        return {
            targetType: "lead",
            targetRef: input.lead_id,
            summary: `Link person ${input.person_id} to lead ${input.lead_id}`,
            effects: ["person_linked_to_lead"],
        };
    },
    async execute(input, context) {
        const res = await context.ports.linkPersonToLead(portCtx(context), {
            person_id: input.person_id,
            lead_id: input.lead_id,
            role_type: input.role_type ?? "family_member",
            role: input.role ?? "primary_guardian",
        });
        return refResult(
            [{ targetType: "lead", recordId: input.lead_id, created: false }],
            { lead_id: input.lead_id, person_id: input.person_id },
            !res.created,
        );
    },
};

// ---------------------------------------------------------------------------
// create_process_participation (owns OCM↔process_instances mapping; Decision B)
// ---------------------------------------------------------------------------
const createProcessParticipation: ProcessingIdentityCommand<
    CreateProcessParticipationPayload,
    { participation_id: string }
> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.createProcessParticipation,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "participation",
        atomicity: "dependent",
        reversibility: "reversible",
        idempotency: "natural_key",
        downstreamEvents: ["participation_created"],
        sensitiveFields: [],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.child_id, "child_id", issues);
        requireString(input.lead_id, "lead_id", issues);
        if (issues.length) return { ok: false, issues };
        return ok(
            await assertSameOrg(context, [
                { table: "customer_members", id: input.child_id, field: "child_id" },
                { table: "opportunities", id: input.lead_id, field: "lead_id" },
            ]),
        );
    },
    preview(input) {
        return {
            targetType: "participation",
            summary: `Create enrollment participation for child ${input.child_id} on lead ${input.lead_id}`,
            after: { stage_key: input.stage_key ?? null, state: input.state ?? null },
            effects: ["participation_created"],
        };
    },
    async execute(input, context) {
        const participation: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input.participation ?? {})) {
            if (v !== undefined && v !== null && v !== "") participation[k] = v;
        }
        const res = await context.ports.createProcessParticipation(portCtx(context), {
            child_id: input.child_id,
            lead_id: input.lead_id,
            stage_key: input.stage_key ?? null,
            state: input.state ?? null,
            participation,
        });
        if (res.error) {
            return { ok: false, refs: [], result: { participation_id: "" }, idempotentReplay: false, error: res.error };
        }
        return refResult(
            res.id ? [{ targetType: "participation", recordId: res.id, created: true }] : [],
            { participation_id: res.id ?? "" },
            res.id === null,
        );
    },
};

// ---------------------------------------------------------------------------
// update_process_participation
// ---------------------------------------------------------------------------
const updateProcessParticipation: ProcessingIdentityCommand<
    UpdateProcessParticipationPayload,
    { participation_id: string }
> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.updateProcessParticipation,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "participation",
        atomicity: "dependent",
        reversibility: "reversible",
        idempotency: "operation_key",
        downstreamEvents: ["participation_updated"],
        sensitiveFields: [],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.participation_id, "participation_id", issues);
        if (issues.length) return { ok: false, issues };
        return ok(
            await assertSameOrg(context, [
                { table: "process_instances", id: input.participation_id, field: "participation_id" },
            ]),
        );
    },
    preview(input) {
        return {
            targetType: "participation",
            targetRef: input.participation_id,
            summary: `Update participation ${input.participation_id}`,
            after: { stage_key: input.stage_key, state: input.state },
            effects: ["participation_updated"],
        };
    },
    async execute(input, context) {
        const patch: Record<string, unknown> = {};
        if (input.stage_key !== undefined) patch.stage_key = input.stage_key;
        if (input.state !== undefined) patch.state = input.state;
        const res = await context.ports.updateProcessParticipation(portCtx(context), {
            participation_id: input.participation_id,
            patch,
            expected_version: input.expected_version ?? null,
        });
        if (!res.ok) {
            return {
                ok: false,
                refs: [],
                result: { participation_id: input.participation_id },
                idempotentReplay: false,
                error: res.error,
            };
        }
        return refResult(
            [{ targetType: "participation", recordId: input.participation_id, created: false }],
            { participation_id: input.participation_id },
        );
    },
};

// ---------------------------------------------------------------------------
// attach_document (asynchronous side effect)
// ---------------------------------------------------------------------------
const attachDocument: ProcessingIdentityCommand<AttachDocumentPayload, { document_id: string }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.attachDocument,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "document",
        atomicity: "asynchronous",
        reversibility: "reversible",
        idempotency: "natural_key",
        downstreamEvents: ["document_attached"],
        sensitiveFields: [],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.document_id, "document_id", issues);
        requireString(input.target_entity_id, "target_entity_id", issues);
        if (issues.length) return { ok: false, issues };
        return ok(await assertSameOrg(context, [{ table: "documents", id: input.document_id, field: "document_id" }]));
    },
    preview(input) {
        return {
            targetType: "document",
            targetRef: input.document_id,
            summary: `Attach document ${input.document_id} to ${input.target_entity_type} ${input.target_entity_id}`,
            effects: ["document_attached"],
        };
    },
    async execute(input, context) {
        const res = await context.ports.attachDocument(portCtx(context), {
            document_id: input.document_id,
            target_entity_type: input.target_entity_type,
            target_entity_id: input.target_entity_id,
            doc_type: input.doc_type ?? null,
        });
        if (!res.ok) {
            return { ok: false, refs: [], result: { document_id: input.document_id }, idempotentReplay: false, error: res.error };
        }
        return refResult([{ targetType: "document", recordId: input.document_id, created: false }], {
            document_id: input.document_id,
        });
    },
};

// ---------------------------------------------------------------------------
// update_communication_preferences (asynchronous; never rolls back identity)
// ---------------------------------------------------------------------------
const updateCommunicationPreferences: ProcessingIdentityCommand<
    UpdateCommunicationPreferencesPayload,
    { person_id: string; category: string }
> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.updateCommunicationPreferences,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.commit",
        targetType: "communication_preferences",
        atomicity: "asynchronous",
        reversibility: "reversible",
        idempotency: "natural_key",
        downstreamEvents: ["communication_preference_changed"],
        sensitiveFields: [],
        executableInV1: true,
    },
    async validate(input, context) {
        const issues: ValidationIssue[] = [];
        requireString(input.person_id, "person_id", issues);
        requireString(input.category, "category", issues);
        if (issues.length) return { ok: false, issues };
        return ok(await assertSameOrg(context, [{ table: "persons", id: input.person_id, field: "person_id" }]));
    },
    preview(input) {
        return {
            targetType: "communication_preferences",
            targetRef: input.person_id,
            summary: `Set ${input.category} preference to ${input.state} for person ${input.person_id}`,
            after: { category: input.category, state: input.state },
            effects: ["communication_preference_changed"],
        };
    },
    async execute(input, context) {
        const res = await context.ports.updateCommunicationPreferences(portCtx(context), {
            person_id: input.person_id,
            category: input.category,
            state: input.state,
            method: input.method ?? null,
            source: input.source ?? null,
        });
        if (!res.ok) {
            return {
                ok: false,
                refs: [],
                result: { person_id: input.person_id, category: input.category },
                idempotentReplay: false,
                error: res.error,
            };
        }
        return refResult(
            [{ targetType: "communication_preferences", recordId: input.person_id, created: false }],
            { person_id: input.person_id, category: input.category },
        );
    },
};

// ---------------------------------------------------------------------------
// propose_merge (V1: escalation only, NOT executable — Decision H)
// ---------------------------------------------------------------------------
const proposeMerge: ProcessingIdentityCommand<ProposeMergePayload, { escalated: true }> = {
    metadata: {
        key: IDENTITY_COMMAND_KEYS.proposeMerge,
        version: IDENTITY_COMMAND_VERSION,
        requiredPermission: "processing.identity.merge.propose",
        targetType: "merge_candidate",
        atomicity: "asynchronous",
        reversibility: "irreversible",
        idempotency: "natural_key",
        downstreamEvents: ["merge_proposed"],
        sensitiveFields: [],
        executableInV1: false,
    },
    validate(input) {
        const issues: ValidationIssue[] = [];
        requireString(input.survivor_id, "survivor_id", issues);
        requireString(input.duplicate_id, "duplicate_id", issues);
        requireString(input.reason, "reason", issues);
        return ok(issues);
    },
    preview(input) {
        return {
            targetType: "merge_candidate",
            summary: `Propose merge of ${input.duplicate_id} into ${input.survivor_id}`,
            effects: ["merge_proposed (escalation only — not executed in V1)"],
        };
    },
    execute() {
        // Merge execution is a Phase-F privileged workflow. In V1 this command can
        // only be surfaced as an exception/escalation; it is never executed.
        return Promise.resolve({
            ok: false,
            refs: [],
            result: { escalated: true } as { escalated: true },
            idempotentReplay: false,
            error: "merge_not_executable_in_v1",
        });
    },
};

/** All registered commands, keyed by semantic command key. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const IDENTITY_COMMANDS: Record<string, ProcessingIdentityCommand<any, any>> = {
    [IDENTITY_COMMAND_KEYS.createPerson]: createPerson,
    [IDENTITY_COMMAND_KEYS.updatePerson]: updatePerson,
    [IDENTITY_COMMAND_KEYS.createHousehold]: createHousehold,
    [IDENTITY_COMMAND_KEYS.linkPersonToHousehold]: linkPersonToHousehold,
    [IDENTITY_COMMAND_KEYS.createChild]: createChild,
    [IDENTITY_COMMAND_KEYS.updateChild]: updateChild,
    [IDENTITY_COMMAND_KEYS.linkChildToHousehold]: linkChildToHousehold,
    [IDENTITY_COMMAND_KEYS.createLead]: createLead,
    [IDENTITY_COMMAND_KEYS.updateLead]: updateLead,
    [IDENTITY_COMMAND_KEYS.linkPersonToLead]: linkPersonToLead,
    [IDENTITY_COMMAND_KEYS.createProcessParticipation]: createProcessParticipation,
    [IDENTITY_COMMAND_KEYS.updateProcessParticipation]: updateProcessParticipation,
    [IDENTITY_COMMAND_KEYS.attachDocument]: attachDocument,
    [IDENTITY_COMMAND_KEYS.updateCommunicationPreferences]: updateCommunicationPreferences,
    [IDENTITY_COMMAND_KEYS.proposeMerge]: proposeMerge,
};

export type { ValidationResult };
