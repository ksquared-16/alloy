import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { invalidateTenantConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function deepMergeJsonObjects(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...a };
    for (const [k, bv] of Object.entries(b)) {
        const av = a[k];
        if (
            bv !== null &&
            typeof bv === "object" &&
            !Array.isArray(bv) &&
            av !== null &&
            typeof av === "object" &&
            !Array.isArray(av)
        ) {
            out[k] = deepMergeJsonObjects(av as Record<string, unknown>, bv as Record<string, unknown>);
        } else {
            out[k] = bv;
        }
    }
    return out;
}

function normalizeKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

/** GET: single department in org. */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("departments")
        .select("id, org_id, key, name, description, sort_order, is_active, metadata, created_at, updated_at")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
}

/** PATCH: update department. Admin only. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const patchDeptDim = scopeDimensionsFromAccess(access);
    if (!departmentIdAllowed(patchDeptDim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: existing, error: fetchErr } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (fetchErr || !existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

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
    if (body.metadata !== undefined) {
        if (body.metadata === null || typeof body.metadata !== "object" || Array.isArray(body.metadata)) {
            return NextResponse.json({ error: "metadata must be a JSON object" }, { status: 400 });
        }
        // Business Process configuration is publication-owned. This endpoint deep-merges arbitrary
        // caller metadata, which made it a generic bypass able to rewrite any part of the
        // configured process. The database guard rejects it too, but that surfaces as an opaque
        // Postgres error — reject here so the caller gets a reason and a destination.
        if (LIFECYCLE_BUILDER_METADATA_KEY in (body.metadata as Record<string, unknown>)) {
            return NextResponse.json(
                {
                    error:
                        "Business Process configuration cannot be changed here. It is published " +
                        "configuration — edit the draft and publish it through the Business Process " +
                        "configuration service.",
                    field: LIFECYCLE_BUILDER_METADATA_KEY,
                },
                { status: 409 },
            );
        }
        const prevRaw = (existing as { metadata?: unknown }).metadata;
        const prev =
            prevRaw !== null && typeof prevRaw === "object" && !Array.isArray(prevRaw)
                ? (prevRaw as Record<string, unknown>)
                : {};
        updates.metadata = deepMergeJsonObjects(prev, body.metadata as Record<string, unknown>);
    }

    if (Object.keys(updates).length <= 1) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
        .from("departments")
        .update(updates)
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .select()
        .single();

    if (updateErr) {
        const code = (updateErr as { code?: string }).code;
        if (code === "23505") {
            return NextResponse.json({ error: "A department with this key already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    // B5 — a department edit changes the lifecycle/config the provisioning answer caches (department
    // metadata + work-unit resolution + queue/header layout selection). Bust every config kind for
    // this tenant so the next operator navigation reflects the change immediately, not after the TTL.
    invalidateTenantConfigReadCache(ctx.orgId);

    return NextResponse.json(updated);
}

/** DELETE: remove department if no work units reference it (RESTRICT). Admin only. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const deleteDeptDim = scopeDimensionsFromAccess(access);
    if (!departmentIdAllowed(deleteDeptDim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { count } = await supabase
        .from("work_units")
        .select("id", { count: "exact", head: true })
        .eq("department_id", departmentId)
        .eq("org_id", ctx.orgId);

    if ((count ?? 0) > 0) {
        return NextResponse.json(
            { error: "Remove or reassign work units under this department before deleting it." },
            { status: 409 }
        );
    }

    const { error } = await supabase.from("departments").delete().eq("id", departmentId).eq("org_id", ctx.orgId);

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "23503") {
            return NextResponse.json(
                { error: "Cannot delete: other records still reference this department." },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
}
