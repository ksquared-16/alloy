import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/runtime/provisioning/workUnitProcessPopulation", () => ({
    loadWorkUnitProcessPopulation: vi.fn(async () => ({ rows: [
        { id: "o1", name: "Row One", stage_key: "lead", stage_entered_at: "2026-09-01", primary_person_id: "p1", location_id: "l1", customer_id: "c1", metadata: {} },
    ], truncated: false })),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM", () => ({ buildAttendanceCardVM: vi.fn(async () => ({ todayLabel: "No record" })) }));
vi.mock("@/lib/completion/loadCustomerMemberProfileFields", () => ({ loadCustomerMemberProfileFieldsByMemberId: vi.fn(async () => new Map([["m1", { gender: "female" }]])) }));
vi.mock("@/lib/financials/prepaid/readAccountPrepaidPosition", () => ({ readAccountPrepaidPosition: vi.fn(async () => ({
    outcome: { state: "ok", position: { availableCents: 12500, pendingCents: 0, heldCents: 0 } },
    diagnostics: { queryCount: 7, agreementCount: 4, paymentCount: 2 },
})) }));
vi.mock("@/lib/workspace/enrichOpportunityQueueProjection", () => ({ enrichOpportunityRowsWithCrmProjection: vi.fn(async () => new Map()) }));
vi.mock("@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue", () => ({ enrichOpportunityRowsWithChildrenForCompactQueue: vi.fn(async () => new Map([["o1", {}]])) }));
vi.mock("@/lib/queues/operatorStageMembershipAck", () => ({ loadAcknowledgedOccurrenceKeys: vi.fn(async () => new Set<string>()) }));

import { composeFirstOrderWorkUnitProjection } from "@/lib/runtime/firstOrder/composeFirstOrderWorkUnitProjection";
import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";
import { enrichOpportunityRowsWithChildrenForCompactQueue } from "@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue";

const SRC = readFileSync(resolve(process.cwd(), "lib/runtime/firstOrder/composeFirstOrderWorkUnitProjection.ts"), "utf8");
const DECLARATIONS = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const SIX = ["business_process", "financials", "children", "household", "attendance", "health_safety"];
const base = (over: Record<string, unknown> = {}) => ({
    supabase: {} as never,
    orgId: "org-1", workUnitId: "wu-1", viewerId: "u1",
    customerMemberId: "m1", householdId: "h1",
    configuration: { cardKeys: SIX, kpiKeys: ["a", "b", "c"], workViewIds: ["v1", "v2"], siteScopeId: null },
    authority: { financialsRead: true, healthView: true },
    ...over,
});

describe("configuration drives execution", () => {
    it("runs the configured six-card set", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.timing.executedResolvers).toEqual(expect.arrayContaining(["population", "attendance", "health_profile", "prepaid", "children"]));
        expect(Object.keys(r.projection.cards).sort()).toEqual([...SIX].sort());
    });

    it("AN UNCONFIGURED CARD DOES NOT EXECUTE ITS RESOLVER", async () => {
        vi.mocked(readAccountPrepaidPosition).mockClear();
        vi.mocked(buildAttendanceCardVM).mockClear();
        vi.mocked(loadCustomerMemberProfileFieldsByMemberId).mockClear();
        vi.mocked(enrichOpportunityRowsWithChildrenForCompactQueue).mockClear();
        const r = await composeFirstOrderWorkUnitProjection(base({
            configuration: { cardKeys: ["business_process", "household"], kpiKeys: [], workViewIds: [], siteScopeId: null },
        }) as never);
        expect(readAccountPrepaidPosition).not.toHaveBeenCalled();
        expect(buildAttendanceCardVM).not.toHaveBeenCalled();
        expect(loadCustomerMemberProfileFieldsByMemberId).not.toHaveBeenCalled();
        expect(enrichOpportunityRowsWithChildrenForCompactQueue).not.toHaveBeenCalled();
        expect(r.timing.executedResolvers).not.toEqual(expect.arrayContaining(["prepaid", "attendance", "health_profile", "children"]));
    });

    it("card membership comes from configuration, never from a list in the source", () => {
        /*
         * The composer legitimately BRANCHES on a card key to know which summary to assemble —
         * that is dispatch, not membership. What it must never contain is a MEMBERSHIP LIST, which
         * is what would make today's six-card specimen into architecture.
         *
         * An earlier version of this test forbade the key strings outright and contradicted its
         * own comment; the branch is fine, the list is not.
         */
        expect(DECLARATIONS).not.toMatch(/cardKeys\s*=\s*\[/);
        expect(DECLARATIONS).not.toMatch(/\[\s*"business_process"\s*,/);
        expect(DECLARATIONS).toContain("cfg.cardKeys");
        // Membership is iterated from configuration, so an added card needs no code change here.
        expect(DECLARATIONS).toMatch(/for \(const cardKey of cfg\.cardKeys\)/);
    });

    it("reordering configuration reorders geometry and identity together", async () => {
        const rev = [...SIX].reverse();
        const r = await composeFirstOrderWorkUnitProjection(base({
            configuration: { cardKeys: rev, kpiKeys: [], workViewIds: [], siteScopeId: null },
        }) as never);
        expect(r.projection.geometry.cardOrder).toEqual(rev);
        expect(r.projection.configurationIdentity.cardKeys).toEqual(rev);
    });
});

describe("state semantics are never collapsed", () => {
    it("FORBIDDEN financials is forbidden, not empty and not zero", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base({ authority: { financialsRead: false, healthView: true } }) as never);
        expect(r.projection.cards.financials.facts.availableCents.state).toBe("forbidden");
        expect(JSON.stringify(r.projection.cards.financials)).not.toContain('"value":0');
    });

    it("a FAILED prepaid read is unavailable, never zero", async () => {
        vi.mocked(readAccountPrepaidPosition).mockResolvedValueOnce({
            outcome: { state: "unavailable", reason: "holds unreadable" },
            diagnostics: { queryCount: 7, agreementCount: 0, paymentCount: 2 },
        } as never);
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.projection.cards.financials.facts.availableCents.state).toBe("unavailable");
    });

    it("a THROWN resolver is unavailable, never an empty value", async () => {
        vi.mocked(buildAttendanceCardVM).mockRejectedValueOnce(new Error("down"));
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.projection.cards.attendance.facts.today.state).toBe("unavailable");
    });

    it("a FAILED HEALTH read is unavailable, not a count of zero", async () => {
        /*
         * FOUND BY THE PLANT BATTERY, not by review. Plant D made profileFactCount unconditionally
         * `known(...)`, so a failed health read would report ZERO facts — and every gate stayed
         * green, because the thrown-resolver test above covers ATTENDANCE and nothing covered
         * health. "Zero care notes" and "we could not read the care notes" are different answers
         * and an operator cannot tell them apart on the card.
         */
        vi.mocked(loadCustomerMemberProfileFieldsByMemberId).mockRejectedValueOnce(new Error("down"));
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.projection.cards.health_safety.facts.profileFactCount.state).toBe("unavailable");
        expect(JSON.stringify(r.projection.cards.health_safety)).not.toContain('"value":0');
    });

    it("KNOWN ZERO survives as a real answer", async () => {
        vi.mocked(readAccountPrepaidPosition).mockResolvedValueOnce({
            outcome: { state: "ok", position: { availableCents: 0, pendingCents: 0, heldCents: 0 } },
            diagnostics: { queryCount: 7, agreementCount: 0, paymentCount: 0 },
        } as never);
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const f = r.projection.cards.financials.facts.availableCents;
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toBe(0);
    });

    it("unresolved KPI and Work View totals are UNKNOWN, not zero", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(Object.values(r.projection.kpiValues).every((f) => f.state === "unknown")).toBe(true);
        expect(Object.values(r.projection.workViewTotals).every((f) => f.state === "unknown")).toBe(true);
    });
});

describe("the DAG is not accidentally serialized", () => {
    it("phase 1 resolvers start together", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const p1 = r.timing.spans.filter((s) => ["population", "attendance", "health_profile", "prepaid"].includes(s.name));
        expect(p1.length).toBeGreaterThan(1);
        // Independent work sharing a start offset is the property; sequential writing would show
        // each one beginning where the previous ended.
        expect(Math.max(...p1.map((s) => s.at))).toBeLessThanOrEqual(Math.min(...p1.map((s) => s.at)) + 5);
    });

    it("PHASE 2 WAITS ON POPULATION ALONE, not on the whole of phase 1", async () => {
        /*
         * THE GATE THAT WAS MISSING, and the defect it now catches was real.
         *
         * The first composer awaited the entire phase-1 `Promise.all` before starting the
         * population-dependent work. Shadow measurement showed population finishing at 127ms while
         * CRM, children and personal_seen did not start until 328ms — waiting on `prepaid`, which
         * none of them consume. Children then bound the DAG at 576ms instead of ~375ms: 200ms
         * spent on a dependency that does not exist, out of a budget with ~170ms of margin.
         *
         * My earlier gate asserted phase-1 resolvers share a start offset. They did. It tested the
         * property I was thinking about rather than the one that mattered, so it stayed green
         * through the defect. This one pins the dependency edge itself.
         */
        const slowPrepaid = new Promise((r) => setTimeout(() => r({
            outcome: { state: "ok", position: { availableCents: 0, pendingCents: 0, heldCents: 0 } },
            diagnostics: { queryCount: 7, agreementCount: 0, paymentCount: 0 },
        }), 60));
        vi.mocked(readAccountPrepaidPosition).mockReturnValueOnce(slowPrepaid as never);
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const span = (n: string) => r.timing.spans.find((s) => s.name === n);
        const pop = span("population")!;
        const crm = span("crm")!;
        const prepaid = span("prepaid")!;
        expect(prepaid.end).toBeGreaterThan(pop.end);
        // The dependent phase must begin at the population's end, NOT at the slow sibling's.
        expect(crm.at, "phase 2 started late — it is waiting on more than population")
            .toBeLessThan(prepaid.end);
    });

    it("THE GATE: the composer calls no full-composer, drawer or Financials VM owner", () => {
        for (const banned of ["composeWorkUnitProvisioningAnswer", "buildFinancialsCardVM", "resolveHouseholdPaymentViews", "drawer"]) {
            expect(DECLARATIONS, `${banned} would restore the coupling A′ exists to remove`).not.toContain(banned);
        }
    });

    it("read time and assembly time are reported separately", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.timing.readDagMs).toBeGreaterThanOrEqual(0);
        expect(r.timing.assemblyMs).toBeGreaterThanOrEqual(0);
        expect(r.timing.totalMs).toBeGreaterThanOrEqual(r.timing.readDagMs);
    });
});
