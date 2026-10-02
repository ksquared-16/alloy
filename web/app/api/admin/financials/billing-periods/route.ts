import { NextRequest, NextResponse } from "next/server";

import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertFinancialsReadAllowed, assertFinancialsWriteAllowed } from "@/lib/financials/financialsPermissions";
import {
    materializeCustomerBillingPeriods,
    readCustomerActiveLocationIds,
    resolveCustomerCalendar,
} from "@/lib/financials/billingPeriods/customerBillingPeriodService";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * THE CUSTOMER'S COMMERCIAL BILLING CALENDAR AND ITS PERIODS.
 *
 * ── WHY THIS ROUTE EXISTS IN A SLICE THAT ADDS NO OPERATOR CONTROL ─────────────────────────────
 *
 * S1 is required to be side-effect-free for existing economics, and it is: no charge, reduction,
 * payment, allocation, journal or Autopay path reads `financial_billing_periods`. But a foundation
 * that nothing can call also cannot be PROVED on the deployed system, and the slice is certified by
 * deployed proof rather than by local tests. So this is the one door into the new authority.
 *
 * It is deliberately narrow. It resolves a calendar and it materialises the current and next
 * period — configuration derived from configuration. It writes no charge, no reduction, no payment
 * and no journal entry, it closes nothing, and it corrects nothing: close is S4's and the
 * prospective correction is S6's. No UI calls it, and `billing_calendar` stays out of
 * `OPERATOR_AUTHORABLE_FINANCIAL_POLICY_TYPES`, so no operator surface changes in this slice.
 *
 * ── WHAT IT ANSWERS ──
 *
 * GET  — which calendar governs this account, from which scope, and why. A multi-location account
 *        with no explicit calendar is reported as AMBIGUOUS rather than resolved to a guess, and the
 *        conflicting locations are named so an operator can see what needs deciding.
 * POST — ensure the current and next periods exist. Idempotent: a period already present keeps its
 *        bounds and its status, so a repeat cannot reopen a closed period.
 *
 * `fin.read` to ask, `fin.write` to materialise — the same authority that creates and posts a
 * charge, because materialising a period is running the billing machine over authored
 * configuration. Closing one is a stronger act and will be `fin.adjust` when S4 builds it.
 */

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function readDate(value: string | null): string | null {
    const raw = (value ?? "").trim();
    if (!raw) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsReadAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    const url = new URL(request.url);
    const customerId = (url.searchParams.get("customer_id") ?? "").trim();
    if (!customerId) {
        return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    }
    const onDate = readDate(url.searchParams.get("on_date")) ?? today();

    const [resolution, activeLocationIds, periods] = await Promise.all([
        resolveCustomerCalendar(supabase, { orgId: ctx.orgId, customerId, onDate }),
        readCustomerActiveLocationIds(supabase, { orgId: ctx.orgId, customerId, onDate }),
        supabase
            .from("financial_billing_periods")
            .select(
                "id, period_key, cadence, starts_on, ends_on, anchor_on, status, closed_at, close_actor, calendar_scope, calendar_policy_id, calendar_source_location_id, calendar_snapshot",
            )
            .eq("org_id", ctx.orgId)
            .eq("customer_id", customerId)
            .order("starts_on", { ascending: true }),
    ]);

    return NextResponse.json({
        customer_id: customerId,
        on_date: onDate,
        active_location_ids: activeLocationIds,
        /* The resolution is returned VERBATIM, ambiguity included. It is the honest answer. */
        calendar: resolution,
        periods: periods.data ?? [],
    });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();
    const allowed = await assertFinancialsWriteAllowed({ supabase, orgId: ctx.orgId, userId: ctx.userId });
    if (!allowed.ok) {
        return NextResponse.json(
            { error: allowed.message, required_permission: allowed.requiredPermission },
            { status: 403 },
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        body = {};
    }
    const customerId = String(body.customer_id ?? "").trim();
    if (!customerId) {
        return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    }
    const onDate = readDate(body.on_date == null ? null : String(body.on_date)) ?? today();

    try {
        const outcome = await materializeCustomerBillingPeriods(supabase, {
            orgId: ctx.orgId,
            customerId,
            onDate,
        });
        if (outcome.kind === "not_materialized") {
            /*
             * 409, not 500 and not 200. Nothing is broken and nothing was written: the account's
             * calendar cannot be decided, which is a configuration state an operator resolves.
             */
            return NextResponse.json(
                { materialized: false, reason: outcome.resolution, customer_id: customerId, on_date: onDate },
                { status: 409 },
            );
        }
        return NextResponse.json({
            materialized: true,
            customer_id: customerId,
            on_date: onDate,
            calendar: outcome.calendar,
            periods: outcome.periods,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        );
    }
}
