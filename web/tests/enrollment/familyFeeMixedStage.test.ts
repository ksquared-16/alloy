/**
 * A FAMILY'S FEES WHEN SIBLINGS ARE AT DIFFERENT STAGES.
 *
 * Measured on staging (ZZQA1474FAMK): Ava enrolling with a per-child registration fee, Ben waitlisted
 * with four field requirements. The family projection kept ONE requirement list that the last child
 * read overwrote — Ben's waitlist fields replaced Ava's requirements, so her fee read NOT_APPLICABLE
 * and the payment step vanished; and one family-wide count of open fields meant Ben's waitlist work
 * would have held Ava's fee back.
 *
 * Each child now contributes its own requirements and its own dueness, and each fee is read for the
 * children it belongs to. These drive the real reader against canonical-shaped charge rows; only the
 * Financials position (`resolveFamilyCollectible`) is stubbed, with the figures Financials would quote.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const positions = new Map<string, { gross: number; applied: number; outstanding: number }>();
vi.mock("@/lib/financials/subsidy/resolveFamilyCollectible", () => ({
    resolveFamilyCollectible: async (_s: unknown, { chargeId }: { chargeId: string }) => {
        const p = positions.get(chargeId);
        if (!p) throw new Error(`no position for ${chargeId}`);
        return {
            chargeId,
            currencyCode: "USD",
            explanation: { grossCents: p.gross, appliedCents: p.applied, suppressionBoundBy: null, openVarianceStates: [] },
            expectedSubsidyCents: 0,
            currentlyCollectibleCents: p.outstanding,
            outstandingCents: p.outstanding,
            unresolvedVarianceCents: 0,
        };
    },
}));

/* The resolver's own collaborators: the live episode, and each child's OWN progress per process
   instance — exactly what each child's participant surface reads. */
const progressByInstance = new Map<string, { requirements: StageRequirementV1[]; satisfied: Set<string> }>();
vi.mock("@/lib/records/enrollmentContextResolver", () => ({
    resolveLiveEnrollmentContextForHousehold: async () => ({
        context: { opportunityId: "opp-1", runningSubjectIds: ["cm-ava", "cm-ben"] },
        consideredOpportunityIds: ["opp-1"],
    }),
}));
vi.mock("@/lib/enrollment/participantProgress/resolveEnrollmentParticipantProgress", () => ({
    resolveEnrollmentParticipantProgress: async (
        _s: unknown,
        input: { processInstanceId: string; captureLoaded?: (l: unknown) => void },
    ) => {
        const own = progressByInstance.get(input.processInstanceId)!;
        input.captureLoaded?.({ session: null, items: [], formBySessionItem: new Map(), subjectId: null, requirements: own.requirements });
        const requirements = own.requirements.map((r) => ({
            requirement_id: r.requirement_id,
            kind: r.ref.kind,
            status: own.satisfied.has(r.requirement_id) ? "satisfied" : "outstanding",
        }));
        return {
            ok: true,
            value: {
                process_instance_id: input.processInstanceId,
                total_requirements: requirements.length,
                satisfied_requirements: requirements.filter((r) => r.status === "satisfied").length,
                remaining_requirements: requirements.filter((r) => r.status !== "satisfied").length,
                requirements,
            },
        };
    },
}));

import { resolveFamilyEnrollmentExperience } from "@/lib/enrollment/family/resolveFamilyEnrollmentExperience";
import {
    planFamilyFeeReads,
    readFamilyEnrollmentFeeProjection,
    type FamilyFeeChild,
} from "@/lib/enrollment/financial/readEnrollmentFeeProjection";
import { combineEnrollmentFinancialProjections } from "@/lib/enrollment/financial/enrollmentFinancialRequirement";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";

const ORG = "org-1";
const HOUSEHOLD = "cust-1";
const AVA = "cm-ava";
const BEN = "cm-ben";

const fee = (id: string, template: string, scope: "each_child" | "record"): StageRequirementV1 =>
    ({ requirement_id: id, ref: { kind: "financial", charge_template_key: template }, level: "required", scope }) as unknown as StageRequirementV1;
const form = (id: string): StageRequirementV1 =>
    ({ requirement_id: id, ref: { kind: "form", form_definition_id: id }, level: "required", scope: "record" }) as unknown as StageRequirementV1;
const field = (id: string): StageRequirementV1 =>
    ({ requirement_id: id, ref: { kind: "field", field_key: id }, level: "required" }) as unknown as StageRequirementV1;

/** The deployed configuration: Enrolling carries three forms and a per-child fee; Waitlist four fields. */
const ENROLLING = [form("f1"), form("f2"), form("f3"), fee("fee_registration_fee", "registration_fee", "each_child")];
const WAITLIST = [field("w1"), field("w2"), field("w3"), field("w4")];

type Charge = { id: string; billable_source_type: string; billable_source_id: string; metadata: Record<string, unknown>; source_charge_id?: string; status?: string };
let charges: Charge[];

/** Canonical-shaped charge rows. Any write would throw — reading a fee must never create one. */
function supabase() {
    return {
        from(table: string) {
            if (table !== "charges") throw new Error(`unexpected table ${table}`);
            let rows: Record<string, unknown>[] = charges.map((c) => ({ org_id: ORG, status: "posted", ...c }));
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (col: string, val: unknown) => {
                    const json = /^metadata->>(.+)$/.exec(col);
                    rows = rows.filter((r) =>
                        json ? ((r.metadata ?? {}) as Record<string, unknown>)[json[1]] === val : r[col] === val,
                    );
                    return api;
                },
                insert: () => { throw new Error("WROTE during a read"); },
                update: () => { throw new Error("WROTE during a read"); },
                then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
            };
            return api;
        },
    } as never;
}

const childFee = (id: string, child: string, template = "registration_fee"): Charge => ({
    id,
    billable_source_type: "customer",
    billable_source_id: HOUSEHOLD,
    metadata: { charge_template_key: template, subject_customer_member_id: child },
});

const ava = (over: Partial<FamilyFeeChild> = {}): FamilyFeeChild => ({ customerMemberId: AVA, agreementId: null, requirements: ENROLLING, due: true, ...over });
const ben = (over: Partial<FamilyFeeChild> = {}): FamilyFeeChild => ({ customerMemberId: BEN, agreementId: null, requirements: WAITLIST, due: false, ...over });

const read = (children: FamilyFeeChild[]) => readFamilyEnrollmentFeeProjection(supabase(), { orgId: ORG, customerId: HOUSEHOLD, children });

beforeEach(() => {
    charges = [];
    positions.clear();
});

describe("Enrolling + Waitlist — the measured household", () => {
    it("Ava's fee is found whichever child is read last; Ben's waitlist fields cannot replace it", async () => {
        charges = [childFee("chg-ava", AVA)];
        positions.set("chg-ava", { gross: 15000, applied: 0, outstanding: 15000 });

        for (const order of [[ava(), ben()], [ben(), ava()]]) {
            const p = await read(order);
            expect(p.state).not.toBe("NOT_APPLICABLE");
            expect(p.state).toBe("DUE");
            expect(p.obligations.map((o) => [o.position?.chargeId, o.subjectCustomerMemberId])).toEqual([["chg-ava", AVA]]);
            expect(p.amounts.collectibleNowCents).toBe(15000);
        }
    });

    it("Ben's open waitlist work does not hold Ava's fee: her own paperwork decides when it is due", async () => {
        // Ava done, Ben not: no charge exists yet, so the fee is due-and-unmaterialized — NOT "not due".
        const p = await read([ava({ due: true }), ben({ due: false })]);
        expect(p.state).toBe("ATTENTION_REQUIRED");
        expect(p.explanation).toMatch(/due, but no charge has been created/);
    });

    it("Ava's own unfinished paperwork still keeps her fee not due", async () => {
        const p = await read([ava({ due: false }), ben({ due: true })]);
        expect(p.state).toBe("NOT_DUE");
    });

    it("a family whose only live child is waitlisted genuinely has no fee", async () => {
        const p = await read([ben()]);
        expect(p.state).toBe("NOT_APPLICABLE");
    });
});

describe("Enrolling + Enrolling", () => {
    it("each child's fee is its own obligation; amounts sum, nothing is merged or duplicated", async () => {
        charges = [childFee("chg-ava", AVA), childFee("chg-ben", BEN)];
        positions.set("chg-ava", { gross: 15000, applied: 15000, outstanding: 0 });
        positions.set("chg-ben", { gross: 10000, applied: 0, outstanding: 10000 });

        const p = await read([ava(), ben({ requirements: ENROLLING, due: true })]);
        expect(p.obligations.map((o) => [o.position?.chargeId, o.subjectCustomerMemberId])).toEqual([
            ["chg-ava", AVA],
            ["chg-ben", BEN],
        ]);
        expect(p.obligations.map((o) => o.state)).toEqual(["SATISFIED", "DUE"]);
        // The family still owes Ben's fee; Ava's being paid does not complete the household.
        expect(p.state).toBe("DUE");
        expect(p.amounts).toMatchObject({ grossCents: 25000, appliedCents: 15000, collectibleNowCents: 10000 });
    });

    it("one child's progress does not make the other's fee due", async () => {
        charges = [childFee("chg-ava", AVA)];
        positions.set("chg-ava", { gross: 15000, applied: 0, outstanding: 15000 });
        const p = await read([ava({ due: true }), ben({ requirements: ENROLLING, due: false })]);
        expect(p.obligations).toHaveLength(1);
        expect(p.obligations[0]!.subjectCustomerMemberId).toBe(AVA);
        expect(p.state).toBe("DUE");
    });
});

describe("different pinned revisions", () => {
    it("each child's fee is read under its own revision's requirement and template", async () => {
        const benRevision = [form("f9"), fee("fee_registration_v2", "registration_fee_v2", "each_child")];
        charges = [childFee("chg-ava", AVA), childFee("chg-ben", BEN, "registration_fee_v2")];
        positions.set("chg-ava", { gross: 15000, applied: 0, outstanding: 15000 });
        positions.set("chg-ben", { gross: 12000, applied: 0, outstanding: 12000 });

        const p = await read([ava(), ben({ requirements: benRevision, due: true })]);
        expect(p.obligations.map((o) => [o.requirementId, o.chargeTemplateKey, o.subjectCustomerMemberId])).toEqual([
            ["fee_registration_fee", "registration_fee", AVA],
            ["fee_registration_v2", "registration_fee_v2", BEN],
        ]);
        expect(p.amounts.collectibleNowCents).toBe(27000);
    });
});

describe("a shared (household) fee", () => {
    const SHARED = [form("f1"), fee("family_fee", "family_fee", "record")];

    it("is read once for the children whose stage carries it, never once per child", () => {
        const reads = planFamilyFeeReads([ava({ requirements: SHARED }), ben({ requirements: SHARED, due: true }), { ...ben(), customerMemberId: "cm-cy" }]);
        expect(reads).toHaveLength(1);
        expect(reads[0]!.enrollingChildren.map((c) => c.customerMemberId)).toEqual([AVA, BEN]);
        expect(reads[0]!.due).toBe(true);
    });

    it("is due only when every child carrying it is done — a sibling at another stage has no say", () => {
        const notDone = planFamilyFeeReads([ava({ requirements: SHARED, due: true }), ben({ requirements: SHARED, due: false })]);
        expect(notDone[0]!.due).toBe(false);
        const otherStage = planFamilyFeeReads([ava({ requirements: SHARED, due: true }), ben({ due: false })]);
        expect(otherStage[0]!.due).toBe(true);
        expect(otherStage[0]!.enrollingChildren.map((c) => c.customerMemberId)).toEqual([AVA]);
    });

    it("yields one household obligation even with two carriers", async () => {
        charges = [{ id: "chg-family", billable_source_type: "customer", billable_source_id: HOUSEHOLD, metadata: { charge_template_key: "family_fee" } }];
        positions.set("chg-family", { gross: 5000, applied: 0, outstanding: 5000 });
        const p = await read([ava({ requirements: SHARED }), ben({ requirements: SHARED, due: true })]);
        expect(p.obligations.map((o) => o.position?.chargeId)).toEqual(["chg-family"]);
        expect(p.amounts.collectibleNowCents).toBe(5000);
    });
});

describe("combining never double-counts", () => {
    it("a charge present in two parts appears once", async () => {
        charges = [childFee("chg-ava", AVA)];
        positions.set("chg-ava", { gross: 15000, applied: 0, outstanding: 15000 });
        const one = await read([ava()]);
        const p = combineEnrollmentFinancialProjections([one, one]);
        expect(p.obligations).toHaveLength(1);
        expect(p.amounts.collectibleNowCents).toBe(15000);
    });
});

describe("the family resolver — the measured household, end to end through the projection", () => {
    /** Every table the resolver reads, as rows; charges come from the same canonical-shaped list. */
    function familyDb(instances: Record<string, unknown>[]) {
        const tables: Record<string, Record<string, unknown>[]> = {
            process_instances: instances,
            customer_members: [
                { id: AVA, org_id: ORG, customer_id: HOUSEHOLD, display_name: "Ava" },
                { id: BEN, org_id: ORG, customer_id: HOUSEHOLD, display_name: "Ben" },
            ],
            form_packet_sessions: [],
            processing_cases: [],
            child_enrollment_agreements: [],
            customers: [{ id: HOUSEHOLD, org_id: ORG, name: "Test Family" }],
        };
        return {
            from(table: string) {
                if (table === "charges") return (supabase() as unknown as { from: (t: string) => unknown }).from("charges");
                let rows = [...(tables[table] ?? [])];
                const api: Record<string, unknown> = {
                    select: () => api,
                    eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return api; },
                    in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return api; },
                    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                    insert: () => { throw new Error("WROTE during a read"); },
                    update: () => { throw new Error("WROTE during a read"); },
                    then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
                };
                return api;
            },
        } as never;
    }

    const instances = (order: "ava-first" | "ben-first") => {
        const a = { id: "pi-ava", org_id: ORG, subject_id: AVA, state: null, stage_key: "enrolling" };
        const b = { id: "pi-ben", org_id: ORG, subject_id: BEN, state: null, stage_key: "waitlist" };
        return order === "ava-first" ? [a, b] : [b, a];
    };

    beforeEach(() => {
        progressByInstance.clear();
        // Ava: paperwork done, fee open. Ben: waitlisted, four fields still open.
        progressByInstance.set("pi-ava", { requirements: ENROLLING, satisfied: new Set(["f1", "f2", "f3"]) });
        progressByInstance.set("pi-ben", { requirements: WAITLIST, satisfied: new Set() });
        charges = [childFee("chg-ava", AVA)];
        positions.set("chg-ava", { gross: 15000, applied: 0, outstanding: 15000 });
    });

    for (const order of ["ava-first", "ben-first"] as const) {
        it(`Ava's fee survives Ben's waitlist stage and is payable (${order})`, async () => {
            const r = await resolveFamilyEnrollmentExperience(familyDb(instances(order)), {
                orgId: ORG,
                session: { crm_snapshot: { customer_id: HOUSEHOLD } } as never,
            });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.projection?.state).toBe("DUE");
            expect(r.projection?.obligations.map((o) => [o.position?.chargeId, o.subjectCustomerMemberId])).toEqual([["chg-ava", AVA]]);
            expect(r.value.financials?.state).toBe("DUE");
            // Per-child progress stays each child's own: Ava has one open item (her fee), Ben four.
            const byName = Object.fromEntries(r.value.children.map((c) => [c.customerMemberId, c.remainingRequirements]));
            expect(byName).toEqual({ [AVA]: 1, [BEN]: 4 });
        });
    }

    it("Ben's open waitlist fields do not hold Ava's fee as not-due (no charge yet)", async () => {
        charges = [];
        const r = await resolveFamilyEnrollmentExperience(familyDb(instances("ben-first")), {
            orgId: ORG,
            session: { crm_snapshot: { customer_id: HOUSEHOLD } } as never,
        });
        // Ava's paperwork is done, so her fee is due; with no charge materialized yet that is an
        // operator-visible gap — never "not due" because of a sibling's unrelated work.
        expect(r.ok && r.projection?.state).toBe("ATTENTION_REQUIRED");
    });

    it("paid: Ava's fee reads satisfied while Ben is still waitlisted — no household completion inferred", async () => {
        positions.set("chg-ava", { gross: 15000, applied: 15000, outstanding: 0 });
        const r = await resolveFamilyEnrollmentExperience(familyDb(instances("ben-first")), {
            orgId: ORG,
            session: { crm_snapshot: { customer_id: HOUSEHOLD } } as never,
        });
        expect(r.ok && r.projection?.state).toBe("SATISFIED");
        expect(r.ok && r.value.children.find((c) => c.customerMemberId === BEN)?.remainingRequirements).toBe(4);
    });
});
