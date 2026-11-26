import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import {
    fetchDepartmentsForSlugResolution,
    fetchWorkUnitsForSlugResolution,
} from "@/lib/admin/fetchWorkUnitsForSlugResolution";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

type RouteParams = { params: Promise<{ workUnitSlug: string }> };

/** GET: resolve operator slug → work unit identity (no department/uuid in public URL). */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { workUnitSlug } = await params;
    const slug = typeof workUnitSlug === "string" ? workUnitSlug.trim() : "";
    const platformKey = workUnitRouteSlugToKey(slug);
    if (!platformKey) {
        return NextResponse.json({ error: "Invalid work unit slug" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (gate.dim.departmentScope === "restricted") {
        const allowed = gate.dim.allowedDepartmentIds ?? [];
        if (!allowed.length) {
            return NextResponse.json({ status: "not_found" }, { status: 404 });
        }
    }

    let workUnits: Awaited<ReturnType<typeof fetchWorkUnitsForSlugResolution>>["rows"];
    try {
        const fetched = await fetchWorkUnitsForSlugResolution({
            supabase,
            orgId: gate.orgId,
            dim: gate.dim,
            platformKey,
        });
        workUnits = fetched.rows;
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load work units.";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Department metadata carries the configured Work Views (`work_views_v1`) that the
    // resolver's `work_view` slug kind matches against (candidate departments only).
    let departments: Awaited<ReturnType<typeof fetchDepartmentsForSlugResolution>> = [];
    try {
        departments = await fetchDepartmentsForSlugResolution({
            supabase,
            orgId: gate.orgId,
            departmentIds: workUnits.map((row) => row.department_id),
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load departments.";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    const result = resolveWorkUnitByRouteSlug({
        slug,
        workUnits,
        departments,
    });

    if (result.status === "not_found") {
        return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    if (result.status === "ambiguous") {
        return NextResponse.json(
            {
                status: "ambiguous",
                candidates: result.candidates.map((c) => ({
                    work_unit_name: c.workUnitName,
                    department_name: c.departmentName,
                    department_key: c.departmentKey,
                    route_slug: slug,
                })),
            },
            { status: 409 },
        );
    }

    const { match } = result;
    return NextResponse.json({
        status: "resolved",
        kind: match.kind,
        route_slug: match.routeSlug,
        work_unit_id: match.workUnitId,
        department_id: match.departmentId,
        department_name: departments.find((d) => d.id === match.departmentId)?.name ?? null,
        work_unit_key: match.workUnitKey,
        work_unit_name: match.workUnitName,
        initial_queue_key: match.initialQueueKey,
        initial_work_view_id: match.initialWorkViewId,
    });
}
