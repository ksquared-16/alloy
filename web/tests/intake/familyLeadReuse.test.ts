import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

/**
 * ONE OPEN FAMILY CASE PER HOUSEHOLD (at the intake's location).
 *
 * Deployed Phase G of #1445: a matched family (exact parent email, existing household with an open
 * Enrollment lead) submitted a second child; review promised the existing lead, and approval opened a
 * SECOND lead. BOS → Create Lead did the same — the shared lookup looked for `status_key = 'open'` while
 * both doors commit leads as `new`, so no open lead was ever found.
 */
vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    fetchEffectiveStatusDefinitions: async () => [
        { status_key: "new", status_label: "New", entity_type: "opportunities", is_active: true, metadata: {} },
        { status_key: "open", status_label: "Open", entity_type: "opportunities", is_active: true, metadata: {} },
        { status_key: "lost", status_label: "Lost", entity_type: "opportunities", is_active: true, metadata: { terminal: true } },
        { status_key: "closed", status_label: "Closed", entity_type: "opportunities", is_active: true, metadata: { terminal: true } },
    ],
}));

import { findExistingIntakeOpportunity } from "@/lib/forms/intake/intakeOpportunityDedup";
import { buildRecommendations } from "@/lib/pos/processingIdentity/operator/recommendationBuilder";
import { IDENTITY_COMMAND_KEYS } from "@/lib/pos/processingIdentity/commands";
import { summarizeLeadCommitRecords } from "@/lib/pos/leadCommitRecords";
import { buildApprovalResultView } from "@/lib/pos/approvalResultPresentation";
import { buildLeadAcknowledgementView } from "@/lib/pos/leadAcknowledgementPresentation";

type Row = Record<string, unknown>;
function fakeDb(opportunities: Row[]): SupabaseClient {
    return {
        from(table: string) {
            const rows = table === "opportunities" ? opportunities : [];
            const filters: Array<(r: Row) => boolean> = [];
            const b = {
                select: () => b,
                eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
                in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
                then: (res: (x: { data: Row[]; error: null }) => unknown) => res({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
            };
            return b;
        },
    } as unknown as SupabaseClient;
}

const ORG = "org-1", HH = "hh-1", PARENT = "p-1", NORTH = "loc-north";
const lead = (id: string, extra: Row = {}) => ({ id, org_id: ORG, customer_id: HH, primary_person_id: PARENT, location_id: NORTH, status_key: "new", ...extra });

describe("findExistingIntakeOpportunity — the family's open case", () => {
    it("finds the household's open lead in its entry status (`new`), not only a literal `open`", async () => {
        const db = fakeDb([lead("o-1")]);
        await expect(findExistingIntakeOpportunity(db, { orgId: ORG, personId: PARENT, customerId: HH, locationId: NORTH })).resolves.toEqual({
            kind: "matched",
            opportunityId: "o-1",
        });
    });

    it("never reuses or reopens a CLOSED prior case — a new intake starts a new case", async () => {
        const db = fakeDb([lead("o-closed", { status_key: "closed" }), lead("o-lost", { status_key: "lost" })]);
        await expect(findExistingIntakeOpportunity(db, { orgId: ORG, personId: PARENT, customerId: HH, locationId: NORTH })).resolves.toEqual({ kind: "no_match" });
    });

    it("is scoped to the resolved household — another household's lead is never reused", async () => {
        const db = fakeDb([lead("o-foreign", { customer_id: "hh-other" })]);
        await expect(findExistingIntakeOpportunity(db, { orgId: ORG, personId: PARENT, customerId: HH, locationId: NORTH })).resolves.toEqual({ kind: "no_match" });
    });

    it("is scoped to the intake's location when one is known", async () => {
        const db = fakeDb([lead("o-south", { location_id: "loc-south" })]);
        await expect(findExistingIntakeOpportunity(db, { orgId: ORG, personId: PARENT, customerId: HH, locationId: NORTH })).resolves.toEqual({ kind: "no_match" });
    });

    it("two open cases for one household are surfaced as ambiguous, never guessed", async () => {
        const db = fakeDb([lead("o-1"), lead("o-2")]);
        await expect(findExistingIntakeOpportunity(db, { orgId: ORG, personId: PARENT, customerId: HH, locationId: NORTH })).resolves.toMatchObject({ kind: "ambiguous" });
    });

    it("without a resolved household it falls back to the matched parent", async () => {
        const db = fakeDb([lead("o-1", { customer_id: null })]);
        await expect(findExistingIntakeOpportunity(db, { orgId: ORG, personId: PARENT, locationId: NORTH })).resolves.toEqual({ kind: "matched", opportunityId: "o-1" });
    });
});

describe("plan — a sibling attaches to the family's open lead", () => {
    const set = {
        subjects: [
            { ref: "household:0", role: "household" as const, decision: "link" as const, selectedRecordId: HH },
            { ref: "parent:0", role: "parent" as const, decision: "link" as const, selectedRecordId: PARENT, householdRef: "household:0" },
            { ref: "child:0", role: "child" as const, decision: "create" as const, householdRef: "household:0", values: { first_name: "Second", last_name: "Kid" } },
            { ref: "household:0:lead", role: "lead" as const, decision: "link" as const, selectedRecordId: "o-1", householdRef: "household:0" },
            { ref: "participation:0", role: "participation" as const, decision: "create" as const, childRef: "child:0", leadRef: "household:0:lead" },
        ],
    };

    it("plans NO new lead: the existing lead is a reuse (no_op) carrying its id", () => {
        const ops = buildRecommendations(set).operations;
        const leadOps = ops.filter((o) => o.commandKey === IDENTITY_COMMAND_KEYS.createLead);
        expect(leadOps).toHaveLength(1);
        expect(leadOps[0]).toMatchObject({ opKind: "no_op", targetId: "o-1" });
        expect(ops.some((o) => o.commandKey === IDENTITY_COMMAND_KEYS.createLead && o.opKind === "create")).toBe(false);
    });

    it("the new child's participation joins the existing lead", () => {
        const participation = buildRecommendations(set).operations.find((o) => o.commandKey === IDENTITY_COMMAND_KEYS.createProcessParticipation);
        expect((participation?.payload as { lead_id?: string }).lead_id).toBe("o-1");
    });
});

describe("result contract — reused is not created", () => {
    const reuseAttempt = [
        { commandKey: "create_household", status: "committed", recordId: HH, opKind: "no_op" },
        { commandKey: "update_person", status: "committed", recordId: PARENT, opKind: "update" },
        { commandKey: "create_child", status: "committed", recordId: "c-2", opKind: "create" },
        { commandKey: "create_lead", status: "committed", recordId: "o-1", opKind: "no_op" },
        { commandKey: "create_process_participation", status: "committed", recordId: "ocm-2", opKind: "workflow" },
    ];

    it("a linked household and a reused lead report their EXISTING ids, not created", () => {
        const r = summarizeLeadCommitRecords(reuseAttempt, { customer_id: HH, primary_person_id: PARENT });
        expect(r.records).toMatchObject({ household: HH, person: PARENT, child: "c-2", lead: "o-1" });
        expect(r.createdRecords).toEqual({ household: false, person: false, child: true, lead: false });
        expect(r.matchedExisting).toBe(true);
    });

    it("a new family still reports every record created", () => {
        const r = summarizeLeadCommitRecords(
            ["create_household", "create_person", "create_child", "create_lead"].map((k, i) => ({ commandKey: k, status: "committed", recordId: `n-${i}`, opKind: "create" })),
            null,
        );
        expect(r.createdRecords).toEqual({ household: true, person: true, child: true, lead: true });
        expect(r.matchedExisting).toBe(false);
    });

    it("the acknowledgement says existing family + existing lead, never 'Created Enrollment lead'", () => {
        const r = summarizeLeadCommitRecords(reuseAttempt, { customer_id: HH, primary_person_id: PARENT });
        const ack = buildLeadAcknowledgementView({ kind: "lead", recordId: "o-1", ...r });
        expect(ack.title).toBe("Added to an existing family");
        expect(ack.body).toMatch(/no new lead/i);
        const view = buildApprovalResultView({
            cards: [
                { role: "parent", name: "Fam Parent", basisTone: "match" } as never,
                { role: "child", name: "Second Kid", basisTone: "new" } as never,
                { role: "business_object", title: "Enrollment lead" } as never,
            ],
            records: r.records,
            createdRecords: r.createdRecords,
        });
        expect(view.created.map((l) => l.primary)).toEqual(expect.arrayContaining(["Second Kid"]));
        expect(view.created.map((l) => l.primary)).not.toContain("Enrollment lead");
        expect(view.linked.map((l) => l.primary)).toContain("Existing Enrollment lead");
    });
});
