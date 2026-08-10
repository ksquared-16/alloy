import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import {
    LIFECYCLE_ACTIVATION_METADATA_KEY,
    lifecycleActivationFromMetadata,
    parseLifecycleActivationV1,
    type LifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import { deleteActivationLifecycleForDepartment } from "@/lib/lifecycle/lifecycleActivationOwned";
import { mergeCategoryFDepartmentMetadata } from "@/lib/lifecycle/mergeCategoryFDepartmentMetadata";

async function loadDepartment(orgId: string, departmentId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("departments")
        .select("id, org_id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as { id: string; metadata?: unknown } | null;
}

/** GET — activation bundle for department (if any). */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const activation = lifecycleActivationFromMetadata(row.metadata);
        return NextResponse.json({ activation });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load" }, { status: 500 });
    }
}

/** PATCH — upsert activation bundle (additive audit trail). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = parseLifecycleActivationV1(body);
    if (!parsed) {
        return NextResponse.json({ error: "Invalid activation payload" }, { status: 400 });
    }

    const activation: LifecycleActivationV1 = {
        ...parsed,
        updated_at: new Date().toISOString(),
    };

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const metadata =
            row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        // Category F — activation sibling only; never rewrite publication-owned builder.
        const nextMeta = mergeCategoryFDepartmentMetadata(metadata, {
            [LIFECYCLE_ACTIVATION_METADATA_KEY]: activation,
        });

        const supabase = createAdminClient();
        const { error } = await supabase
            .from("departments")
            .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
            .eq("id", departmentId)
            .eq("org_id", ctx.orgId);
        if (error) throw new Error(error.message);

        return NextResponse.json({ activation });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 400 });
    }
}

/** DELETE — remove activation-owned lifecycle and related config. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const result = await deleteActivationLifecycleForDepartment(supabase, ctx.orgId, departmentId);
    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
}
