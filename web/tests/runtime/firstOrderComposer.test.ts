import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/runtime/provisioning/workUnitProcessPopulation", () => ({
    loadWorkUnitProcessPopulation: vi.fn(async () => ({ rows: [
        // `customer_id` IS the household the request names. An incoherent fixture would resolve no
        // subject record and then every household/children/process gate below would pass on
        // UNKNOWN without ever exercising the projection.
        { id: "o1", name: "Row One", updated_at: "2026-09-10T00:00:00Z", stage_key: "lead", stage_entered_at: "2026-09-01", primary_person_id: "p1", location_id: "l1", customer_id: "h1", metadata: {} },
        { id: "o2", name: "Row Two", stage_key: "tour", stage_entered_at: "2026-09-02", primary_person_id: "p2", location_id: "l1", customer_id: "h2", metadata: {} },
        /*
         * A THIRD ROW, so the enrichment MAP's size (3) cannot coincide with the subject's child
         * count (2). With two rows the plant that restored `children.size` stayed green — the
         * fixture agreed with the defect by arithmetic accident, which is exactly the collision
         * the comment below warned about and did not prevent.
         */
        { id: "o3", name: "Row Three", stage_key: "lead", stage_entered_at: "2026-09-03", primary_person_id: "p3", location_id: "l1", customer_id: "h3", metadata: {} },
    ], truncated: false })),
}));
/*
 * THE ATTENDANCE MOCK RETURNS THE OWNER'S REAL SHAPE.
 *
 * It used to return `{ todayLabel: "No record" }` — a property `AttendanceCardVM` has never
 * declared. The composer read that property, the cast made it typecheck, and a SUCCESSFUL
 * attendance read published `known("")`. The stub agreed with the defect, so the gate below was
 * green against a false KNOWN for the life of the composer. A stub that invents the contract
 * cannot catch a contract loss.
 */
vi.mock("@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM", () => ({ buildAttendanceCardVM: vi.fn(async () => ({
    participant: { customerMemberId: "m1", displayName: "Ada" },
    date: "2026-09-21",
    expected: { expected: true, roomLocationId: "r1", roomLabel: "Toddler A" },
    state: "not_arrived",
    checkInAt: null, checkOutAt: null, currentRoomLocationId: null, currentRoomLabel: null,
    movements: [], recentDays: [], history: [], corrected: false, siteRooms: [],
    unavailableReason: null,
})) }));
vi.mock("@/lib/runtime/firstOrder/readWorkUnitProcessConfiguration", () => ({
    readWorkUnitProcessConfiguration: vi.fn(async () => ({ workUnitId: "wu-1", departmentId: "d1", departmentMetadata: { LIFECYCLE: true } })),
}));
vi.mock("@/lib/runtime/firstOrder/readHealthFirstOrderSupplements", () => ({
    readHealthFirstOrderSupplements: vi.fn(async () => ({ requirementsSatisfied: 2, requirementsTotal: 4, emergencyContactCount: 3 })),
}));
/*
 * The rail BUILDER is mocked, not its configuration document. The builder is a pure function with
 * its own owner and its own tests; what this suite must pin is that the composer asks it, and
 * states its answers — including its null — in the right first-order states.
 */
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail", () => ({
    buildOpportunityWorkspaceLifecycleRail: vi.fn(() => ({
        stages: [{ key: "lead", label: "Lead" }, { key: "tour", label: "Tour" }, { key: "enrolled", label: "Enrolled" }],
        current_stage_key: "lead",
        process_name: "Enrollment",
    })),
}));
vi.mock("@/lib/completion/loadCustomerMemberProfileFields", () => ({ loadCustomerMemberProfileFieldsByMemberId: vi.fn(async () => new Map([["m1", { gender: "female" }]])) }));
vi.mock("@/lib/financials/prepaid/readAccountPrepaidPosition", () => ({ readAccountPrepaidPosition: vi.fn(async () => ({
    outcome: { state: "ok", position: { availableCents: 12500, pendingCents: 0, heldCents: 0 } },
    diagnostics: { queryCount: 7, agreementCount: 4, paymentCount: 2 },
})) }));
vi.mock("@/lib/workspace/enrichOpportunityQueueProjection", () => ({ enrichOpportunityRowsWithCrmProjection: vi.fn(async () => new Map([
    ["o1", { _primary_contact_name: "Cara L", _primary_contact_line: "Cara L · cara@x.test", _location_label: "North Campus" }],
])) }));
vi.mock("@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue", () => ({ enrichOpportunityRowsWithChildrenForCompactQueue: vi.fn(async () => new Map([
    // TWO children on the subject, and a SECOND row in the map. The map's size is 2 and the
    // subject's child count is 2 for different reasons, so the fixture below deliberately makes
    // them differ where it matters (see the child-count gate).
    /*
     * `customer_member_id` and `display_name` are REQUIRED by the canonical normalizer:
     * `filterInquiryChildRowsForDrawer` drops a row carrying neither, because a child with no
     * identity cannot be placed. The first version of this fixture supplied only first/last name
     * and the normalizer dropped both children — the rule was right and the fixture was not.
     */
    ["o1", {
        _inquiry_children: [
            { id: "ch1", customer_member_id: "cm1", display_name: "Ada L", outcome_status_key: "enrolling" },
            { id: "ch2", customer_member_id: "cm2", display_name: "Bo L", outcome_status_key: "declined" },
        ],
        // The enricher's UNIFIED key, written by BOTH its branches — the source the children
        // capability reads. A fixture with only `_inquiry_children` hid a live defect where a
        // household-derived roster projected zero.
        _crm_compact_children: [
            { primary: "Ada L", secondary: null, customerMemberId: "cm1" },
            { primary: "Bo L", secondary: null, customerMemberId: "cm2" },
        ],
    }],
    ["o2", { _inquiry_children: [{ id: "ch9", customer_member_id: "cm9", display_name: "Zed Q" }] }],
    ["o3", { _inquiry_children: [] }],
])) }));
vi.mock("@/lib/runtime/firstOrder/readAccountLedgerPosition", () => ({
    readAccountLedgerPosition: vi.fn(async () => ({
        state: "ok", periodKey: "2026-09",
        reconciliation: {
            grossCents: 120000, discountsCents: -20000, fundingCents: 0, adjustmentsCents: 0,
            responsibilityCents: 100000, paymentsCents: 40000, balanceCents: 60000,
            scheduledCents: 0, draftCents: 0,
        },
        pastDue: { amountCents: 25000, oldestDueDate: "2026-08-01", agingDays: 51 },
    })),
}));
vi.mock("@/lib/queues/operatorStageMembershipAck", () => ({ loadAcknowledgedOccurrenceKeys: vi.fn(async () => new Set<string>()) }));

import { composeFirstOrderWorkUnitProjection } from "@/lib/runtime/firstOrder/composeFirstOrderWorkUnitProjection";
import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";
import { enrichOpportunityRowsWithChildrenForCompactQueue } from "@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue";
import { resolveFirstOrderSurfaceConfiguration } from "@/lib/runtime/firstOrder/resolveFirstOrderSurfaceConfiguration";
import { loadWorkUnitProcessPopulation } from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { readWorkUnitProcessConfiguration } from "@/lib/runtime/firstOrder/readWorkUnitProcessConfiguration";
import { readHealthFirstOrderSupplements } from "@/lib/runtime/firstOrder/readHealthFirstOrderSupplements";

const SRC = readFileSync(resolve(process.cwd(), "lib/runtime/firstOrder/composeFirstOrderWorkUnitProjection.ts"), "utf8");
const DECLARATIONS = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const SIX = ["business_process", "financials", "children", "household", "attendance", "health_safety"];

/** Today's Enrollment surface, resolved the way the product resolves it. */
const surface = (over: Partial<Parameters<typeof resolveFirstOrderSurfaceConfiguration>[0]> = {}) =>
    resolveFirstOrderSurfaceConfiguration({
        cardKeys: SIX, kpiKeys: ["a", "b", "c"], workViewIds: ["v1", "v2"], siteScopeId: null, ...over,
    });

const base = (over: Record<string, unknown> = {}) => ({
    supabase: {} as never,
    orgId: "org-1", workUnitId: "wu-1", viewerId: "u1",
    customerMemberId: "m1", householdId: "h1",
    configuration: surface(),
    authority: { financialsRead: true, healthView: true },
    ...over,
});

describe("configuration drives execution", () => {
    it("runs the configured six-card set", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.timing.executedResolvers).toEqual(expect.arrayContaining([
            "population", "attendance_fold", "health_profile", "prepaid_position", "children_projection",
        ]));
        expect(Object.keys(r.projection.cards).sort()).toEqual([...SIX].sort());
    });

    it("AN UNCONFIGURED CARD DOES NOT EXECUTE ITS RESOLVER", async () => {
        vi.mocked(readAccountPrepaidPosition).mockClear();
        vi.mocked(buildAttendanceCardVM).mockClear();
        vi.mocked(loadCustomerMemberProfileFieldsByMemberId).mockClear();
        vi.mocked(enrichOpportunityRowsWithChildrenForCompactQueue).mockClear();
        /*
         * `business_process` alone. Household is no longer a valid control here: it declares
         * `children.count`, so the children read IS one of its prerequisites, and asserting it
         * must not run would be asserting the compiler is broken.
         */
        const r = await composeFirstOrderWorkUnitProjection(base({
            configuration: surface({ cardKeys: ["business_process"], kpiKeys: [], workViewIds: [] }),
        }) as never);
        expect(readAccountPrepaidPosition).not.toHaveBeenCalled();
        expect(buildAttendanceCardVM).not.toHaveBeenCalled();
        expect(loadCustomerMemberProfileFieldsByMemberId).not.toHaveBeenCalled();
        expect(enrichOpportunityRowsWithChildrenForCompactQueue).not.toHaveBeenCalled();
        for (const resolver of ["prepaid_position", "attendance_fold", "health_profile", "children_projection"]) {
            expect(r.timing.executedResolvers).not.toContain(resolver);
        }
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
        // Membership AND field membership are iterated from the compiled configuration, so
        // adding a card or moving a field needs no code change here.
        expect(DECLARATIONS).toMatch(/for \(const card of cfg\.cards\)/);
        expect(DECLARATIONS).toMatch(/for \(const field of plan\.fields\)/);
    });

    it("reordering configuration reorders geometry and identity together", async () => {
        const rev = [...SIX].reverse();
        const r = await composeFirstOrderWorkUnitProjection(base({
            configuration: surface({ cardKeys: rev, kpiKeys: [], workViewIds: [] }),
        }) as never);
        expect(r.projection.geometry.cardOrder).toEqual(rev);
        expect(r.projection.configurationIdentity.cardKeys).toEqual(rev);
    });
});

describe("state semantics are never collapsed", () => {
    it("FORBIDDEN financials is forbidden, not empty and not zero", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base({ authority: { financialsRead: false, healthView: true } }) as never);
        expect(r.projection.cards.financials.facts["financials.prepaid_available_cents"].state).toBe("forbidden");
        expect(JSON.stringify(r.projection.cards.financials)).not.toContain('"value":0');
    });

    it("a FAILED prepaid read is unavailable, never zero", async () => {
        vi.mocked(readAccountPrepaidPosition).mockResolvedValueOnce({
            outcome: { state: "unavailable", reason: "holds unreadable" },
            diagnostics: { queryCount: 7, agreementCount: 0, paymentCount: 2 },
        } as never);
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.projection.cards.financials.facts["financials.prepaid_available_cents"].state).toBe("unavailable");
    });

    it("a THROWN resolver is unavailable, never an empty value", async () => {
        vi.mocked(buildAttendanceCardVM).mockRejectedValueOnce(new Error("down"));
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.projection.cards.attendance.facts["attendance.state"].state).toBe("unavailable");
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
        expect(r.projection.cards.health_safety.facts["health.profile_fact_count"].state).toBe("unavailable");
        expect(JSON.stringify(r.projection.cards.health_safety)).not.toContain('"value":0');
    });

    it("KNOWN ZERO survives as a real answer", async () => {
        vi.mocked(readAccountPrepaidPosition).mockResolvedValueOnce({
            outcome: { state: "ok", position: { availableCents: 0, pendingCents: 0, heldCents: 0 } },
            diagnostics: { queryCount: 7, agreementCount: 0, paymentCount: 0 },
        } as never);
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const f = r.projection.cards.financials.facts["financials.prepaid_available_cents"];
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toBe(0);
    });

    it("EVERY configured KPI appears in the projection", async () => {
        /*
         * FOUND BY PLANT I, which dropped a configured KPI and stayed green. The existing gate
         * checked that whatever KPIs were present were UNKNOWN — it never checked that they were
         * all THERE. A dropped slot renders as a missing region, not a wrong value, so nothing
         * about the surviving entries looks wrong.
         */
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(Object.keys(r.projection.kpiValues).sort()).toEqual(["a", "b", "c"]);
        expect(r.projection.geometry.kpiSlotCount).toBe(3);
    });

    it("EVERY configured Work View appears in the projection", async () => {
        // Found by plant J, the same shape of gap as the KPI one above.
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(Object.keys(r.projection.workViewTotals).sort()).toEqual(["v1", "v2"]);
        expect(r.projection.geometry.workViewCount).toBe(2);
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
        const p1 = r.timing.spans.filter((s) => ["population", "attendance_fold", "health_profile", "prepaid_position"].includes(s.name));
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
        const crm = span("crm_projection")!;
        const prepaid = span("prepaid_position")!;
        expect(prepaid.end).toBeGreaterThan(pop.end);
        // The dependent phase must begin at the population's end, NOT at the slow sibling's.
        expect(crm.at, "phase 2 started late — it is waiting on more than population")
            .toBeLessThan(prepaid.end);
    });

    it("THE GATE: the composer calls no full-composer, drawer view model or Financials VM owner", () => {
        /*
         * NAMED OWNERS, NOT A PATH SUBSTRING.
         *
         * This banned the literal "drawer", which is a directory name rather than a coupling.
         * `buildOpportunityWorkspaceLifecycleRail` lives under `viewModel/drawer/` and is a PURE
         * function — the canonical answer composer calls it for exactly this reason and says so.
         * Banning its folder would have forced A′ to grow a second owner of the lifecycle rail to
         * satisfy a test, which is the opposite of what this gate is for.
         *
         * What must stay banned is the WORK: composing the whole answer, building a drawer view
         * model, or building the full Financials VM.
         */
        for (const banned of [
            "composeWorkUnitProvisioningAnswer",
            "buildFinancialsCardVM",
            "resolveHouseholdPaymentViews",
            "buildOpportunityDrawerViewModel",
            "sharedCanonicalDeps",
            "buildOperationalContext",
        ]) {
            expect(DECLARATIONS, `${banned} would restore the coupling A′ exists to remove`).not.toContain(banned);
        }
    });

    it("THE GATE BEHIND THE GATE: nothing the composer imports from a drawer path does I/O", () => {
        /*
         * The rule the path substring was standing in for. A pure builder may be imported from
         * anywhere; anything that takes a SupabaseClient may not, because that is a read this DAG
         * has not measured and did not place.
         */
        const drawerImports = [...DECLARATIONS.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]*drawer[^"]*)"/g)];
        expect(drawerImports.length, "the fixture below assumes at least one such import exists").toBeGreaterThan(0);
        for (const [, , modulePath] of drawerImports) {
            const rel = modulePath.replace(/^@\//, "");
            const src = readFileSync(resolve(process.cwd(), `${rel}.ts`), "utf8");
            expect(src, `${modulePath} performs I/O and must not be on the first-order path`)
                .not.toMatch(/SupabaseClient|supabase\./);
        }
    });

    it("read time and assembly time are reported separately", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.timing.readDagMs).toBeGreaterThanOrEqual(0);
        expect(r.timing.assemblyMs).toBeGreaterThanOrEqual(0);
        expect(r.timing.totalMs).toBeGreaterThanOrEqual(r.timing.readDagMs);
    });
});

describe("FIELD COVERAGE — every contracted first-order field is produced", () => {
    /*
     * THE LEDGER IS THE GATE.
     *
     * `certification/p076-first-order-field-ledger/FIELD-COVERAGE-LEDGER.md` names every
     * contracted field and its canonical owner. This suite is that ledger executed: a field the
     * ledger contracts and the composer does not produce fails here rather than being discovered
     * on the surface as a blank region.
     *
     * The composer stood at 6 of 27 for several slices while every other gate was green, because
     * nothing asserted COVERAGE — only that the fields which existed carried honest states. A
     * projection can be perfectly honest about six facts and still be unshippable.
     */
    const CONTRACTED: Record<string, string[]> = {
        business_process: [
            "process.name", "process.stage_count", "process.current_stage_key",
            "process.current_stage_label", "process.stage_position", "process.stage_entered_at",
        ],
        financials: [
            "financials.prepaid_available_cents", "financials.prepaid_pending_cents",
            "financials.prepaid_held_cents", "financials.billing_period_key",
            "financials.responsibility_cents", "financials.balance_cents",
            "financials.past_due_cents",
        ],
        children: ["children.count", "children.enrolling_count"],
        household: [
            "household.label", "household.updated_at", "person.primary_contact_name",
            "person.primary_contact_line", "record.location_label", "children.count",
        ],
        attendance: [
            "attendance.state", "attendance.date", "attendance.expected_room_label",
            "attendance.unavailable_reason",
        ],
        health_safety: [
            "health.profile_fact_count", "health.requirements_satisfied",
            "health.requirements_total", "health.emergency_contact_count",
        ],
    };

    it("every ledger-contracted field is present on its card", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        for (const [cardKey, fields] of Object.entries(CONTRACTED)) {
            for (const f of fields) {
                expect(r.projection.cards[cardKey].facts[f], `${cardKey}.${f} is contracted and absent`).toBeDefined();
            }
        }
    });

    it("the ledger file and this suite name the same fields", () => {
        /*
         * A ledger nobody executes is prose. If a field is added to the document and not to this
         * list — or the reverse — the two artifacts disagree and neither is authoritative.
         */
        const ledger = readFileSync(
            resolve(process.cwd(), "../certification/p076-first-order-field-ledger/FIELD-COVERAGE-LEDGER.md"),
            "utf8",
        );
        for (const fields of Object.values(CONTRACTED)) {
            for (const f of fields) {
                expect(ledger, `${f} is gated here but not contracted in the ledger`).toContain(`\`${f}\``);
            }
        }
    });

    it("A SUCCESSFUL attendance read does not publish a known-empty string", async () => {
        /*
         * THE DEFECT THE LEDGER FOUND. The composer read `todayLabel`, which `AttendanceCardVM`
         * does not declare, so a successful read produced `known("")` — a confident statement that
         * there is nothing to say about the child's day. UNKNOWN would have been wrong; KNOWN
         * EMPTY was worse, because it is the one state the surface is entitled to trust.
         */
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const st = r.projection.cards.attendance.facts["attendance.state"];
        expect(st.state).toBe("known");
        if (st.state === "known") expect(st.value).toBe("not_arrived");
        expect(JSON.stringify(r.projection.cards.attendance)).not.toContain('"value":""');
    });

    it("attendance's recordability reason is KNOWN EMPTY when attendance IS recordable", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.projection.cards.attendance.facts["attendance.unavailable_reason"].state).toBe("known_empty");
    });

    it("attendance states WHY no record is recordable, from the same read", async () => {
        vi.mocked(buildAttendanceCardVM).mockResolvedValueOnce({
            participant: null, date: "2026-09-21",
            expected: { expected: false, roomLocationId: null, roomLabel: null },
            state: "no_record", checkInAt: null, checkOutAt: null,
            currentRoomLocationId: null, currentRoomLabel: null,
            movements: [], recentDays: [], history: [], corrected: false, siteRooms: [],
            unavailableReason: "This child has no attendable enrolment.",
        } as never);
        const before = vi.mocked(buildAttendanceCardVM).mock.calls.length;
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const f = r.projection.cards.attendance.facts["attendance.unavailable_reason"];
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toContain("no attendable enrolment");
        // PROJECTED, not re-read: one attendance call, not two.
        expect(vi.mocked(buildAttendanceCardVM).mock.calls.length).toBe(before + 1);
    });

    it("THE CHILD COUNT IS OF CHILDREN, NOT OF ENRICHED ROWS", async () => {
        /*
         * It read `children.size` — the size of the enrichment MAP, one entry per opportunity. The
         * The map carries THREE entries and the subject has TWO children, so the two numbers
         * cannot coincide. They did in the first version of this fixture — two and two — and the
         * plant that restored `children.size` stayed green against a gate written specifically to
         * catch it. Stating the intended distinction in a comment is not the same as building a
         * fixture in which the two answers must differ.
         */
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const f = r.projection.cards.children.facts["children.count"];
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toBe(2);
        const e = r.projection.cards.children.facts["children.enrolling_count"];
        if (e.state === "known") expect(e.value, "a declined child is not enrolling").toBe(1);
    });

    it("household facts come from the subject's own record and enrichment", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const f = r.projection.cards.household.facts;
        expect(f["household.label"].state === "known" && f["household.label"].value).toBe("Row One");
        expect(f["person.primary_contact_name"].state === "known" && f["person.primary_contact_name"].value).toBe("Cara L");
        expect(f["record.location_label"].state === "known" && f["record.location_label"].value).toBe("North Campus");
        expect(f["household.updated_at"].state === "known" && f["household.updated_at"].value).toBe("2026-09-10T00:00:00Z");
    });

    it("NO RESOLVED SUBJECT IS UNKNOWN, never an empty household", async () => {
        /*
         * The tempting shortcut is `rows[0]`. A request whose household is not in the population
         * would then render a confident household label belonging to a different family — a
         * wrong answer, not a missing one.
         */
        const r = await composeFirstOrderWorkUnitProjection(base({ householdId: "not-in-population" }) as never);
        expect(r.projection.cards.household.facts["household.label"].state).toBe("unknown");
        expect(r.projection.cards.children.facts["children.count"].state).toBe("unknown");
        expect(r.projection.cards.business_process.facts["process.current_stage_key"].state).toBe("unknown");
        expect(JSON.stringify(r.projection.cards.household)).not.toContain("Row One");
    });

    it("business process states the rail's stages and the RECORD's position", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const f = r.projection.cards.business_process.facts;
        expect(f["process.name"].state === "known" && f["process.name"].value).toBe("Enrollment");
        expect(f["process.stage_count"].state === "known" && f["process.stage_count"].value).toBe(3);
        expect(f["process.current_stage_label"].state === "known" && f["process.current_stage_label"].value).toBe("Lead");
        expect(f["process.stage_position"].state === "known" && f["process.stage_position"].value).toBe(1);
    });

    it("A STAGE THE RAIL DOES NOT DECLARE IS UNKNOWN, not position one", async () => {
        vi.mocked(buildOpportunityWorkspaceLifecycleRail).mockReturnValueOnce({
            stages: [{ key: "apply", label: "Apply" }, { key: "enrolled", label: "Enrolled" }],
            current_stage_key: null, process_name: "Enrollment",
        } as never);
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const f = r.projection.cards.business_process.facts;
        // The record says `lead`; the rail declares no such stage. That is unresolved, not first.
        expect(f["process.stage_position"].state).toBe("unknown");
        expect(f["process.current_stage_label"].state).toBe("unknown");
        // The key itself is still KNOWN — the record does have a stage; the rail cannot place it.
        expect(f["process.current_stage_key"].state).toBe("known");
    });

    it("A CONFIGURED ABSENCE OF PROCESS IS KNOWN EMPTY; a FAILED read is unavailable", async () => {
        vi.mocked(buildOpportunityWorkspaceLifecycleRail).mockReturnValueOnce(null);
        const empty = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(empty.projection.cards.business_process.facts["process.stage_count"].state).toBe("known_empty");

        vi.mocked(readWorkUnitProcessConfiguration).mockRejectedValueOnce(new Error("down"));
        const failed = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(failed.projection.cards.business_process.facts["process.stage_count"].state).toBe("unavailable");
        expect(JSON.stringify(failed.projection.cards.business_process)).not.toContain('"value":0');
    });

    it("health requirements and contacts are FORBIDDEN under refusal, never empty", async () => {
        const r = await composeFirstOrderWorkUnitProjection(base({ authority: { financialsRead: true, healthView: false } }) as never);
        const f = r.projection.cards.health_safety.facts;
        expect(f["health.requirements_satisfied"].state).toBe("forbidden");
        expect(f["health.emergency_contact_count"].state).toBe("forbidden");
        expect(f["health.profile_fact_count"].state).toBe("forbidden");
        expect(JSON.stringify(r.projection.cards.health_safety)).not.toContain('"value":0');
    });

    it("A FAILED health supplement read is unavailable, not zero requirements satisfied", async () => {
        vi.mocked(readHealthFirstOrderSupplements).mockRejectedValueOnce(new Error("down"));
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.projection.cards.health_safety.facts["health.requirements_satisfied"].state).toBe("unavailable");
        expect(r.projection.cards.health_safety.facts["health.emergency_contact_count"].state).toBe("unavailable");
        expect(JSON.stringify(r.projection.cards.health_safety)).not.toContain('"value":0');
    });

    it("KNOWN ZERO requirements satisfied survives as a real answer", async () => {
        vi.mocked(readHealthFirstOrderSupplements).mockResolvedValueOnce({
            requirementsSatisfied: 0, requirementsTotal: 4, emergencyContactCount: 0,
        });
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const f = r.projection.cards.health_safety.facts["health.requirements_satisfied"];
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toBe(0);
    });
});

describe("the new reads obey configuration and cost nothing when unconfigured", () => {
    it("an unconfigured business_process card never reads process configuration", async () => {
        vi.mocked(readWorkUnitProcessConfiguration).mockClear();
        const r = await composeFirstOrderWorkUnitProjection(base({
            configuration: surface({ cardKeys: ["household"], kpiKeys: [], workViewIds: [] }),
        }) as never);
        expect(readWorkUnitProcessConfiguration).not.toHaveBeenCalled();
        expect(r.timing.executedResolvers).not.toContain("process_config");
    });

    it("an unconfigured health card never reads documents or relationships", async () => {
        vi.mocked(readHealthFirstOrderSupplements).mockClear();
        const r = await composeFirstOrderWorkUnitProjection(base({
            configuration: surface({ cardKeys: ["household"], kpiKeys: [], workViewIds: [] }),
        }) as never);
        expect(readHealthFirstOrderSupplements).not.toHaveBeenCalled();
        expect(r.timing.executedResolvers).not.toContain("health_supplements");
    });

    it("A REFUSED health caller costs no health read at all", async () => {
        vi.mocked(readHealthFirstOrderSupplements).mockClear();
        await composeFirstOrderWorkUnitProjection(base({ authority: { financialsRead: true, healthView: false } }) as never);
        expect(readHealthFirstOrderSupplements).not.toHaveBeenCalled();
    });

    it("THE THREE NEW READS ARE IN PHASE 1 — none of them waits on the population", async () => {
        /*
         * None consumes the population: the configuration is addressed by work unit and both
         * health supplements by the focused child. Placing any of them after the population would
         * repeat the 200ms serialization this DAG was already repaired for once, and the repair
         * held only because a gate pins the EDGE rather than the source.
         */
        const slowPopulation = new Promise((r) => setTimeout(() => r({ rows: [], truncated: false }), 60));
        vi.mocked(loadWorkUnitProcessPopulation).mockReturnValueOnce(slowPopulation as never);
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        const span = (n: string) => r.timing.spans.find((s) => s.name === n)!;
        const pop = span("population");
        for (const name of ["process_config", "health_supplements"]) {
            expect(span(name).at, `${name} started after the population — it is not in phase 1`)
                .toBeLessThan(pop.end);
        }
    });

    it("the query count rises by exactly the ledger's stated budget", async () => {
        /*
         * 17 → 20 with process configuration (1) and the two health supplements (2); 20 → 24 with
         * the account ledger (agreements · paged charges · batched applications · batched payment
         * statuses). A silent extra read is the thing this catches.
         */
        const r = await composeFirstOrderWorkUnitProjection(base() as never);
        expect(r.timing.queryCount).toBe(24);
    });
});
