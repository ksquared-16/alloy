/**
 * THE ENROLLMENT FEE, RESOLVED AND READ — the actuation for the one wire into Financials.
 *
 * POST resolves the obligations a financial requirement intends and returns the projection.
 * GET reads the projection without writing anything.
 *
 * Both are idempotent, which is the whole design: dueness is a QUESTION rather than an event, and
 * the charges are keyed by Financials' own resolution key, so calling this on a packet completion,
 * a stage completion, a retry or an ordinary refresh converges on the same obligations rather than
 * minting new money.
 *
 * This route does no arithmetic. It asks the bridge to create/reuse the canonical charges, asks
 * `resolveFamilyCollectible` what each one is worth now, and hands both to a pure projection.
 */
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";
import {
    resolveEnrollmentFeeObligations,
    type EnrollingChild,
} from "@/lib/enrollment/financial/resolveEnrollmentFeeObligations";
import {
    projectEnrollmentFinancialRequirement,
    type EnrollmentFeeObligation,
} from "@/lib/enrollment/financial/enrollmentFinancialRequirement";
import type { RequirementScope } from "@/lib/lifecycle/requirementTimingTypes";

export const dynamic = "force-dynamic";

type Body = {
    requirement_id?: string;
    charge_template_key?: string;
    /** `record` (one per family) or `each_child` (one per enrolling child). */
    scope?: string;
    customer_id?: string;
    enrolling_children?: { customer_member_id?: string; agreement_id?: string | null }[];
    /** ISO date the requirement became due. Stable across replays — it is part of the charge key. */
    due_on?: string;
    /** False reads without creating anything. */
    resolve?: boolean;
    /** False leaves charges in draft, so nothing becomes collectible. */
    post?: boolean;
};

function childrenFrom(body: Body): EnrollingChild[] {
    return (body.enrolling_children ?? [])
        .map((c) => ({
            customerMemberId: String(c.customer_member_id ?? "").trim(),
            agreementId: c.agreement_id != null ? String(c.agreement_id).trim() || null : null,
        }))
        .filter((c) => c.customerMemberId.length > 0);
}

async function handle(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Body = {};
    try {
        body = (await request.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const requirementId = String(body.requirement_id ?? "").trim();
    const chargeTemplateKey = String(body.charge_template_key ?? "").trim();
    const customerId = String(body.customer_id ?? "").trim();
    const dueOn = String(body.due_on ?? "").trim();
    const scope = (String(body.scope ?? "record").trim() || "record") as RequirementScope;

    if (!requirementId || !chargeTemplateKey || !customerId || !dueOn) {
        return NextResponse.json(
            { error: "requirement_id, charge_template_key, customer_id and due_on are required" },
            { status: 400 },
        );
    }
    if (scope !== "record" && scope !== "each_child") {
        return NextResponse.json({ error: `Unsupported fee scope "${scope}"` }, { status: 400 });
    }

    const supabase = createAdminClient();
    const enrollingChildren = childrenFrom(body);

    try {
        const resolved = await resolveEnrollmentFeeObligations(supabase, {
            orgId: ctx.orgId,
            requirementId,
            chargeTemplateKey,
            scope,
            customerId,
            enrollingChildren,
            dueOn,
            actorUserId: ctx.userId ?? null,
            // A read still resolves, because resolution is how an existing charge is FOUND; `post`
            // is what separates looking from committing money to a collectible state.
            post: body.resolve === false || body.post === false ? false : true,
        });

        if (!resolved.templateResolved) {
            return NextResponse.json(
                {
                    error: `No active charge template named "${chargeTemplateKey}".`,
                    projection: projectEnrollmentFinancialRequirement({
                        configured: true,
                        due: true,
                        resolvesToZero: false,
                        obligations: [],
                    }),
                },
                { status: 422 },
            );
        }

        const obligations: EnrollmentFeeObligation[] = [];
        for (const outcome of resolved.outcomes) {
            if (outcome.status === "not_writable") continue;
            const position = await resolveFamilyCollectible(supabase, {
                orgId: ctx.orgId,
                chargeId: outcome.chargeId,
            });
            obligations.push({
                requirementId,
                chargeTemplateKey,
                billableSource: outcome.billableSource,
                subjectCustomerMemberId: outcome.subjectCustomerMemberId,
                position: {
                    chargeId: position.chargeId,
                    currencyCode: position.currencyCode,
                    chargeStatus: outcome.posted ? "posted" : "draft",
                    grossCents: position.explanation.grossCents,
                    appliedCents: position.explanation.appliedCents,
                    expectedSubsidyCents: position.expectedSubsidyCents,
                    currentlyCollectibleCents: position.currentlyCollectibleCents,
                    outstandingCents: position.outstandingCents,
                    unresolvedVarianceCents: position.unresolvedVarianceCents,
                    suppressionBoundBy: position.explanation.suppressionBoundBy,
                    openVarianceStates: position.explanation.openVarianceStates,
                },
            });
        }

        const projection = projectEnrollmentFinancialRequirement({
            configured: true,
            due: true,
            resolvesToZero: resolved.resolvesToZero,
            obligations,
        });

        return NextResponse.json({
            data: {
                requirement_id: requirementId,
                scope,
                resolves_to_zero: resolved.resolvesToZero,
                outcomes: resolved.outcomes,
                projection,
            },
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to resolve enrollment fee obligations" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    return handle(request);
}
