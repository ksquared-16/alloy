/**
 * Employment positions — org-owned job vocabulary.
 *
 * Configuration steers: "Lead Teacher" is a tenant word an operator authors,
 * not a platform enum. Employment reads are served by the canonical Person view
 * model (`record._employment`); this route exists only so the Add Staff and
 * Edit Employment surfaces can offer the org's own positions.
 */

import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { EmploymentServiceError, employmentErrorStatus } from "@/lib/employment/employmentErrors";
import { listEmploymentPositions } from "@/lib/employment/employmentService";
import { createAdminClient } from "@/lib/supabaseAdmin";

function errorResponse(e: unknown) {
    if (e instanceof EmploymentServiceError) {
        return NextResponse.json({ error: e.message, details: e.details }, { status: employmentErrorStatus(e.code) });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("include_inactive") === "true";

    const supabase = createAdminClient();
    try {
        const positions = await listEmploymentPositions(supabase, ctx.orgId, {
            activeOnly: !includeInactive,
        });
        return NextResponse.json({ positions });
    } catch (e) {
        return errorResponse(e);
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        body = {};
    }

    const key = String(body.key ?? "").trim().toLowerCase();
    const label = String(body.label ?? "").trim();
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(key)) {
        return NextResponse.json(
            { error: "key must start with a letter and contain only lowercase letters, numbers, and underscores" },
            { status: 400 }
        );
    }
    if (!label) {
        return NextResponse.json({ error: "label is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("employment_positions")
        .insert({
            org_id: ctx.orgId,
            key,
            label,
            description: String(body.description ?? "").trim() || null,
            sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 100,
        })
        .select("id, org_id, key, label, description, is_active, sort_order")
        .single();

    if (error) {
        const conflict = /duplicate key|employment_positions_org_key_key/i.test(error.message);
        return NextResponse.json(
            { error: conflict ? `A position with key '${key}' already exists` : error.message },
            { status: conflict ? 409 : 500 }
        );
    }

    return NextResponse.json({ position: data }, { status: 201 });
}
