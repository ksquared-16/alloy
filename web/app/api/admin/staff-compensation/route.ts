import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import {
    COMPENSATION_READ_PERMISSION_KEY,
    COMPENSATION_WRITE_PERMISSION_KEY,
    requireCompensationCapability,
} from "@/lib/access/compensationAuthority";
import {
    composeEmploymentCompensation,
    EmploymentCompensationError,
    recordCompensationTerm,
} from "@/lib/employmentCompensation/employmentCompensationService";

/**
 * Compensation terms for one employment — the only route in the Staff domain that
 * is capability-gated rather than `status: "none"`.
 *
 * The database revokes every grant from `authenticated`, so this handler reads
 * through the service role and is therefore the ONLY operator boundary. That is
 * why the capability check is the first thing after admission and why it guards
 * the write separately: a principal who may read a rate is not thereby a principal
 * who may change one.
 *
 * Changing compensation creates no payroll run, no journal entry and no financial
 * transaction. It records what the organization has agreed to pay, and nothing
 * downstream of it fires.
 */
function fail(err: unknown): NextResponse {
    if (err instanceof EmploymentCompensationError) {
        const status =
            err.code === "not_found" ? 404
            : err.code === "invalid_input" ? 422
            : err.code === "conflict" ? 409
            : 500;
        return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    const message = err instanceof Error ? err.message : "Compensation request failed";
    return NextResponse.json({ error: message, code: "internal_error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireCompensationCapability(ctx, COMPENSATION_READ_PERMISSION_KEY);
    if (denied) return denied;

    const params = new URL(request.url).searchParams;
    const employmentId = (params.get("employment_id") ?? "").trim();
    if (!employmentId) {
        return NextResponse.json({ error: "employment_id is required", code: "invalid_input" }, { status: 400 });
    }
    const supabase = createAdminClient();
    try {
        const asOf = (params.get("as_of") ?? "").trim()
            || (await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId));
        return NextResponse.json(await composeEmploymentCompensation(supabase, ctx.orgId, employmentId, asOf));
    } catch (err) {
        return fail(err);
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireCompensationCapability(ctx, COMPENSATION_WRITE_PERMISSION_KEY);
    if (denied) return denied;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }
    const supabase = createAdminClient();
    try {
        const term = await recordCompensationTerm(supabase, {
            orgId: ctx.orgId,
            employmentId: String(body.employment_id ?? "").trim(),
            payBasis: String(body.pay_basis ?? "") as "hourly" | "salary",
            rateAmount: Number(body.rate_amount),
            effectiveStart: String(body.effective_start ?? "").trim(),
            currency: body.currency ? String(body.currency) : undefined,
            note: body.note ? String(body.note) : null,
            actorUserId: ctx.userId ?? null,
        });
        return NextResponse.json({ term }, { status: 201 });
    } catch (err) {
        return fail(err);
    }
}
