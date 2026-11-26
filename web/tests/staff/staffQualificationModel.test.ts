/**
 * Staff & Workforce V2 · Slice 3 — the qualification contract.
 *
 * These test the PURE model, which is where the slice's promises live:
 * expiration is derived rather than stored, requirements combine rather than
 * override, and every requirement can say why it applies.
 */

import { describe, expect, it } from "vitest";

import {
    daysUntilExpiry,
    qualificationStanding,
    requirementAppliesTo,
    resolveEffectiveQualificationRequirements,
    resolveRequirementSatisfaction,
    type QualificationRequirementRow,
    type StaffQualificationRow,
} from "@/lib/staffQualifications/staffQualificationModel";

const ORG = "org-1";
const EMP = "emp-1";
const OTHER_EMP = "emp-2";
const CPR = "type-cpr";
const FIRST_AID = "type-first-aid";
const TODAY = "2026-09-20";

function held(over: Partial<StaffQualificationRow> = {}): StaffQualificationRow {
    return {
        id: "q1", org_id: ORG, employment_id: EMP, qualification_type_id: CPR,
        issued_on: "2026-01-01", expires_on: "2027-01-01",
        verification_state: "verified", verified_at: "2026-01-02T00:00:00Z",
        supersedes_qualification_id: null, revoked_at: null, ...over,
    };
}
function req(over: Partial<QualificationRequirementRow> = {}): QualificationRequirementRow {
    return {
        id: "r1", org_id: ORG, qualification_type_id: CPR,
        scope_type: "organization", scope_id: null,
        requirement_level: "required", evidence_required: false,
        effective_start: null, effective_end: null, is_active: true, ...over,
    };
}
const ctx = (over: Record<string, unknown> = {}) => ({ employmentId: EMP, asOf: TODAY, ...over }) as never;

describe("1. expiration is DERIVED from the date, never stored", () => {
    it("is valid before the expiry date", () => {
        expect(qualificationStanding(held({ expires_on: "2027-01-01" }), TODAY)).toBe("valid");
    });

    it("is expired the day AFTER the expiry date", () => {
        expect(qualificationStanding(held({ expires_on: "2026-09-19" }), TODAY)).toBe("expired");
    });

    it("is still valid ON the expiry date — expiry is not exclusive", () => {
        expect(qualificationStanding(held({ expires_on: TODAY }), TODAY)).toBe("valid");
    });

    it("never expires when there is no expiry date", () => {
        expect(qualificationStanding(held({ expires_on: null }), "2099-01-01")).toBe("valid");
    });

    it("is not yet effective when issued in the future", () => {
        expect(qualificationStanding(held({ issued_on: "2026-12-01" }), TODAY)).toBe("not_yet_effective");
    });

    it("revocation beats the dates — a revoked credential is not merely stale", () => {
        expect(qualificationStanding(held({ revoked_at: "2026-05-01T00:00:00Z" }), TODAY)).toBe("revoked");
    });

    it("counts days to expiry, and reports none once past or absent", () => {
        expect(daysUntilExpiry("2026-10-04", TODAY)).toBe(14);
        expect(daysUntilExpiry("2026-09-19", TODAY)).toBeNull();
        expect(daysUntilExpiry(null, TODAY)).toBeNull();
    });
});

describe("2. a requirement applies only to its own scope", () => {
    it("an organization requirement applies to everyone", () => {
        expect(requirementAppliesTo(req(), ctx())).toBe(true);
    });

    it("a position requirement applies only to that position", () => {
        const r = req({ scope_type: "position", scope_id: "pos-director" });
        expect(requirementAppliesTo(r, ctx({ positionId: "pos-director" }))).toBe(true);
        expect(requirementAppliesTo(r, ctx({ positionId: "pos-teacher" }))).toBe(false);
        expect(requirementAppliesTo(r, ctx())).toBe(false);
    });

    it("a site requirement applies only at that site", () => {
        const r = req({ scope_type: "site", scope_id: "site-north" });
        expect(requirementAppliesTo(r, ctx({ siteLocationId: "site-north" }))).toBe(true);
        expect(requirementAppliesTo(r, ctx({ siteLocationId: "site-south" }))).toBe(false);
    });

    it("an assignment-type requirement applies when the employment carries that assignment", () => {
        const r = req({ scope_type: "assignment_type", scope_id: "at-toddler-coverage" });
        expect(requirementAppliesTo(r, ctx({ assignmentTypeIds: ["at-toddler-coverage"] }))).toBe(true);
        expect(requirementAppliesTo(r, ctx({ assignmentTypeIds: ["at-float"] }))).toBe(false);
        expect(requirementAppliesTo(r, ctx({ assignmentTypeIds: [] }))).toBe(false);
    });

    it("respects effective dating and the active flag", () => {
        expect(requirementAppliesTo(req({ effective_start: "2026-12-01" }), ctx())).toBe(false);
        expect(requirementAppliesTo(req({ effective_end: "2026-09-19" }), ctx())).toBe(false);
        expect(requirementAppliesTo(req({ is_active: false }), ctx())).toBe(false);
    });
});

describe("3. contributions COMBINE and explain themselves", () => {
    it("returns the org default with its provenance", () => {
        const [r] = resolveEffectiveQualificationRequirements([req()], ctx());
        expect(r.qualificationTypeId).toBe(CPR);
        expect(r.level).toBe("required");
        expect(r.provenance).toHaveLength(1);
        expect(r.provenance[0].scopeType).toBe("organization");
    });

    it("keeps BOTH reasons when two scopes require the same qualification", () => {
        // "CPR is required organization-wide AND because of Toddler Coverage."
        const rows = [
            req({ id: "org", requirement_level: "recommended" }),
            req({ id: "at", scope_type: "assignment_type", scope_id: "at-toddler", requirement_level: "enforced" }),
        ];
        const [r] = resolveEffectiveQualificationRequirements(rows, ctx({ assignmentTypeIds: ["at-toddler"] }));
        expect(r.provenance.map((p) => p.scopeType).sort()).toEqual(["assignment_type", "organization"]);
        // strongest wins for the level; both reasons survive for the explanation
        expect(r.level).toBe("enforced");
        expect(r.provenance[0].level).toBe("enforced");
    });

    it("requires evidence when ANY contributing scope requires it", () => {
        const rows = [
            req({ id: "org", evidence_required: false }),
            req({ id: "site", scope_type: "site", scope_id: "site-north", evidence_required: true }),
        ];
        const [r] = resolveEffectiveQualificationRequirements(rows, ctx({ siteLocationId: "site-north" }));
        expect(r.evidenceRequired).toBe(true);
    });

    it("drops a type whose only contribution is off, without cancelling other scopes", () => {
        expect(resolveEffectiveQualificationRequirements([req({ requirement_level: "off" })], ctx())).toEqual([]);
        const rows = [
            req({ id: "org", requirement_level: "off" }),
            req({ id: "site", scope_type: "site", scope_id: "s1", requirement_level: "required" }),
        ];
        const [r] = resolveEffectiveQualificationRequirements(rows, ctx({ siteLocationId: "s1" }));
        expect(r.level).toBe("required");
    });

    it("separates distinct qualification types", () => {
        const rows = [req({ id: "a" }), req({ id: "b", qualification_type_id: FIRST_AID })];
        const out = resolveEffectiveQualificationRequirements(rows, ctx());
        expect(out.map((r) => r.qualificationTypeId).sort()).toEqual([CPR, FIRST_AID].sort());
    });
});

describe("4. satisfaction — and WHY, when unsatisfied", () => {
    const requirements = () => resolveEffectiveQualificationRequirements([req()], ctx());

    it("a valid held qualification satisfies its requirement", () => {
        const [s] = resolveRequirementSatisfaction(requirements(), [held()], ctx());
        expect(s.satisfied).toBe(true);
        expect(s.satisfiedBy?.id).toBe("q1");
    });

    it("an expired one does not, and says so", () => {
        const [s] = resolveRequirementSatisfaction(requirements(), [held({ expires_on: "2026-09-19" })], ctx());
        expect(s.satisfied).toBe(false);
        expect(s.reason).toBe("expired");
    });

    it("a future-dated one does not, and is distinguished from missing", () => {
        const [s] = resolveRequirementSatisfaction(requirements(), [held({ issued_on: "2026-12-01" })], ctx());
        expect(s.reason).toBe("not_yet_effective");
    });

    it("nothing held reads as missing, not expired", () => {
        const [s] = resolveRequirementSatisfaction(requirements(), [], ctx());
        expect(s.reason).toBe("missing");
    });

    it("the WRONG qualification type does not satisfy", () => {
        const [s] = resolveRequirementSatisfaction(requirements(), [held({ qualification_type_id: FIRST_AID })], ctx());
        expect(s.reason).toBe("missing");
    });

    it("ANOTHER employment's qualification does not satisfy — grain is enforced", () => {
        const [s] = resolveRequirementSatisfaction(requirements(), [held({ employment_id: OTHER_EMP })], ctx());
        expect(s.satisfied).toBe(false);
        expect(s.reason).toBe("missing");
    });

    it("a renewal satisfies while the superseded expired row does not rescue it", () => {
        const expired = held({ id: "old", expires_on: "2026-09-19" });
        const renewed = held({ id: "new", expires_on: "2027-09-19", supersedes_qualification_id: "old" });
        const [s] = resolveRequirementSatisfaction(requirements(), [expired, renewed], ctx());
        expect(s.satisfied).toBe(true);
        expect(s.satisfiedBy?.id).toBe("new");
    });

    it("evidence is demanded only when the requirement asks for it", () => {
        const withEvidence = resolveEffectiveQualificationRequirements([req({ evidence_required: true })], ctx());
        const none = resolveRequirementSatisfaction(withEvidence, [held()], ctx(), new Map());
        expect(none[0].reason).toBe("evidence_missing");
        const some = resolveRequirementSatisfaction(withEvidence, [held()], ctx(), new Map([["q1", 1]]));
        expect(some[0].satisfied).toBe(true);
    });
});

describe("5. the model persists no verdict", () => {
    it("exports no readiness or expiry flag", async () => {
        const mod = await import("@/lib/staffQualifications/staffQualificationModel");
        for (const forbidden of ["isReady", "setExpired", "markExpired", "persistReadiness"]) {
            expect(mod).not.toHaveProperty(forbidden);
        }
    });

    it("the migration stores no expiry or readiness flag", () => {
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { resolve } = require("node:path") as typeof import("node:path");
        const sql = readFileSync(
            resolve(__dirname, "../../../supabase/migrations/20260926120000_staff_qualifications_v1.sql"),
            "utf8",
        ) as string;
        // Strip BOTH line comments and COMMENT ON literals: the doctrine prose
        // names Readiness precisely to say this slice does not own it, and an
        // assertion that trips on its own documentation measures nothing.
        const body = sql
            .replace(/^--.*$/gm, "")
            .replace(/COMMENT ON[\s\S]*?;/g, "");
        // No stored verdict may appear as a COLUMN.
        expect(body).not.toMatch(/^\s+is_expired\b/m);
        expect(body).not.toMatch(/^\s+is_ready\b/m);
        expect(body).not.toMatch(/^\s+readiness_[a-z_]+\b/m);
        // and expiry must be a date the reader compares, not a flag someone sets
        expect(body).toMatch(/expires_on date/);
    });
});
