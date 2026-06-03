import { NextRequest, NextResponse } from "next/server";

import { isTaskAssistV1Uuid } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import {
    createWorkInstance,
    instantiateWorkFromDefinition,
    isKnownWorkDefinitionKey,
    listWorkForEntity,
    listWorkForWorkspace,
    MANUAL_AD_HOC_WORK_DEFINITION_KEY,
    summarizeWorkCounts,
    toOperationalTaskApiRow,
    validateWorkCreateBody,
    type InstantiateWorkResult,
    type OperationalWorkWorkspaceFilter,
} from "@/lib/admin/operationalWork";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET `/api/admin/operational-tasks?entity_type=opportunities&entity_id=<uuid>`
 * POST `/api/admin/operational-tasks` — create Task Assist–sourced operational task (no send).
 */
export async function GET(request: NextRequest) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const url = new URL(request.url);
    const scope = (url.searchParams.get("scope") ?? "").trim().toLowerCase();
    const summaryOnly = url.searchParams.get("summary") === "true";

    const supabase = createAdminClient();

    if (scope === "workspace") {
        if (summaryOnly) {
            const counts = await summarizeWorkCounts({ supabase, orgId: ctx.orgId });
            if (!counts.ok) {
                return NextResponse.json({ ok: false, error: counts.error, message: counts.message }, { status: 500 });
            }
            return NextResponse.json({ ok: true, counts });
        }
        const filterRaw = (url.searchParams.get("filter") ?? "open").trim().toLowerCase();
        const allowed: OperationalWorkWorkspaceFilter[] = [
            "open",
            "due_today",
            "overdue",
            "completed",
            "all",
            "assigned_to_me",
            "unassigned",
        ];
        const filter = (allowed.includes(filterRaw as OperationalWorkWorkspaceFilter) ?
            filterRaw
        :   "open") as OperationalWorkWorkspaceFilter;
        const listed = await listWorkForWorkspace({
            supabase,
            orgId: ctx.orgId,
            userId: ctx.userId,
            filter,
        });
        if (!listed.ok) {
            return NextResponse.json({ ok: false, error: listed.error, message: listed.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, tasks: listed.rows.map(toOperationalTaskApiRow) });
    }

    const entityType = (url.searchParams.get("entity_type") ?? "").trim().toLowerCase();
    const entityId = (url.searchParams.get("entity_id") ?? "").trim();
    if (entityType !== "opportunities") {
        return NextResponse.json({ ok: false, error: "ENTITY_TYPE_UNSUPPORTED", message: "entity_type must be opportunities." }, { status: 400 });
    }
    if (!entityId || !isTaskAssistV1Uuid(entityId)) {
        return NextResponse.json({ ok: false, error: "ENTITY_ID_INVALID", message: "entity_id must be a UUID." }, { status: 400 });
    }

    if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Opportunity not found." }, { status: 404 });
    }

    const listed = await listWorkForEntity({
        supabase,
        orgId: ctx.orgId,
        entityType: "opportunities",
        entityId,
    });
    if (!listed.ok) {
        return NextResponse.json({ ok: false, error: listed.error, message: listed.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tasks: listed.rows.map(toOperationalTaskApiRow) });
}

function mapInstantiateResultToCreateResponse(result: InstantiateWorkResult) {
    if (result.status === "rejected") {
        return {
            ok: false as const,
            status: 400,
            error: result.error,
            message: result.message,
        };
    }
    if (result.status === "deduped") {
        return {
            ok: true as const,
            httpStatus: 200,
            row: result.existingWork,
            instantiateStatus: "deduped" as const,
        };
    }
    return {
        ok: true as const,
        httpStatus: 201,
        row: result.work,
        instantiateStatus: "created" as const,
    };
}

export async function POST(request: NextRequest) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const parsed = validateWorkCreateBody(body);
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, message: parsed.message }, { status: 400 });
    }
    const v = parsed.value;

    const supabase = createAdminClient();
    if (v.entity_id && !(await assertRowOrg(supabase, "opportunities", v.entity_id, ctx.orgId)).ok) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Opportunity not found." }, { status: 404 });
    }

    const definitionKey = v.work_definition_key?.trim() || null;
    const useDefinitionPath =
        definitionKey &&
        definitionKey !== MANUAL_AD_HOC_WORK_DEFINITION_KEY &&
        isKnownWorkDefinitionKey(definitionKey);

    if (useDefinitionPath) {
        const result = await instantiateWorkFromDefinition({
            supabase,
            orgId: ctx.orgId,
            userId: ctx.userId,
            workDefinitionKey: definitionKey,
            subject: v.entity_id
                ? { entityType: "opportunities", entityId: v.entity_id }
                : { entityType: null, entityId: null },
            provenance: { source: v.source },
            titleOverride: v.title,
            dueAtOverride: v.due_at,
            assigneeOverride: v.assigned_to_user_id,
            description: v.description,
            proposalId: v.proposal_id,
            metadata: v.metadata,
        });
        const mapped = mapInstantiateResultToCreateResponse(result);
        if (!mapped.ok) {
            return NextResponse.json({ ok: false, error: mapped.error, message: mapped.message }, { status: mapped.status });
        }
        const payload: Record<string, unknown> = { ok: true, task: toOperationalTaskApiRow(mapped.row) };
        if (mapped.instantiateStatus === "deduped") {
            payload.instantiate = { status: "deduped" };
        }
        return NextResponse.json(payload, { status: mapped.httpStatus });
    }

    const created = await createWorkInstance({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        entityId: v.entity_id,
        title: v.title,
        description: v.description,
        dueAtIso: v.due_at,
        source: v.source,
        proposalId: v.proposal_id,
        assignedToUserId: v.assigned_to_user_id,
        metadata: v.metadata,
    });

    if (!created.ok) {
        const status = created.status ?? (created.error === "NOT_FOUND" ? 404 : 400);
        return NextResponse.json({ ok: false, error: created.error, message: created.message }, { status });
    }

    const payload: Record<string, unknown> = { ok: true, task: toOperationalTaskApiRow(created.row) };
    if (created.instantiateStatus === "deduped") {
        payload.instantiate = { status: "deduped" };
        return NextResponse.json(payload, { status: 200 });
    }

    return NextResponse.json(payload, { status: 201 });
}
