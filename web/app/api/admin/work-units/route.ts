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

function parseQueueDefinition(raw: unknown): Record<string, unknown> {
    if (raw === undefined || raw === null) return {};
    if (typeof raw === "object" && !Array.isArray(raw) && raw !== null) {
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

/** GET: list work units for current org. Optional ?department_id= */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const departmentId = new URL(request.url).searchParams.get("department_id")?.trim() || null;

    const supabase = createAdminClient();
    let q = supabase
        .from("work_units")
        .select("id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    if (departmentId) {
        const ok = await assertRowOrg(supabase, "departments", departmentId, ctx.orgId);
        if (!ok.ok) {
            return NextResponse.json({ error: "Department not found" }, { status: 404 });
        }
        q = q.eq("department_id", departmentId);
    }

    const { data: rows, error } = await q;

    if (error) {
        if ((error as { code?: string }).code === "42P01") {
            return NextResponse.json(
                { error: "work_units table not found — apply hierarchy migration (see docs/HIERARCHY_SCHEMA_V1.md)" },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: rows ?? [] });
}

/** POST: create work unit. Admin only. org_id from department row, not client. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
        department_id?: string;
        key?: string;
        name?: string;
        description?: string | null;
        sort_order?: number;
        is_active?: boolean;
        queue_definition?: unknown;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const department_id = typeof body.department_id === "string" ? body.department_id.trim() : "";
    if (!department_id) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id, org_id")
        .eq("id", department_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (deptErr || !dept) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const key = normalizeKey(typeof body.key === "string" ? body.key : "");
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
        typeof body.description === "string" ? body.description.trim() || null : body.description === null ? null : null;
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 0;
    const is_active = body.is_active !== false;

    let queue_definition: Record<string, unknown>;
    try {
        queue_definition = parseQueueDefinition(body.queue_definition);
    } catch (e) {
        if ((e as Error).message === "INVALID_QUEUE_JSON") {
            return NextResponse.json({ error: "queue_definition must be a JSON object" }, { status: 400 });
        }
        throw e;
    }

    if (!key) {
        return NextResponse.json({ error: "key is required" }, { status: 400 });
    }
    if (!KEY_REGEX.test(key)) {
        return NextResponse.json(
            { error: "key must be 2–64 characters: lowercase letters, numbers, underscores only" },
            { status: 400 }
        );
    }
    if (!name) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const org_id = (dept as { org_id: string }).org_id;
    if (org_id !== ctx.orgId) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { data: created, error } = await supabase
        .from("work_units")
        .insert({
            org_id: ctx.orgId,
            department_id,
            key,
            name,
            description,
            sort_order,
            is_active,
            queue_definition,
            metadata: {},
            updated_at: now,
        })
        .select()
        .single();

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
            return NextResponse.json({ error: "A work unit with this key already exists in this department" }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(created);
}
