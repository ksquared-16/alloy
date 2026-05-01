import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import {
    PlacementValidationError,
    validatePlacementCreateBody,
    validatePlacementPatchBody,
} from "@/lib/kpi/placementMutationValidation";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";

export const dynamic = "force-dynamic";

const SELECT_COLS =
    "id, org_id, surface, department_id, work_unit_id, metric_key, display_order, is_visible, label_override, format_override, lane_override, metadata, created_at, updated_at";

/**
 * GET:
 * - `list=org` — all placement rows for current org (includes hidden). **Admin only.**
 * - Otherwise — surface-scoped list for workspace KPI strips (visible only unless extended later).
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const listOrg = request.nextUrl.searchParams.get("list")?.trim() === "org";
    if (listOrg) {
        if (ctx.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("workspace_kpi_placement")
            .select(SELECT_COLS)
            .eq("org_id", ctx.orgId)
            .order("display_order", { ascending: true })
            .order("metric_key", { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const items = (data ?? []) as WorkspaceKpiPlacementRow[];
        return NextResponse.json({ items });
    }

    const surface = (request.nextUrl.searchParams.get("surface") ?? "").trim().toLowerCase();
    const departmentId = (request.nextUrl.searchParams.get("department_id") ?? "").trim();
    const workUnitId = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim();

    if (surface !== "workspace" && surface !== "department" && surface !== "work_unit") {
        return NextResponse.json({ error: "Invalid surface" }, { status: 400 });
    }
    if (surface === "department" && !departmentId) {
        return NextResponse.json({ error: "department_id required for surface=department" }, { status: 400 });
    }
    if (surface === "work_unit" && (!departmentId || !workUnitId)) {
        return NextResponse.json(
            { error: "department_id and work_unit_id required for surface=work_unit" },
            { status: 400 }
        );
    }
    if (surface === "workspace" && (departmentId || workUnitId)) {
        return NextResponse.json({ error: "workspace surface must not include department_id or work_unit_id" }, { status: 400 });
    }

    const supabase = createAdminClient();

    let countBuilder = supabase
        .from("workspace_kpi_placement")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .eq("surface", surface);

    let q = supabase
        .from("workspace_kpi_placement")
        .select(SELECT_COLS)
        .eq("org_id", ctx.orgId)
        .eq("surface", surface)
        .eq("is_visible", true)
        .order("display_order", { ascending: true })
        .order("metric_key", { ascending: true });

    if (surface === "workspace") {
        q = q.is("department_id", null).is("work_unit_id", null);
        countBuilder = countBuilder.is("department_id", null).is("work_unit_id", null);
    } else if (surface === "department") {
        q = q.eq("department_id", departmentId).is("work_unit_id", null);
        countBuilder = countBuilder.eq("department_id", departmentId).is("work_unit_id", null);
    } else {
        q = q.eq("department_id", departmentId).eq("work_unit_id", workUnitId);
        countBuilder = countBuilder.eq("department_id", departmentId).eq("work_unit_id", workUnitId);
    }

    const [{ data, error }, countRes] = await Promise.all([q, countBuilder]);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (countRes.error) {
        return NextResponse.json({ error: countRes.error.message }, { status: 500 });
    }

    const items = (data ?? []) as WorkspaceKpiPlacementRow[];
    const scopeHasPlacementRows = (countRes.count ?? 0) > 0;
    return NextResponse.json({ items, scope_has_placements: scopeHasPlacementRows });
}

/** Create placement from registry metric keys only; **admin only**. */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    let parsed: ReturnType<typeof validatePlacementCreateBody>;
    try {
        parsed = validatePlacementCreateBody(body as Parameters<typeof validatePlacementCreateBody>[0]);
    } catch (e) {
        if (e instanceof PlacementValidationError) {
            return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
    }

    const supabase = createAdminClient();

    const deptOk = await assertRowOrg(supabase, "departments", parsed.department_id ?? "", ctx.orgId);
    if (parsed.surface === "department") {
        if (!deptOk.ok) return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const insertRow = {
        org_id: ctx.orgId,
        surface: parsed.surface,
        department_id: parsed.department_id,
        work_unit_id: parsed.work_unit_id,
        metric_key: parsed.metric_key,
        display_order: parsed.display_order,
        is_visible: true,
        label_override: parsed.label_override,
        format_override: null as string | null,
        lane_override: null as string | null,
        metadata: {} as Record<string, never>,
    };

    const { data: inserted, error: insErr } = await supabase
        .from("workspace_kpi_placement")
        .insert(insertRow)
        .select(SELECT_COLS)
        .maybeSingle();

    if (insErr) {
        const code = (insErr as { code?: string }).code;
        if (code === "23505") {
            return NextResponse.json(
                { error: "A visible placement for this metric and scope already exists. Hide the existing row or adjust scope." },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ item: inserted as WorkspaceKpiPlacementRow });
}

/**
 * Patch one row (`id`). Soft-hide via `is_visible: false` (preferred over delete). **Admin only**.
 */
export async function PATCH(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    let patch: ReturnType<typeof validatePlacementPatchBody>;
    try {
        patch = validatePlacementPatchBody(body as Parameters<typeof validatePlacementPatchBody>[0]);
    } catch (e) {
        if (e instanceof PlacementValidationError) {
            return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
    }

    const supabase = createAdminClient();
    const { data: existing, error: exErr } = await supabase
        .from("workspace_kpi_placement")
        .select("id, org_id")
        .eq("id", patch.id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (patch.is_visible !== undefined) updates.is_visible = patch.is_visible;
    if (patch.display_order !== undefined) updates.display_order = patch.display_order;
    if (patch.label_override !== undefined) updates.label_override = patch.label_override;

    const { data: updated, error: upErr } = await supabase
        .from("workspace_kpi_placement")
        .update(updates)
        .eq("id", patch.id)
        .eq("org_id", ctx.orgId)
        .select(SELECT_COLS)
        .maybeSingle();

    if (upErr) {
        const code = (upErr as { code?: string }).code;
        if (code === "23505") {
            return NextResponse.json(
                { error: "Update would duplicate another visible placement for this metric and scope." },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ item: updated as WorkspaceKpiPlacementRow });
}

/**
 * Hard-delete a placement row (frees unique partial-index slot for a new visible row). **Admin only**.
 */
export async function DELETE(request: NextRequest) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
    if (!id) {
        return NextResponse.json({ error: "id query parameter required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: exErr } = await supabase
        .from("workspace_kpi_placement")
        .select("id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { error: delErr } = await supabase.from("workspace_kpi_placement").delete().eq("id", id).eq("org_id", ctx.orgId);

    if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
