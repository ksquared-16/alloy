/**
 * Lead deletion no longer orphans stored files: documents of a deleted subject are disposed of through Documents.
 *
 * Runs the real disposal (`disposeDocumentsOfDeletedSubjects`) and the real lead-deletion executor against the
 * in-memory service-role client, with the real D1a audit writer (`emitEvent` → workflow_events). Storage is a thin
 * wrapper with the hosted semantics the shared harness does not model: `remove` reports only the objects it
 * actually removed, and it can be made to fail.
 *
 * Cases (Director, 2026-10-23):
 *   * a document owned only by the lead;
 *   * a document shared with another subject or consumer;
 *   * a retention period or legal hold;
 *   * a missing storage object;
 *   * a storage failure;
 *   * a retry after a partial failure;
 *   * cross-organization refusal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemorySupabase } from "../harness/inMemorySupabase";

const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as unknown } }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => dbRef.current }));

import { disposeDocumentsOfDeletedSubjects, DocumentDisposalError } from "@/lib/documents/documentDisposal";
import { executeOpportunityLeadDeletionGraph } from "@/lib/admin/opportunity/deleteOpportunityLead";

const ORG = "0a000000-0000-4000-8000-0000000000d1";
const OTHER_ORG = "0b000000-0000-4000-8000-0000000000d1";
const OPP = "0c000000-0000-4000-8000-000000000001";
const PERSON = "0d000000-0000-4000-8000-000000000001";
const OTHER_PERSON = "0d000000-0000-4000-8000-000000000002";
const ACTOR = "05e00000-0000-4000-8000-0000000000d1";
const BUCKET = "org_documents";
const D = {
    owned: "dd000000-0000-4000-8000-000000000001",
    otherSubject: "dd000000-0000-4000-8000-000000000002",
    formLinked: "dd000000-0000-4000-8000-000000000003",
    held: "dd000000-0000-4000-8000-000000000004",
    retention: "dd000000-0000-4000-8000-000000000005",
    missingObject: "dd000000-0000-4000-8000-000000000006",
    foreign: "dd000000-0000-4000-8000-000000000007",
    staffEvidence: "dd000000-0000-4000-8000-000000000008",
    outsidePrefix: "dd000000-0000-4000-8000-000000000009",
} as const;
const path = (id: string, org = ORG) => `${org}/opportunity/${OPP}/${id}.pdf`;

/** The client under test: the in-memory tables, and storage with hosted `remove` semantics. */
function client(db: InMemorySupabase, opts: { failRemove?: () => boolean } = {}) {
    return {
        from: (t: string) => db.from(t),
        storage: {
            from: (bucket: string) => ({
                remove: async (paths: string[]) => {
                    db.removeCalls.push({ bucket, paths: [...paths] });
                    if (opts.failRemove?.()) return { data: null, error: { message: "storage unavailable" } };
                    const removed = paths.filter((p) => db.objects.delete(`${bucket}/${p}`));
                    return { data: removed.map((name) => ({ name })), error: null };
                },
            }),
        },
    };
}

let db: InMemorySupabase;

function seed() {
    db = new InMemorySupabase();
    dbRef.current = db;
    const doc = (id: string, over: Record<string, unknown> = {}) => ({
        id,
        org_id: ORG,
        bucket: BUCKET,
        storage_path: path(id),
        entity_type: "opportunity",
        entity_id: OPP,
        doc_type: "other",
        metadata: {},
        ...over,
    });
    db.seed("documents", [
        doc(D.owned),
        doc(D.otherSubject, { entity_type: "person", entity_id: OTHER_PERSON }),
        doc(D.formLinked),
        doc(D.held, { metadata: { legal_hold: true } }),
        doc(D.retention, { metadata: { retention_until: "2099-01-01" } }),
        doc(D.missingObject),
        { ...doc(D.foreign), org_id: OTHER_ORG, storage_path: path(D.foreign, OTHER_ORG) },
        doc(D.staffEvidence),
        doc(D.outsidePrefix, { storage_path: `vendors/x/${D.outsidePrefix}.png` }),
    ]);
    db.seed("document_versions", [
        { id: "ee000000-0000-4000-8000-000000000001", org_id: ORG, document_id: D.owned, storage_path: `${ORG}/opportunity/${OPP}/${D.owned}-v1.pdf` },
    ]);
    db.seed("document_field_values", [{ id: "ef000000-0000-4000-8000-000000000001", org_id: ORG, document_id: D.owned }]);
    db.seed("form_submission_documents", [
        { id: "f5000000-0000-4000-8000-000000000001", org_id: ORG, form_submission_id: "5b000000-0000-4000-8000-000000000099", document_id: D.formLinked },
    ]);
    db.seed("staff_qualification_evidence", [{ id: "5e000000-0000-4000-8000-000000000001", org_id: ORG, document_id: D.staffEvidence }]);
    for (const id of Object.values(D)) {
        if (id === D.missingObject) continue;
        db.putObject(BUCKET, id === D.foreign ? path(id, OTHER_ORG) : id === D.outsidePrefix ? `vendors/x/${id}.png` : path(id));
    }
    db.putObject(BUCKET, `${ORG}/opportunity/${OPP}/${D.owned}-v1.pdf`);
}

const dispose = (ids: string[], c = client(db)) =>
    disposeDocumentsOfDeletedSubjects(c as never, {
        orgId: ORG,
        actorUserId: ACTOR,
        documentIds: ids,
        deletedSubjectIds: [OPP, PERSON],
        route: "admin/opportunities/delete",
        now: new Date("2026-10-23T00:00:00Z"),
    });

const outcome = (r: Awaited<ReturnType<typeof dispose>>, id: string) => r.find((d) => d.documentId === id);
const audits = (event: string) => db.rows("workflow_events").filter((e) => e.event_type === event);

beforeEach(() => seed());

describe("a document owned only by the deleted lead", () => {
    it("is deleted WITH its stored files (document and versions), its children, and an audit written first", async () => {
        const r = await dispose([D.owned]);
        expect(outcome(r, D.owned)).toMatchObject({ outcome: "deleted", objectsRemoved: 2, objectsAlreadyAbsent: 0 });
        expect(db.rows("documents").some((d) => d.id === D.owned)).toBe(false);
        // D2: the version rows go with the document row (ON DELETE CASCADE, proven on the database). The disposal never
        // deletes a version itself — the database refuses that while the document remains — so this in-memory store,
        // which has no cascade, still holds the seeded version row.
        expect(db.rows("document_versions").filter((v) => v.document_id === D.owned)).toHaveLength(1);
        expect(db.rows("document_field_values")).toHaveLength(0);
        expect(db.objects.has(`${BUCKET}/${path(D.owned)}`)).toBe(false);
        expect(db.objects.has(`${BUCKET}/${ORG}/opportunity/${OPP}/${D.owned}-v1.pdf`)).toBe(false);
        const a = audits("document_delete_authorized");
        expect(a).toHaveLength(1);
        expect(a[0]).toMatchObject({ entity_type: "documents", entity_id: D.owned });
        expect(JSON.stringify(a[0].payload)).toContain("subject_deleted");
    });
});

describe("a document something else still relies on is retained, row and file", () => {
    it("another subject, a remaining form submission, staff-qualification evidence", async () => {
        const r = await dispose([D.otherSubject, D.formLinked, D.staffEvidence]);
        expect(outcome(r, D.otherSubject)).toMatchObject({ outcome: "retained", reasons: ["other_subject"] });
        expect(outcome(r, D.formLinked)).toMatchObject({ outcome: "retained", reasons: ["form_submission"] });
        expect(outcome(r, D.staffEvidence)).toMatchObject({ outcome: "retained", reasons: ["staff_qualification_evidence"] });
        for (const id of [D.otherSubject, D.formLinked, D.staffEvidence]) {
            expect(db.rows("documents").some((d) => d.id === id)).toBe(true);
            expect(db.objects.has(`${BUCKET}/${path(id)}`)).toBe(true);
        }
        expect(db.removeCalls).toHaveLength(0);
        expect(audits("document_delete_authorized")).toHaveLength(0);
    });
});

describe("retention and legal hold", () => {
    it("a legal hold or an unexpired retention period keeps the document", async () => {
        const r = await dispose([D.held, D.retention]);
        expect(outcome(r, D.held)).toMatchObject({ outcome: "retained", reasons: ["legal_hold"] });
        expect(outcome(r, D.retention)).toMatchObject({ outcome: "retained", reasons: ["retention_period"] });
        expect(db.objects.has(`${BUCKET}/${path(D.held)}`)).toBe(true);
    });

    it("an EXPIRED retention period no longer holds it", async () => {
        db.tables.documents = db.rows("documents").map((d) => (d.id === D.retention ? { ...d, metadata: { retention_until: "2020-01-01" } } : d));
        const r = await dispose([D.retention]);
        expect(outcome(r, D.retention)).toMatchObject({ outcome: "deleted" });
    });
});

describe("a missing storage object", () => {
    it("is already absent, which is not an error: the row is still removed", async () => {
        const r = await dispose([D.missingObject]);
        expect(outcome(r, D.missingObject)).toMatchObject({ outcome: "deleted", objectsRemoved: 0, objectsAlreadyAbsent: 1 });
        expect(db.rows("documents").some((d) => d.id === D.missingObject)).toBe(false);
    });
});

describe("storage failure, and retry after a partial failure", () => {
    it("a storage error keeps the row, records the failure, and throws a typed error", async () => {
        const failing = client(db, { failRemove: () => true });
        await expect(dispose([D.owned], failing)).rejects.toMatchObject({ code: "storage_removal_failed", documentId: D.owned });
        expect(db.rows("documents").some((d) => d.id === D.owned)).toBe(true);
        expect(db.objects.has(`${BUCKET}/${path(D.owned)}`)).toBe(true);
        expect(audits("document_delete_failed")).toHaveLength(1);
    });

    it("a retry completes, and a third run finds the document already absent", async () => {
        let fail = true;
        await expect(dispose([D.owned], client(db, { failRemove: () => fail }))).rejects.toBeInstanceOf(DocumentDisposalError);
        fail = false;
        const second = await dispose([D.owned], client(db, { failRemove: () => fail }));
        expect(outcome(second, D.owned)).toMatchObject({ outcome: "deleted", objectsRemoved: 2 });
        const third = await dispose([D.owned]);
        expect(outcome(third, D.owned)).toEqual({ documentId: D.owned, outcome: "absent" });
    });

    it("an audit that cannot be written deletes nothing", async () => {
        db.failInsertInto.add("workflow_events");
        await expect(dispose([D.owned])).rejects.toMatchObject({ code: "audit_unavailable" });
        expect(db.removeCalls).toHaveLength(0);
        expect(db.rows("documents").some((d) => d.id === D.owned)).toBe(true);
    });

    it("a reference that cannot be read deletes nothing (fail closed)", async () => {
        const realFrom = db.from.bind(db);
        const c = client(db);
        c.from = (t: string) => {
            if (t === "child_safeguarding_restrictions") throw new DocumentDisposalError("reference_lookup_failed", null, "unavailable");
            return realFrom(t);
        };
        await expect(dispose([D.owned], c)).rejects.toMatchObject({ code: "reference_lookup_failed" });
        expect(db.removeCalls).toHaveLength(0);
    });
});

describe("cross-organization refusal", () => {
    it("a candidate of another organization is never read, retained or deleted, and its object stays", async () => {
        const r = await dispose([D.foreign]);
        expect(r).toEqual([{ documentId: D.foreign, outcome: "absent" }]);
        expect(db.rows("documents").some((d) => d.id === D.foreign)).toBe(true);
        expect(db.objects.has(`${BUCKET}/${path(D.foreign, OTHER_ORG)}`)).toBe(true);
        expect(db.removeCalls).toHaveLength(0);
    });

    it("a stored path outside this organization's prefix is never removed", async () => {
        const r = await dispose([D.outsidePrefix]);
        expect(outcome(r, D.outsidePrefix)).toMatchObject({ outcome: "retained", reasons: ["storage_outside_org"] });
        expect(db.objects.has(`${BUCKET}/vendors/x/${D.outsidePrefix}.png`)).toBe(true);
    });
});

describe("the lead deletion executor uses the disposal (no generic document row delete)", () => {
    it("removes the owned document's file and keeps the shared one; the lead row goes last", async () => {
        db.seed("opportunities", [{ id: OPP, org_id: ORG, name: "Lead" }]);
        const dispositions: Awaited<ReturnType<typeof dispose>> = [];
        const deleted = await executeOpportunityLeadDeletionGraph(
            client(db) as never,
            {
                orgId: ORG,
                opportunityId: OPP,
                opportunityName: "Lead",
                customerId: null,
                scopedCustomerMemberIds: [],
                scopedPersonIds: [],
                adultPersonIds: [],
                childPersonIds: [],
                deletableCustomerId: null,
                deletableCustomerMemberIds: [],
                deletablePersonIds: [],
                threadIds: [],
                formSubmissionIds: [],
                documentIds: [D.owned, D.otherSubject],
                blocked: false,
                blockReason: null,
            },
            { actorUserId: ACTOR, documentDispositions: dispositions },
        );
        expect(deleted.documents).toBe(1);
        expect(deleted.documents_retained).toBe(1);
        expect(db.objects.has(`${BUCKET}/${path(D.owned)}`)).toBe(false);
        expect(db.objects.has(`${BUCKET}/${path(D.otherSubject)}`)).toBe(true);
        expect(db.rows("opportunities")).toHaveLength(0);
        expect(dispositions.map((d) => d.outcome).sort()).toEqual(["deleted", "retained"]);
    });

    it("a disposal failure leaves the lead row in place, so the whole deletion can be retried", async () => {
        db.seed("opportunities", [{ id: OPP, org_id: ORG, name: "Lead" }]);
        const graph = {
            orgId: ORG, opportunityId: OPP, opportunityName: "Lead", customerId: null, scopedCustomerMemberIds: [],
            scopedPersonIds: [], adultPersonIds: [], childPersonIds: [], deletableCustomerId: null,
            deletableCustomerMemberIds: [], deletablePersonIds: [], threadIds: [], formSubmissionIds: [],
            documentIds: [D.owned], blocked: false, blockReason: null,
        };
        await expect(
            executeOpportunityLeadDeletionGraph(client(db, { failRemove: () => true }) as never, graph, { actorUserId: ACTOR }),
        ).rejects.toBeInstanceOf(DocumentDisposalError);
        expect(db.rows("opportunities")).toHaveLength(1);
        const deleted = await executeOpportunityLeadDeletionGraph(client(db) as never, graph, { actorUserId: ACTOR });
        expect(deleted.documents).toBe(1);
        expect(db.rows("opportunities")).toHaveLength(0);
    });
});

describe("the lead deletion graph proposes every dependent document as a candidate", () => {
    it("owned by the lead, and linked to its deleted form submissions (generated PDFs, uploads, drawn signatures)", async () => {
        const { resolveOpportunityLeadDeletionGraph } = await import("@/lib/admin/opportunity/opportunityLeadDeletionGraph");
        const SUB = "5b000000-0000-4000-8000-0000000000aa";
        const GEN = "dd000000-0000-4000-8000-0000000000a1";
        const SIG = "dd000000-0000-4000-8000-0000000000a2";
        db.seed("opportunities", [{ id: OPP, org_id: ORG, name: "Lead", customer_id: null }]);
        db.seed("form_submissions", [{ id: SUB, org_id: ORG, opportunity_id: OPP }]);
        db.seed("form_submission_documents", [{ id: "f5000000-0000-4000-8000-0000000000a1", org_id: ORG, form_submission_id: SUB, document_id: GEN }]);
        db.seed("form_submission_signatures", [{ id: "f6000000-0000-4000-8000-0000000000a1", org_id: ORG, form_submission_id: SUB, drawn_asset_document_id: SIG }]);
        const graph = await resolveOpportunityLeadDeletionGraph(client(db) as never, ORG, OPP);
        expect(graph?.formSubmissionIds).toContain(SUB);
        expect(graph?.documentIds).toEqual(expect.arrayContaining([D.owned, GEN, SIG]));
        // Candidates of another organization are never proposed.
        expect(graph?.documentIds).not.toContain(D.foreign);
    });
});
