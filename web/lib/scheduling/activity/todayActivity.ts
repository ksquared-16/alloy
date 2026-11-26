/**
 * Today's scheduling activity — real counts of what changed at a site today.
 *
 * There is no scheduling audit/event log, so this reads the `created_at`/`updated_at`
 * columns of the operational tables directly: placements created today, schedule
 * assignments created today, and assignments modified today (created earlier, touched
 * today). Honest and derived — no fabricated feed. `child_placements` carries
 * `site_location_id` directly; `schedule_assignments` is scoped through its agreements.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";

export type TodayActivity = {
    placementsToday: number;
    schedulesCreatedToday: number;
    schedulesModifiedToday: number;
};

async function count(promise: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
    const { count: c, error } = await promise;
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return c ?? 0;
}

/** Counts of scheduling activity for `site` on the operational day `todayYmd`. */
export async function computeTodayActivity(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    todayYmd: string
): Promise<TodayActivity> {
    const dayStart = `${todayYmd}T00:00:00.000Z`;

    // Placements created today — child_placements carries site_location_id directly.
    const placementsToday = await count(
        supabase
            .from("child_placements")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("site_location_id", siteLocationId)
            .gte("created_at", dayStart)
    );

    // Schedule assignments are scoped to a site through their enrollment agreements.
    const { data: agreementRows, error: agreementErr } = await supabase
        .from("child_enrollment_agreements")
        .select("id")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId);
    if (agreementErr) throw new OperationalEnrollmentServiceError("db_error", agreementErr.message);
    const agreementIds = ((agreementRows ?? []) as { id: string }[]).map((r) => r.id);

    if (agreementIds.length === 0) {
        return { placementsToday, schedulesCreatedToday: 0, schedulesModifiedToday: 0 };
    }

    const schedulesCreatedToday = await count(
        supabase
            .from("schedule_assignments")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .in("enrollment_agreement_id", agreementIds)
            .gte("created_at", dayStart)
    );

    // Modified today = touched today but created earlier (a real edit, not a fresh insert).
    const schedulesModifiedToday = await count(
        supabase
            .from("schedule_assignments")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .in("enrollment_agreement_id", agreementIds)
            .gte("updated_at", dayStart)
            .lt("created_at", dayStart)
    );

    return { placementsToday, schedulesCreatedToday, schedulesModifiedToday };
}
