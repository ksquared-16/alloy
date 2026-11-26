/**
 * Admin API helpers for childcare operational enrollment routes.
 */

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { fetchOrgTimeZoneIana } from "@/lib/admin/orgLocalDayBounds";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { billingPeriodBindingHttpAnswer } from "@/lib/financials/billingPeriods/billingPeriodBindingHttp";

export type OperationalEnrollmentApiErrorBody = {
    error: string;
    code?: string;
    details?: Record<string, unknown>;
};

export function operationalEnrollmentErrorResponse(
    error: unknown
): NextResponse<OperationalEnrollmentApiErrorBody> {
    /*
     * A BILLING-PERIOD REFUSAL IS A CONFIGURATION CONFLICT, NOT AN INTERNAL ERROR.
     *
     * This branch is first because the fall-through at the bottom of this function is what used to
     * answer it: `{ code: "internal_error" }, 500`, carrying the error's own message. For a
     * household that merely needs a billing calendar chosen, that told the operator nothing was
     * actionable. The single mapping lives in `billingPeriodBindingHttp` so every boundary that
     * can see this error answers it the same way.
     */
    const binding = billingPeriodBindingHttpAnswer(error);
    if (binding) {
        return NextResponse.json(
            { error: binding.message, code: binding.code, details: binding.detail },
            { status: binding.status }
        );
    }
    if (error instanceof OperationalEnrollmentServiceError) {
        const status =
            error.code === "not_found"
                ? 404
                : error.code === "conflict"
                  ? 409
                  : error.code === "db_error"
                    ? 500
                    : 400;
        return NextResponse.json(
            {
                error: error.message,
                code: error.code,
                details: error.details,
            },
            { status }
        );
    }
    if (error instanceof RangeError) {
        return NextResponse.json({ error: error.message, code: "invalid_input" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message, code: "internal_error" }, { status: 500 });
}

/** Org-local calendar today (YYYY-MM-DD) for operational date comparisons. */
export async function resolveOperationalEnrollmentTodayYmd(
    supabase: SupabaseClient,
    orgId: string,
    refUtc: Date = new Date()
): Promise<string> {
    const timeZone = await fetchOrgTimeZoneIana(supabase, orgId);
    return formatInTimeZone(refUtc, timeZone, "yyyy-MM-dd");
}

export function parseJsonObject(value: unknown): Record<string, unknown> {
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return {};
}

export function parseWeekdays(value: unknown): number[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const out: number[] = [];
    for (const item of value) {
        const n = Number(item);
        if (!Number.isInteger(n) || n < 0 || n > 6) return null;
        out.push(n);
    }
    return out;
}
