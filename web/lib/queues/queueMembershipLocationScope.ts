/**
 * Location-scope filtering for builder-backed child/candidate queue lanes.
 *
 * Applies user site scope (`RecordScopeConstraints.locationIds`) against
 * membership `location_scope_source` — OCM site, placement site, or case site.
 */

import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import type {
    QueueMembershipLocationScopeSource,
    QueueMembershipSubjectType,
    QueueMembershipV1,
} from "@/lib/lifecycle/queueMembershipV1";
import type { RelatedSubjectSummary, RelatedSubjectVisibility } from "@/lib/workUnits/lifecycleSubjectContracts";

export function defaultLocationScopeSourceForSubjectType(
    subjectType: QueueMembershipSubjectType,
): QueueMembershipLocationScopeSource {
    switch (subjectType) {
        case "child":
            return "ocm_site";
        case "candidate":
            return "placement_site";
        case "case":
            return "case_site";
    }
}

export function resolveEffectiveLocationScopeSource(
    membership: Pick<QueueMembershipV1, "subject_type" | "location_scope_source">,
): QueueMembershipLocationScopeSource {
    return membership.location_scope_source ?? defaultLocationScopeSourceForSubjectType(membership.subject_type);
}

export function isUserLocationScopeRestricted(constraints: RecordScopeConstraints | null): boolean {
    return Boolean(constraints?.locationIds?.length);
}

/** Restricted users cannot see subject rows with unknown placement location. */
export function passesSubjectLocationScope(params: {
    subjectLocationId: string | null | undefined;
    recordScopeConstraints: RecordScopeConstraints | null;
}): boolean {
    const allowedIds = params.recordScopeConstraints?.locationIds;
    if (!allowedIds?.length) return true;

    const loc = params.subjectLocationId?.trim() ?? "";
    if (!loc) return false;
    return allowedIds.includes(loc);
}

export function resolveOcmRowSubjectLocationId(params: {
    ocmLocationId: string | null | undefined;
    opportunityLocationId: string | null | undefined;
    scopeSource: QueueMembershipLocationScopeSource;
}): string | null {
    const ocm = params.ocmLocationId?.trim() || null;
    const opp = params.opportunityLocationId?.trim() || null;
    if (params.scopeSource === "ocm_site") return ocm;
    return opp;
}

export function resolveCandidateRowSubjectLocationId(params: {
    siteId: string | null | undefined;
    opportunityLocationId: string | null | undefined;
    scopeSource: QueueMembershipLocationScopeSource;
}): string | null {
    const site = params.siteId?.trim() || null;
    const opp = params.opportunityLocationId?.trim() || null;
    if (params.scopeSource === "placement_site") {
        return site ?? opp;
    }
    return opp;
}

export function applyOcmLocationScopeToQuery<T extends { in: (col: string, vals: string[]) => T }>(
    q: T,
    constraints: RecordScopeConstraints | null,
    scopeSource: QueueMembershipLocationScopeSource,
): T {
    if (!constraints) return q;
    if (constraints.workUnitIds?.length) {
        q = q.in("opportunities.work_unit_id", constraints.workUnitIds);
    }
    if (constraints.locationIds?.length) {
        if (scopeSource === "ocm_site") {
            q = q.in("location_id", constraints.locationIds);
        } else {
            q = q.in("opportunities.location_id", constraints.locationIds);
        }
    }
    return q;
}

/** Candidate-grain waitlist: placement site primary; case site uses opportunity only. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyWaitlistCandidateLocationScopeToQuery(q: any, constraints: RecordScopeConstraints | null, scopeSource: QueueMembershipLocationScopeSource): any {
    if (!constraints?.locationIds?.length) return q;
    const ids = constraints.locationIds.filter((id) => id.trim()).join(",");
    if (!ids) return q;

    if (scopeSource === "case_site") {
        return q.in("opportunities.location_id", constraints.locationIds);
    }

    return q.or(`site_id.in.(${ids}),and(site_id.is.null,opportunities.location_id.in.(${ids}))`);
}

export function relatedSubjectVisibilityForLocation(
    subjectLocationId: string | null | undefined,
    allowedLocationIds: readonly string[] | null | undefined,
): RelatedSubjectVisibility {
    if (!allowedLocationIds?.length) return "full";
    const loc = subjectLocationId?.trim() ?? "";
    if (!loc) return "redacted";
    return allowedLocationIds.includes(loc) ? "full" : "redacted";
}

export function applyRelatedSubjectLocationVisibility(
    summary: RelatedSubjectSummary,
    visibility: RelatedSubjectVisibility,
): RelatedSubjectSummary {
    if (visibility === "full") {
        return { ...summary, visibility: "full" };
    }
    if (visibility === "hidden") {
        return {
            subject_type: summary.subject_type,
            subject_id: summary.subject_id,
            display_name: "Other child",
            status_label: "—",
            visibility: "hidden",
        };
    }
    return {
        subject_type: summary.subject_type,
        subject_id: summary.subject_id,
        display_name: "Other child",
        status_label: summary.status_label?.trim() ? "At another location" : "—",
        visibility: "redacted",
    };
}

export function filterOcmEnrollmentTrackRowsByLocationScope<T extends {
    location_id?: string | null;
    opportunities?: { location_id?: string | null } | { location_id?: string | null }[] | null;
}>(
    rows: readonly T[],
    constraints: RecordScopeConstraints | null,
    scopeSource: QueueMembershipLocationScopeSource,
): T[] {
    if (!isUserLocationScopeRestricted(constraints)) return [...rows];

    return rows.filter((row) => {
        const oppRaw = row.opportunities;
        const opp = Array.isArray(oppRaw) ? (oppRaw[0] ?? null) : oppRaw;
        const subjectLocationId = resolveOcmRowSubjectLocationId({
            ocmLocationId: row.location_id,
            opportunityLocationId: opp?.location_id,
            scopeSource,
        });
        return passesSubjectLocationScope({
            subjectLocationId,
            recordScopeConstraints: constraints,
        });
    });
}

export function filterWaitlistCandidateRowsByLocationScope<T extends CandidateLocationScopeRow>(
    rows: readonly T[],
    constraints: RecordScopeConstraints | null,
    scopeSource: QueueMembershipLocationScopeSource,
): T[] {
    if (!isUserLocationScopeRestricted(constraints)) return [...rows];

    return rows.filter((row) => {
        const opp = readCandidateOpportunityForScope(row);
        const subjectLocationId = resolveCandidateRowSubjectLocationId({
            siteId: row.site_id,
            opportunityLocationId: opp?.location_id,
            scopeSource,
        });
        return passesSubjectLocationScope({
            subjectLocationId,
            recordScopeConstraints: constraints,
        });
    });
}

export type CandidateLocationScopeRow = {
    site_id?: string | null;
    opportunities?: CandidateOpportunityScopePreview | CandidateOpportunityScopePreview[] | null;
};

type CandidateOpportunityScopePreview = { location_id?: string | null };

function readCandidateOpportunityForScope(row: CandidateLocationScopeRow): CandidateOpportunityScopePreview | null {
    const o = row.opportunities;
    const single = Array.isArray(o) ? (o[0] ?? null) : o;
    return single ?? null;
}
