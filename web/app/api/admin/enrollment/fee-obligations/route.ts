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
    reverseEnrollmentFeeObligation,
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
    /** "reverse" corrects a posted fee after a withdrawal. Requires `charge_id`. */
    action?: string;
    charge_id?: string;
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

    const supabaseForAction = createAdminClient();
    if (String(body.action ?? "").trim() === "reverse") {
        /*
         * WITHDRAWAL DOES NOT DELETE HISTORY.
         *
         * Financials writes a correction as a NEW row referencing the original, and the database
         * enforces that a charge is corrected once. Enrollment delegates rather than composing a
         * negative charge of its own, which would be a second correction model nothing reconciles.
         */
        const chargeId = String(body.charge_id ?? "").trim();
        if (!chargeId) return NextResponse.json({ error: "charge_id is required to reverse" }, { status: 400 });
        try {
            const correction = await reverseEnrollmentFeeObligation(supabaseForAction, {
                orgId: ctx.orgId,
                chargeId,
                actorUserId: ctx.userId ?? null,
            });
            return NextResponse.json({
                data: {
                    correction_charge_id: correction.id,
                    source_charge_id: chargeId,
                    amount_cents: correction.amount_cents,
                    status: correction.status,
                },
            });
        } catch (e) {
            return NextResponse.json(
                { error: e instanceof Error ? e.message : "Failed to reverse the fee obligation" },
                { status: 422 },
            );
        }
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

    const supabase = supabaseForAction;
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
            // A misspelled definition is a CONFIGURATION failure, and must never read as a family
            // that owes nothing — the two are opposite situations that look identical from outside.
            return NextResponse.json(
                {
                    error: `No active charge template named "${chargeTemplateKey}".`,
                    projection: projectEnrollmentFinancialRequirement({
                        configured: true,
                        due: true,
                        resolvesToZero: false,
                        definitionUnresolved: true,
                        obligations: [],
                    }),
                },
                { status: 422 },
            );
        }

        const obligations: EnrollmentFeeObligation[] = [];
        for (const outcome of resolved.outcomes) {
            if (outcome.status === "not_writable") continue;
            /*
             * A CHARGE CAN EXIST AND STILL HAVE NO POSITION.
             *
             * `writeTemplateDraftCharge` accepts a `customer` billable source on purpose — a family
             * incurs registration and deposit fees before anyone is enrolled — but
             * `resolveAllocatableNet` refuses to position anything that is not enrolment-backed.
             * A household-grain fee therefore posts as real money and then cannot be read. That is a
             * disagreement inside Financials, and Enrollment resolves it in neither direction: the
             * obligation is reported without a position, and an operator is told.
             */
            let raw: Awaited<ReturnType<typeof resolveFamilyCollectible>> | null = null;
            let unavailable: string | null = null;
            try {
                raw = await resolveFamilyCollectible(supabase, { orgId: ctx.orgId, chargeId: outcome.chargeId });
            } catch (e) {
                unavailable = e instanceof Error ? e.message : "Collectible position is unavailable.";
            }
            if (!raw) {
                obligations.push({
                    requirementId,
                    chargeTemplateKey,
                    billableSource: outcome.billableSource,
                    subjectCustomerMemberId: outcome.subjectCustomerMemberId,
                    position: null,
                    positionUnavailableReason: unavailable ?? "Collectible position is unavailable.",
                });
                continue;
            }
            const position = raw;
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
