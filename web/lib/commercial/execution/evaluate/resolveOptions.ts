/**
 * Commercial Execution — WHICH AUTHORED OPTIONS APPLY TO AN ASSIGNMENT, and which one is
 * recommended (pure).
 *
 * `resolvePricing` already answers "what does THIS variant cost", and answers it well. It cannot
 * answer the question an operator actually has, because it is given the variant: someone upstream
 * must already know which cell of the matrix this child belongs in. Nobody did. That is why the
 * enrollment surface grew its own resolver reading `program_key` / `schedule_key` columns that
 * `20260702000002_commercial_tuition_rates_v2` had dropped — a second engine, resolving against a
 * shape the database has not had since July.
 *
 * So this is the missing step, added where the architecture already says it belongs: Commercial
 * Execution owns option applicability, recommendation, matched/rejected explanation, and the
 * ambiguity and no-match semantics. Enrollment consumes the answer and owns the DECISION.
 *
 * ── PRECEDENCE IS SUPERSESSION, NOT SORTING ──
 *
 * Two rules narrow the field, and both are existing doctrine rather than new invention:
 *
 *   1. A location-scoped rate beats the org default. (`resolvePricing`, `buildTuitionRateMap`.)
 *   2. Within the winning scope, the latest `effective.start` at or before `asOf` wins — a
 *      later-dated rate SUPERSEDES an earlier one. (`resolvePricing.mostSpecific`, `resolveRate`.)
 *
 * Anything still tied after those is AMBIGUOUS, and is returned as a tie rather than resolved. Two
 * genuinely equal candidates mean the configuration has not said which applies, and picking one by
 * array order would make an arbitrary choice wear the costume of a recommendation. Every resolver
 * this replaces did exactly that: `sorted[0]`, `matches[0]`, `mostSpecific(...)[0]`.
 *
 * ── NO BILLING VOCABULARY ──
 *
 * Nothing here is a charge, an obligation, an invoice, or money owed. An option is what the
 * catalog offers this assignment; whether it becomes money is a later thread's question.
 */

import type {
    CommercialExport,
    EffectiveWindow,
    TuitionRateDef,
} from "@/lib/commercial/execution/commercialExport";
import type {
    CommercialSourceRef,
    ConfigSnapshotRef,
    Money,
    PayerType,
    ResolutionReasonCode,
} from "@/lib/commercial/execution/executionTypes";
import { djb2, isEffective } from "@/lib/commercial/execution/evaluate/evalUtils";

/**
 * The canonical assignment facts an option resolution is computed from — by VALUE, read from the
 * owners that hold them. Nothing here is copied onto the child profile to make resolution easier:
 * the program and location come from the assignment, the days come from the schedule, the date is
 * the day being asked about.
 */
export type AssignmentPricingFacts = {
    /** `location_program_categories.key` — the program the child is assigned to. */
    programKey: string | null;
    /** `program_offerings.attendance_type` — full day, part day… from the assignment's schedule type. */
    attendanceType: string | null;
    /** How many days a week the schedule commits to (`schedule_patterns.weekdays.length`). */
    daysPerWeek: number | null;
    /** The site the assignment is at; drives the location-override rule. */
    locationId: string | null;
    payerType: PayerType;
    /**
     * The billing frequency, WHEN the operator has chosen one. Left null it is not a wildcard: every
     * offered cadence stays a candidate, and more than one of them is a real ambiguity for the
     * operator to settle, not for this function to settle on their behalf.
     */
    cadenceKey: string | null;
    /** The date being priced (YYYY-MM-DD). */
    asOf: string;
};

/** One authored option that applies to the assignment, with the coordinates that located it. */
export type ApplicableOption = {
    source: CommercialSourceRef;
    offeringId: string;
    /** The offering's configured name (`program_offerings.label`) — a rate's own identity. */
    offeringLabel: string;
    variantId: string;
    programKey: string;
    attendanceType: string;
    variantLabel: string;
    quantityType: string | null;
    quantityValue: number | null;
    cadenceKey: string;
    payerType: PayerType;
    locationId: string | null;
    amount: Money;
    effective: EffectiveWindow;
    /** Which scope produced it — a location override, or the org default. */
    scope: "location" | "org_default";
    /** Why it survived, in operator-readable fragments. */
    matched: string[];
};

/** An authored option that did NOT apply, and the structured reason. */
export type RejectedOption = {
    source: CommercialSourceRef;
    reason: ResolutionReasonCode;
    detail: string;
};

export type AssignmentPricingResolution =
    | {
          kind: "recommended";
          recommended: ApplicableOption;
          applicable: ApplicableOption[];
          rejected: RejectedOption[];
          resolutionKey: string;
          configVersion: ConfigSnapshotRef;
          facts: AssignmentPricingFacts;
      }
    | {
          kind: "ambiguous";
          /** The candidates that survived every narrowing rule, equally. Never one of them. */
          tied: ApplicableOption[];
          applicable: ApplicableOption[];
          rejected: RejectedOption[];
          resolutionKey: string;
          configVersion: ConfigSnapshotRef;
          facts: AssignmentPricingFacts;
      }
    | {
          kind: "no_match";
          reason: ResolutionReasonCode;
          rejected: RejectedOption[];
          resolutionKey: string;
          configVersion: ConfigSnapshotRef;
          facts: AssignmentPricingFacts;
      };

const RATE_ENTITY = "commercial_tuition_rates";

function ref(id: string): CommercialSourceRef {
    return { entity: RATE_ENTITY, id };
}

/**
 * A stable key over the FACTS and the config version.
 *
 * It is what makes a stored decision checkable later: recompute it from today's assignment facts,
 * compare it with the key the accepted term recorded, and a difference means the facts have moved
 * underneath the decision. That is the whole of staleness — no extra flag, no background job.
 */
export function assignmentResolutionKey(
    facts: AssignmentPricingFacts,
    configVersion: string,
): string {
    return djb2(
        [
            `v:${configVersion}`,
            `prog:${facts.programKey ?? ""}`,
            `att:${facts.attendanceType ?? ""}`,
            `days:${facts.daysPerWeek ?? ""}`,
            `loc:${facts.locationId ?? ""}`,
            `payer:${facts.payerType}`,
            `cad:${facts.cadenceKey ?? ""}`,
            `asOf:${facts.asOf}`,
        ].join("|"),
    );
}

/** Days a week, when the variant expresses a quantity that way. */
function variantDays(quantityType: string | null, quantityValue: number | null): number | null {
    if (quantityType !== "days") return null;
    return quantityValue == null ? null : Number(quantityValue);
}

/**
 * Resolve the authored tuition options that apply to an assignment.
 *
 * Pure: same facts + same config ⇒ same answer, including the same key.
 */
export function resolveAssignmentPricingOptions(
    exp: CommercialExport,
    facts: AssignmentPricingFacts,
): AssignmentPricingResolution {
    const resolutionKey = assignmentResolutionKey(facts, exp.version.version);
    const base = { resolutionKey, configVersion: exp.version, facts };
    const rejected: RejectedOption[] = [];

    // ── The facts have to be there ───────────────────────────────────────────────────────────
    // An absent program is not "no rate", it is "we have not been told enough", and saying so is
    // the difference between a configuration gap and an operator's missing step.
    if (!facts.programKey) {
        return { kind: "no_match", reason: "missing_required_input", rejected, ...base };
    }

    // ── The offerings this assignment could be priced under ──────────────────────────────────
    const programOfferings = exp.offerings.filter(
        (o) => o.isActive && o.programKey === facts.programKey && isEffective(o.effective, facts.asOf),
    );
    /*
     * ATTENDANCE NARROWS ONLY IN ITS OWN VOCABULARY.
     *
     * Offerings are authored by attendance type — Programs' fixed vocabulary (`full_time`,
     * `part_time`, `before_school`…). The assignment carries a SCHEDULE type, the organisation's
     * own keys (`full_day`, `weekly`…). Nothing configures a relation between the two, so requiring
     * them to be equal priced an assignment only when the two vocabularies happened to share a
     * spelling — measured on staging, never: every schedule type is `full_day`/`weekly`, every
     * offering `full_time`/`part_time`/…, and every assignment read "No rate matches".
     *
     * So a schedule type that IS one of this program's attendance types narrows exactly as before;
     * one that is not says nothing about attendance, and the program's offerings all stay in play.
     * Days a week and the site still narrow, and whatever remains equal is returned as a TIE for the
     * operator to settle — never an arbitrary pick.
     */
    const attendanceVocabulary = new Set(programOfferings.map((o) => o.attendanceType));
    const narrowsByAttendance = Boolean(facts.attendanceType) && attendanceVocabulary.has(facts.attendanceType!);
    const offerings = narrowsByAttendance
        ? programOfferings.filter((o) => o.attendanceType === facts.attendanceType)
        : programOfferings;
    if (offerings.length === 0) {
        return { kind: "no_match", reason: "not_offered_at_scope", rejected, ...base };
    }
    const offeringById = new Map(offerings.map((o) => [o.id, o]));

    // ── The variants that match the committed quantity ───────────────────────────────────────
    // A variant with no quantity is the transparent default: it applies whatever the schedule is,
    // which is how an offering that does not price by days stays priceable.
    const variants = exp.variants.filter((v) => {
        if (!v.isActive || !offeringById.has(v.offeringId)) return false;
        const days = variantDays(v.quantityType, v.quantityValue);
        if (days == null) return true;
        return facts.daysPerWeek != null && days === facts.daysPerWeek;
    });
    if (variants.length === 0) {
        return { kind: "no_match", reason: "unsupported_schedule_basis", rejected, ...base };
    }
    const variantById = new Map(variants.map((v) => [v.id, v]));

    // ── The rates on those variants ──────────────────────────────────────────────────────────
    const applicable: ApplicableOption[] = [];
    const scopedOut: TuitionRateDef[] = [];

    for (const rate of exp.tuitionRates) {
        const variant = variantById.get(rate.variantId);
        if (!variant) continue; // priced a variant this assignment is not in — not a rejection.
        const offering = offeringById.get(variant.offeringId)!;

        if (rate.payerType !== facts.payerType) {
            rejected.push({
                source: ref(rate.id),
                reason: "no_rate_for_scope",
                detail: `priced for ${rate.payerType}, not ${facts.payerType}`,
            });
            continue;
        }
        if (facts.cadenceKey && rate.cadenceKey !== facts.cadenceKey) {
            rejected.push({
                source: ref(rate.id),
                reason: "cadence_unavailable",
                detail: `billed ${rate.cadenceKey}, not ${facts.cadenceKey}`,
            });
            continue;
        }
        if (!isEffective(rate.effective, facts.asOf)) {
            // The two shapes of "not now" are told apart, because an operator meeting a future
            // price wants to know it is coming, not that it is missing.
            const future = Boolean(rate.effective.start && facts.asOf < rate.effective.start);
            rejected.push({
                source: ref(rate.id),
                reason: "no_effective_config",
                detail: future
                    ? `not effective until ${rate.effective.start}`
                    : `expired after ${rate.effective.end}`,
            });
            continue;
        }
        if (rate.notOffered) {
            rejected.push({
                source: ref(rate.id),
                reason: "not_offered_at_scope",
                detail: "explicitly not offered at this scope",
            });
            continue;
        }
        if (rate.locationId !== null && rate.locationId !== facts.locationId) {
            rejected.push({
                source: ref(rate.id),
                reason: "no_rate_for_scope",
                detail: "priced for a different site",
            });
            continue;
        }

        const isLocation = rate.locationId !== null;
        if (isLocation) scopedOut.push(rate);
        const days = variantDays(variant.quantityType, variant.quantityValue);
        applicable.push({
            source: ref(rate.id),
            offeringId: offering.id,
            offeringLabel: offering.label,
            variantId: variant.id,
            programKey: offering.programKey,
            attendanceType: offering.attendanceType,
            variantLabel: variant.label,
            quantityType: variant.quantityType,
            quantityValue: variant.quantityValue,
            cadenceKey: rate.cadenceKey,
            payerType: rate.payerType,
            locationId: rate.locationId,
            amount: { amountCents: rate.rateCents, currency: "USD" },
            effective: rate.effective,
            scope: isLocation ? "location" : "org_default",
            matched: [
                `Program · ${offering.label}`,
                narrowsByAttendance
                    ? `Attendance · ${offering.attendanceType}`
                    : `Attendance · ${offering.attendanceType} (the schedule does not name one)`,
                days != null ? `Schedule · ${days} days a week` : `Schedule · any`,
                `Billed · ${rate.cadenceKey}`,
                isLocation ? "Site rate" : "Organisation default",
                rate.effective.start ? `Effective ${rate.effective.start}` : "Effective from day one",
            ],
        });
    }

    if (applicable.length === 0) {
        return { kind: "no_match", reason: "no_rate_for_scope", rejected, ...base };
    }

    // ── Narrow: a site rate supersedes the organisation default ──────────────────────────────
    let field = applicable;
    if (scopedOut.length > 0) {
        const siteRates = applicable.filter((o) => o.scope === "location");
        if (siteRates.length > 0) {
            for (const o of applicable) {
                if (o.scope === "org_default") {
                    rejected.push({
                        source: o.source,
                        reason: "no_rate_for_scope",
                        detail: "superseded by a site rate",
                    });
                }
            }
            field = siteRates;
        }
    }

    // ── Narrow: within an offering and cadence, a later effective start supersedes an earlier one
    // Done per cadence, because two cadences are two different offers rather than two versions of
    // one — collapsing them by date would silently answer a question the operator has not been asked.
    // And per OFFERING for the same reason: when attendance does not narrow, full-time and part-time
    // are two offers, and a later-dated part-time rate must not silently supersede full-time. With a
    // single offering in play (attendance narrowed, or only one offered) this is exactly per cadence.
    const byCadence = new Map<string, ApplicableOption[]>();
    for (const o of field) {
        const key = `${o.offeringId}|${o.cadenceKey}`;
        const list = byCadence.get(key) ?? [];
        list.push(o);
        byCadence.set(key, list);
    }
    const survivors: ApplicableOption[] = [];
    for (const [, list] of byCadence) {
        const latest = list.reduce((a, b) =>
            (b.effective.start ?? "") > (a.effective.start ?? "") ? b : a,
        );
        for (const o of list) {
            if (o === latest) continue;
            if ((o.effective.start ?? "") === (latest.effective.start ?? "")) {
                survivors.push(o); // a genuine tie — carried through to the ambiguity check
                continue;
            }
            rejected.push({
                source: o.source,
                reason: "no_effective_config",
                detail: `superseded by the rate effective ${latest.effective.start ?? "from day one"}`,
            });
        }
        survivors.push(latest);
    }

    if (survivors.length === 1) {
        return { kind: "recommended", recommended: survivors[0]!, applicable, rejected, ...base };
    }
    // More than one survivor is the configuration declining to say which applies — usually two
    // cadences with no chosen billing frequency, sometimes two equally-dated rates. Either way the
    // operator settles it, not this function.
    return { kind: "ambiguous", tied: survivors, applicable, rejected, ...base };
}

/**
 * EVERY RATE THIS SITE OFFERS — the operator's "additional rates", beyond what applies.
 *
 * `resolveAssignmentPricingOptions` answers "which authored options fit this assignment" and
 * recommends among them. An operator sometimes needs a rate the facts do not select — a different
 * program's rate, or another schedule's — and the honest place for that is an OVERRIDE of a real
 * authored rate, with a reason, not an invented price. This lists the candidates for that choice.
 *
 * Program, attendance type and days are deliberately NOT filtered. Everything that makes a rate
 * unusable at all still is: the payer type, the effective window, an explicit "not offered", and a
 * rate priced for a different site. Where a site rate exists for a variant and cadence, the org
 * default for the same pair is superseded, as in the resolver.
 *
 * Pure: same export + facts ⇒ same list, in catalog order.
 */
export function listLocationTuitionOptions(
    exp: CommercialExport,
    facts: Pick<AssignmentPricingFacts, "locationId" | "payerType" | "asOf">,
): ApplicableOption[] {
    const offeringById = new Map(
        exp.offerings.filter((o) => o.isActive && isEffective(o.effective, facts.asOf)).map((o) => [o.id, o]),
    );
    const variantById = new Map(
        exp.variants.filter((v) => v.isActive && offeringById.has(v.offeringId)).map((v) => [v.id, v]),
    );

    const options: ApplicableOption[] = [];
    for (const rate of exp.tuitionRates) {
        const variant = variantById.get(rate.variantId);
        if (!variant) continue;
        if (rate.payerType !== facts.payerType) continue;
        if (!isEffective(rate.effective, facts.asOf)) continue;
        if (rate.notOffered) continue;
        if (rate.locationId !== null && rate.locationId !== facts.locationId) continue;
        const offering = offeringById.get(variant.offeringId)!;
        const isLocation = rate.locationId !== null;
        const days = variantDays(variant.quantityType, variant.quantityValue);
        options.push({
            source: ref(rate.id),
            offeringId: offering.id,
            offeringLabel: offering.label,
            variantId: variant.id,
            programKey: offering.programKey,
            attendanceType: offering.attendanceType,
            variantLabel: variant.label,
            quantityType: variant.quantityType,
            quantityValue: variant.quantityValue,
            cadenceKey: rate.cadenceKey,
            payerType: rate.payerType,
            locationId: rate.locationId,
            amount: { amountCents: rate.rateCents, currency: "USD" },
            effective: rate.effective,
            scope: isLocation ? "location" : "org_default",
            matched: [
                `Program · ${offering.label}`,
                `Attendance · ${offering.attendanceType}`,
                days != null ? `Schedule · ${days} days a week` : `Schedule · any`,
                `Billed · ${rate.cadenceKey}`,
                isLocation ? "Site rate" : "Organisation default",
                "Chosen beyond the assignment's own rates",
            ],
        });
    }

    const siteKeys = new Set(
        options.filter((o) => o.scope === "location").map((o) => `${o.variantId}|${o.cadenceKey}`),
    );
    return options.filter((o) => o.scope === "location" || !siteKeys.has(`${o.variantId}|${o.cadenceKey}`));
}
