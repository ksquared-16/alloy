/**
 * Staff qualifications — the pure model.
 *
 * Everything here is a function of rows and a date. No client, no clock of its
 * own, no persisted verdict. That matters for two reasons: expiration must be
 * the same answer for everyone who asks on the same day, and the later Readiness
 * slice must be able to consume these facts without inheriting a second engine.
 *
 * WHAT IS DELIBERATELY ABSENT: there is no `is_expired`, no `is_ready`, no
 * status column that a job has to maintain. A qualification is expired when its
 * expiry date has passed, which is a fact about the date.
 */

/** Platform requirement vocabulary, reused rather than re-invented. */
export type QualificationRequirementLevel =
    | "off"
    | "suggested"
    | "recommended"
    | "required"
    | "enforced";

export type QualificationScopeType = "organization" | "position" | "site" | "assignment_type";

export type QualificationVerificationState = "unverified" | "verified" | "rejected";

export type StaffQualificationRow = {
    id: string;
    org_id: string;
    employment_id: string;
    qualification_type_id: string;
    issued_on: string | null;
    expires_on: string | null;
    verification_state: QualificationVerificationState;
    verified_at: string | null;
    supersedes_qualification_id: string | null;
    revoked_at: string | null;
};

export type QualificationRequirementRow = {
    id: string;
    org_id: string;
    qualification_type_id: string;
    scope_type: QualificationScopeType;
    scope_id: string | null;
    requirement_level: QualificationRequirementLevel;
    evidence_required: boolean;
    effective_start: string | null;
    effective_end: string | null;
    is_active: boolean;
};

/** The work context a requirement is resolved against. */
export type QualificationWorkContext = {
    employmentId: string;
    positionId?: string | null;
    siteLocationId?: string | null;
    assignmentTypeIds?: readonly string[];
    /** Org calendar day — supplied, never read from a local clock. */
    asOf: string;
};

export type QualificationStanding = "valid" | "expired" | "not_yet_effective" | "revoked";

/**
 * Standing of ONE held qualification on a given day.
 *
 * Order matters and is deliberate: revocation beats dates, because a revoked
 * credential is not merely out of date. A future issue date reads as
 * not_yet_effective rather than valid, so a qualification recorded in advance
 * does not silently count today.
 */
export function qualificationStanding(
    row: Pick<StaffQualificationRow, "issued_on" | "expires_on" | "revoked_at">,
    asOf: string,
): QualificationStanding {
    if (row.revoked_at) return "revoked";
    const day = String(asOf ?? "").slice(0, 10);
    if (!day) return "valid";
    if (row.issued_on && row.issued_on > day) return "not_yet_effective";
    // NULL expiry means "does not expire", not "unknown".
    if (row.expires_on && row.expires_on < day) return "expired";
    return "valid";
}

/** Days until expiry; null when it does not expire or has already passed. */
export function daysUntilExpiry(expiresOn: string | null, asOf: string): number | null {
    if (!expiresOn) return null;
    const a = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${expiresOn.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
    return Math.round((b - a) / 86_400_000);
}

export type EffectiveQualificationRequirement = {
    qualificationTypeId: string;
    level: QualificationRequirementLevel;
    evidenceRequired: boolean;
    /** Why this applies — every contributing scope, strongest first. */
    provenance: readonly {
        requirementId: string;
        scopeType: QualificationScopeType;
        scopeId: string | null;
        level: QualificationRequirementLevel;
    }[];
};

const LEVEL_RANK: Readonly<Record<QualificationRequirementLevel, number>> = {
    off: 0,
    suggested: 1,
    recommended: 2,
    required: 3,
    enforced: 4,
};

/** Does this requirement row apply to the given context on the given day? */
export function requirementAppliesTo(
    row: QualificationRequirementRow,
    ctx: QualificationWorkContext,
): boolean {
    if (!row.is_active) return false;
    const day = ctx.asOf.slice(0, 10);
    if (row.effective_start && row.effective_start > day) return false;
    if (row.effective_end && row.effective_end < day) return false;
    switch (row.scope_type) {
        case "organization":
            return true;
        case "position":
            return !!ctx.positionId && row.scope_id === ctx.positionId;
        case "site":
            return !!ctx.siteLocationId && row.scope_id === ctx.siteLocationId;
        case "assignment_type":
            return !!row.scope_id && (ctx.assignmentTypeIds ?? []).includes(row.scope_id);
        default:
            return false;
    }
}

/**
 * Resolve every requirement that applies, with provenance.
 *
 * CONTRIBUTIONS COMBINE, THEY DO NOT OVERRIDE. Several scopes may require the
 * same qualification — organization-wide AND because of an assignment type — and
 * the operator needs to see both reasons, not the winner. The effective LEVEL is
 * the strongest contributing level, and `off` at one scope does not cancel a
 * requirement asserted at another; it simply contributes nothing.
 *
 * A type whose only contributions are `off` is not returned at all.
 */
export function resolveEffectiveQualificationRequirements(
    rows: readonly QualificationRequirementRow[],
    ctx: QualificationWorkContext,
): EffectiveQualificationRequirement[] {
    const byType = new Map<string, EffectiveQualificationRequirement>();
    for (const row of rows) {
        if (!requirementAppliesTo(row, ctx)) continue;
        const existing = byType.get(row.qualification_type_id);
        const contribution = {
            requirementId: row.id,
            scopeType: row.scope_type,
            scopeId: row.scope_id,
            level: row.requirement_level,
        };
        if (!existing) {
            byType.set(row.qualification_type_id, {
                qualificationTypeId: row.qualification_type_id,
                level: row.requirement_level,
                evidenceRequired: row.evidence_required,
                provenance: [contribution],
            });
            continue;
        }
        const strongest =
            LEVEL_RANK[row.requirement_level] > LEVEL_RANK[existing.level]
                ? row.requirement_level
                : existing.level;
        byType.set(row.qualification_type_id, {
            qualificationTypeId: row.qualification_type_id,
            level: strongest,
            // Evidence is required if ANY contributing scope requires it.
            evidenceRequired: existing.evidenceRequired || row.evidence_required,
            provenance: [...existing.provenance, contribution].sort(
                (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level],
            ),
        });
    }
    return [...byType.values()].filter((r) => r.level !== "off");
}

export type RequirementSatisfaction = {
    requirement: EffectiveQualificationRequirement;
    satisfiedBy: StaffQualificationRow | null;
    satisfied: boolean;
    reason: "satisfied" | "missing" | "expired" | "not_yet_effective" | "revoked" | "evidence_missing";
};

/**
 * Which held qualification satisfies each requirement.
 *
 * A qualification satisfies only if it is THIS employment's, of the required
 * type, standing valid on the day, and — where the requirement demands it —
 * carrying evidence. Anything else reports WHY, because "missing" and "expired"
 * send an operator to different places.
 */
export function resolveRequirementSatisfaction(
    requirements: readonly EffectiveQualificationRequirement[],
    held: readonly StaffQualificationRow[],
    ctx: QualificationWorkContext,
    evidenceCountByQualificationId: ReadonlyMap<string, number> = new Map(),
): RequirementSatisfaction[] {
    return requirements.map((requirement) => {
        const candidates = held.filter(
            (q) =>
                q.employment_id === ctx.employmentId &&
                q.qualification_type_id === requirement.qualificationTypeId,
        );
        if (candidates.length === 0) {
            return { requirement, satisfiedBy: null, satisfied: false, reason: "missing" };
        }
        const valid = candidates.filter((q) => qualificationStanding(q, ctx.asOf) === "valid");
        if (valid.length === 0) {
            // Report the most informative failure rather than the first row.
            const standings = candidates.map((q) => qualificationStanding(q, ctx.asOf));
            const reason = standings.includes("expired")
                ? "expired"
                : standings.includes("not_yet_effective")
                  ? "not_yet_effective"
                  : "revoked";
            return { requirement, satisfiedBy: null, satisfied: false, reason };
        }
        const withEvidence = requirement.evidenceRequired
            ? valid.find((q) => (evidenceCountByQualificationId.get(q.id) ?? 0) > 0)
            : valid[0];
        if (!withEvidence) {
            return { requirement, satisfiedBy: null, satisfied: false, reason: "evidence_missing" };
        }
        return { requirement, satisfiedBy: withEvidence, satisfied: true, reason: "satisfied" };
    });
}
