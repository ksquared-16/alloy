import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { upsertFieldValuesFromBody } from "@/lib/admin/fieldValues";
import { parsePersonEmployeePlacementPatchBody } from "@/lib/admin/personEmployeePlacementFields";

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
        .select("id, org_id, first_name, last_name")
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

    const personUpdates: Record<string, unknown> = {};
    if (first_name !== undefined) personUpdates.first_name = first_name;
    if (last_name !== undefined) personUpdates.last_name = last_name;
    if (email !== undefined) personUpdates.email = email;
    if (phone !== undefined) personUpdates.phone = phone;
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

    if (Object.keys(personUpdates).length > 0) {
        const fn = first_name !== undefined ? first_name : (existing as { first_name?: string | null }).first_name;
        const ln = last_name !== undefined ? last_name : (existing as { last_name?: string | null }).last_name;
        (personUpdates as Record<string, unknown>).full_name = [fn, ln].filter(Boolean).join(" ").trim() || null;
    }

    if (Object.keys(personUpdates).length > 0) {
        const { error: updateErr } = await supabase
            .from("persons")
            .update(personUpdates)
            .eq("id", id)
            .eq("org_id", ctx.orgId);
        if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 400 });
        }
    }

    await upsertFieldValuesFromBody(supabase, ctx.orgId, "person", id, body, PERSON_FIELD_VALUES_EXCLUDED_KEYS);

    const { data: updated } = await supabase
        .from("persons")
        .select(
            "id, org_id, first_name, last_name, full_name, email, phone, status_key, is_employee, employee_id, employee_source, created_at, updated_at"
        )
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    return NextResponse.json(updated ?? { id, ...personUpdates });
}
