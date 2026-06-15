import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { splitRuleForStage } from "@/lib/businessProcesses/businessProcessConfigReader";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { applyEnrollmentDecisionSplit } from "@/lib/opportunities/applyEnrollmentDecisionSplit";
import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

async function loadOpportunityContext(supabase: ReturnType<typeof createAdminClient>, orgId: string, id: string) {
    const { data: opp, error } = await supabase
        .from("opportunities")
        .select("id, org_id, status_key, metadata, work_unit_id, department_id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !opp) return { error: error?.message ?? "Not found" as const };

    let departmentMetadata: unknown = null;
    const deptId = trimOrNull(opp.department_id);
    if (deptId) {
        const { data: dept } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", deptId)
            .eq("org_id", orgId)
            .maybeSingle();
        departmentMetadata = dept?.metadata ?? null;
    }

    return { opp, departmentMetadata };
}

function readInquiryChildren(metadata: unknown): Array<Record<string, unknown>> {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const raw = (metadata as { inquiry_children?: unknown }).inquiry_children;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x) => x != null && typeof x === "object") as Array<Record<string, unknown>>;
}

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", id, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const loaded = await loadOpportunityContext(supabase, ctx.orgId, id);
    if ("error" in loaded && !("opp" in loaded)) {
        return NextResponse.json({ error: loaded.error }, { status: 404 });
    }
    const { opp, departmentMetadata } = loaded as {
        opp: Record<string, unknown>;
        departmentMetadata: unknown;
    };

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    const splitRule = process ? splitRuleForStage(process, "decision") : null;

    const children = readInquiryChildren(opp.metadata).map((row) => {
        const ocmId = trimOrNull(row.ocm_id) ?? trimOrNull(row.id);
        const statusKey = trimOrNull(row.outcome_status_key);
        return {
            opportunity_customer_member_id: ocmId,
            customer_member_id: trimOrNull(row.customer_member_id),
            display_name: trimOrNull(row.display_name) ?? "Child",
            outcome_status_key: statusKey,
            outcome_status_label:
                trimOrNull(row.outcome_status_label) ??
                (statusKey ? humanizeSnakeCaseToken(statusKey) : null),
        };
    });

    return NextResponse.json({
        visible: Boolean(splitRule),
        split_rule: splitRule
            ? {
                  from_stage_key: splitRule.from_stage_key,
                  outcomes: splitRule.per_subject_outcomes,
              }
            : null,
        children,
    });
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: { selections?: Array<Record<string, unknown>> } = {};
    try {
        body = (await request.json()) as { selections?: Array<Record<string, unknown>> };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const selectionsRaw = Array.isArray(body.selections) ? body.selections : [];
    if (!selectionsRaw.length) {
        return NextResponse.json({ error: "selections is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", id, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const loaded = await loadOpportunityContext(supabase, ctx.orgId, id);
    if ("error" in loaded && !("opp" in loaded)) {
        return NextResponse.json({ error: loaded.error }, { status: 404 });
    }
    const { departmentMetadata } = loaded as { departmentMetadata: unknown };

    const selections = selectionsRaw.map((row) => ({
        opportunity_customer_member_id: trimOrNull(row.opportunity_customer_member_id),
        customer_member_id: trimOrNull(row.customer_member_id),
        outcome_key: trimOrNull(row.outcome_key) ?? "",
    }));

    const result = await applyEnrollmentDecisionSplit({
        supabase,
        orgId: ctx.orgId,
        opportunityId: id,
        departmentMetadata,
        selections,
        actorUserId: ctx.userId ?? null,
        source: "api:opportunity-decision-split",
    });

    if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, applied: result.applied });
}
