/**
 * A RELATIONSHIP FROM THE PUBLISHED ADMISSIONS PACKET CARRIES ITS PERSON'S IDENTITY.
 *
 * Deployed (84111be1, Ben ZZQA1476ZMU7's case f923b33b): every guardian / emergency-contact commit
 * answered "Submitted response does not carry enough identity to propose a Person." The published
 * packet's collection members ("Full name", "Phone") carry no field_source, and person facts were read
 * from bound members only. The relationship definition declares those members; Processing now reads
 * them through it — explicit bindings first, a unique match or nothing.
 *
 * Regression fixture: the PUBLISHED Admissions schema, read-only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ invocations: [] as Array<{ invocation: { inputValues: Record<string, unknown> } }>, next: null as unknown }));
type Inv = { request: { invocation: { inputValues: Record<string, unknown> } } };
vi.mock("@/lib/platform/commands/runtime/executeCommandInvocation", () => ({
    executeCommandInvocation: async (inv: { request: { invocation: { inputValues: Record<string, unknown> } } }) => {
        m.invocations.push(inv.request);
        if (m.next) { const r = m.next; m.next = null; return r; }
        return { ok: true, status: "succeeded", output: { person_id: "person-new", links_written: 1 } };
    },
}));
vi.mock("@/lib/emitEvent", () => ({ emitEvent: async () => "evt" }));

import { validateFormSchema, type FormField, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload, FormPayloadGroupRow } from "@/lib/forms/validateSubmission";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import { relationshipDefinitionForRef } from "@/lib/fields/relationship/relationshipDefinitions";
import { interpretRelationshipMemberFields } from "@/lib/fields/relationship/relationshipNestedFields";
import { executeRelationshipProposalCommit } from "@/lib/pos/processingCase/commit/executeRelationshipProposalCommit";

const RAW = JSON.parse(readFileSync(resolve(__dirname, "../../forms/__fixtures_admissions_v12_published.json"), "utf8"));
const SCHEMA: FormSchemaV1 = validateFormSchema(RAW);
const group = (id: string) => SCHEMA.fields.find((f) => f.id === id) as FormField & { type: "group" };
const GUARDIANS = "emergency_contacts";
const EMERGENCY = "emergency_contacts_3";
const GUARDIAN_DEF = relationshipDefinitionForRef("person.contact_role.parents")!;
const EC_DEF = relationshipDefinitionForRef("person.contact_role.emergency_contacts")!;

let n = 0;
const member = (groupId: string, values: Record<string, unknown>): FormPayloadGroupRow => {
    const binding = group(groupId).collection_binding!;
    n += 1;
    return { instance_key: `row-${groupId}-${n}`, values, groups: {}, signatures: {}, collection: { provider_ref: binding.collection_provider_ref, origin: "respondent_added", iteration_entity_type: binding.iteration_entity_type } };
};
const guardian = (name: string | null = "Parent ZMU7B", phone = "5550101111") =>
    member(GUARDIANS, { ...(name !== null ? { emergency_contacts_full_name: name } : {}), emergency_contacts_phone: phone, emergency_contacts_relationship_to_the_child: "Mother" });
const contact = (name: string, phone: string) =>
    member(EMERGENCY, { emergency_contacts_3_full_name: name, emergency_contacts_3_phone: phone, emergency_contacts_3_relationship_to_the_child: "Aunt" });
const payload = (guardians: FormPayloadGroupRow[], contacts: FormPayloadGroupRow[]): FormPayload => ({ values: {}, groups: { [GUARDIANS]: guardians, [EMERGENCY]: contacts } } as FormPayload);

describe("the interpretation contract (relationshipNestedFields)", () => {
    const f = (id: string, label: string, field_source?: { entity_type: string; field_key: string }) => ({ id, label, field_source: field_source ?? null });

    it("the published packet's members match the definition's declared members uniquely", () => {
        const { interpreted, unresolved } = interpretRelationshipMemberFields(EC_DEF, [f("a", "Full name"), f("b", "Phone"), f("c", "Relationship to the child")]);
        expect(Object.fromEntries([...interpreted].map(([k, v]) => [k, `${v.field_source.entity_type}.${v.field_source.field_key}:${v.basis}`]))).toEqual({
            a: "person.full_name:definition_member",
            b: "person.phone:definition_member",
            c: "person_child_relationship.relationship_type:definition_member",
        });
        expect(unresolved).toEqual([]);
    });

    it("an explicit binding always wins, and an unbound member claiming the same key stays unresolved", () => {
        const { interpreted, unresolved } = interpretRelationshipMemberFields(EC_DEF, [f("a", "Mobile", { entity_type: "person", field_key: "phone" }), f("b", "Phone")]);
        expect(interpreted.get("a")).toEqual({ field_source: { entity_type: "person", field_key: "phone" }, basis: "bound" });
        expect(unresolved).toEqual(["b"]);
    });

    it("ambiguous, colliding and unknown members are never guessed", () => {
        // "Phone or email" names two declared members; two phones claim one; "Favourite colour" names none.
        const { interpreted, unresolved } = interpretRelationshipMemberFields(GUARDIAN_DEF, [
            f("x", "Phone or email"), f("h", "Home phone"), f("w", "Work phone"), f("c", "Favourite colour"),
        ]);
        expect(interpreted.size).toBe(0);
        expect(unresolved.sort()).toEqual(["c", "h", "w", "x"]);
    });
});

describe("the published Admissions packet, through the real adapter", () => {
    const bundle = () =>
        adaptFormSubmissionToRelatedRecordProposals(SCHEMA, payload([guardian()], [contact("Ec One Zzqa", "5550102222"), contact("Ec Two Zzqa", "5550103333")]), {
            formSubmissionId: "sub-1", formDefinitionVersionId: "ver-1",
        });
    const facts = (ref: string) =>
        bundle().collections.filter((c) => c.collection_provider_ref === ref).flatMap((c) => c.instances)
            .map((i) => Object.fromEntries((i.relationship_intent?.proposed_person_facts ?? []).map((p) => [p.field_key, p.value])));

    it("the guardian's name and phone are the guardian's", () => {
        expect(facts("person.contact_role.parents")).toEqual([{ full_name: "Parent ZMU7B", phone: "5550101111", relationship_type: "Mother" }]);
    });

    it("two emergency contacts stay two people, each with their own identity — none borrowed from the guardian", () => {
        expect(facts("person.contact_role.emergency_contacts")).toEqual([
            { full_name: "Ec One Zzqa", phone: "5550102222", relationship_type: "Aunt" },
            { full_name: "Ec Two Zzqa", phone: "5550103333", relationship_type: "Aunt" },
        ]);
    });

    it("provenance travels: each fact names its submitted field and how it was read", () => {
        const f0 = bundle().collections.find((c) => c.collection_provider_ref === "person.contact_role.emergency_contacts")!.instances[0]!.relationship_intent!.proposed_person_facts;
        expect(f0.map((x) => [x.source_field_id, x.basis])).toEqual([
            ["emergency_contacts_3_full_name", "definition_member"],
            ["emergency_contacts_3_phone", "definition_member"],
            ["emergency_contacts_3_relationship_to_the_child", "definition_member"],
        ]);
    });
});

// ── the commit, through the real loader, adapter, gate, household and anchor resolvers ─────────────
type Row = Record<string, unknown>;
function db(tables: Record<string, Row[]>) {
    return {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            let patch: Row | null = null;
            const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
            const api: Record<string, unknown> = {
                select: () => api,
                eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api; },
                in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api; },
                update: (p: Row) => { patch = p; return api; },
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (res: (v: unknown) => void) => { const hit = rows(); if (patch) for (const r of hit) Object.assign(r, patch); res({ data: hit, error: null }); },
            };
            return api;
        },
    } as never;
}

function world(guardians: FormPayloadGroupRow[], contacts: FormPayloadGroupRow[]) {
    const p = payload(guardians, contacts);
    const tables: Record<string, Row[]> = {
        processing_cases: [{ id: "case-1", org_id: "org", status: "received", metadata: {}, updated_at: "t" }],
        processing_case_sources: [{ org_id: "org", processing_case_id: "case-1", source_kind: "form_submission", source_id: "sub-1" }],
        form_submissions: [{ id: "sub-1", org_id: "org", payload: p, form_definition_version_id: "ver-1", customer_id: "house-1", customer_member_id: "ben" }],
        form_definition_versions: [{ id: "ver-1", org_id: "org", schema_json: RAW }],
        customer_members: [
            { id: "ben", org_id: "org", customer_id: "house-1", relationship: "child", is_active: true },
            { id: "zed", org_id: "org", customer_id: "house-2", relationship: "child", is_active: true },
        ],
    };
    const ids = adaptFormSubmissionToRelatedRecordProposals(SCHEMA, p, { formSubmissionId: "sub-1", formDefinitionVersionId: "ver-1" })
        .collections.flatMap((c) => c.instances.map((i) => ({ ref: c.collection_provider_ref, id: i.proposal_id })));
    return { tables, ids };
}
const commit = (tables: Record<string, Row[]>, proposalId: string, opts: { anchor?: string | null; decision?: "approve" | "reject" } = {}) =>
    executeRelationshipProposalCommit({
        supabase: db(tables), orgId: "org", userId: "op", actorRole: "admin", accessScope: null, caseId: "case-1", proposalId,
        decision: { proposal_id: proposalId, instance_decision: opts.decision ?? "approve", field_decisions: [] },
        metadata: (tables.processing_cases![0]!.metadata ?? {}) as Record<string, unknown>,
        anchorCustomerMemberId: opts.anchor ?? null,
    } as never);

beforeEach(() => { m.invocations = []; });

describe("committing relationships from the published packet", () => {
    it("THE DEPLOYED FAILURE: the guardian commits with the guardian's identity, anchored to the paperwork's child", async () => {
        const { tables, ids } = world([guardian()], [contact("Ec One Zzqa", "5550102222")]);
        const out = await commit(tables, ids.find((x) => x.ref === "person.contact_role.parents")!.id);
        expect(out.record.reason ?? null).toBeNull();
        expect(out.ok).toBe(true);
        const inputs = m.invocations[0]!.invocation.inputValues;
        expect(inputs.createPersonDraft).toEqual({ first_name: "Parent", last_name: "ZMU7B", phone: "5550101111" });
        expect(inputs.anchorCustomerMemberId).toBe("ben");
    });

    it("two emergency contacts commit as two people", async () => {
        const { tables, ids } = world([guardian()], [contact("Ec One Zzqa", "5550102222"), contact("Ec Two Zzqa", "5550103333")]);
        for (const x of ids.filter((i) => i.ref === "person.contact_role.emergency_contacts")) {
            tables.processing_cases![0]!.metadata = tables.processing_cases![0]!.metadata ?? {};
            expect((await commit(tables, x.id)).ok).toBe(true);
        }
        expect(m.invocations.map((i) => i.invocation.inputValues.createPersonDraft)).toEqual([
            { first_name: "Ec", last_name: "One Zzqa", phone: "5550102222" },
            { first_name: "Ec", last_name: "Two Zzqa", phone: "5550103333" },
        ]);
    });

    it("a repeat commit is the same commit — no second person", async () => {
        const { tables, ids } = world([guardian()], []);
        const id = ids.find((x) => x.ref === "person.contact_role.parents")!.id;
        expect((await commit(tables, id)).ok).toBe(true);
        const again = await commit(tables, id);
        expect(again.record.outcome).toBe("already_applied");
        expect(m.invocations).toHaveLength(1);
    });

    it("no name, no person: missing identity still refuses — nothing is invented", async () => {
        const { tables, ids } = world([guardian(null)], []);
        const out = await commit(tables, ids.find((x) => x.ref === "person.contact_role.parents")!.id);
        expect(out.ok).toBe(false);
        expect(out.record.code).toBe("insufficient_person_identity");
        expect(m.invocations).toHaveLength(0);
    });

    it("another household's child is refused", async () => {
        const { tables, ids } = world([guardian()], []);
        const out = await commit(tables, ids.find((x) => x.ref === "person.contact_role.parents")!.id, { anchor: "zed" });
        expect(out.record.code).toBe("anchor_not_found");
        expect(m.invocations).toHaveLength(0);
    });

    it("a rejected decision writes nothing", async () => {
        const { tables, ids } = world([guardian()], []);
        const out = await commit(tables, ids.find((x) => x.ref === "person.contact_role.parents")!.id, { decision: "reject" });
        expect(out.ok).toBe(false);
        expect(out.record.outcome).toBe("rejected");
        expect(m.invocations).toHaveLength(0);
    });
});

describe("a refused guardian write keeps the relationship authority's structured answer", () => {
    it("code, safe message, correlation id and the identity candidates reach the Processing record (409)", async () => {
        const { tables, ids } = world([guardian()], []);
        const candidates = [{ person_id: "p-orphan", display_name: "Parent ZMU7B", in_household: true, same_name: false }];
        m.next = {
            ok: false,
            status: "failed",
            invocationId: "inv-123",
            error: { code: "relationship_identity_choice_required", operatorMessage: "A person with this email or phone already exists — choose them, or correct the details." },
            diagnostics: [{ code: "relationship_identity_choice_required", message: "x" }, { code: "relationship_identity_candidates", message: JSON.stringify(candidates) }],
        };
        const out = await commit(tables, ids.find((x) => x.ref === "person.contact_role.parents")!.id);
        expect(out.status).toBe(409);
        expect(out.record).toMatchObject({ code: "relationship_identity_choice_required", correlation_id: "inv-123", identity_candidates: candidates });
        expect(out.record.reason).toMatch(/choose them/);
    });
});
