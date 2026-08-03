/**
 * Canonical Business Process configuration read for editor surfaces (Law 4, editor slice 2).
 *
 * GET returns the editable draft plus everything needed to tell draft, published and runtime apart.
 * Editors must load through here rather than reading `departments.metadata.lifecycle_builder_v1`;
 * that column is the runtime projection and only the publish RPC may write it.
 */

import { NextRequest, NextResponse } from "next/server";

import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    DRAFT_STATUS_COPY,
    summarizeBusinessProcessEditorState,
    loadBusinessProcessEditorState,
} from "@/lib/businessProcesses/configuration/businessProcessEditorState";

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const departmentId = request.nextUrl.searchParams.get("department_id")?.trim() ?? "";
    if (!departmentId) {
        return NextResponse.json({ error: "department_id is required" }, { status: 400 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    if (!departmentIdAllowed(scopeDimensionsFromAccess(access), departmentId)) {
        return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const deptOk = await assertRowOrg(supabase, "departments", departmentId, ctx.orgId);
    if (!deptOk.ok) return NextResponse.json({ error: "Department not found" }, { status: 404 });

    // Materializing the draft is a read-shaped act for the operator (it copies what is already
    // live), so a GET is the honest verb. `readOnly` exists for callers that must not create one.
    const readOnly = request.nextUrl.searchParams.get("read_only") === "true";

    try {
        const state = await loadBusinessProcessEditorState(supabase, {
            orgId: ctx.orgId,
            departmentId,
            actorUserId: ctx.userId,
            readOnly,
        });
        if (!state) {
            return NextResponse.json({ error: "No draft configuration exists." }, { status: 404 });
        }
        return NextResponse.json({
            ...state,
            status_message: DRAFT_STATUS_COPY[state.status],
            // The compact shape editors render. Returned alongside the full state so a surface
            // never has to re-derive "published vs unpublished" for itself and get it wrong.
            summary: summarizeBusinessProcessEditorState(state),
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load configuration" },
            { status: 400 },
        );
    }
}
