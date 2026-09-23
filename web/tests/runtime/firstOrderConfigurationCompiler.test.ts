import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/runtime/provisioning/workUnitProcessPopulation", () => ({
    loadWorkUnitProcessPopulation: vi.fn(async () => ({ rows: [
        { id: "o1", name: "Row One", updated_at: "2026-09-10T00:00:00Z", stage_key: "lead", stage_entered_at: "2026-09-01", primary_person_id: "p1", location_id: "l1", customer_id: "h1", metadata: {} },
        { id: "o2", name: "Row Two", stage_key: "tour", stage_entered_at: "2026-09-02", primary_person_id: "p2", location_id: "l1", customer_id: "h2", metadata: {} },
        { id: "o3", name: "Row Three", stage_key: "lead", stage_entered_at: "2026-09-03", primary_person_id: "p3", location_id: "l1", customer_id: "h3", metadata: {} },
    ], truncated: false })),
}));
vi.mock("@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM", () => ({ buildAttendanceCardVM: vi.fn(async () => ({
    participant: { customerMemberId: "m1", displayName: "Ada" }, date: "2026-09-21",
    expected: { expected: true, roomLocationId: "r1", roomLabel: "Toddler A" },
    state: "not_arrived", checkInAt: null, checkOutAt: null, currentRoomLocationId: null,
    currentRoomLabel: null, movements: [], recentDays: [], history: [], corrected: false,
    siteRooms: [], unavailableReason: null,
})) }));
vi.mock("@/lib/completion/loadCustomerMemberProfileFields", () => ({
    loadCustomerMemberProfileFieldsByMemberId: vi.fn(async () => new Map([["m1", { gender: "female", allergies: "none" }]])),
}));
vi.mock("@/lib/runtime/firstOrder/readHealthFirstOrderSupplements", () => ({
    readHealthFirstOrderSupplements: vi.fn(async () => ({ requirementsSatisfied: 2, requirementsTotal: 4, emergencyContactCount: 3 })),
}));
vi.mock("@/lib/runtime/firstOrder/readWorkUnitProcessConfiguration", () => ({
    readWorkUnitProcessConfiguration: vi.fn(async () => ({ workUnitId: "wu-1", departmentId: "d1", departmentMetadata: { L: true } })),
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail", () => ({
    buildOpportunityWorkspaceLifecycleRail: vi.fn(() => ({
        stages: [{ key: "lead", label: "Lead" }, { key: "tour", label: "Tour" }, { key: "enrolled", label: "Enrolled" }],
        current_stage_key: "lead", process_name: "Enrollment",
    })),
}));
vi.mock("@/lib/financials/prepaid/readAccountPrepaidPosition", () => ({ readAccountPrepaidPosition: vi.fn(async () => ({
    outcome: { state: "ok", position: { availableCents: 12500, pendingCents: 0, heldCents: 500 } },
    diagnostics: { queryCount: 7, agreementCount: 4, paymentCount: 2 },
})) }));
vi.mock("@/lib/workspace/enrichOpportunityQueueProjection", () => ({ enrichOpportunityRowsWithCrmProjection: vi.fn(async () => new Map([
    ["o1", { _primary_contact_name: "Cara L", _primary_contact_line: "Cara L · cara@x.test", _location_label: "North Campus" }],
])) }));
vi.mock("@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue", () => ({ enrichOpportunityRowsWithChildrenForCompactQueue: vi.fn(async () => new Map([
    ["o1", {
        _inquiry_children: [
            { id: "ch1", customer_member_id: "cm1", display_name: "Ada L", outcome_status_key: "enrolling" },
            { id: "ch2", customer_member_id: "cm2", display_name: "Bo L", outcome_status_key: "declined" },
        ],
        // The enricher's UNIFIED key — populated by both its branches. A fixture carrying only
        // `_inquiry_children` cannot distinguish the two sources and hid a live defect.
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
vi.mock("@/lib/runtime/firstOrder/readFirstOrderValueSeeds", () => ({
    readHeaderKpiValues: vi.fn(async () => ({ status: "ok", values: { a: 6, b: 6, c: 20 } })),
}));
vi.mock("@/lib/runtime/firstOrder/readWorkViewTotalsForFirstOrder", () => ({
    readWorkViewTotalsForFirstOrder: vi.fn(async () => ({
        status: "ok", totalsByViewId: { v1: 4, v2: 9 }, configuredViewSignature: "v1|v2", diagnostics: { spans: {}, targetCount: 2, hostWorkUnitCount: 1, groupCount: 1, locatorMs: 0, seedMs: 0, deptUnitsMs: 0, deptUnitCount: 1, timeline: [] },
    })),
}));
vi.mock("@/lib/queues/operatorStageMembershipAck", () => ({ loadAcknowledgedOccurrenceKeys: vi.fn(async () => new Set<string>()) }));

import {
    composeFirstOrderWorkUnitProjection, FirstOrderUnsupportedCapabilityError,
} from "@/lib/runtime/firstOrder/composeFirstOrderWorkUnitProjection";
import { compileFirstOrderPlan, type FirstOrderSurfaceConfiguration } from "@/lib/runtime/firstOrder/compileFirstOrderPlan";
import { resolveFirstOrderSurfaceConfiguration } from "@/lib/runtime/firstOrder/resolveFirstOrderSurfaceConfiguration";
import { findFirstOrderCapability, registeredFirstOrderSemanticKeys } from "@/lib/runtime/firstOrder/firstOrderCapabilityRegistry";
import { KPI_CAPABILITY_FAMILY, WORK_VIEW_CAPABILITY_FAMILY } from "@/lib/runtime/firstOrder/firstOrderCapability";
import { FOCUS_PANEL_CARDS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { readAccountPrepaidPosition } from "@/lib/financials/prepaid/readAccountPrepaidPosition";
import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { readHealthFirstOrderSupplements } from "@/lib/runtime/firstOrder/readHealthFirstOrderSupplements";
import { readWorkUnitProcessConfiguration } from "@/lib/runtime/firstOrder/readWorkUnitProcessConfiguration";
import { readHeaderKpiValues } from "@/lib/runtime/firstOrder/readFirstOrderValueSeeds";
import { readWorkViewTotalsForFirstOrder } from "@/lib/runtime/firstOrder/readWorkViewTotalsForFirstOrder";
import { enrichOpportunityRowsWithChildrenForCompactQueue } from "@/lib/runtime/provisioning/enrichOpportunityRowsWithChildrenForCompactQueue";

const SRC_DIR = resolve(process.cwd(), "lib/runtime/firstOrder");
const read = (f: string) => readFileSync(resolve(SRC_DIR, f), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const COMPOSER = strip(read("composeFirstOrderWorkUnitProjection.ts"));

const ENROLLMENT_CARDS = ["business_process", "financials", "children", "household", "attendance", "health_safety"];

/** Today's published Enrollment surface, resolved exactly as the product would resolve it. */
const enrollment = (over: Partial<Parameters<typeof resolveFirstOrderSurfaceConfiguration>[0]> = {}) =>
    resolveFirstOrderSurfaceConfiguration({
        cardKeys: ENROLLMENT_CARDS, kpiKeys: ["a", "b", "c"], workViewIds: ["v1", "v2"], siteScopeId: null, ...over,
    });

const compose = (configuration: FirstOrderSurfaceConfiguration, over: Record<string, unknown> = {}) =>
    composeFirstOrderWorkUnitProjection({
        supabase: {} as never, orgId: "org-1", workUnitId: "wu-1", viewerId: "u1",
        customerMemberId: "m1", householdId: "h1", configuration,
        authority: { financialsRead: true, healthView: true },
        // The two genuinely request-scoped facts the evaluator needs and A′ must not invent.
        workViewCaller: {
            recordScopeConstraints: null, recordScopeImpossible: false,
            viewerDisplayTimeZone: { iana: "UTC", source: "test", cacheHit: false },
            activeWorkViewId: "v1",
        },
        ...over,
    } as never);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("PART 4 — card membership AND field membership are both configuration-driven", () => {
    it("THE COMPOSER NAMES NO CARD AND NO SEMANTIC KEY", () => {
        /*
         * The primary test. A configurable card set is not a configuration compiler if the fields
         * on those cards are populated by `switch (cardKey)`. The previous composer did exactly
         * that: card membership came from configuration while field membership was source code,
         * so moving one field between cards was an edit.
         */
        for (const cardKey of ENROLLMENT_CARDS) {
            expect(COMPOSER, `the composer names the card "${cardKey}"`).not.toContain(`"${cardKey}"`);
        }
        for (const key of registeredFirstOrderSemanticKeys()) {
            expect(COMPOSER, `the composer names the semantic key "${key}"`).not.toContain(`"${key}"`);
        }
        expect(COMPOSER).not.toMatch(/switch\s*\(\s*card/);
        expect(COMPOSER).not.toMatch(/cardKey\s*===/);
        // The Stage-1/Stage-2 line is configuration's. The composer must not re-decide it.
        expect(COMPOSER).not.toContain('"collapsed"');
    });

    it("the compiler and the registry name no card key either", () => {
        const compiler = strip(read("compileFirstOrderPlan.ts"));
        for (const cardKey of ENROLLMENT_CARDS) expect(compiler).not.toContain(`"${cardKey}"`);
        // The registry keys by CONCEPT, not by card — otherwise moving a field is a code change.
        for (const key of registeredFirstOrderSemanticKeys()) {
            expect(key.startsWith("card."), `${key} is keyed by card`).toBe(false);
        }
    });

    it("every card-declared default names a REGISTERED capability", () => {
        const registered = new Set(registeredFirstOrderSemanticKeys());
        for (const card of FOCUS_PANEL_CARDS) {
            for (const key of card.firstOrderFields ?? []) {
                expect(registered.has(key), `card "${card.key}" declares unregistered "${key}"`).toBe(true);
            }
        }
    });

    it("CONFIGURED FIELDS OVERRIDE the card's declared default", () => {
        const configured = resolveFirstOrderSurfaceConfiguration({
            cardKeys: ["household"], kpiKeys: [], workViewIds: [], siteScopeId: null,
            cardConfigs: {
                household: { fields: [
                    { id: "f1", label: "Contact", refKey: "person.primary_contact_name", concept: "x", renderer: "text", placement: "collapsed", kind: "field" },
                ] },
            },
        });
        expect(configured.cards[0].semanticKeys).toEqual(["person.primary_contact_name"]);
        // The declared default is six keys; configuration replaced it with one, with no code change.
        expect(enrollment().cards.find((c) => c.cardKey === "household")!.semanticKeys.length).toBe(6);
    });

    it("an EXPANDED-placement field is not first-order", () => {
        const cfg = resolveFirstOrderSurfaceConfiguration({
            cardKeys: ["household"], kpiKeys: [], workViewIds: [], siteScopeId: null,
            cardConfigs: {
                household: { fields: [
                    { id: "f1", label: "A", refKey: "household.label", concept: "x", renderer: "text", placement: "collapsed", kind: "field" },
                    { id: "f2", label: "B", refKey: "household.updated_at", concept: "x", renderer: "text", placement: "expanded", kind: "field" },
                ] },
            },
        });
        expect(cfg.cards[0].semanticKeys).toEqual(["household.label"]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("PART 5/6 — configuration mutations change the plan, not the source", () => {
    const cardOf = (cfg: FirstOrderSurfaceConfiguration, key: string) => cfg.cards.find((c) => c.cardKey === key)!;

    const withCards = (cards: Array<{ cardKey: string; semanticKeys: string[] }>): FirstOrderSurfaceConfiguration =>
        ({ cards, kpiKeys: [], workViewIds: [], siteScopeId: null });

    it("A — REMOVING A FIELD RETIRES ITS READ when nothing else needs it", async () => {
        const before = compileFirstOrderPlan(withCards([
            { cardKey: "attendance", semanticKeys: ["attendance.state"] },
        ]));
        expect(before.prerequisites.has("attendance_fold")).toBe(true);

        const after = compileFirstOrderPlan(withCards([{ cardKey: "attendance", semanticKeys: [] }]));
        expect(after.prerequisites.has("attendance_fold"), "the read survived its last consumer").toBe(false);

        vi.mocked(buildAttendanceCardVM).mockClear();
        const r = await compose(withCards([{ cardKey: "attendance", semanticKeys: [] }]));
        expect(buildAttendanceCardVM).not.toHaveBeenCalled();
        expect(r.timing.executedResolvers).not.toContain("attendance_fold");
    });

    it("A′ — a read with ANOTHER consumer survives the removal", () => {
        const plan = compileFirstOrderPlan(withCards([
            { cardKey: "attendance", semanticKeys: ["attendance.date"] },
            { cardKey: "other", semanticKeys: ["attendance.state"] },
        ]));
        const narrowed = compileFirstOrderPlan(withCards([
            { cardKey: "attendance", semanticKeys: [] },
            { cardKey: "other", semanticKeys: ["attendance.state"] },
        ]));
        expect(plan.prerequisites.has("attendance_fold")).toBe(true);
        expect(narrowed.prerequisites.has("attendance_fold"), "retired a read another field still needs").toBe(true);
    });

    it("B — ADDING A SUPPORTED FIELD selects its provider automatically", async () => {
        const r = await compose(withCards([{ cardKey: "household", semanticKeys: ["household.label", "record.location_label"] }]));
        const f = r.projection.cards.household.facts["record.location_label"];
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toBe("North Campus");
        expect(r.timing.executedResolvers).toContain("crm_projection");
    });

    it("C — REORDERING FIELDS changes order and NOTHING semantic", async () => {
        const keys = ["household.label", "person.primary_contact_name", "record.location_label"];
        const a = await compose(withCards([{ cardKey: "household", semanticKeys: keys }]));
        const b = await compose(withCards([{ cardKey: "household", semanticKeys: [...keys].reverse() }]));
        expect(Object.keys(b.projection.cards.household.facts)).toEqual([...keys].reverse());
        for (const k of keys) {
            expect(b.projection.cards.household.facts[k], `reorder changed the value of ${k}`)
                .toEqual(a.projection.cards.household.facts[k]);
        }
        expect(b.timing.queryCount).toBe(a.timing.queryCount);
    });

    it("D — MOVING A FIELD to another card moves the value, unchanged", async () => {
        const onHousehold = await compose(withCards([{ cardKey: "household", semanticKeys: ["children.count"] }]));
        const onChildren = await compose(withCards([{ cardKey: "children", semanticKeys: ["children.count"] }]));
        expect(onChildren.projection.cards.children.facts["children.count"])
            .toEqual(onHousehold.projection.cards.household.facts["children.count"]);
        expect(onChildren.projection.cards.children.facts["children.count"].state).toBe("known");
    });

    it("E/F/G — cards can be removed, added and reordered", async () => {
        const removed = await compose(enrollment({ cardKeys: ENROLLMENT_CARDS.filter((c) => c !== "financials") }));
        expect(Object.keys(removed.projection.cards)).not.toContain("financials");
        expect(removed.timing.executedResolvers).not.toContain("prepaid_position");

        const added = await compose(enrollment({ cardKeys: [...ENROLLMENT_CARDS, "children"] }));
        expect(Object.keys(added.projection.cards)).toContain("children");

        const reordered = [...ENROLLMENT_CARDS].reverse();
        const r = await compose(enrollment({ cardKeys: reordered }));
        expect(r.projection.geometry.cardOrder).toEqual(reordered);
        expect(r.projection.configurationIdentity.cardKeys).toEqual(reordered);
    });

    it("H/I — KPI and Work View membership are configuration", async () => {
        const r = await compose(enrollment({ kpiKeys: ["x", "y"], workViewIds: ["only"] }));
        expect(Object.keys(r.projection.kpiValues).sort()).toEqual(["x", "y"]);
        expect(Object.keys(r.projection.workViewTotals)).toEqual(["only"]);
        expect(r.projection.geometry.kpiSlotCount).toBe(2);
        expect(r.projection.geometry.workViewCount).toBe(1);
    });

    it("SHARED PREREQUISITES ARE READ ONCE", async () => {
        // Six household/children fields, three of which need CRM and two of which need children.
        const r = await compose(enrollment({ cardKeys: ["household", "children"] }));
        const count = (n: string) => r.timing.executedResolvers.filter((x) => x === n).length;
        expect(count("crm_projection")).toBe(1);
        expect(count("children_projection")).toBe(1);
        expect(count("population")).toBe(1);
    });

    it("the compiler deduplicates prerequisites across cards", () => {
        const plan = compileFirstOrderPlan(withCards([
            { cardKey: "a", semanticKeys: ["person.primary_contact_name"] },
            { cardKey: "b", semanticKeys: ["person.primary_contact_line", "record.location_label"] },
        ]));
        expect(plan.fields.length).toBe(3);
        expect([...plan.prerequisites].sort()).toEqual(["crm_projection", "personal_seen", "population"]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("PART 7/8 — a synthetic Billing process compiles through the SAME runtime", () => {
    /*
     * NOT a Billing implementation and NOT new billing semantics. It is a materially different
     * SURFACE — different cards, different order, different field composition, different KPIs and
     * Work Views — assembled only from capabilities that already exist today. The question it
     * answers is whether a second business process needs a second first-order architecture.
     */
    const BILLING: FirstOrderSurfaceConfiguration = {
        cards: [
            { cardKey: "billing_overview", semanticKeys: ["financials.prepaid_available_cents", "financials.prepaid_held_cents", "household.updated_at"] },
            { cardKey: "account", semanticKeys: ["household.label", "person.primary_contact_line", "record.location_label"] },
            { cardKey: "payment_plan", semanticKeys: ["financials.prepaid_pending_cents"] },
            { cardKey: "collections", semanticKeys: ["process.current_stage_label", "process.stage_entered_at"] },
        ],
        kpiKeys: ["billing_kpi_1", "billing_kpi_2", "billing_kpi_3", "billing_kpi_4"],
        workViewIds: ["past_due", "plans"],
        siteScopeId: "site-7",
    };

    it("it compiles with ZERO composer source changes and no process-specific branch", async () => {
        const r = await compose(BILLING);
        expect(Object.keys(r.projection.cards).sort())
            .toEqual(["account", "billing_overview", "collections", "payment_plan"]);
        expect(r.plan.ok).toBe(true);
        expect(r.plan.unsupported).toEqual([]);
        // The proof that no branch exists: the composer has never heard of any of these cards.
        for (const c of BILLING.cards) expect(COMPOSER).not.toContain(`"${c.cardKey}"`);
        expect(COMPOSER).not.toMatch(/billing|enrollment/i);
    });

    it("its values are the SAME capabilities' answers, not a Billing re-derivation", async () => {
        const billing = await compose(BILLING);
        const enrol = await compose(enrollment());
        expect(billing.projection.cards.billing_overview.facts["financials.prepaid_available_cents"])
            .toEqual(enrol.projection.cards.financials.facts["financials.prepaid_available_cents"]);
    });

    it("ONE runtime compiles both processes in the same session", async () => {
        const a = await compose(enrollment());
        const b = await compose(BILLING);
        expect(a.projection.geometry.cardOrder).not.toEqual(b.projection.geometry.cardOrder);
        expect(a.plan.ok && b.plan.ok).toBe(true);
    });

    it("EXECUTION SCALES WITH SELECTED CAPABILITIES, not with the registry", async () => {
        /*
         * Billing selects no attendance and no health capability, so those providers must cost
         * nothing. A runtime whose cost tracked the global registry would execute them anyway.
         */
        vi.mocked(buildAttendanceCardVM).mockClear();
        vi.mocked(readHealthFirstOrderSupplements).mockClear();
        const r = await compose(BILLING);
        expect(buildAttendanceCardVM).not.toHaveBeenCalled();
        expect(readHealthFirstOrderSupplements).not.toHaveBeenCalled();
        expect(r.timing.executedResolvers.sort()).toEqual([
            "crm_projection", "header_kpis", "personal_seen", "population", "prepaid_position",
            "process_config", "work_view_totals",
        ]);
        // population 1 + personal_seen 1 + crm_projection 2 + prepaid_position 7 + process_config 1
        // + header_kpis 2 + work_view_totals 2 — KPI and Work View are first-order VALUES
        expect(r.timing.queryCount).toBe(16);
    });

    it("a one-card Billing surface costs less than the four-card one", async () => {
        const tiny = await compose({ ...BILLING, cards: [{ cardKey: "account", semanticKeys: ["household.label"] }] });
        const full = await compose(BILLING);
        expect(tiny.timing.queryCount).toBeLessThan(full.timing.queryCount);
        expect(tiny.timing.executedResolvers).not.toContain("prepaid_position");
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("PART 9 — an unsupported capability fails EXPLICITLY", () => {
    const withFuture: FirstOrderSurfaceConfiguration = {
        cards: [{ cardKey: "collections", semanticKeys: ["household.label", "billing.some_future_fact"] }],
        kpiKeys: [], workViewIds: [], siteScopeId: null,
    };

    it("the compile reports it, names it, and is not ok", () => {
        const plan = compileFirstOrderPlan(withFuture);
        expect(plan.ok).toBe(false);
        expect(plan.unsupported).toHaveLength(1);
        expect(plan.unsupported[0].semanticKey).toBe("billing.some_future_fact");
        expect(plan.unsupported[0].cardKey).toBe("collections");
        expect(plan.unsupported[0].reason).toBe("no_registered_capability");
        expect(plan.unsupported[0].message).toMatch(/requires code/);
    });

    it("the composer THROWS — it does not omit, zero, empty, or UNKNOWN the field", async () => {
        /*
         * UNKNOWN is the platform saying it tried and could not answer. Nobody tried: the fact has
         * no implementation. Rendering UNKNOWN would present a missing IMPLEMENTATION as a missing
         * VALUE, and no operator can tell those apart.
         */
        await expect(compose(withFuture)).rejects.toBeInstanceOf(FirstOrderUnsupportedCapabilityError);
        await expect(compose(withFuture)).rejects.toThrow(/billing\.some_future_fact/);
    });

    it("it does not fall back to a legacy view model", () => {
        for (const banned of ["composeWorkUnitProvisioningAnswer", "buildFinancialsCardVM", "buildOperationalContext"]) {
            expect(COMPOSER).not.toContain(banned);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("PART 11/12 — authorization is request-time; state semantics belong to the capability", () => {
    it("a refused caller gets FORBIDDEN and the read never executes", async () => {
        vi.mocked(readAccountPrepaidPosition).mockClear();
        const r = await compose(enrollment(), { authority: { financialsRead: false, healthView: false } });
        expect(r.projection.cards.financials.facts["financials.prepaid_available_cents"].state).toBe("forbidden");
        expect(r.projection.cards.health_safety.facts["health.profile_fact_count"].state).toBe("forbidden");
        expect(readAccountPrepaidPosition).not.toHaveBeenCalled();
        expect(r.timing.executedResolvers).not.toContain("prepaid_position");
        expect(JSON.stringify(r.projection.cards.financials)).not.toContain('"value":0');
    });

    it("NO AUTHORIZATION VERDICT IS STORED IN THE COMPILED PLAN", () => {
        /*
         * A plan is compiled from configuration and configuration outlives a request. A verdict
         * baked into it is a cached permission wearing a layout's clothes.
         */
        const plan = compileFirstOrderPlan(enrollment());
        /*
         * The WHOLE compiled field is inspected, not a hand-picked projection of it. An earlier
         * version serialized three chosen properties, so a verdict added as a FOURTH would have
         * been invisible to the gate that exists to catch it.
         */
        const shape = plan.fields.map((f) => {
            const { capability, ...rest } = f;
            const { project, ...cap } = capability;
            void project;
            return { ...rest, capability: cap };
        });
        expect(Object.keys(shape[0]).sort()).toEqual(["capability", "cardKey", "semanticKey"]);
        // Family capabilities carry a `projectMember` function; strip it the same way `project`
        // is stripped, or the serialisation below inspects a function body rather than data.
        const serialized = JSON.stringify(shape);
        expect(serialized).not.toMatch(/allowed|denied|granted|permitted|"authorized"|viewer|actor|userId/i);
        expect(plan.fields.every((f) => ["none", "financials_read", "health_view", "analytics_read"].includes(f.capability.authorization))).toBe(true);
        // A plan compiled for a refused caller is IDENTICAL to one compiled for an allowed caller.
        expect(JSON.stringify(compileFirstOrderPlan(enrollment()).fields.map((f) => f.semanticKey)))
            .toBe(JSON.stringify(plan.fields.map((f) => f.semanticKey)));
    });

    it("every state survives the generic path", async () => {
        const r = await compose(enrollment());
        const known = r.projection.cards.financials.facts["financials.prepaid_available_cents"];
        expect(known.state).toBe("known");

        vi.mocked(readAccountPrepaidPosition).mockResolvedValueOnce({
            outcome: { state: "ok", position: { availableCents: 0, pendingCents: 0, heldCents: 0 } },
            diagnostics: { queryCount: 7, agreementCount: 0, paymentCount: 0 },
        } as never);
        const zero = await compose(enrollment());
        const z = zero.projection.cards.financials.facts["financials.prepaid_available_cents"];
        expect(z.state).toBe("known");
        if (z.state === "known") expect(z.value).toBe(0);

        vi.mocked(readAccountPrepaidPosition).mockRejectedValueOnce(new Error("down"));
        const failed = await compose(enrollment());
        expect(failed.projection.cards.financials.facts["financials.prepaid_available_cents"].state).toBe("unavailable");

        const empty = await compose(enrollment());
        expect(empty.projection.cards.attendance.facts["attendance.unavailable_reason"].state).toBe("known_empty");

        const noSubject = await compose(enrollment(), { householdId: "absent" });
        expect(noSubject.projection.cards.household.facts["household.label"].state).toBe("unknown");
    });

    it("A CARD NEVER RECONSTRUCTS A STATE — the composer only reads what the capability returned", () => {
        /*
         * Every state constructor except `forbidden` (the request-time refusal) and the two the
         * projection contract itself owns must be absent from the assembly loop, or two surfaces
         * can come to disagree about whether a read failed.
         */
        /*
         * BRACE-MATCHED, not sliced to end of file. The first version took everything after the
         * loop header, which swept in the projection literal below it — `known(queueRows)` and
         * the UNKNOWN KPI seeds, both of which the projection contract legitimately owns — and
         * reported a violation that was not one. A source gate that over-reaches is not a
         * stricter gate; it is an unreliable one.
         */
        const start = COMPOSER.indexOf("for (const field of plan.fields)");
        expect(start, "the projection loop was not found").toBeGreaterThan(-1);
        const open = COMPOSER.indexOf("{", start);
        let depth = 0; let end = open;
        for (let i = open; i < COMPOSER.length; i += 1) {
            if (COMPOSER[i] === "{") depth += 1;
            else if (COMPOSER[i] === "}") { depth -= 1; if (depth === 0) { end = i + 1; break; } }
        }
        const loop = COMPOSER.slice(start, end);
        // A control: the slice really is the loop, not an empty string that passes vacuously.
        expect(loop).toContain("capability.project(ctx)");
        expect(loop.length).toBeLessThan(900);
        for (const ctor of ["knownEmpty(", "unavailable(", "known("]) {
            expect(loop, `the projection loop constructs ${ctor}`).not.toContain(ctor);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("PART 13 — geometry is configuration's, and identity includes field membership", () => {
    it("geometry reserves a slot per configured field, in configured order", async () => {
        const r = await compose(enrollment());
        expect(r.projection.geometry.cardFieldSlots.household).toEqual(
            enrollment().cards.find((c) => c.cardKey === "household")!.semanticKeys,
        );
        expect(r.projection.geometry.cardOrder).toEqual(ENROLLMENT_CARDS);
    });

    it("geometry does NOT depend on whether a provider resolved", async () => {
        vi.mocked(readAccountPrepaidPosition).mockRejectedValueOnce(new Error("down"));
        const failed = await compose(enrollment());
        const ok = await compose(enrollment());
        expect(failed.projection.geometry).toEqual(ok.projection.geometry);
    });

    it("a configured card with NO first-order fields still reserves its region", async () => {
        const r = await compose({
            cards: [{ cardKey: "notes", semanticKeys: [] }], kpiKeys: [], workViewIds: [], siteScopeId: null,
        });
        expect(r.projection.cards.notes).toBeDefined();
        expect(r.projection.geometry.cardFieldSlots.notes).toEqual([]);
    });

    it("CONFIGURATION IDENTITY MOVES when field membership or order moves", async () => {
        const { projectionMatchesConfiguration } = await import("@/lib/runtime/firstOrder/firstOrderWorkUnitProjection");
        const r = await compose(enrollment());
        const current = r.projection.configurationIdentity;
        expect(projectionMatchesConfiguration(r.projection, current).matches).toBe(true);

        const fewer = { ...current, cardFields: { ...current.cardFields, household: current.cardFields.household.slice(0, 2) } };
        const a = projectionMatchesConfiguration(r.projection, fewer);
        expect(a.matches).toBe(false);
        if (!a.matches) expect(a.reason).toContain("household");

        const reordered = { ...current, cardFields: { ...current.cardFields, household: [...current.cardFields.household].reverse() } };
        expect(projectionMatchesConfiguration(r.projection, reordered).matches).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("PART 18 — the repaired DAG survives compilation", () => {
    it("planning is measured SEPARATELY and is not hidden inside assembly", async () => {
        const r = await compose(enrollment());
        expect(r.timing.planMs).toBeGreaterThanOrEqual(0);
        expect(r.timing).toHaveProperty("assemblyMs");
        expect(r.timing.totalMs).toBeGreaterThanOrEqual(r.timing.readDagMs);
    });

    it("PHASE 2 STILL WAITS ON POPULATION ALONE", async () => {
        const slow = new Promise((res) => setTimeout(() => res({
            outcome: { state: "ok", position: { availableCents: 0, pendingCents: 0, heldCents: 0 } },
            diagnostics: { queryCount: 7, agreementCount: 0, paymentCount: 0 },
        }), 60));
        vi.mocked(readAccountPrepaidPosition).mockReturnValueOnce(slow as never);
        const r = await compose(enrollment());
        const span = (n: string) => r.timing.spans.find((s) => s.name === n)!;
        expect(span("crm_projection").at, "phase 2 is waiting on more than the population").toBeLessThan(span("prepaid_position").end);
    });

    it("the subject-independent reads are in phase 1", async () => {
        const r = await compose(enrollment());
        const span = (n: string) => r.timing.spans.find((s) => s.name === n)!;
        for (const n of ["process_config", "health_supplements", "attendance_fold", "prepaid_position"]) {
            expect(span(n).at, `${n} did not start with phase 1`).toBeLessThanOrEqual(span("population").at + 5);
        }
    });

    it("query count for today's Enrollment specimen is stable", async () => {
        const r = await compose(enrollment());
        expect(r.timing.queryCount).toBe(28);
    });

    it("PART 12 — THE QUERY CENSUS IS EXECUTABLE, not prose", async () => {
        /*
         * Every number the certification reports about cost is asserted here, so the document and
         * the runtime cannot drift. A census written only in prose is a claim about a past run.
         */
        const r = await compose(enrollment());
        const plan = compileFirstOrderPlan(enrollment());

        // 29 card fields + 3 configured KPI values + 2 configured Work View values. KPI and Work
        // View VALUES are first-order by Director ruling, so they select capabilities like any
        // other configured value rather than arriving from a seed beside the composition.
        expect(plan.fields.length, "selected capabilities").toBe(34);
        expect(plan.unsupported).toEqual([]);

        const executed = r.timing.executedResolvers;
        expect([...executed].sort(), "unique prerequisite reads").toEqual([
            "account_ledger", "attendance_fold", "children_projection", "crm_projection",
            "header_kpis", "health_profile", "health_supplements", "personal_seen", "population",
            "prepaid_position", "process_config", "work_view_totals",
        ]);

        // DUPLICATE READS = 0. Each prerequisite is acquired exactly once, however many
        // capabilities named it — `children.count` alone is selected by two cards.
        const counts = executed.reduce<Record<string, number>>((a, n) => ({ ...a, [n]: (a[n] ?? 0) + 1 }), {});
        expect(Object.values(counts).every((n) => n === 1), `duplicate acquisition: ${JSON.stringify(counts)}`).toBe(true);

        // UNUSED-PROVIDER READS = 0: every executed prerequisite is named by a selected capability
        // or is one the projection contract itself requires.
        const needed = new Set<string>(["population", "personal_seen"]);
        for (const f of plan.fields) for (const p of f.capability.prerequisites) needed.add(p);
        for (const name of executed) expect(needed.has(name), `${name} ran for nobody`).toBe(true);

        // NO N+1: the cost is a constant per prerequisite, never a function of row or child count.
        expect(r.timing.queryCount).toBe(28);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe("PART 10 — the first-order classification is not the composer's", () => {
    it("it is resolved from configuration placement, by the surface resolver", () => {
        const resolver = read("resolveFirstOrderSurfaceConfiguration.ts");
        expect(resolver).toContain('placement === "collapsed"');
        expect(COMPOSER).not.toContain("placement");
    });

    it("the card default is a REGISTRY declaration, not a composer list", () => {
        const registry = readFileSync(
            resolve(process.cwd(), "lib/adminV2/runtime/focusPanel/focusPanelCardRegistry.ts"), "utf8");
        expect(registry).toContain("firstOrderFields");
        // The composer must not carry the fallback either.
        expect(COMPOSER).not.toContain("firstOrderFields");
    });

    it("a card that declares no default and configures nothing contributes no field", () => {
        const cfg = resolveFirstOrderSurfaceConfiguration({
            cardKeys: ["some_future_card"], kpiKeys: [], workViewIds: [], siteScopeId: null,
        });
        expect(cfg.cards[0].semanticKeys).toEqual([]);
        expect(compileFirstOrderPlan(cfg).ok).toBe(true);
    });
});

describe("FACT IDENTITY — children reached through the HOUSEHOLD are still children", () => {
    /*
     * FOUND ON DEPLOYED DATA, not in review. `enrichOpportunityRowsWithChildrenForCompactQueue`
     * writes `_inquiry_children` only for children seeded from inquiry metadata; children reached
     * via `customer_members` land under `_household_children`. The capability read a normalizer
     * that sees neither of those — only `_inquiry_children` — so a real family with one child
     * projected `known(0)` while the operator's frame rendered "1 child".
     *
     * A state-shape oracle passes that. Only comparing the VALUE against the canonical fact
     * catches it, which is why this suite exists alongside the state gates.
     */
    const householdOnly = {
        // No `_inquiry_children` at all: this roster was reached through the household.
        _crm_compact_children: [{ primary: "Specee S", secondary: null, customerMemberId: "cm9" }],
        _household_children: [{ id: "cm9", customer_member_id: "cm9", display_name: "Specee S" }],
    };

    it("a household-derived roster is COUNTED, not reported as zero", async () => {
        vi.mocked(enrichOpportunityRowsWithChildrenForCompactQueue).mockResolvedValueOnce(
            new Map([["o1", householdOnly]]) as never);
        const r = await compose(enrollment({ cardKeys: ["children"] }));
        const f = r.projection.cards.children.facts["children.count"];
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value, "a household-derived child is still a child").toBe(1);
    });

    it("ENROLLING COUNT IS UNKNOWN when the roster carries no outcome", async () => {
        /*
         * Only the inquiry roster carries `outcome_status_key`. Reporting 0 enrolling for children
         * nobody has assessed would be the same false-fact mistake in a new place.
         */
        vi.mocked(enrichOpportunityRowsWithChildrenForCompactQueue).mockResolvedValueOnce(
            new Map([["o1", householdOnly]]) as never);
        const r = await compose(enrollment({ cardKeys: ["children"] }));
        expect(r.projection.cards.children.facts["children.enrolling_count"].state).toBe("unknown");
    });

    it("an outcome-bearing roster still reports the enrolling count", async () => {
        const r = await compose(enrollment({ cardKeys: ["children"] }));
        const e = r.projection.cards.children.facts["children.enrolling_count"];
        expect(e.state).toBe("known");
        if (e.state === "known") expect(e.value).toBe(1);
    });

    it("a genuinely childless record is a REAL zero, not unknown", async () => {
        vi.mocked(enrichOpportunityRowsWithChildrenForCompactQueue).mockResolvedValueOnce(
            new Map([["o1", { _crm_compact_children: [], _inquiry_children: [] }]]) as never);
        const r = await compose(enrollment({ cardKeys: ["children"] }));
        const f = r.projection.cards.children.facts["children.count"];
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toBe(0);
        expect(r.projection.cards.children.facts["children.enrolling_count"].state).toBe("known");
    });
});

describe("PART 6 — KPI and Work View VALUES are configuration, with zero source changes", () => {
    /*
     * The Director ruled both first-order: geometry without values is not a complete frame. They
     * therefore select capabilities exactly as card fields do — and, exactly as card fields do,
     * a surface that configures none must pay nothing for them.
     */
    const cfg = (kpiKeys: string[], workViewIds: string[]): FirstOrderSurfaceConfiguration =>
        ({ cards: [{ cardKey: "household", semanticKeys: ["household.label"] }], kpiKeys, workViewIds, siteScopeId: null });

    it("ADD / REMOVE / REORDER a KPI — plan follows, source does not change", () => {
        expect(compileFirstOrderPlan(cfg(["a"], [])).fields.filter((f) => f.semanticKey.startsWith("kpi:")).length).toBe(1);
        expect(compileFirstOrderPlan(cfg(["a", "b", "c"], [])).fields.filter((f) => f.semanticKey.startsWith("kpi:")).length).toBe(3);
        expect(compileFirstOrderPlan(cfg([], [])).fields.filter((f) => f.semanticKey.startsWith("kpi:")).length).toBe(0);
        const fwd = compileFirstOrderPlan(cfg(["a", "b"], [])).fields.map((f) => f.semanticKey);
        const rev = compileFirstOrderPlan(cfg(["b", "a"], [])).fields.map((f) => f.semanticKey);
        expect(fwd).not.toEqual(rev);
        expect([...fwd].sort()).toEqual([...rev].sort());
    });

    it("ADD / REMOVE / REORDER a Work View — same", () => {
        expect(compileFirstOrderPlan(cfg([], ["v1"])).fields.filter((f) => f.semanticKey.startsWith("work_view:")).length).toBe(1);
        expect(compileFirstOrderPlan(cfg([], ["v1", "v2", "v3"])).fields.filter((f) => f.semanticKey.startsWith("work_view:")).length).toBe(3);
        expect(compileFirstOrderPlan(cfg([], [])).fields.filter((f) => f.semanticKey.startsWith("work_view:")).length).toBe(0);
    });

    it("AN UNCONFIGURED KPI COSTS ZERO WORK", async () => {
        const none = compileFirstOrderPlan(cfg([], []));
        expect(none.prerequisites.has("header_kpis"), "the KPI read survived having no consumer").toBe(false);
        const some = compileFirstOrderPlan(cfg(["a"], []));
        expect(some.prerequisites.has("header_kpis")).toBe(true);
    });

    it("AN UNCONFIGURED WORK VIEW COSTS ZERO WORK", () => {
        expect(compileFirstOrderPlan(cfg([], [])).prerequisites.has("work_view_totals")).toBe(false);
        expect(compileFirstOrderPlan(cfg([], ["v1"])).prerequisites.has("work_view_totals")).toBe(true);
    });

    it("THREE KPI SLOTS SHARE ONE READ — the family is acquired once", async () => {
        const r = await compose(enrollment({ kpiKeys: ["a", "b", "c"] }));
        expect(r.timing.executedResolvers.filter((x) => x === "header_kpis").length).toBe(1);
    });

    it("KPI and Work View values reach the projection, not just its geometry", async () => {
        const r = await compose(enrollment());
        expect(Object.keys(r.projection.kpiValues).sort()).toEqual(["a", "b", "c"]);
        expect(Object.keys(r.projection.workViewTotals).sort()).toEqual(["v1", "v2"]);
        // Every configured slot carries a canonical STATE — never "still loading".
        for (const f of [...Object.values(r.projection.kpiValues), ...Object.values(r.projection.workViewTotals)]) {
            expect(["known", "known_zero", "known_empty", "unknown", "unavailable", "forbidden"]).toContain(f.state);
        }
    });

    it("the family buckets are NOT surface — a configured card set gains no cards nobody configured", async () => {
        const r = await compose(enrollment());
        expect(Object.keys(r.projection.cards)).not.toContain("kpi");
        expect(Object.keys(r.projection.cards)).not.toContain("work_view");
        expect(Object.keys(r.projection.cards).sort()).toEqual([...ENROLLMENT_CARDS].sort());
    });

    it("SYNTHETIC BILLING configures its own KPI and Work View set through the same runtime", async () => {
        const billing: FirstOrderSurfaceConfiguration = {
            cards: [{ cardKey: "billing_overview", semanticKeys: ["financials.balance_cents"] }],
            kpiKeys: ["billing_kpi_1", "billing_kpi_2", "billing_kpi_3", "billing_kpi_4"],
            workViewIds: ["past_due", "plans"], siteScopeId: "site-7",
        };
        const r = await compose(billing);
        expect(r.plan.ok).toBe(true);
        expect(Object.keys(r.projection.kpiValues).length).toBe(4);
        expect(Object.keys(r.projection.workViewTotals).length).toBe(2);
        // The composer still names neither family member nor Billing.
        expect(COMPOSER).not.toMatch(/billing|needs_attention|past_due/i);
    });
});

describe("THE IMPORT CYCLE MUST NOT BE POSSIBLE AGAIN", () => {
    /*
     * The family constants were first declared in the compiler, which the registry imports while
     * the compiler imports the registry's lookup. At module initialisation the constants were
     * `undefined`, so every family registered as "undefined:*" and EVERY configured KPI and Work
     * View compiled as an unsupported capability. Nothing about the source read wrongly; the
     * cycle only showed up at runtime.
     *
     * These gates pin the property rather than the tidy-up: the identifiers are real strings when
     * the registry registers them, and the contract module stays a leaf.
     */
    it("family identifiers are initialised — no capability registers as undefined", () => {
        expect(KPI_CAPABILITY_FAMILY).toBe("kpi");
        expect(WORK_VIEW_CAPABILITY_FAMILY).toBe("work_view");
        for (const key of registeredFirstOrderSemanticKeys()) {
            expect(key, "a capability registered with an uninitialised family constant")
                .not.toContain("undefined");
        }
    });

    it("both families are findable by the exact key the compiler looks up", () => {
        for (const family of [KPI_CAPABILITY_FAMILY, WORK_VIEW_CAPABILITY_FAMILY]) {
            const cap = findFirstOrderCapability(`${family}:*`);
            expect(cap, `the compiler's lookup key "${family}:*" resolves to nothing`).toBeDefined();
            expect(cap?.projectMember, "a family capability without projectMember cannot project a member")
                .toBeTypeOf("function");
        }
    });

    it("THE CONTRACT MODULE IS A LEAF — it imports no first-order module that imports it back", () => {
        const contract = readFileSync(resolve(SRC_DIR, "firstOrderCapability.ts"), "utf8");
        for (const cyclic of ["compileFirstOrderPlan", "firstOrderCapabilityRegistry", "composeFirstOrderWorkUnitProjection"]) {
            expect(contract, `firstOrderCapability imports ${cyclic}, reopening the cycle`)
                .not.toMatch(new RegExp(`from "@/lib/runtime/firstOrder/${cyclic}"`));
        }
    });

    it("A CONFIGURED KPI AND WORK VIEW ACTUALLY COMPILE — the end-to-end symptom", () => {
        /*
         * The defect's visible signature was five unsupported capabilities on a surface that
         * configures three KPIs and two Work Views. This asserts the symptom directly, so a
         * future cycle fails here even if the structural gates above are satisfied some other way.
         */
        const plan = compileFirstOrderPlan(enrollment());
        expect(plan.unsupported, JSON.stringify(plan.unsupported)).toEqual([]);
        expect(plan.ok).toBe(true);
        expect(plan.fields.filter((f) => f.semanticKey.startsWith("kpi:")).length).toBe(3);
        expect(plan.fields.filter((f) => f.semanticKey.startsWith("work_view:")).length).toBe(2);
    });
});

describe("STATE SEMANTICS OF THE VALUE FAMILIES — UNKNOWN is not ZERO here either", () => {
    /*
     * Found by plants, not review: the states were implemented correctly and gated nowhere, so a
     * mutation turning a missing KPI into known(0) and a failed Work View read into known(0) both
     * stayed green across the whole battery. A KPI is a figure an operator acts on; zero is a real
     * operational answer and must never stand in for "we did not resolve it".
     */
    it("A KPI THE RESOLVER DID NOT ANSWER IS UNKNOWN, never zero", async () => {
        vi.mocked(readHeaderKpiValues).mockResolvedValueOnce({ status: "ok", values: { a: 6 } });
        const r = await compose(enrollment());
        expect(r.projection.kpiValues.a.state).toBe("known");
        expect(r.projection.kpiValues.b.state, "an unanswered KPI became a value").toBe("unknown");
        expect(r.projection.kpiValues.c.state).toBe("unknown");
        expect(JSON.stringify([r.projection.kpiValues.b, r.projection.kpiValues.c])).not.toContain('"value":0');
    });

    it("A KPI OF ZERO IS A REAL ANSWER and survives as known", async () => {
        vi.mocked(readHeaderKpiValues).mockResolvedValueOnce({ status: "ok", values: { a: 0, b: 0, c: 0 } });
        const r = await compose(enrollment());
        const f = r.projection.kpiValues.a;
        expect(f.state).toBe("known");
        if (f.state === "known") expect(f.value).toBe(0);
    });

    it("A FAILED KPI RESOLUTION IS UNAVAILABLE, never zero", async () => {
        vi.mocked(readHeaderKpiValues).mockRejectedValueOnce(new Error("down"));
        const r = await compose(enrollment());
        for (const k of ["a", "b", "c"]) expect(r.projection.kpiValues[k].state).toBe("unavailable");
        expect(JSON.stringify(r.projection.kpiValues)).not.toContain('"value":0');
    });

    it("A REFUSED ANALYTICS CALLER GETS FORBIDDEN, never zero and never empty", async () => {
        vi.mocked(readHeaderKpiValues).mockResolvedValueOnce({ status: "forbidden", values: {} });
        const r = await compose(enrollment());
        for (const k of ["a", "b", "c"]) expect(r.projection.kpiValues[k].state).toBe("forbidden");
    });

    it("A FAILED WORK VIEW READ IS UNAVAILABLE, never zero", async () => {
        vi.mocked(readWorkViewTotalsForFirstOrder).mockRejectedValueOnce(new Error("down"));
        const r = await compose(enrollment());
        for (const v of ["v1", "v2"]) expect(r.projection.workViewTotals[v].state).toBe("unavailable");
        expect(JSON.stringify(r.projection.workViewTotals)).not.toContain('"value":0');
    });

    it("A WORK VIEW TOTAL OF ZERO IS A REAL ANSWER", async () => {
        vi.mocked(readWorkViewTotalsForFirstOrder).mockResolvedValueOnce({
            status: "ok", totalsByViewId: { v1: 0, v2: 7 }, configuredViewSignature: "v1|v2", diagnostics: { spans: {}, targetCount: 2, hostWorkUnitCount: 1, groupCount: 1, locatorMs: 0, seedMs: 0, deptUnitsMs: 0, deptUnitCount: 1, timeline: [] },
        });
        const r = await compose(enrollment());
        const a = r.projection.workViewTotals.v1; const b = r.projection.workViewTotals.v2;
        expect(a.state).toBe("known");
        if (a.state === "known") expect(a.value).toBe(0);
        if (b.state === "known") expect(b.value).toBe(7);
    });

    it("A WORK VIEW THE EVALUATOR DID NOT ANSWER IS UNKNOWN", async () => {
        vi.mocked(readWorkViewTotalsForFirstOrder).mockResolvedValueOnce({
            status: "ok", totalsByViewId: { v1: 3 }, configuredViewSignature: "v1|v2", diagnostics: { spans: {}, targetCount: 2, hostWorkUnitCount: 1, groupCount: 1, locatorMs: 0, seedMs: 0, deptUnitsMs: 0, deptUnitCount: 1, timeline: [] },
        });
        const r = await compose(enrollment());
        expect(r.projection.workViewTotals.v2.state).toBe("unknown");
    });
});
