import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { parsePersonEmployeePlacementPatchBody } from "@/lib/admin/personEmployeePlacementFields";
import {
    COMPLETION_REQUIREMENT_VALIDATION_ERROR,
    enforcePersonCompletionOnPatch,
} from "@/lib/completion/enforcePersonCompletionOnPatch";

const PERSON_NATIVE_KEYS_IN_PATCH = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "status_key",
    "is_employee",
    "employee_id",
    "employee_source",
] as const;

/** Keys never persisted via field_values (native columns, computed, or audit fields). */
const PERSON_FIELD_VALUES_EXCLUDED_KEYS = [
    ...PERSON_NATIVE_KEYS_IN_PATCH,
    "full_name",
    "preferred_name",
    "date_of_birth",
    "status",
    "archived_at",
    "archived_by",
    "external_source",
    "external_id",
    "metadata",
    "id",
    "org_id",
    "created_at",
    "updated_at",
] as const;

/** PATCH: update a person. System fields -> persons table; custom fields -> typed field_values via shared helper. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("persons")
        .select(
            "id, org_id, first_name, last_name, email, phone, status_key, date_of_birth, is_employee, employee_id, employee_source, metadata"
        )
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const first_name = body.first_name !== undefined ? (typeof body.first_name === "string" ? body.first_name.trim() || null : null) : undefined;
    const last_name = body.last_name !== undefined ? (typeof body.last_name === "string" ? body.last_name.trim() || null : null) : undefined;
    const email = body.email !== undefined ? (typeof body.email === "string" ? body.email.trim() || null : null) : undefined;
    const phone = body.phone !== undefined ? (typeof body.phone === "string" ? body.phone.trim() || null : null) : undefined;
    const status_key =
        body.status_key !== undefined
            ? body.status_key === "" || body.status_key == null
                ? null
                : typeof body.status_key === "string"
                  ? body.status_key.trim() || null
                  : null
            : undefined;
    const date_of_birth =
        body.date_of_birth !== undefined
            ? body.date_of_birth === "" || body.date_of_birth == null
                ? null
                : typeof body.date_of_birth === "string"
                  ? body.date_of_birth.trim().slice(0, 10) || null
                  : null
            : undefined;

    // Shallow-merge metadata (jsonb, existing column) — used today for the canonical
    // profile-photo reference (`profile_photo_document_id` / `photo_url`). Merge rather
    // than replace so unrelated metadata keys survive an edit that only touches one key.
    const metadataPatch =
        body.metadata != null && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined;
    const existingMetadata =
        (existing as { metadata?: unknown }).metadata && typeof (existing as { metadata?: unknown }).metadata === "object"
            ? ((existing as { metadata?: unknown }).metadata as Record<string, unknown>)
            : {};

    const personUpdates: Record<string, unknown> = {};
    if (first_name !== undefined) personUpdates.first_name = first_name;
    if (last_name !== undefined) personUpdates.last_name = last_name;
    if (email !== undefined) personUpdates.email = email;
    if (phone !== undefined) personUpdates.phone = phone;
    if (date_of_birth !== undefined) personUpdates.date_of_birth = date_of_birth;
    if (metadataPatch) personUpdates.metadata = { ...existingMetadata, ...metadataPatch };
    if (status_key !== undefined) {
        const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "persons", status_key);
        if (!chk.ok) {
            return NextResponse.json({ error: chk.message }, { status: 400 });
        }
        personUpdates.status_key = status_key;
    }

    const employeePatch = parsePersonEmployeePlacementPatchBody(body);
    if (!employeePatch.ok) {
        return NextResponse.json({ error: employeePatch.error }, { status: 400 });
    }
    if (employeePatch.updates.is_employee !== undefined) {
        personUpdates.is_employee = employeePatch.updates.is_employee;
    }
    if (employeePatch.updates.employee_id !== undefined) {
        personUpdates.employee_id = employeePatch.updates.employee_id;
    }
    if (employeePatch.updates.employee_source !== undefined) {
        personUpdates.employee_source = employeePatch.updates.employee_source;
    }

    const mergedForValidation: Record<string, unknown> = {
        ...(existing as Record<string, unknown>),
        ...body,
        ...personUpdates,
    };

    const completionCheck = await enforcePersonCompletionOnPatch({
        supabase,
        orgId: ctx.orgId,
        personId: id,
        body,
        existing: mergedForValidation,
        phase: status_key !== undefined ? "status_change" : "save",
        status_to: status_key,
    });
    if (!completionCheck.ok) {
        return NextResponse.json(
            {
                error: completionCheck.message || COMPLETION_REQUIREMENT_VALIDATION_ERROR,
                completion_requirements: completionCheck.validation,
            },
            { status: 400 }
        );
    }

    if (Object.keys(personUpdates).length > 0) {
        const fn = first_name !== undefined ? first_name : (existing as { first_name?: string | null }).first_name;
        const ln = last_name !== undefined ? last_name : (existing as { last_name?: string | null }).last_name;
        (personUpdates as Record<string, unknown>).full_name = [fn, ln].filter(Boolean).join(" ").trim() || null;

        const { error: updateErr } = await supabase
            .from("persons")
            .update(personUpdates)
            .eq("id", id)
            .eq("org_id", ctx.orgId);
        if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 400 });
        }
    }

    const fieldValueOutcome = await upsertFieldValuesFromBody(
        supabase,
        ctx.orgId,
        "person",
        id,
        body,
        PERSON_FIELD_VALUES_EXCLUDED_KEYS
    );

    /**
     * A SAVE THAT PERSISTS NOTHING MUST NOT REPORT SUCCESS.
     *
     * `address_line2` is not a persons column and has no `field_definitions` row for `person`, so
     * the column whitelist above ignored it and the field-values upsert skipped it. The route
     * still returned 200 with the unchanged row, the Focus Panel took that as success and showed
     * the new value, and the edit was gone on reload — a silent data loss the operator could only
     * discover by re-opening the record. Certified on Firefly's Household surface.
     *
     * This refuses only the case where the body asked for changes and NONE of them could land.
     * A body that writes something plus carries an unknown key still succeeds, so callers that
     * send incidental extra keys are unaffected.
     */
    if (Object.keys(personUpdates).length === 0 && fieldValueOutcome.written.length === 0 && fieldValueOutcome.skipped.length > 0) {
        return NextResponse.json(
            {
                error:
                    `No writable field in this request. Unknown for a person: ${fieldValueOutcome.skipped.join(", ")}.`,
                unwritable_fields: fieldValueOutcome.skipped,
            },
            { status: 400 }
        );
    }

    const { data: updated } = await supabase
        .from("persons")
        .select(
            "id, org_id, first_name, last_name, full_name, email, phone, status_key, date_of_birth, is_employee, employee_id, employee_source, metadata, created_at, updated_at"
        )
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    return NextResponse.json(updated ?? { id, ...personUpdates });
}
