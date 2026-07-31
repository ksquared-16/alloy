/**
 * Publish a Business Process draft — the ONLY product path that changes runtime configuration.
 *
 * Everything that makes publication safe lives in `publish_business_process_revision_v1`: the CAS
 * against the publication the draft was based on, the immutable revision, the publication act, the
 * audit event and the runtime projection, all in one transaction. This route's job is the two
 * things the RPC cannot do — run the full-graph validation gate (decision D3: drafting is
 * permissive, publish is not) and translate failures into something an operator can act on.
 *
 * It never writes `departments.metadata` itself. If it did, the database guard would reject it,
 * which is the point of having the guard.
 */

import { NextRequest, NextResponse } from "next/server";

import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    BusinessProcessDraftInvalidError,
    BusinessProcessStaleDraftError,
    latestPublication,
    loadPublishedConfiguration,
    publishDraft,
    readDraft,
    recordDraftValidation,
} from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import {
    buildBusinessProcessEditorState,
    DRAFT_STATUS_COPY,
    summarizeBusinessProcessEditorState,
} from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { department_id?: string; draft_revision?: number; base_revision_id?: string | null } = {};
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
                { error: "There is no draft configuration to publish." },
                { status: 404 },
            );
        }

        // Publishing what you were not looking at is the defect this sprint exists to remove, so
        // the editor's own token is checked before anything else.
        if (
            typeof body.draft_revision === "number" &&
            body.draft_revision !== draft.draftRevision
        ) {
            return NextResponse.json(
                {
                    error:
                        "Someone else changed this configuration while you were editing. " +
                        "Reload to see their changes, then publish.",
                    code: "business_process_draft_edit_conflict",
                    conflict: {
                        kind: "draft_edit",
                        current_draft_revision: draft.draftRevision,
                        attempted_draft_revision: body.draft_revision,
                    },
                },
                { status: 409 },
            );
        }

        const validation = validateBusinessProcessForPublish(draft.payload);

        // Record the outcome either way: the draft's own `draft_status` is what the RPC checks, so
        // a blocked publish must leave the draft visibly unvalidated rather than stale-validated.
        await recordDraftValidation(supabase, {
            ...scope,
            validationErrors: validation.errors,
            actorUserId: ctx.userId,
        });

        if (validation.errors.length) {
            return NextResponse.json(
                {
                    error: "This configuration cannot be published until its problems are resolved.",
                    code: "business_process_publication_blocked",
                    errors: validation.errors,
                    warnings: validation.warnings,
                },
                { status: 422 },
            );
        }

        const result = await publishDraft(supabase, { ...scope, actorUserId: ctx.userId });

        // Re-read so the editor gets the rebased draft and the new publication in one response.
        const [publishedDraft, publication, publishedPayload] = await Promise.all([
            readDraft(supabase, scope),
            latestPublication(supabase, scope),
            loadPublishedConfiguration(supabase, scope),
        ]);

        const state =
            publishedDraft &&
            buildBusinessProcessEditorState({
                departmentId,
                draft: publishedDraft,
                publication,
                publishedPayload,
            });

        return NextResponse.json({
            published: result,
            warnings: validation.warnings,
            ...(state
                ? {
                      state,
                      status_message: DRAFT_STATUS_COPY[state.status],
                      summary: summarizeBusinessProcessEditorState(state),
                  }
                : {}),
        });
    } catch (e) {
        if (e instanceof BusinessProcessStaleDraftError) {
            return NextResponse.json(
                {
                    error: e.message,
                    code: e.code,
                    conflict: {
                        kind: "publication",
                        current_revision_id: e.currentRevisionId,
                        attempted_base_revision_id: e.attemptedBaseRevisionId,
                    },
                },
                { status: 409 },
            );
        }
        if (e instanceof BusinessProcessDraftInvalidError) {
            return NextResponse.json(
                {
                    error: e.message,
                    code: e.code,
                    errors: e.validationErrors,
                },
                { status: 422 },
            );
        }
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to publish configuration" },
            { status: 400 },
        );
    }
}
