import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { normalizeQueueDefinitionForCreate } from "@/lib/rrs/queue/queueDefinitionV1";

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function normalizeKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

/** GET: list work units for current org. Optional ?department_id= */
export async function GET(request: NextRequest) {
    const t0 = Date.now();
    const gate = await loadAdminRouteGate();
    const ctxMs = Date.now() - t0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const dim = gate.dim;

    const departmentId = new URL(request.url).searchParams.get("department_id")?.trim() || null;

    const t1 = Date.now();
    const supabase = createAdminClient();

    if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        if (!allowed.length) {
            return NextResponse.json({ items: [] });
        }
        if (departmentId && !allowed.includes(departmentId)) {
            return NextResponse.json({ error: "Department not found" }, { status: 404 });
        }
    }

    let q = supabase
        .from("work_units")
        .select("id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, created_at, updated_at")
        .eq("org_id", gate.orgId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    if (departmentId) {
        const ok = await assertRowOrg(supabase, "departments", departmentId, gate.orgId);
        if (!ok.ok) {
            return NextResponse.json({ error: "Department not found" }, { status: 404 });
        }
        q = q.eq("department_id", departmentId);
    } else if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        q = q.in("department_id", allowed);
    }

    const { data: rows, error } = await q;

    if (error) {
        if ((error as { code?: string }).code === "42P01") {
            return NextResponse.json(
                { error: "work_units table not found — apply hierarchy migration (see docs/implementation/HIERARCHY_SCHEMA_V1.md)" },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const dbMs = Date.now() - t1;
    const totalMs = Date.now() - t0;
    if (totalMs > 200) {
        console.warn("[admin-timing] GET /api/admin/work-units", {
            total_ms: totalMs,
            get_admin_context_ms: ctxMs,
            query_ms: dbMs,
            department_id: departmentId,
            row_count: (rows ?? []).length,
        });
    }

    return NextResponse.json({ items: rows ?? [] });
}

/** POST: create work unit. Admin only. org_id from department row, not client. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
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

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const postDim = scopeDimensionsFromAccess(access);
    if (!departmentIdAllowed(postDim, department_id)) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const key = normalizeKey(typeof body.key === "string" ? body.key : "");
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
        typeof body.description === "string" ? body.description.trim() || null : body.description === null ? null : null;
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 0;
    const is_active = body.is_active !== false;

    const qdNorm = normalizeQueueDefinitionForCreate(body.queue_definition);
    if (!qdNorm.ok) {
        return NextResponse.json({ error: qdNorm.error }, { status: 400 });
    }
    const queue_definition = qdNorm.value;

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
