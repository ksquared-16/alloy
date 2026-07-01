import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertEntityInOrg } from "@/lib/admin/assertEntityInOrg";
import { dbGetSubmission, dbPatchSubmission } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    submissionHasDocumentAttachTarget,
    type SubmissionAttachRow,
} from "@/lib/forms/submissionOutcomeSummary";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readOptionalFk(
    body: Record<string, unknown>,
    key: "person_id" | "customer_id" | "customer_member_id" | "opportunity_id",
    current: string | null
): { ok: true; value: string | null; touched: boolean } | { ok: false; response: NextResponse } {
    if (!(key in body)) {
        return { ok: true, value: current, touched: false };
    }
    const v = body[key];
    if (v === null) {
        return { ok: true, value: null, touched: true };
    }
    if (typeof v !== "string" || !UUID_RE.test(v.trim())) {
        return { ok: false, response: jsonError(`Invalid ${key}`, 400) };
    }
    return { ok: true, value: v.trim(), touched: true };
}

/** POST — set CRM FKs on a submitted row from operator-selected UUIDs (org-validated). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { submissionId: raw } = await params;
    const submissionId = parseUuidParam(raw, "submissionId");
    if (submissionId instanceof NextResponse) return submissionId;

    let body: Record<string, unknown> = {};
    try {
        const parsed = await request.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            body = parsed as Record<string, unknown>;
        }
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const supabase = createAdminClient();
    const { data: sub, error: sErr } = await dbGetSubmission(supabase, ctx.orgId, submissionId);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!sub) return jsonError("Not found", 404);

    const row = sub as {
        status: string;
        payload: Record<string, unknown>;
        person_id: string | null;
        customer_id: string | null;
        customer_member_id: string | null;
        opportunity_id: string | null;
    };

    if (row.status !== "submitted") {
        return jsonError("Only submitted submissions can be manually linked", 409);
    }

    const p = readOptionalFk(body, "person_id", row.person_id);
    if (!p.ok) return p.response;
    const c = readOptionalFk(body, "customer_id", row.customer_id);
    if (!c.ok) return c.response;
    const cm = readOptionalFk(body, "customer_member_id", row.customer_member_id);
    if (!cm.ok) return cm.response;
    const o = readOptionalFk(body, "opportunity_id", row.opportunity_id);
    if (!o.ok) return o.response;

    if (!p.touched && !c.touched && !cm.touched && !o.touched) {
        return jsonError("Provide at least one FK field to update", 400);
    }

    let nextPerson = p.value;
    let nextCustomer = c.value;
    let nextMember = cm.value;
    let nextOpp = o.value;

    const validate = async (canonical: string, id: string | null) => {
        if (!id) return true;
        return assertEntityInOrg(supabase, ctx.orgId, canonical, id);
    };

    if (nextPerson && !(await validate("person", nextPerson))) {
        return jsonError("person_id not found in this organization", 400);
    }
    if (nextCustomer && !(await validate("customer", nextCustomer))) {
        return jsonError("customer_id not found in this organization", 400);
    }
    if (nextMember && !(await validate("customer_member", nextMember))) {
        return jsonError("customer_member_id not found in this organization", 400);
    }
    if (nextOpp && !(await validate("opportunity", nextOpp))) {
        return jsonError("opportunity_id not found in this organization", 400);
    }

    if (nextMember) {
        const { data: mem, error: mErr } = await supabase
            .from("customer_members")
            .select("customer_id")
            .eq("id", nextMember)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
        const mc = (mem as { customer_id?: string } | null)?.customer_id ?? null;
        if (mc) {
            if (!nextCustomer) {
                nextCustomer = mc;
            } else if (nextCustomer !== mc) {
                return jsonError("customer_id does not match the selected customer_member", 400);
            }
        }
    }

    if (nextOpp) {
        const { data: opp, error: oErr } = await supabase
            .from("opportunities")
            .select("customer_id")
            .eq("id", nextOpp)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
        const oc = (opp as { customer_id?: string | null } | null)?.customer_id ?? null;
        if (oc) {
            if (!nextCustomer) {
                nextCustomer = oc;
            } else if (nextCustomer !== oc) {
                return jsonError("customer_id does not match the selected opportunity", 400);
            }
        }
    }

    const attachProbe: SubmissionAttachRow = {
        person_id: nextPerson,
        customer_id: nextCustomer,
        customer_member_id: nextMember,
        opportunity_id: nextOpp,
    };
    if (!submissionHasDocumentAttachTarget(attachProbe)) {
        return jsonError(
            "After this update, the submission would not attach to any CRM parent — link at least one of person, customer, customer member, or opportunity.",
            400
        );
    }

    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
    const prevMeta =
        payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
            ? { ...(payload.meta as Record<string, unknown>) }
            : {};

    const nextMeta: Record<string, unknown> = {
        ...prevMeta,
        intake_resolution_path: "manually_linked",
        intake_match_strategy: "operator_selected",
        intake_match_confidence: "human_reviewed",
        intake_needs_review: false,
        intake_review_result: "corrected",
        intake_reviewed_at: new Date().toISOString(),
        intake_reviewed_by: ctx.userId,
    };

    const nextPayload = { ...payload, meta: nextMeta };

    const { data: updated, error: uErr } = await dbPatchSubmission(supabase, ctx.orgId, submissionId, {
        payload: nextPayload,
        person_id: nextPerson,
        customer_id: nextCustomer,
        customer_member_id: nextMember,
        opportunity_id: nextOpp,
    });
    if (uErr) {
        if (uErr.code === "PGRST116" || uErr.message?.toLowerCase().includes("rows")) {
            return jsonError("Submission was modified concurrently", 409);
        }
        return NextResponse.json({ error: uErr.message }, { status: 400 });
    }

    return jsonData(updated);
}
