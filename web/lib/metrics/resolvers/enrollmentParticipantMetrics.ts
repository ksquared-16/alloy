/**
 * Enrollment participant metrics — count PARTICIPANTS via the SAME engine projection + predicates
 * the rest of the runtime uses. Metrics invent NO separate membership logic: they load through the
 * Enrollment Definition's projection and count with its semantics, so a metric can never diverge
 * from queue membership.
 *
 *   enrollment.active_leads — live participant, not enrolled/withdrawn/not_enrolling (stage-agnostic)
 *   enrollment.active_families — same live predicate, distinct opportunity/case contexts
 *   enrollment.new_leads    — live, undispositioned, effective stage 'lead'
 *   enrollment.waitlisted   — live, waitlist stage or waitlisted state
 *
 * enrollment.lead_count is a DEPRECATED alias → active_leads (one definition at every scope).
 * Effective stage = process_instances.stage_key ?? opportunities.stage_key (engine coalesce).
 *
 * Grain: participant/child (process_instances). Work View queue totals use opportunity/case grain.
 * Workspace Site Filter: case grain uses opportunity.location_id; child grain uses OCM location
 * (falling back to opportunity location). Never show org-wide PI totals inside a site-scoped workspace.
 */

import type { MetricResolveContext, OipMetricKey, ResolvedMetricValue } from "@/lib/metrics/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { resolveMetricTimeWindowBounds } from "@/lib/metrics/timeWindow";
import { resolveMetricScopeFilter } from "@/lib/metrics/scopeFilter";
import {
    enrollmentProjection,
    countActiveLeadParticipants,
    countActiveLeadFamilies,
    countNewLeadParticipants,
    countWaitlistedParticipants,
    type EnrollmentParticipant,
} from "@/lib/process/definitions/enrollment";

type EnrollmentCounter = (
    participants: readonly EnrollmentParticipant[],
    scope?: { orgId: string; scopeId?: string | null },
) => number;

/** Location match for a Workspace Site Filter cohort — grain-aware. */
export function enrollmentParticipantMatchesLocationScope(
    participant: EnrollmentParticipant,
    locationIds: readonly string[],
    grain: "participant" | "case",
): boolean {
    const allowed = new Set(locationIds.map((id) => id.trim()).filter(Boolean));
    if (!allowed.size) return false;
    if (grain === "case") {
        const loc = participant.attributes.contextLocationId?.trim() || "";
        return Boolean(loc && allowed.has(loc));
    }
    const loc =
        participant.attributes.subjectLocationId?.trim()
        || participant.attributes.contextLocationId?.trim()
        || "";
    return Boolean(loc && allowed.has(loc));
}

async function resolveParticipantMetric(
    ctx: MetricResolveContext,
    key: OipMetricKey,
    counter: EnrollmentCounter,
    grain: "participant" | "case" = "participant",
): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition(key);
    const now = ctx.now ?? new Date();
    const { windowStart, windowEnd } = resolveMetricTimeWindowBounds(ctx.window, now);
    const scopeId = ctx.workUnitId?.trim() || null;
    const siteId = ctx.siteLocationId?.trim() || null;

    let locationIds: string[] | null = null;
    if (siteId) {
        const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, siteId);
        if (filter.impossible) {
            return {
                key: def.key,
                label: def.label,
                format: def.format,
                value: 0,
                formattedValue: formatMetricValue(def.format, 0),
                window: ctx.window,
                windowStartIso: windowStart.toISOString(),
                windowEndIso: windowEnd.toISOString(),
                computedAtIso: now.toISOString(),
                sources: def.sources,
                resolveMode: ctx.mode ?? "live",
                meta: { count: 0, grain, scope: "site", site_id: siteId },
            };
        }
        locationIds = filter.locationIds;
    }

    // ONE membership source: the Enrollment projection (process_instances ⋈ context ⋈ subject),
    // scoped to the work unit when present, else the org rollup — then narrowed by site location.
    let participants = await enrollmentProjection.load(ctx.supabase, { orgId: ctx.orgId, scopeId });
    if (locationIds?.length) {
        participants = participants.filter((p) =>
            enrollmentParticipantMatchesLocationScope(p, locationIds!, grain),
        );
    }
    const value = counter(participants, { orgId: ctx.orgId, scopeId });

    return {
        key: def.key,
        label: def.label,
        format: def.format,
        value,
        formattedValue: formatMetricValue(def.format, value),
        window: ctx.window,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        computedAtIso: now.toISOString(),
        sources: def.sources,
        resolveMode: ctx.mode ?? "live",
        meta: {
            count: value,
            grain,
            scope: siteId ? "site" : scopeId ? "work_unit" : "org",
            ...(siteId ? { site_id: siteId } : {}),
        },
    };
}

export function resolveEnrollmentActiveLeads(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    return resolveParticipantMetric(ctx, "enrollment.active_leads", countActiveLeadParticipants);
}
export function resolveEnrollmentActiveFamilies(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    return resolveParticipantMetric(ctx, "enrollment.active_families", countActiveLeadFamilies, "case");
}
export function resolveEnrollmentNewLeads(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    return resolveParticipantMetric(ctx, "enrollment.new_leads", countNewLeadParticipants);
}
export function resolveEnrollmentWaitlisted(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    return resolveParticipantMetric(ctx, "enrollment.waitlisted", countWaitlistedParticipants);
}

/** DEPRECATED alias — enrollment.lead_count now resolves to the SINGLE active-leads participant
 *  definition, replacing the old status_key/opportunity-grain + windowed dual behavior. */
export function resolveEnrollmentLeadCountCompat(ctx: MetricResolveContext): Promise<ResolvedMetricValue> {
    return resolveParticipantMetric(ctx, "enrollment.lead_count", countActiveLeadParticipants);
}
