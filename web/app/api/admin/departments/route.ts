import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";
import { ensureLifecycleDepartmentWorkspaceAccess } from "@/lib/lifecycle/ensureLifecycleDepartmentWorkspaceAccess";
import {
    applyDepartmentAccessScope,
    filterActiveWorkspaceDepartments,
} from "@/lib/workspace/workspaceActiveDepartments";

export const dynamic = "force-dynamic";

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function normalizeKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

/** GET: list departments for current org. */
export async function GET() {
    const t0 = Date.now();
    const gate = await loadAdminRouteGate();
    const ctxMs = Date.now() - t0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const dim = gate.dim;

    const t1 = Date.now();
    const supabase = createAdminClient();
    let deptQuery = supabase
        .from("departments")
        .select("id, org_id, key, name, description, sort_order, is_active, metadata, created_at, updated_at")
        .eq("org_id", gate.orgId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

    if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        if (!allowed.length) {
            return NextResponse.json({ items: [] });
        }
        deptQuery = deptQuery.in("id", allowed);
    }

    const { data: rows, error } = await deptQuery;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const dbMs = Date.now() - t1;
    const totalMs = Date.now() - t0;
    if (totalMs > 200) {
        console.warn("[admin-timing] GET /api/admin/departments", {
            total_ms: totalMs,
            get_admin_context_ms: ctxMs,
            query_ms: dbMs,
            row_count: (rows ?? []).length,
        });
    }

    const active = filterActiveWorkspaceDepartments(rows ?? []);
    const scoped = applyDepartmentAccessScope(active, dim);
    return NextResponse.json({ items: scoped });
}

/** POST: create department. Admin only. org_id server-side. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
        key?: string;
        name?: string;
        description?: string | null;
        sort_order?: number;
        is_active?: boolean;
        metadata?: Record<string, unknown>;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const key = normalizeKey(typeof body.key === "string" ? body.key : "");
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
        typeof body.description === "string" ? body.description.trim() || null : body.description === null ? null : null;
    const sort_order = typeof body.sort_order === "number" && !Number.isNaN(body.sort_order) ? body.sort_order : 0;
    const is_active = body.is_active !== false;
    const metadata =
        body.metadata !== null && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? body.metadata
            : {};

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

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data: created, error } = await supabase
        .from("departments")
        .insert({
            org_id: ctx.orgId,
            key,
            name,
            description,
            sort_order,
            is_active,
            metadata,
            updated_at: now,
        })
        .select()
        .single();

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "23505") {
            return NextResponse.json({ error: "A department with this key already exists" }, { status: 409 });
        }
        if (code === "42P01") {
            return NextResponse.json(
                { error: "departments table not found — apply hierarchy migration (see docs/implementation/HIERARCHY_SCHEMA_V1.md)" },
                { status: 503 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const createdId = (created as { id?: string }).id;
    if (createdId && isLifecycleBuilderOwnedDepartmentMetadata(metadata)) {
        const ensure = await ensureLifecycleDepartmentWorkspaceAccess({
            supabase,
            orgId: ctx.orgId,
            departmentId: createdId,
            currentUserId: ctx.userId,
        });
        // W-8: a department-restricted creator no longer self-provisions access to what it just
        // created. The department is created; the caller is told it is outside their scope rather
        // than being silently granted it. 403, not 500 — this is a refusal, not a failure.
        if (!ensure.ok) {
            return NextResponse.json(
                { error: `Department created, but it is outside your department scope: ${ensure.error}` },
                { status: 403 }
            );
        }
    }

    return NextResponse.json(created);
}
