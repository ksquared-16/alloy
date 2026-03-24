import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function normalizeKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

function parseQueueDefinition(raw: unknown): Record<string, unknown> | undefined {
    if (raw === undefined) return undefined;
    if (raw === null) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        if (!t) return {};
        try {
            const p = JSON.parse(t) as unknown;
            if (typeof p === "object" && p !== null && !Array.isArray(p)) {
                return p as Record<string, unknown>;
            }
        } catch {
            throw new Error("INVALID_QUEUE_JSON");
        }
    }
    throw new Error("INVALID_QUEUE_JSON");
}

/** GET: single work unit in org. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("work_units")
        .select("id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, created_at, updated_at")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
}

/** PATCH: update work unit. Admin only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
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
        .from("work_units")
        .select("id, department_id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.department_id !== undefined) {
        const newDeptId = typeof body.department_id === "string" ? body.department_id.trim() : "";
        if (!newDeptId) {
            return NextResponse.json({ error: "department_id cannot be empty" }, { status: 400 });
        }
        const ok = await assertRowOrg(supabase, "departments", newDeptId, ctx.orgId);
        if (!ok.ok) {
            return NextResponse.json({ error: "Department not found" }, { status: 404 });
        }
        updates.department_id = newDeptId;
        updates.org_id = ctx.orgId;
    }

    if (body.key !== undefined) {
        const key = normalizeKey(String(body.key ?? ""));
        if (!key || !KEY_REGEX.test(key)) {
            return NextResponse.json(
                { error: "key must be 2–64 characters: lowercase letters, numbers, underscores only" },
                { status: 400 }
            );
        }
        updates.key = key;
    }
    if (body.name !== undefined) {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (!name) {
            return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
        }
        updates.name = name;
    }
    if (body.description !== undefined) {
        updates.description =
            body.description === null
                ? null
                : typeof body.description === "string"
                  ? body.description.trim() || null
                  : null;
    }
    if (body.sort_order !== undefined) {
        const v = body.sort_order;
        updates.sort_order = typeof v === "number" && !Number.isNaN(v) ? v : Number(v);
    }
    if (body.is_active !== undefined) {
        updates.is_active = !!body.is_active;
    }
    if (body.queue_definition !== undefined) {
        try {
            const qd = parseQueueDefinition(body.queue_definition);
            if (qd !== undefined) updates.queue_definition = qd;
        } catch (e) {
            if ((e as Error).message === "INVALID_QUEUE_JSON") {
                return NextResponse.json({ error: "queue_definition must be a JSON object" }, { status: 400 });
            }
            throw e;
        }
    }

    if (Object.keys(updates).length <= 1) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("work_units")
        .update(updates)
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select()
        .single();

    if (updateErr) {
        const code = (updateErr as { code?: string }).code;
        if (code === "23505") {
            return NextResponse.json({ error: "A work unit with this key already exists in this department" }, { status: 409 });
        }
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json(updated);
}

/** DELETE: remove work unit. Admin only. Jobs referencing it get work_unit_id cleared (FK). */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase.from("work_units").delete().eq("id", id).eq("org_id", ctx.orgId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
}
