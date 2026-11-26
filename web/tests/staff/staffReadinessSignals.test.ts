/**
 * THE SIGNAL IS THE CARD'S ANSWER, RENDERED SMALLER.
 *
 * Slice 6 shows readiness where operators choose staff. The danger in doing that
 * for a POPULATION is that batching the reads quietly becomes rewriting the
 * evaluation — and then two surfaces disagree about the same person and neither
 * is wrong on its own terms.
 *
 * So the load-bearing test here is not "does the signal look right". It is: for
 * the same fixture, does the batch path return exactly what `composeStaffReadiness`
 * returns, employment by employment. Everything else is presentation.
 */
import { describe, expect, it } from "vitest";

import { composeStaffReadiness } from "@/lib/staffReadiness/staffReadinessService";
import {
    composeStaffReadinessSignals,
    summariseStaffReadiness,
} from "@/lib/staffReadiness/staffReadinessSignals";

const ORG = "org-1";
const AS_OF = "2026-09-21";

type Row = Record<string, unknown>;

const FIXTURE: Record<string, Row[]> = {
    employments: [
        { id: "emp-ready", org_id: ORG, person_id: "p-ready", employment_status: "active",
          position_id: null, primary_location_id: "loc-1", start_date: "2025-01-01", end_date: null },
        { id: "emp-missing", org_id: ORG, person_id: "p-missing", employment_status: "active",
          position_id: null, primary_location_id: "loc-1", start_date: "2025-01-01", end_date: null },
        { id: "emp-expired", org_id: ORG, person_id: "p-expired", employment_status: "active",
          position_id: null, primary_location_id: null, start_date: "2025-01-01", end_date: null },
        { id: "emp-ended", org_id: ORG, person_id: "p-ended", employment_status: "ended",
          position_id: null, primary_location_id: null, start_date: "2025-01-01", end_date: "2026-08-01" },
        { id: "emp-other-org", org_id: "org-2", person_id: "p-other", employment_status: "active",
          position_id: null, primary_location_id: null, start_date: "2025-01-01", end_date: null },
    ],
    staff_qualification_types: [
        { id: "t-cpr", org_id: ORG, key: "cpr", label: "CPR", is_active: true, expiration_expected: true },
        { id: "t-aid", org_id: ORG, key: "first_aid", label: "First Aid", is_active: true, expiration_expected: true },
        { id: "t-food", org_id: ORG, key: "food", label: "Food Handler", is_active: true, expiration_expected: true },
    ],
    staff_qualification_requirements: [
        { id: "r-cpr", org_id: ORG, qualification_type_id: "t-cpr", scope_type: "organization",
          scope_id: null, requirement_level: "required", evidence_required: false,
          effective_start: null, effective_end: null, is_active: true },
        { id: "r-aid", org_id: ORG, qualification_type_id: "t-aid", scope_type: "organization",
          scope_id: null, requirement_level: "required", evidence_required: true,
          effective_start: null, effective_end: null, is_active: true },
        // A third requirement, so at least one specimen carries MORE than two gaps.
        // Without it a plant like "more than two gaps means blocked" is a no-op and
        // the agreement test looks stronger than it is.
        { id: "r-food", org_id: ORG, qualification_type_id: "t-food", scope_type: "organization",
          scope_id: null, requirement_level: "recommended", evidence_required: false,
          effective_start: null, effective_end: null, is_active: true },
    ],
    staff_qualifications: [
        { id: "q1", org_id: ORG, employment_id: "emp-ready", qualification_type_id: "t-cpr",
          issued_on: "2026-01-01", expires_on: "2027-01-01", revoked_at: null },
        // Evidence IS required for First Aid and this row HAS it — the batch path must
        // see that, or it reports a compliance problem that does not exist.
        { id: "q2", org_id: ORG, employment_id: "emp-ready", qualification_type_id: "t-aid",
          issued_on: "2026-01-01", expires_on: "2027-01-01", revoked_at: null },
        { id: "q3", org_id: ORG, employment_id: "emp-expired", qualification_type_id: "t-cpr",
          issued_on: "2024-01-01", expires_on: "2024-06-01", revoked_at: null },
        // First Aid is satisfied here, so CPR is the ONE concern and the summary
        // must name it rather than counting to one.
        { id: "q4", org_id: ORG, employment_id: "emp-expired", qualification_type_id: "t-aid",
          issued_on: "2026-01-01", expires_on: "2027-01-01", revoked_at: null },
        { id: "q5", org_id: ORG, employment_id: "emp-expired", qualification_type_id: "t-food",
          issued_on: "2026-01-01", expires_on: "2027-01-01", revoked_at: null },
        { id: "q6", org_id: ORG, employment_id: "emp-ready", qualification_type_id: "t-food",
          issued_on: "2026-01-01", expires_on: "2027-01-01", revoked_at: null },
    ],
    staff_qualification_evidence: [
        { staff_qualification_id: "q2", org_id: ORG },
        { staff_qualification_id: "q4", org_id: ORG },
    ],
    schedule_assignments: [],
    locations: [{ id: "loc-1", org_id: ORG, label: "North Campus", name: undefined }],
};

/** A query double that filters the fixture the way PostgREST would. */
function fakeSupabase() {
    const make = (table: string) => {
        let rows = (FIXTURE[table] ?? []).map((r) => ({ ...r }));
        const api: Record<string, unknown> = {
            select: () => api,
            order: () => api,
            eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return api; },
            in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col] as never)); return api; },
            lte: (col: string, val: string) => {
                rows = rows.filter((r) => r[col] == null || String(r[col]) <= val); return api;
            },
            maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
            then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
        };
        return api;
    };
    return { from: (table: string) => make(table) } as never;
}

const IDS = ["emp-ready", "emp-missing", "emp-expired", "emp-ended"];

describe("the batch signal is the same evaluation as the card", () => {
    it("agrees with composeStaffReadiness for every employment", async () => {
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, IDS, AS_OF);
        for (const id of IDS) {
            const single = await composeStaffReadiness(fakeSupabase(), ORG, id, AS_OF, "record_view");
            const signal = signals.get(id);
            expect(signal, `no signal for ${id}`).toBeTruthy();
            expect(signal!.state, `state disagrees for ${id}`).toBe(single.readiness.primary_state);
            expect(signal!.concern_count, `gap count disagrees for ${id}`).toBe(single.readiness.gaps.length);
            expect(signal!.summary, `summary disagrees for ${id}`)
                .toBe(summariseStaffReadiness(single.readiness));
        }
    });

    it("counts evidence, so a credential that HAS evidence is not reported missing", async () => {
        // The first version of the batch path passed an empty evidence map. First Aid
        // sets evidenceRequired, so every holder looked non-compliant.
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, IDS, AS_OF);
        expect(signals.get("emp-ready")!.state).toBe("ready");
        expect(signals.get("emp-ready")!.summary).toBe("");
    });
});

describe("the signal is advisory and cannot become an instruction", () => {
    it("never reports a blocking concern, whatever the requirement level", async () => {
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, IDS, AS_OF);
        for (const id of IDS) {
            const single = await composeStaffReadiness(fakeSupabase(), ORG, id, AS_OF, "record_view");
            expect(single.readiness.counts.blocking, `${id} must not block`).toBe(0);
            expect(single.readiness.gaps.every((g) => g.blocking === false)).toBe(true);
            expect(signals.get(id)!.tone).not.toBe("blocked");
        }
    });

    it("uses factual operator copy, never permission language", async () => {
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, IDS, AS_OF);
        const forbidden = /cannot|not permitted|blocked|override|acknowledge|denied|forbidden/i;
        for (const s of signals.values()) {
            expect(s.summary, `"${s.summary}" reads as permission`).not.toMatch(forbidden);
        }
        expect(signals.get("emp-expired")!.summary).toBe("CPR expired");
        expect(signals.get("emp-expired")!.tone).toBe("expired");
    });

    it("names a single concern and counts several", async () => {
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, IDS, AS_OF);
        // emp-missing holds nothing, so both org-wide requirements are open.
        expect(signals.get("emp-missing")!.summary).toBe("3 staff requirements need attention");
        expect(signals.get("emp-missing")!.concern_count).toBe(3);
    });

    it("a ready employment carries no warning at all", async () => {
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, IDS, AS_OF);
        expect(signals.get("emp-ready")!.tone).toBe("ready");
        expect(signals.get("emp-ready")!.concern_count).toBe(0);
    });
});

describe("the signal cannot leak across employments or organizations", () => {
    it("does not answer for an employment in another organization", async () => {
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, ["emp-other-org"], AS_OF);
        expect(signals.has("emp-other-org")).toBe(false);
    });

    it("one employment's credential does not satisfy another's requirement", async () => {
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, IDS, AS_OF);
        // emp-ready holds CPR; emp-missing must still be short of it.
        expect(signals.get("emp-ready")!.state).toBe("ready");
        expect(signals.get("emp-missing")!.state).not.toBe("ready");
    });

    it("an ended employment says so, and does not read as an active-work warning", async () => {
        const signals = await composeStaffReadinessSignals(fakeSupabase(), ORG, IDS, AS_OF);
        const ended = signals.get("emp-ended")!;
        expect(ended.summary).toBe("Active employment");
        expect(ended.summary).not.toMatch(/expired|missing|requirement/i);
    });
});
