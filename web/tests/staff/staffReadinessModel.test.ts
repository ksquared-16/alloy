/**
 * READINESS IS A PROJECTION OF THE ENGINE, NOT A SECOND ENGINE.
 *
 * The risk in a slice like this is a Staff-shaped evaluator that computes "blocked"
 * its own way while wearing the platform's types. These tests pin the opposite: the
 * gap vocabulary, the level ladder, the primary-state derivation and the blocking
 * rule are all the canonical ones, and Staff supplies only the facts.
 *
 * The most important assertion here is that a card read NEVER blocks. Enforcement
 * is Slice 6's, and it arrives by changing the TRIGGER at a seam — not by changing
 * this evaluator — because `isReadinessBlockingTrigger` already admits only
 * action_execute, form_submit and status_transition.
 */
import { describe, expect, it } from "vitest";

import { READINESS_PHASE_1_SCOPE_TYPES } from "@/lib/completion/readinessTypes";
import {
    evaluateStaffReadiness,
    explainProvenance,
    gapLevelFromRequirementLevel,
    type StaffReadinessInput,
} from "@/lib/staffReadiness/staffReadinessModel";
import type { RequirementSatisfaction } from "@/lib/staffQualifications/staffQualificationModel";

const TYPES: Record<string, string> = { "t-cpr": "CPR Certification", "t-aid": "First Aid" };

function sat(over: Partial<RequirementSatisfaction> & { level?: string; reason?: string; typeId?: string } = {}): RequirementSatisfaction {
    const typeId = over.typeId ?? "t-cpr";
    return {
        requirement: {
            qualificationTypeId: typeId,
            level: (over.level ?? "required") as never,
            evidenceRequired: false,
            provenance: over.requirement?.provenance ?? [
                { requirementId: "r1", scopeType: "organization", scopeId: null, level: (over.level ?? "required") as never },
            ],
        },
        satisfiedBy: null,
        satisfied: over.satisfied ?? false,
        reason: (over.reason ?? "missing") as never,
    } as RequirementSatisfaction;
}

function input(over: Partial<StaffReadinessInput> = {}): StaffReadinessInput {
    return {
        orgId: "org-1",
        trigger: over.trigger ?? "record_view",
        context: {
            employmentId: "emp-1", positionId: null, siteLocationId: "site-1",
            siteLabel: "North Campus", assignmentTypeIds: [], asOf: "2026-09-28",
        },
        employment: { status: "active", isOpen: true, startDate: "2026-01-01", endDate: null },
        satisfaction: over.satisfaction ?? [],
        typeLabel: (id) => TYPES[id] ?? "Qualification",
        ...over,
    };
}

describe("the subject is the EMPLOYMENT", () => {
    it("binds to employment, never to a person", () => {
        const r = evaluateStaffReadiness(input());
        expect(r.subject).toEqual({ entity_type: "employment", entity_id: "emp-1" });
        // The same human can be ready for one employer and not another, so a
        // person-grain subject would be wrong the first time that happened.
        expect(JSON.stringify(r.subject)).not.toMatch(/person/i);
    });

    it("every gap carries the employment as its entity", () => {
        const r = evaluateStaffReadiness(input({ satisfaction: [sat()] }));
        expect(r.gaps[0]!.entity_type).toBe("employment");
        expect(r.gaps[0]!.entity_id).toBe("emp-1");
    });
});

describe("nothing blocks on a card read — enforcement is Slice 6's", () => {
    it("an ENFORCED gap is not blocking under record_view", () => {
        const r = evaluateStaffReadiness(input({ trigger: "record_view", satisfaction: [sat({ level: "enforced" })] }));
        expect(r.gaps[0]!.level).toBe("enforced");
        expect(r.gaps[0]!.blocking).toBe(false);
        expect(r.primary_state).toBe("needs_information");
        expect(r.ok).toBe(true);
    });

    it("the SAME gap blocks under an enforcing trigger — the seam is the trigger", () => {
        // This is what makes Slice 6 a change of caller rather than a change of rule.
        const r = evaluateStaffReadiness(input({ trigger: "action_execute", satisfaction: [sat({ level: "enforced" })] }));
        expect(r.gaps[0]!.blocking).toBe(true);
        expect(r.primary_state).toBe("blocked");
        expect(r.ok).toBe(false);
    });

    it("a required or recommended gap never blocks, whatever the trigger", () => {
        for (const level of ["required", "recommended", "suggested"]) {
            const r = evaluateStaffReadiness(input({ trigger: "action_execute", satisfaction: [sat({ level })] }));
            expect(r.gaps[0]!.blocking, `${level} must not block`).toBe(false);
        }
    });
});

describe("level mapping does not promote advice into an alarm", () => {
    it("maps the five config levels onto the three gap levels", () => {
        expect(gapLevelFromRequirementLevel("enforced")).toBe("enforced");
        expect(gapLevelFromRequirementLevel("required")).toBe("required");
        expect(gapLevelFromRequirementLevel("recommended")).toBe("recommended");
        // `suggested` lands on the weakest gap level rather than being promoted.
        expect(gapLevelFromRequirementLevel("suggested")).toBe("recommended");
    });
});

describe("failure kind and scope use the engine's existing vocabulary", () => {
    it("an expired qualification is a FRESHNESS gap and drives the expired state", () => {
        const r = evaluateStaffReadiness(input({ satisfaction: [sat({ reason: "expired" })] }));
        expect(r.gaps[0]!.scope_type).toBe("freshness");
        expect(r.gaps[0]!.failure_kind).toBe("expired");
        // Expired outranks "needs information" on the canonical ladder.
        expect(r.primary_state).toBe("expired");
        // The operator sees "has expired", never "not held" — they go to different places.
        expect(r.gaps[0]!.missing_reason).toContain("has expired");
    });

    it("missing evidence is a PACKET gap and reads as incomplete, not missing", () => {
        const r = evaluateStaffReadiness(input({ satisfaction: [sat({ reason: "evidence_missing" })] }));
        expect(r.gaps[0]!.scope_type).toBe("packet");
        expect(r.gaps[0]!.failure_kind).toBe("incomplete");
        expect(r.gaps[0]!.missing_reason).toContain("no supporting evidence");
    });

    it("a never-held qualification is a RECORD gap", () => {
        const r = evaluateStaffReadiness(input({ satisfaction: [sat({ reason: "missing" })] }));
        expect(r.gaps[0]!.scope_type).toBe("record");
        expect(r.gaps[0]!.failure_kind).toBe("missing");
        // Phase 1 activated only `record`; freshness and packet are reached here for
        // the first time, which is why the scope types are asserted explicitly.
        expect(READINESS_PHASE_1_SCOPE_TYPES).toEqual(["record"]);
    });
});

describe("explainability names the authority, not a rule key", () => {
    it("carries every contributing scope into the reason", () => {
        const s = sat({ level: "enforced" });
        s.requirement.provenance = [
            { requirementId: "r1", scopeType: "site", scopeId: "site-1", level: "enforced" },
            { requirementId: "r2", scopeType: "organization", scopeId: null, level: "required" },
        ] as never;
        const r = evaluateStaffReadiness(input({ satisfaction: [s] }));
        expect(r.gaps[0]!.missing_reason).toContain("this site");
        expect(r.gaps[0]!.missing_reason).toContain("organization-wide");
        // The label is the credential's name, not an identifier.
        expect(r.gaps[0]!.label).toBe("CPR Certification");
        expect(r.gaps[0]!.missing_reason).not.toMatch(/t-cpr|requirement_id/);
    });

    it("uses supplied scope labels when the caller can resolve them", () => {
        // The caller supplies a PHRASE, because the label is substituted into
        // "Required ___" alongside defaults like "organization-wide".
        const s = sat();
        s.requirement.provenance = [{ requirementId: "r1", scopeType: "site", scopeId: "site-1", level: "required" }] as never;
        expect(explainProvenance(s, () => "at North Campus")).toBe("Required at North Campus");
    });

    it("offers a resolution that points at the canonical command", () => {
        const r = evaluateStaffReadiness(input({ satisfaction: [sat()] }));
        expect(r.gaps[0]!.resolution).toEqual({ type: "action", action_key: "staff_qualification.record" });
    });
});

describe("the employment itself", () => {
    it("is ready when open with no unmet requirements", () => {
        const r = evaluateStaffReadiness(input({ satisfaction: [sat({ satisfied: true, reason: "satisfied" })] }));
        expect(r.primary_state).toBe("ready");
        expect(r.gaps).toEqual([]);
        expect(r.counts.satisfied).toBe(1);
    });

    it("an ended employment reports ONLY that, not every credential it lacks", () => {
        const r = evaluateStaffReadiness(input({
            employment: { status: "ended", isOpen: false, startDate: "2025-01-01", endDate: "2026-06-30" },
            satisfaction: [sat(), sat({ typeId: "t-aid" })],
        }));
        // Listing every missing credential for a former employee would bury the one
        // fact that explains all of them.
        expect(r.gaps).toHaveLength(1);
        expect(r.gaps[0]!.requirement_id).toBe("staff_employment:open_period");
        expect(r.gaps[0]!.missing_reason).toContain("has ended");
    });

    it("a future employment is distinguished from an ended one", () => {
        const r = evaluateStaffReadiness(input({
            employment: { status: "pending_start", isOpen: false, startDate: "2027-01-01", endDate: null },
            satisfaction: [sat()],
        }));
        expect(r.gaps[0]!.missing_reason).toContain("not started yet");
    });
});

describe("gap ordering and counts", () => {
    it("puts the strongest gap first", () => {
        const r = evaluateStaffReadiness(input({
            satisfaction: [sat({ level: "recommended", typeId: "t-aid" }), sat({ level: "enforced" })],
        }));
        expect(r.gaps.map((g) => g.level)).toEqual(["enforced", "recommended"]);
        expect(r.counts.by_level).toEqual({ recommended: 1, required: 0, enforced: 1 });
        expect(r.counts.gaps_total).toBe(2);
    });
});

describe("availability is deliberately not an input", () => {
    it("the evaluator accepts no availability at all", () => {
        // "Not available Tuesday at 2pm" is not "not ready as staff". The absence is
        // the assertion: there is no field through which a momentary exception could
        // reach a global readiness verdict.
        const keys = Object.keys(input());
        expect(keys).not.toContain("availability");
        expect(JSON.stringify(evaluateStaffReadiness(input()))).not.toMatch(/availab/i);
    });
});

describe("nothing is persisted", () => {
    it("emits no is_ready and no readiness row identity", () => {
        const r = evaluateStaffReadiness(input({ satisfaction: [sat()] }));
        const json = JSON.stringify(r);
        expect(json).not.toMatch(/is_ready/);
        expect(json).not.toMatch(/readiness_status/);
        expect(r).not.toHaveProperty("id");
        // It is a computed answer with a timestamp, not a stored one.
        expect(r.evaluated_at).toBeTruthy();
    });
});

describe("provenance reads as a sentence, not a slot-fill", () => {
    // `explainProvenance` substitutes the scope label into "Required ___", beside
    // defaults like "organization-wide" and "this site". A bare site name produced
    // "Required North Campus." — it named the site, which was the point of the fix,
    // and still read wrong. The label is a phrase.
    it("a named site reads as a place, not a subject", () => {
        const sat = {
            requirement: { qualificationTypeId: "t1", level: "required" as const,
                provenance: [{ scopeType: "site", scopeId: "loc-1" }] },
            satisfied: false, reason: "missing" as const,
        };
        const why = explainProvenance(sat as never, (scopeType, scopeId) =>
            scopeType === "site" && scopeId === "loc-1" ? "at North Campus" : "");
        expect(why).toBe("Required at North Campus");
        expect(why, "a bare noun after 'Required' is not a sentence").not.toBe("Required North Campus");
    });

    it("falls back to the generic phrase when the site cannot be named", () => {
        const sat = {
            requirement: { qualificationTypeId: "t1", level: "required" as const,
                provenance: [{ scopeType: "site", scopeId: "loc-1" }] },
            satisfied: false, reason: "missing" as const,
        };
        expect(explainProvenance(sat as never, () => "")).toBe("Required this site");
    });
});
