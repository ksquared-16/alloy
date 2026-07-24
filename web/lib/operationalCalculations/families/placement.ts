/**
 * Placement — room-fit as a governed Operational Calculation.
 *
 * `placement.room_fit` is the ONE owner of room eligibility + recommendation
 * ranking for a child. It is NOT recommendation logic living inside a Scheduling
 * editor, room-picker, API route, or presentation adapter — those consume this
 * result. The calculation:
 *
 *   1. resolves the proposed effective date and the child's age as of it,
 *   2. applies HARD eligibility gates (age band, program compatibility, site,
 *      room active, schedule/day compatibility, capacity) BEFORE any ranking,
 *   3. ranks ONLY the eligible set (configured policy — program → continuity →
 *      headroom; capacity/headroom never overrides age or program), and
 *   4. returns a typed, VERDICT-FREE `set` result with provenance.
 *
 * "Verdict-free" = the result states eligibility + an ORDER over the eligible
 * set with its basis and provenance. It never emits "Recommended" — that word is
 * a SURFACE label applied to the calculation's top-ranked eligible entry. An
 * ineligible room has `rank: null` and can never be labelled Recommended.
 *
 * The handler is PURE (no IO): the I/O adapter resolves configuration + facts
 * (room age bands, room active state, the child's DOB, and the occupancy/capacity/
 * schedule signals from the existing expectation engine) and passes them in the
 * request. This composes over — and does not re-implement — that engine.
 */

import {
    defineOperationalCalculation,
    type HandlerComputation,
    type OperationalCalculationDefinition,
} from "@/lib/operationalCalculations/definition";
import type { AppliedOperationalRule, OperationalResolutionWarning } from "@/lib/location/operationalResolutionContracts";

const ROOM_FIT_ENGINE_VERSION = "placement.roomFit@1.0.0";
const CONTRACT_VERSION = "1.0";

// ---------------------------------------------------------------------------
// Pure age helper
// ---------------------------------------------------------------------------

/**
 * Whole months from `dob` to `asOf` (both YYYY-MM-DD), never negative. The day of
 * month is honoured — a child is not `n` months old until the day-of-month is
 * reached — so a child who "ages into" a band by the effective date is counted.
 * Returns null when either date is unparseable (age then can't gate).
 */
export function ageInMonthsAsOf(dob: string | null | undefined, asOf: string): number | null {
    if (!dob) return null;
    const b = dob.slice(0, 10).split("-").map(Number);
    const a = asOf.slice(0, 10).split("-").map(Number);
    if (b.length !== 3 || a.length !== 3 || b.some(Number.isNaN) || a.some(Number.isNaN)) return null;
    let months = (a[0] - b[0]) * 12 + (a[1] - b[1]);
    if (a[2] < b[2]) months -= 1;
    return months < 0 ? 0 : months;
}

/** Normalize a configured age bound to whole months. `years` → ×12; default months. */
export function ageBoundToMonths(value: number | null | undefined, unit: string | null | undefined): number | null {
    if (value == null || Number.isNaN(value)) return null;
    const u = (unit ?? "").trim().toLowerCase();
    if (u === "year" || u === "years" || u === "yr" || u === "yrs") return Math.round(value * 12);
    return Math.round(value); // months (or unspecified — treated as months)
}

// ---------------------------------------------------------------------------
// Request / value shapes
// ---------------------------------------------------------------------------

/** A configured age band for a room, already normalized to whole months. */
export type RoomAgeBandMonths = { minMonths: number | null; maxMonths: number | null };

/**
 * One candidate room with its RESOLVED configuration + operational facts. The
 * adapter fills these from config (age band, active) + the expectation engine
 * (occupancy/capacity/schedule signals); the handler decides, never re-queries.
 */
export type RoomFitCandidate = {
    roomId: string;
    roomName: string | null;
    /** Room location active state (config). */
    active: boolean;
    /** Configured age band (months), or null when unconfigured. */
    ageBand: RoomAgeBandMonths | null;
    /** Room's age group matches the child's desired program's age group (config). */
    programMatch: boolean;
    /** Whether the child's desired program / room age group could be resolved at all. */
    programKnown: boolean;
    /** Child already occupies this room (effective-dated continuity). */
    continuity: boolean;
    /** Schedule type is eligible for this room's scope (expectation engine). */
    scheduleEligible: boolean;
    /** Every scheduled weekday falls inside the room's operating windows (engine). */
    withinOperatingWindow: boolean;
    /** The expectation engine flagged capacity_exceeded for this room after placement. */
    capacityExceeded: boolean;
    /** Projected peak occupancy in this room after the hypothetical placement. */
    occupancyAfter: number;
    /** Remaining capacity after placement (null = capacity not configured / unknown). */
    capacityHeadroom: number | null;
};

/** Ordered ranking factors among the ELIGIBLE set. Capacity never precedes age/program. */
export type RoomFitFactor = "program_match" | "continuity" | "headroom";
export type RoomFitPolicy = { factors: RoomFitFactor[] };
export const DEFAULT_ROOM_FIT_POLICY: RoomFitPolicy = { factors: ["program_match", "continuity", "headroom"] };

export type RoomFitRequest = {
    /** The proposed effective (start) date the fit is resolved as of (YYYY-MM-DD). */
    asOf: string;
    /** Child age in whole months as of `asOf`, or null when DOB is unknown. */
    childAgeMonths: number | null;
    /** Whether the child's DOB was known (drives an honest warning, not a silent pass). */
    dobKnown: boolean;
    candidates: RoomFitCandidate[];
    policy?: RoomFitPolicy;
    /** Site the rooms belong to (scope provenance). */
    siteLocationId?: string | null;
};

/** A stable, machine-readable cause a candidate is ineligible (never free prose only). */
export type RoomFitReason = { ruleId: string; detail: string };

/** The ranking inputs that ordered an eligible entry — explainability, not a score. */
export type RoomFitRankBasis = { programMatch: boolean; continuity: boolean; occupancyAfter: number; headroom: number | null };

/** Per-room fit — eligible + (if eligible) its rank among the eligible set. */
export type RoomFitEntry = {
    roomId: string;
    roomName: string | null;
    eligible: boolean;
    /** Present only when ineligible: the hard rules that excluded the room. */
    ineligibleReasons: RoomFitReason[];
    /** 0-based order among the eligible set (0 = best fit); null when ineligible. */
    rank: number | null;
    rankBasis: RoomFitRankBasis;
    /** A plain operator-level line — age eligibility + the deciding fit signal. */
    explanation: string;
};

export type RoomFitSetValue = { kind: "set"; entries: readonly RoomFitEntry[] };

// ---------------------------------------------------------------------------
// Pure hard-eligibility gates (applied BEFORE ranking)
// ---------------------------------------------------------------------------

/**
 * The ordered hard gates. Each returns a reason when it EXCLUDES the room. Gates
 * fail CLOSED on a known violation and OPEN on unknown inputs (an unconfigured age
 * band or unknown DOB cannot prove ineligibility — it is surfaced as a warning,
 * not a silent block or a fabricated pass). Capacity is one gate among these —
 * it never overrides age or program, because ranking only ever sees rooms that
 * passed ALL gates.
 */
function hardGateReasons(c: RoomFitCandidate, req: RoomFitRequest): RoomFitReason[] {
    const reasons: RoomFitReason[] = [];

    if (!c.active) {
        reasons.push({ ruleId: "room.active", detail: "Room is not active" });
    }

    // Age as of the proposed effective date — only gates when both the child's age
    // and the relevant band bound are known.
    if (req.childAgeMonths != null && c.ageBand) {
        if (c.ageBand.minMonths != null && req.childAgeMonths < c.ageBand.minMonths) {
            reasons.push({ ruleId: "age.min", detail: `Too young for this room by ${fmtMonthDay(req.asOf)}` });
        }
        if (c.ageBand.maxMonths != null && req.childAgeMonths > c.ageBand.maxMonths) {
            reasons.push({ ruleId: "age.max", detail: `Too old for this room by ${fmtMonthDay(req.asOf)}` });
        }
    }

    // Program / category compatibility — a hard gate only when the child's program
    // (and thus the target age group) is KNOWN and the room does not match it.
    if (c.programKnown && !c.programMatch) {
        reasons.push({ ruleId: "program.compatible", detail: "Different program than the child's" });
    }

    if (!c.scheduleEligible) {
        reasons.push({ ruleId: "schedule.type_eligible", detail: "Schedule type not offered in this room" });
    }
    if (!c.withinOperatingWindow) {
        reasons.push({ ruleId: "schedule.operating_window", detail: "Scheduled days fall outside operating hours" });
    }
    if (c.capacityExceeded) {
        reasons.push({ ruleId: "capacity.headroom", detail: "At capacity for the scheduled days" });
    }

    return reasons;
}

/** Compare two eligible rooms by one ranking factor. Negative ⇒ `a` is the better fit. */
function compareByFactor(a: RoomFitCandidate, b: RoomFitCandidate, factor: RoomFitFactor): number {
    switch (factor) {
        case "program_match":
            return (b.programMatch ? 1 : 0) - (a.programMatch ? 1 : 0);
        case "continuity":
            return (b.continuity ? 1 : 0) - (a.continuity ? 1 : 0);
        case "headroom":
            return a.occupancyAfter - b.occupancyAfter; // lower resulting occupancy = more headroom
    }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Pure `YYYY-MM-DD` → `Mon D` (operator-facing, no locale/Date dependency). */
function fmtMonthDay(iso: string): string {
    const [, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!m || !d || m < 1 || m > 12) return iso;
    return `${MONTHS[m - 1]} ${d}`;
}

/** The operator-level line for an ELIGIBLE room — age eligibility + the deciding fit. */
function eligibleExplanation(c: RoomFitCandidate, req: RoomFitRequest, isTop: boolean): string {
    const parts: string[] = [];
    if (req.childAgeMonths != null && c.ageBand && (c.ageBand.minMonths != null || c.ageBand.maxMonths != null)) {
        parts.push(`Age eligible on ${fmtMonthDay(req.asOf)}`);
    } else if (isTop && c.programMatch) {
        parts.push("Right program");
    }
    if (c.continuity) parts.push("current room");
    if (c.capacityHeadroom != null) parts.push(`${c.capacityHeadroom} ${c.capacityHeadroom === 1 ? "space" : "spaces"} available`);
    else parts.push("most headroom");
    return parts.join(" · ");
}

/**
 * Pure fit computation: gate every candidate, then rank ONLY the eligible ones by
 * the configured policy (program → continuity → headroom; ties break stably by
 * room id). Returns entries in display order: eligible-by-rank first, then
 * ineligible by name. No entry is ever labelled "Recommended" here.
 */
export function computeRoomFit(req: RoomFitRequest): { entries: RoomFitEntry[]; appliedRules: AppliedOperationalRule[]; warnings: OperationalResolutionWarning[] } {
    const policy = req.policy ?? DEFAULT_ROOM_FIT_POLICY;
    const warnings: OperationalResolutionWarning[] = [];

    if (!req.dobKnown) {
        warnings.push({ code: "child_dob_unknown", message: "Child date of birth is unknown — age eligibility could not be applied." });
    }

    const gated = req.candidates.map((c) => ({ c, reasons: hardGateReasons(c, req) }));
    const eligible = gated.filter((g) => g.reasons.length === 0).map((g) => g.c);

    // Rank the eligible set by policy (stable by room id).
    const ranked = [...eligible].sort((a, b) => {
        for (const factor of policy.factors) {
            const cmp = compareByFactor(a, b, factor);
            if (cmp !== 0) return cmp;
        }
        return a.roomId.localeCompare(b.roomId);
    });
    const rankByRoom = new Map<string, number>();
    ranked.forEach((c, i) => rankByRoom.set(c.roomId, i));

    const entries: RoomFitEntry[] = gated.map(({ c, reasons }) => {
        const isEligible = reasons.length === 0;
        const rank = isEligible ? rankByRoom.get(c.roomId) ?? null : null;
        return {
            roomId: c.roomId,
            roomName: c.roomName,
            eligible: isEligible,
            ineligibleReasons: reasons,
            rank,
            rankBasis: { programMatch: c.programMatch, continuity: c.continuity, occupancyAfter: c.occupancyAfter, headroom: c.capacityHeadroom },
            explanation: isEligible ? eligibleExplanation(c, req, rank === 0) : reasons[0]!.detail,
        };
    });

    // Display order: eligible first (by rank), then ineligible (by name/id).
    entries.sort((x, y) => {
        if (x.eligible !== y.eligible) return x.eligible ? -1 : 1;
        if (x.eligible) return (x.rank ?? 0) - (y.rank ?? 0);
        return (x.roomName ?? x.roomId).localeCompare(y.roomName ?? y.roomId);
    });

    // Provenance: the age-band rule read per candidate that carried a configured
    // band, binding=true on the top-ranked eligible room (the one the surface will
    // label Recommended). Program/schedule signals are engine-resolved upstream.
    const topRoomId = entries.find((e) => e.rank === 0)?.roomId ?? null;
    const appliedRules: AppliedOperationalRule[] = req.candidates
        .filter((c) => c.ageBand && (c.ageBand.minMonths != null || c.ageBand.maxMonths != null))
        .map((c) => ({
            ruleId: `age_band:${c.roomId}`,
            ruleType: "age_band",
            scopeType: "room",
            scopeId: c.roomId,
            sourceKey: "config",
            binding: c.roomId === topRoomId,
        }));

    if (eligible.length === 0 && req.candidates.length > 0) {
        warnings.push({ code: "no_eligible_room", message: "No room satisfies every hard eligibility rule for this schedule." });
    }

    return { entries, appliedRules, warnings };
}

// ---------------------------------------------------------------------------
// The registered Definition + pure handler
// ---------------------------------------------------------------------------

function evaluateRoomFit(request: RoomFitRequest): HandlerComputation<RoomFitSetValue> {
    const { entries, appliedRules, warnings } = computeRoomFit(request);
    return {
        // A resolved ordering over candidates; `incomplete` when DOB was unknown so
        // the age gate could not be applied (honesty, never a silent pass).
        status: request.dobKnown ? "resolved" : "incomplete",
        value: { kind: "set", entries },
        scope: { type: request.siteLocationId ? "site" : "org", id: request.siteLocationId ?? null },
        effective: { asOf: request.asOf },
        appliedRules,
        warnings,
    };
}

export const PLACEMENT_ROOM_FIT: OperationalCalculationDefinition<RoomFitRequest, RoomFitSetValue> =
    defineOperationalCalculation({
        key: "placement.room_fit",
        family: "placement",
        purpose: "Which rooms is this child eligible for on the proposed start date, and in what fit order?",
        handler: {
            kind: "pure",
            ref: "placement/roomFit.computeRoomFit (over childcareOperational/expectations occupancy signals)",
            engineVersion: ROOM_FIT_ENGINE_VERSION,
            evaluate: evaluateRoomFit,
        },
        ruleShapes: ["eligibility_gate"],
        scopes: ["site", "room"],
        effectiveTime: "as_of",
        resultKind: "set",
        contractVersion: CONTRACT_VERSION,
        consumers: ["scheduling", "placement"],
        // A ranking is NOT an Operational Expectation binding target (doc 05 §7).
        expectationBindable: false,
        logicOwner: "Placement — room eligibility & fit",
        status: "active",
        testingStrategy:
            "Deterministic: too young; ages in by effective date; inactive; at capacity; program mismatch; multiple eligible ranked by headroom; no eligible room.",
    });

/** The Placement family — the room-fit registration set. */
export const PLACEMENT_DEFINITIONS: readonly OperationalCalculationDefinition[] = [
    PLACEMENT_ROOM_FIT,
] as OperationalCalculationDefinition[];
