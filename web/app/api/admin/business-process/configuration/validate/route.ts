/**
 * Run the publication validation gate against the current draft, without publishing.
 *
 * Validation is a deliberate act, not a side effect of typing (any save resets the draft to
 * unvalidated). This gives the operator the answer to "could I publish this?" before they commit
 * to changing what runtime serves.
 *
 * IT IS NOT A READ, AND THAT IS THE WHOLE REASON IT IS GATED. A route-level scan for
 * `.insert/.update/.upsert/.delete` finds nothing here and reports this handler as read-like; the
 * write is one call away, in `recordDraftValidation`, which sets `business_process_drafts`
 * `draft_status` to `validated` along with `validation_errors`, `validated_at` and `validated_by`.
 * That status is precisely what `publish` requires, so validating is the step that unlocks
 * publication — and `publish` has been `business_process.configure` since Business Process Family
 * Convergence V2. Leaving admission alone in front of this one let any portal-admitted principal
 * advance the publication workflow for a draft they could not publish.
 */

import { NextRequest, NextResponse } from "next/server";

import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    latestPublication,
    loadPublishedConfiguration,
    readDraft,
    recordDraftValidation,
} from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import {
    buildBusinessProcessEditorState,
    DRAFT_STATUS_COPY,
    summarizeBusinessProcessEditorState,
} from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { BUSINESS_PROCESS_CONFIGURE, requireBusinessProcessCapability } from "@/lib/access/businessProcessAuthority";

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireBusinessProcessCapability(ctx, BUSINESS_PROCESS_CONFIGURE);
    if (denied) return denied;

    let body: { department_id?: string } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const departmentId = typeof body.department_id === "string" ? body.department_id.trim() : "";
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

    const scope = { orgId: ctx.orgId, departmentId };

    try {
        const draft = await readDraft(supabase, scope);
        if (!draft) {
            return NextResponse.json(
                { error: "There is no draft configuration to validate." },
                { status: 404 },
            );
        }

        const validation = validateBusinessProcessForPublish(draft.payload);
        const validated = await recordDraftValidation(supabase, {
            ...scope,
            validationErrors: validation.errors,
            actorUserId: ctx.userId,
        });

        const [publication, publishedPayload] = await Promise.all([
            latestPublication(supabase, scope),
            loadPublishedConfiguration(supabase, scope),
        ]);
        const state = buildBusinessProcessEditorState({
            departmentId,
            draft: validated,
            publication,
            publishedPayload,
        });

        return NextResponse.json({
            errors: validation.errors,
            warnings: validation.warnings,
            can_publish: validation.errors.length === 0 && !state.draft_is_stale,
            state,
            status_message: DRAFT_STATUS_COPY[state.status],
            summary: summarizeBusinessProcessEditorState(state),
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to validate configuration" },
            { status: 400 },
        );
    }
}
