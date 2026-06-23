import type { SupabaseClient } from "@supabase/supabase-js";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import { NEW_LEAD_STATUS_KEY, DEFAULT_LEAD_CASE_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { ENROLLMENT_INTAKE_PERSON_STATUS_KEY } from "@/lib/admin/person/enrollmentPersonDefaultStatus";
import { applyCreateLeadChildParticipation } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import { applyCreateLeadHouseholdMemberCommit } from "@/lib/admin/actions/executeCreateLeadHouseholdCommit";
import { applyCreateLeadLayoutRuntimePersistence } from "@/lib/admin/actions/applyCreateLeadLayoutRuntimePersistence";
import { readCreateLeadCommitSelectionFromPayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import {
    primaryIncludedParent,
    primaryIncludedChild,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { linkedPersonIdFromCommitRecord } from "@/lib/intake/resolve/applyResolutionToCommitSelection";
import { resolveLifecycleCreateLeadBinding } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import { QUALIFICATION_STATUS_KEY } from "@/lib/admin/actions/universalActionConstants";
import type { ExecuteAdminActionCtx } from "@/lib/admin/actions/executeAdminAction";
import { buildHouseholdLeadDisplayName } from "@/lib/admin/opportunity/buildHouseholdLeadDisplayName";

export type EntryLifecycleActionError = { ok: false; error: string; status: number };

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function asStringList(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.map((x) => String(x).trim()).filter(Boolean);
}

export async function resolveOrgDefaultVerticalId(
    supabase: SupabaseClient,
    orgId: string
): Promise<string | null> {
    const { data: row } = await supabase.from("verticals").select("id").eq("org_id", orgId).limit(1).maybeSingle();
    const id = (row as { id?: string } | null)?.id;
    return id?.trim() || null;
}

export type ExecuteCreateLeadInput = {
    merged: Record<string, unknown>;
    context?: {
        department_id?: string | null;
        work_unit_id?: string | null;
        surface?: string;
    };
};

export async function executeCreateLeadAction(
    supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    input: ExecuteCreateLeadInput
): Promise<
    | { ok: true; opportunity_id: string; person_id: string; customer_id: string }
    | EntryLifecycleActionError
> {
    const firstName = trim(input.merged.first_name);
    const lastName = trim(input.merged.last_name);
    const email = trim(input.merged.email) || null;
    const phone = trim(input.merged.phone) || null;

    if (!firstName) {
        return { ok: false, error: "First name is required.", status: 400 };
    }
    if (!lastName) {
        return { ok: false, error: "Last name is required.", status: 400 };
    }
    // Server minimum: first/last name + email OR phone. Stage-configured requirements
    // (e.g. Location, individual Email+Phone) are enforced client-side via
    // validateCreateLeadFromIntakeSpec before submit — see resolveCreateLeadRequiredFields.
    if (!email && !phone) {
        return { ok: false, error: "Phone or email is required.", status: 400 };
    }

    const verticalId =
        trim(input.merged.vertical_id) || (await resolveOrgDefaultVerticalId(supabase, ctx.orgId)) || null;

    const departmentId = trim(input.context?.department_id) || trim(input.merged.department_id) || null;
    let workUnitId =
        trim(input.context?.work_unit_id) ||
        trim(input.merged.work_unit_id) ||
        null;
    let statusKeyForLead = DEFAULT_LEAD_CASE_STATUS_KEY;
    if (departmentId) {
        const binding = await resolveLifecycleCreateLeadBinding(supabase, ctx.orgId, departmentId);
        if (!workUnitId && binding.work_unit_id) {
            workUnitId = binding.work_unit_id;
        }
        if (binding.status_key?.trim()) {
            statusKeyForLead = binding.status_key.trim();
        }
    }
    const locationId = trim(input.merged.location_id) || null;

    const householdCommit = readCreateLeadCommitSelectionFromPayload(input.merged);
    const primaryParentRecord = householdCommit ? primaryIncludedParent(householdCommit) : null;
    const linkedPrimaryPersonId = linkedPersonIdFromCommitRecord(primaryParentRecord);
    if (
        primaryParentRecord?.include_in_commit &&
        (primaryParentRecord.resolution?.state === "conflict" || primaryParentRecord.resolution?.action === "reject")
    ) {
        return {
            ok: false,
            error: primaryParentRecord.resolution?.reasons[0] ?? "Primary parent record resolution conflict.",
            status: 400,
        };
    }

    let personId = linkedPrimaryPersonId;
    if (!personId) {
        const person = await findOrCreatePersonInOrgWithMeta(supabase, {
            org_id: ctx.orgId,
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            default_status_key_on_create: ENROLLMENT_INTAKE_PERSON_STATUS_KEY,
        });
        personId = person?.id?.trim() || null;
    }
    if (!personId) {
        return { ok: false, error: "Could not create or resolve person.", status: 400 };
    }

    // Never silently create a duplicate when resolver found an exact match but operator did not confirm link.
    if (
        !linkedPrimaryPersonId &&
        primaryParentRecord?.resolution?.confidence === "exact_match" &&
        primaryParentRecord.resolution.action === "review_required"
    ) {
        return {
            ok: false,
            error: "Exact parent match requires linking the existing record before commit.",
            status: 400,
        };
    }

    const householdDisplayName = buildHouseholdLeadDisplayName({
        firstName,
        lastName,
        fallback: email || phone || "New lead",
    });
    const { customer_id: customerId } = await ensureCustomerForPersonNative(supabase, personId, {
        org_id: ctx.orgId,
        vertical_id: verticalId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        household_name: householdDisplayName,
    });
    if (!customerId?.trim()) {
        return { ok: false, error: "Could not create household for this lead.", status: 400 };
    }
    await ensureCustomerPersonsPrimaryLink(supabase, { customerId, personId, orgId: ctx.orgId });

    const displayName = householdDisplayName;
    const intakeNotes = trim(input.merged.intake_notes) || null;
    const oppPayload: Record<string, unknown> = {
        org_id: ctx.orgId,
        customer_id: customerId,
        primary_person_id: personId,
        primary_contact_id: null,
        name: displayName,
        status: "open",
        source: trim(input.merged.source) || "manual",
        status_key: statusKeyForLead,
        work_unit_id: workUnitId,
        metadata: {
            created_via: "create_lead",
            ...(departmentId ? { department_id: departmentId } : {}),
            ...(intakeNotes ? { intake_notes: intakeNotes } : {}),
        },
    };
    if (verticalId) oppPayload.vertical_id = verticalId;
    if (locationId) oppPayload.location_id = locationId;

    await normalizeOpportunityWritePayload(supabase, oppPayload, "executeAdminAction:create_lead");
    const { data: oppRow, error: oppErr } = await supabase.from("opportunities").insert(oppPayload).select("id").single();
    if (oppErr || !oppRow) {
        return { ok: false, error: oppErr?.message ?? "Failed to create lead.", status: 400 };
    }
    const opportunityId = (oppRow as { id: string }).id;

    const { error: opErr } = await supabase.from("opportunity_persons").insert({
        org_id: ctx.orgId,
        opportunity_id: opportunityId,
        person_id: personId,
        role_type: "family_member",
        metadata: { source: "create_lead", role: "primary_guardian" },
    });
    if (opErr && opErr.code !== "23505") {
        return { ok: false, error: opErr.message ?? "Failed to link person to lead.", status: 400 };
    }

    try {
        const primaryChildRecord = householdCommit ? primaryIncludedChild(householdCommit) : null;
        const linkedChildPersonId = linkedPersonIdFromCommitRecord(primaryChildRecord);
        if (
            primaryChildRecord?.include_in_commit &&
            (primaryChildRecord.resolution?.state === "conflict" || primaryChildRecord.resolution?.action === "reject")
        ) {
            return {
                ok: false,
                error: primaryChildRecord.resolution?.reasons[0] ?? "Child record resolution conflict.",
                status: 400,
            };
        }
        await applyCreateLeadChildParticipation(supabase, {
            orgId: ctx.orgId,
            opportunityId,
            customerId,
            merged: input.merged,
            existingPersonId: linkedChildPersonId,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to persist child enrollment fields.";
        return { ok: false, error: message, status: 400 };
    }

    if (householdCommit) {
        try {
            await applyCreateLeadHouseholdMemberCommit(supabase, {
                orgId: ctx.orgId,
                customerId,
                opportunityId,
                merged: input.merged,
                selection: householdCommit,
                primaryPersonId: personId,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to persist additional household members.";
            return { ok: false, error: message, status: 400 };
        }
    }

    try {
        await applyCreateLeadLayoutRuntimePersistence(supabase, {
            orgId: ctx.orgId,
            customerId,
            opportunityId,
            primaryPersonId: personId,
            merged: input.merged,
            selection: householdCommit,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to persist layout runtime contact/address data.";
        return { ok: false, error: message, status: 400 };
    }

    try {
        await emitStatusChangedEvent({
            supabase,
            orgId: ctx.orgId,
            entityType: "opportunities",
            entityId: opportunityId,
            oldStatusKey: null,
            newStatusKey: statusKeyForLead,
            metadata: { customer_id: customerId, primary_person_id: personId },
            actorUserId: ctx.userId,
        });
    } catch (e) {
        console.error("[executeCreateLeadAction] emitStatusChangedEvent", e);
    }

    return { ok: true, opportunity_id: opportunityId, person_id: personId, customer_id: customerId };
}

export async function assertMoveToQualificationAllowed(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    merged: Record<string, unknown>
): Promise<EntryLifecycleActionError | { ok: true; oldStatusKey: string | null }> {
    const allowedFrom = asStringList(merged.allowed_from_status_keys);
    const fromKeys = allowedFrom.length > 0 ? allowedFrom : [NEW_LEAD_STATUS_KEY];

    const { data: existing } = await supabase
        .from("opportunities")
        .select("status_key, primary_person_id, metadata")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!existing) {
        return { ok: false, error: "Not found", status: 404 };
    }

    const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
    const sk = (oldStatusKey ?? "").trim();
    if (sk && !fromKeys.includes(sk)) {
        return {
            ok: false,
            error: "Move to qualification is only available for new leads.",
            status: 400,
        };
    }

    const personId = trim((existing as { primary_person_id?: string | null }).primary_person_id);
    if (personId) {
        const { data: person } = await supabase
            .from("persons")
            .select("email, phone")
            .eq("id", personId)
            .eq("org_id", orgId)
            .maybeSingle();
        const email = trim((person as { email?: string | null } | null)?.email);
        const phone = trim((person as { phone?: string | null } | null)?.phone);
        if (!email && !phone) {
            return {
                ok: false,
                error: "Parent phone or email is required before moving to qualification.",
                status: 400,
            };
        }
    }

    const chk = await assertAllowedStatusKey(supabase, orgId, "opportunities", QUALIFICATION_STATUS_KEY);
    if (!chk.ok) {
        return { ok: false, error: chk.message, status: 400 };
    }

    return { ok: true, oldStatusKey };
}

export async function validateMarkLostPayload(
    merged: Record<string, unknown>
): Promise<EntryLifecycleActionError | { ok: true; lostReason: string }> {
    const lostReason = trim(merged.lost_reason);
    if (!lostReason) {
        return { ok: false, error: "Lost reason is required.", status: 400 };
    }
    return { ok: true, lostReason };
}

export async function validateOpportunityStatusTransitionForAction(
    supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    input: {
        actionKey: string;
        entityId: string;
        toStatusKey: string;
        merged: Record<string, unknown>;
        context?: ExecuteCreateLeadInput["context"];
    }
): Promise<
    EntryLifecycleActionError | { ok: true; existing: Record<string, unknown>; oldStatusKey: string | null }
> {
    const { data: existing } = await supabase
        .from("opportunities")
        .select("status_key, customer_id, primary_contact_id, primary_person_id, metadata, work_unit_id")
        .eq("id", input.entityId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!existing) {
        return { ok: false, error: "Not found", status: 404 };
    }

    const oldStatusKey = (existing as { status_key?: string | null }).status_key ?? null;
    const md = ((existing as { metadata?: Record<string, unknown> | null }).metadata ?? null) as Record<
        string,
        unknown
    > | null;

    const contextWorkUnitId =
        trim(input.context?.work_unit_id) || trim((existing as { work_unit_id?: string | null }).work_unit_id) || null;
    let contextDepartmentId = trim(input.context?.department_id) || null;
    if (!contextDepartmentId && contextWorkUnitId) {
        const { data: wu } = await supabase
            .from("work_units")
            .select("department_id")
            .eq("id", contextWorkUnitId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        contextDepartmentId = trim((wu as { department_id?: string | null } | null)?.department_id) || null;
    }

    const transition = await validateStatusTransition({
        supabase,
        orgId: ctx.orgId,
        entityType: "opportunities",
        entityId: input.entityId,
        departmentId: contextDepartmentId,
        workUnitId: contextWorkUnitId,
        actionKey: input.actionKey,
        fromStatusKey: oldStatusKey,
        toStatusKey: input.toStatusKey,
        currentMetadata: md,
        payload: input.merged,
    });
    if (!transition.ok) {
        return { ok: false, error: transition.message, status: 400 };
    }

    return { ok: true, existing: existing as Record<string, unknown>, oldStatusKey };
}
