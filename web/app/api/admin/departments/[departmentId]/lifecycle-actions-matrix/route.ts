import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import {
    LIFECYCLE_ACTIVATION_METADATA_KEY,
    parseLifecycleActivationV1,
} from "@/lib/lifecycle/lifecycleActivationConfig";
import {
    configuredStageKeysForMetadata,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    loadLifecycleActionsMatrix,
    saveLifecycleActionsMatrix,
    upsertEnabledProcessActionsIntoCommandSet,
    type LifecycleActionsMatrixSaveRow,
} from "@/lib/lifecycle/lifecycleActionsMatrix";
import { mergeCategoryFDepartmentMetadata } from "@/lib/lifecycle/mergeCategoryFDepartmentMetadata";
import {
    builderFromDraft,
    editProcessInDraft,
} from "@/lib/businessProcesses/configuration/editProcessInDraft";
import { loadBusinessProcessEditorState } from "@/lib/businessProcesses/configuration/businessProcessEditorState";

async function loadDepartment(orgId: string, departmentId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
}

/** GET — lifecycle actions matrix rows for builder-owned department. */
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

        const metadata =
            row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        const activation = parseLifecycleActivationV1(metadata[LIFECYCLE_ACTIVATION_METADATA_KEY]);
        const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
        const process = builder.processes.find((p) => p.id === builder.active_process_id) ?? null;
        const builderStageKeys = process
            ? configuredStageKeysForMetadata(metadata)
            : undefined;

        const supabase = createAdminClient();
        const payload = await loadLifecycleActionsMatrix(supabase, ctx.orgId, {
            primaryRecordLabel: activation?.primary_record_label ?? "Lead",
            builderStageKeys,
            departmentMetadata: metadata,
        });

        return NextResponse.json(payload);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load matrix" }, { status: 500 });
    }
}

/** PUT — persist lifecycle actions matrix (batch). Admin only. */
export async function PUT(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
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

    let body: { rows?: LifecycleActionsMatrixSaveRow[] } = {};
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!Array.isArray(body.rows)) {
        return NextResponse.json({ error: "rows array is required" }, { status: 400 });
    }

    try {
        const row = await loadDepartment(ctx.orgId, departmentId);
        if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const metadata =
            row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : {};
        const activation = parseLifecycleActivationV1(metadata[LIFECYCLE_ACTIVATION_METADATA_KEY]);
        const builderStageKeys = configuredStageKeysForMetadata(metadata);

        const supabase = createAdminClient();
        const result = await saveLifecycleActionsMatrix(supabase, ctx.orgId, body.rows, {
            primaryRecordLabel: activation?.primary_record_label ?? "Lead",
            builderStageKeys,
            existingMetadata: metadata,
        });

        // Category F: order key only. Never rewrite publication-owned lifecycle_builder_v1.
        const nextMeta = mergeCategoryFDepartmentMetadata(metadata, result.metadata_patch);
        const { error: metaErr } = await supabase
            .from("departments")
            .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
            .eq("id", departmentId)
            .eq("org_id", ctx.orgId);
        if (metaErr) throw new Error(metaErr.message);

        let publication_required = false;
        let draft_revision: number | undefined;
        if (result.enabled_definition_keys.length) {
            const editorState = await loadBusinessProcessEditorState(supabase, {
                orgId: ctx.orgId,
                departmentId,
                actorUserId: ctx.userId ?? null,
            });
            if (editorState) {
                const draftBuilder = builderFromDraft(editorState);
                const processId = draftBuilder.active_process_id?.trim() || null;
                const process = processId
                    ? draftBuilder.processes.find((p) => p.id === processId) ?? null
                    : null;
                if (process && processId) {
                    const wouldChange = upsertEnabledProcessActionsIntoCommandSet(
                        process,
                        result.enabled_definition_keys,
                    );
                    if (wouldChange) {
                        const draftSave = await editProcessInDraft(supabase, {
                            orgId: ctx.orgId,
                            departmentId,
                            processId,
                            actorUserId: ctx.userId ?? null,
                            expectedDraftRevision: editorState.draft_revision,
                            edit: (current) =>
                                upsertEnabledProcessActionsIntoCommandSet(
                                    current,
                                    result.enabled_definition_keys,
                                ) ?? current,
                        });
                        publication_required = draftSave.publicationRequired;
                        draft_revision = draftSave.draftRevision;
                    }
                }
            }
        }

        const payload = await loadLifecycleActionsMatrix(supabase, ctx.orgId, {
            primaryRecordLabel: activation?.primary_record_label ?? "Lead",
            builderStageKeys,
            departmentMetadata: nextMeta,
        });

        return NextResponse.json({
            ok: true,
            ...result,
            ...payload,
            publication_required,
            ...(draft_revision != null ? { draft_revision } : {}),
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save matrix" }, { status: 400 });
    }
}
