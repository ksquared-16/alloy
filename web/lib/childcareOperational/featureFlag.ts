import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Feature gate for childcare operational enrollment (agreements, placements, schedule assignments).
 *
 * ## Environment variables (both required for UI; server handoff needs server flag only)
 *
 * | Variable | Scope | Default | Purpose |
 * |----------|-------|---------|---------|
 * | `CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED` | Server | off | Handoff on `approve_enrollment`, admin APIs |
 * | `NEXT_PUBLIC_CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED` | Client | off | Child drawer read + edit surfaces |
 *
 * ## Org opt-out
 *
 * `org_settings.metadata.feature_flags.childcare_operational_enrollment_v1 === false`
 * disables server handoff even when env is on.
 *
 * ## Flag-off behavior
 *
 * - No handoff on approve; no operational enrollment UI sections (no empty shells).
 * - No placement/schedule/agreement edit actions in the child drawer.
 * - Published child layouts with legacy `schedule_attendance` future placeholders stay hidden in production.
 */

/** Feature gate key for childcare operational enrollment v1. */
export const CHILDCARE_OPERATIONAL_ENROLLMENT_V1_FLAG = "childcare_operational_enrollment_v1";

function readFlag(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw === undefined || raw === "") return defaultValue;
    const v = raw.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
    return defaultValue;
}

/** Env gate — default off until explicitly enabled. */
export function isChildcareOperationalEnrollmentV1EnvEnabled(): boolean {
    return readFlag(process.env.CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED, false);
}

/** Client gate — mirrors server env default (off). */
export function isChildcareOperationalEnrollmentV1EnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_CHILDCARE_OPERATIONAL_ENROLLMENT_V1_ENABLED, false);
}

/** Org may opt out via org_settings.metadata.feature_flags[flag] === false. */
export function isChildcareOperationalEnrollmentV1EnabledForOrgMetadata(
    metadata: Record<string, unknown> | null | undefined
): boolean {
    if (!isChildcareOperationalEnrollmentV1EnvEnabled()) return false;
    const flags = metadata?.feature_flags;
    if (flags != null && typeof flags === "object" && !Array.isArray(flags)) {
        const entry = (flags as Record<string, unknown>)[CHILDCARE_OPERATIONAL_ENROLLMENT_V1_FLAG];
        if (entry === false || entry === "false" || entry === 0 || entry === "0") return false;
    }
    return true;
}

export async function isChildcareOperationalEnrollmentV1EnabledForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<boolean> {
    if (!isChildcareOperationalEnrollmentV1EnvEnabled()) return false;
    const { data, error } = await supabase
        .from("org_settings")
        .select("metadata")
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) {
        console.warn("[childcareOperational] org_settings feature flag read failed", error.message);
        return false;
    }
    const metadata = (data as { metadata?: Record<string, unknown> } | null)?.metadata;
    return isChildcareOperationalEnrollmentV1EnabledForOrgMetadata(metadata);
}
