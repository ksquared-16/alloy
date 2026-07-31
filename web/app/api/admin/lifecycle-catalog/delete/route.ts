import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import {
    lifecycleBuilderFromDepartmentMetadata,
    mergeLifecycleBuilderIntoMetadata,
    removeProcessFromConfig,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { deleteActivationLifecycleForDepartment } from "@/lib/lifecycle/lifecycleActivationOwned";
import { isActivationOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleActivationOwned";
import { editBuilderInDraft } from "@/lib/businessProcesses/configuration/editProcessInDraft";
import { BusinessProcessDraftEditConflictError } from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";

/** POST — delete builder-owned department or remove legacy process (with confirm). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    let body: {
        department_id?: string;
        process_id?: string;
        legacy_delete_confirm?: boolean;
        /** The draft token the caller loaded, so a concurrent edit conflicts instead of vanishing. */
        draft_revision?: number;
    } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : "";
    const processId = typeof body.process_id === "string" ? body.process_id.trim() : "";
    if (!departmentId) return NextResponse.json({ error: "department_id is required" }, { status: 400 });

    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data: dept } = await supabase
        .from("departments")
        .select("id, key, metadata")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!dept) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const metadata =
        dept.metadata !== null && typeof dept.metadata === "object" && !Array.isArray(dept.metadata)
            ? (dept.metadata as Record<string, unknown>)
            : {};

    if (isActivationOwnedDepartmentMetadata(metadata)) {
        const result = await deleteActivationLifecycleForDepartment(supabase, ctx.orgId, departmentId);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
        return NextResponse.json({ ok: true, mode: "department_deleted" });
    }

    if (!processId) {
        return NextResponse.json({ error: "process_id is required for legacy lifecycle delete" }, { status: 400 });
    }
    if (!body.legacy_delete_confirm) {
        return NextResponse.json(
            {
                error: "Legacy lifecycle delete requires legacy_delete_confirm: true. Demo Enrollment config may be runtime-critical.",
            },
            { status: 400 }
        );
    }

    const deptKey = ((dept as { key?: string }).key ?? "").trim().toLowerCase();
    if (deptKey === "enrollment") {
        return NextResponse.json(
            { error: "Cannot remove processes from the Enrollment department via this action. Use Advanced Configuration." },
            { status: 400 }
        );
    }

    // Removing a process is ordinary editing, so it goes where every other ordinary edit goes:
    // the draft. It used to UPDATE the projection directly, which meant a delete took runtime
    // down with it before anyone reviewed or published the change — and, once the lifecycle guard
    // reached `enforce`, failed with an opaque Postgres error instead of doing anything.
    try {
        const result = await editBuilderInDraft(supabase, {
            orgId: ctx.orgId,
            departmentId,
            actorUserId: ctx.userId,
            expectedDraftRevision:
                typeof body.draft_revision === "number" ? body.draft_revision : undefined,
            edit: (builder) => removeProcessFromConfig(builder, processId),
        });
        return NextResponse.json({
            ok: true,
            mode: "legacy_process_removed",
            draft: { draft_revision: result.draftRevision },
            // The process is gone from the DRAFT. Runtime still serves it until a publish.
            publication_required: result.publicationRequired,
        });
    } catch (e) {
        if (e instanceof BusinessProcessDraftEditConflictError) {
            return NextResponse.json({ error: e.message }, { status: 409 });
        }
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to remove process" },
            { status: 400 },
        );
    }
}
