/**
 * STAFF READINESS — a projection, not an authority.
 *
 * One question: is this EMPLOYMENT operationally ready for the evaluated context,
 * and if not, why? Every input is a canonical fact owned elsewhere; nothing here is
 * stored, and there is no `is_ready` anywhere in the slice.
 *
 * ── IT REUSES THE ENGINE RATHER THAN RESEMBLING IT ──
 *
 * The output is the platform's own `ReadinessResult`: the same `ReadinessGap`
 * shape, the same `RequirementLevel` vocabulary, the same
 * `derivePrimaryStateFromGaps` ladder, and the same `isReadinessBlockingTrigger`
 * rule. A Staff-specific evaluator that computed "blocked" its own way would be a
 * second readiness engine wearing the first one's types.
 *
 * ── WHY NOTHING BLOCKS IN SLICE 5, WITHOUT A FLAG TO SAY SO ──
 *
 * `blocking` is already trigger-dependent: `isReadinessBlockingTrigger` admits only
 * `action_execute`, `form_submit` and `status_transition`. A card reads with
 * `record_view`, so an enforced gap surfaces as `expired` or `needs_information`
 * and never as `blocked`. The separation Slice 5 requires is the engine's existing
 * behaviour, not a switch added for it — which is why enforcement can arrive later
 * by changing the TRIGGER at a seam rather than by changing this evaluator.
 *
 * ── AVAILABILITY IS DELIBERATELY NOT AN INPUT ──
 *
 * "Not available Tuesday at 2pm" is not "not ready as staff". Availability answers
 * when someone can be asked to work; readiness answers whether they may be. Folding
 * a momentary exception into a global readiness verdict would make every operator
 * who recorded a dentist appointment look unqualified.
 */

import {
    derivePrimaryStateFromGaps,
    isReadinessBlockingTrigger,
} from "@/lib/completion/readinessMappers";
import {
    READINESS_RESULT_CONTRACT_VERSION,
    type ReadinessGap,
    type ReadinessResult,
    type ReadinessTrigger,
    type RequirementLevel,
} from "@/lib/completion/readinessTypes";
import type { RequirementSatisfaction } from "@/lib/staffQualifications/staffQualificationModel";

/** What the evaluation was about — reported so an operator can see the context. */
export type StaffReadinessWorkContext = {
    employmentId: string;
    positionId: string | null;
    siteLocationId: string | null;
    siteLabel: string | null;
    assignmentTypeIds: readonly string[];
    asOf: string;
};

export type StaffReadinessEmploymentFacts = {
    /** Canonical employment status, carried verbatim from `lib/employment`. */
    status: string | null;
    isOpen: boolean;
    startDate: string | null;
    endDate: string | null;
};

export type StaffReadinessInput = {
    orgId: string;
    trigger: ReadinessTrigger;
    context: StaffReadinessWorkContext;
    employment: StaffReadinessEmploymentFacts;
    /** The canonical Slice 3 answer. Readiness consumes it; it never re-derives it. */
    satisfaction: readonly RequirementSatisfaction[];
    /** Qualification type id → operator-facing label. */
    typeLabel: (typeId: string) => string;
    /** Scope id → operator-facing label, for explaining WHY something is required. */
    scopeLabel?: (scopeType: string, scopeId: string | null) => string;
};

/**
 * The config plane carries five levels; a gap carries three.
 *
 * `off` never reaches here — the qualification resolver drops it. `suggested`
 * lands on `recommended`, the weakest gap level, because the engine has no weaker
 * one and silently promoting a suggestion to `required` is how advisory noise
 * becomes an alarm nobody trusts.
 */
export function gapLevelFromRequirementLevel(level: string): RequirementLevel {
    if (level === "enforced") return "enforced";
    if (level === "required") return "required";
    return "recommended";
}

const DEFAULT_SCOPE_LABEL: Record<string, string> = {
    organization: "organization-wide",
    position: "this position",
    site: "this site",
    assignment_type: "this assignment type",
};

/**
 * WHY it is required, in the operator's words.
 *
 * The gap contract has no provenance field, so the reason line is where provenance
 * lives — which is the engine's own language rather than a second one. Every
 * contributing scope is named, because a requirement an operator cannot explain is
 * one they cannot change.
 */
export function explainProvenance(
    sat: RequirementSatisfaction,
    scopeLabel?: (scopeType: string, scopeId: string | null) => string,
): string {
    const parts = sat.requirement.provenance.map((p) => {
        const named = scopeLabel?.(p.scopeType, p.scopeId);
        return named || DEFAULT_SCOPE_LABEL[p.scopeType] || p.scopeType;
    });
    const unique = [...new Set(parts)];
    if (unique.length === 0) return "Required for this work";
    if (unique.length === 1) return `Required ${unique[0]}`;
    return `Required ${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

function qualificationGap(
    sat: RequirementSatisfaction,
    input: StaffReadinessInput,
): ReadinessGap | null {
    if (sat.satisfied) return null;
    const level = gapLevelFromRequirementLevel(sat.requirement.level);
    const label = input.typeLabel(sat.requirement.qualificationTypeId);
    const why = explainProvenance(sat, input.scopeLabel);

    // The SCOPE names what kind of shortfall this is, using the engine's existing
    // vocabulary: an expiry is freshness, a missing document is a packet, and a
    // credential that was never recorded is a record fact.
    const scope_type =
        sat.reason === "expired" ? "freshness"
        : sat.reason === "evidence_missing" ? "packet"
        : "record";

    const failure_kind =
        sat.reason === "expired" ? "expired"
        : sat.reason === "evidence_missing" ? "incomplete"
        : "missing";

    const reason =
        sat.reason === "expired" ? `${label} has expired. ${why}.`
        : sat.reason === "evidence_missing" ? `${label} is recorded but has no supporting evidence. ${why}.`
        : sat.reason === "not_yet_effective" ? `${label} is not yet effective. ${why}.`
        : sat.reason === "revoked" ? `${label} was revoked. ${why}.`
        : `${label} is not held. ${why}.`;

    return {
        requirement_id: `staff_qualification:${sat.requirement.qualificationTypeId}`,
        scope_type,
        level,
        label,
        missing_reason: reason,
        failure_kind,
        // Reuse the canonical rule. Never recomputed here, so a change to what
        // blocks reaches Staff without anyone remembering to update this file.
        blocking: level === "enforced" && isReadinessBlockingTrigger(input.trigger),
        entity_type: "employment",
        entity_id: input.context.employmentId,
        resolution: { type: "action", action_key: "staff_qualification.record" },
    };
}

/** The employment itself has to be a live working relationship to be "ready". */
function employmentGap(input: StaffReadinessInput): ReadinessGap | null {
    if (input.employment.isOpen) return null;
    const ended = input.employment.status === "ended" || input.employment.endDate != null;
    return {
        requirement_id: "staff_employment:open_period",
        scope_type: "record",
        level: "enforced",
        label: "Active employment",
        missing_reason: ended
            ? "This employment has ended, so readiness for current work does not apply."
            : "This employment has not started yet, so readiness for current work does not apply.",
        failure_kind: "missing",
        blocking: isReadinessBlockingTrigger(input.trigger),
        entity_type: "employment",
        entity_id: input.context.employmentId,
    };
}

/**
 * The canonical Staff readiness projection.
 *
 * Gaps are ordered strongest first so the card's first line is the thing that
 * matters most, and `derivePrimaryStateFromGaps` is the platform's ladder rather
 * than a Staff reading of it.
 */
export function evaluateStaffReadiness(input: StaffReadinessInput): ReadinessResult {
    const gaps: ReadinessGap[] = [];
    const employment = employmentGap(input);
    if (employment) gaps.push(employment);

    // An ended or unstarted employment reports ONLY that. Listing every credential a
    // former employee lacks would bury the one fact that explains all of them.
    if (!employment) {
        for (const sat of input.satisfaction) {
            const gap = qualificationGap(sat, input);
            if (gap) gaps.push(gap);
        }
    }

    const order: Record<RequirementLevel, number> = { enforced: 0, required: 1, recommended: 2 };
    gaps.sort((a, b) => order[a.level] - order[b.level] || a.label.localeCompare(b.label));

    const satisfied = input.satisfaction.filter((s) => s.satisfied).length;
    return {
        contract_version: READINESS_RESULT_CONTRACT_VERSION,
        primary_state: derivePrimaryStateFromGaps(gaps),
        trigger: input.trigger,
        subject: { entity_type: "employment", entity_id: input.context.employmentId },
        context: { org_id: input.orgId },
        gaps,
        counts: {
            gaps_total: gaps.length,
            by_level: {
                recommended: gaps.filter((g) => g.level === "recommended").length,
                required: gaps.filter((g) => g.level === "required").length,
                enforced: gaps.filter((g) => g.level === "enforced").length,
            },
            blocking: gaps.filter((g) => g.blocking).length,
            satisfied,
            configured: input.satisfaction.length,
        },
        ok: !gaps.some((g) => g.blocking),
        evaluated_at: new Date().toISOString(),
    };
}
