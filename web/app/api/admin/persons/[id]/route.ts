import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";

const PERSON_SYSTEM_KEYS = ["first_name", "last_name", "email", "phone", "status_key"] as const;

/** PATCH: update a person. System fields -> persons table; custom fields (by field_key) -> field_values. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
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
        .select("id, org_id")
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

    const customKeys = Object.keys(body).filter(
        (k) =>
            !PERSON_SYSTEM_KEYS.includes(k as (typeof PERSON_SYSTEM_KEYS)[number]) && k !== "full_name" && !k.startsWith("_")
    );
    if (customKeys.length > 0) {
        const { data: defRows } = await supabase
            .from("field_definitions")
            .select("id, field_key")
            .eq("org_id", ctx.orgId)
            .eq("entity_type", "person")
            .eq("is_system", false)
            .in("field_key", customKeys);
        const defsByKey = new Map((defRows ?? []).map((r: { id: string; field_key: string }) => [r.field_key, r.id]));

        for (const field_key of customKeys) {
            const defId = defsByKey.get(field_key);
            if (!defId) continue;
            const value = body[field_key] == null ? "" : String(body[field_key]).trim();
            const { data: existingFv } = await supabase
                .from("field_values")
                .select("id")
                .eq("entity_type", "person")
                .eq("entity_id", id)
                .eq("field_definition_id", defId)
                .maybeSingle();
            if (existingFv) {
                await supabase
                    .from("field_values")
                    .update({ value, updated_at: new Date().toISOString() })
                    .eq("entity_type", "person")
                    .eq("entity_id", id)
                    .eq("field_definition_id", defId);
            } else {
                await supabase.from("field_values").insert({
                    org_id: ctx.orgId,
                    entity_type: "person",
                    entity_id: id,
                    field_definition_id: defId,
                    value,
                });
            }
        }
    }

    const { data: updated } = await supabase
        .from("persons")
        .select("id, org_id, first_name, last_name, full_name, email, phone, status_key, created_at, updated_at")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    return NextResponse.json(updated ?? { id, ...personUpdates });
}
