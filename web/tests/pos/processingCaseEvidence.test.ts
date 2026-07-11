import { describe, it, expect } from "vitest";
import { resolveSourceEvidence } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";
import type { SourceEvidenceRaw, SourceEvidenceRegistry } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";
import type { ProcessingCollectionSourceEvidence } from "@/lib/pos/processingCase/collection/types";
import type { ProcessingCaseDetail, ProcessingCaseSourceKind } from "@/lib/pos/processingCase/readModel/types";

function detailWith(sources: { kind: ProcessingCaseSourceKind; id: string; role: "primary" | "related" }[]): ProcessingCaseDetail {
    return {
        id: "c1",
        status: "needs_review",
        caseType: null,
        createdAt: "2026-06-12T00:00:00Z",
        updatedAt: null,
        archivedAt: null,
        sources: sources.map((s) => ({
            kind: s.kind,
            id: s.id,
            role: s.role,
            linkedAt: null,
            display: { kind: s.kind, id: s.id, label: `L:${s.id}`, receivedAt: null, channel: s.kind, resolved: true },
        })),
        classification: null,
        extraction: null,
        documentFormPreview: null,
        formDraftPreview: null,
        formDraftCreated: null,
        processingIntent: null,
    };
}

function makeRegistry(map: Partial<Record<ProcessingCaseSourceKind, Record<string, SourceEvidenceRaw>>>) {
    const calls: Record<string, number> = {};
    const reg: SourceEvidenceRegistry = new Map();
    (Object.keys(map) as ProcessingCaseSourceKind[]).forEach((kind) => {
        reg.set(kind, async (ids) => {
            calls[kind] = (calls[kind] ?? 0) + 1;
            const out = new Map<string, SourceEvidenceRaw>();
            for (const id of ids) {
                const raw = map[kind]?.[id];
                if (raw) out.set(id, raw);
            }
            return out;
        });
    });
    return { reg, calls };
}

describe("resolveSourceEvidence", () => {
    it("resolves mixed kinds: proposed values for forms, document handle for documents", async () => {
        const detail = detailWith([
            { kind: "form_submission", id: "s1", role: "primary" },
            { kind: "document", id: "d1", role: "related" },
        ]);
        const { reg } = makeRegistry({
            form_submission: { s1: { proposedValues: [{ label: "Email", value: "a@b", entityType: "guardian" }], documentId: null } },
            document: { d1: { proposedValues: [], documentId: "d1" } },
        });
        const result = await resolveSourceEvidence(detail, reg);
        const s1 = result.evidence.find((e) => e.id === "s1");
        const d1 = result.evidence.find((e) => e.id === "d1");
        expect(s1?.proposedValues).toEqual([{ label: "Email", value: "a@b", entityType: "guardian" }]);
        expect(d1?.documentId).toBe("d1");
        expect(d1?.proposedValues).toEqual([]);
        expect(result.affectedRecordTypes).toEqual(["guardian"]);
    });

    it("returns empty evidence for an unknown source kind (no loader)", async () => {
        const detail = detailWith([{ kind: "upload", id: "u1", role: "primary" }]);
        const { reg } = makeRegistry({ form_submission: {} });
        const result = await resolveSourceEvidence(detail, reg);
        expect(result.evidence[0]).toMatchObject({ kind: "upload", id: "u1", proposedValues: [], documentId: null });
    });

    it("falls back to empty for a missing source (loader returns no entry)", async () => {
        const detail = detailWith([{ kind: "document", id: "gone", role: "primary" }]);
        const { reg } = makeRegistry({ document: {} }); // id not present
        const result = await resolveSourceEvidence(detail, reg);
        expect(result.evidence[0]).toMatchObject({ id: "gone", proposedValues: [], documentId: null });
    });

    it("dedupes affected record types across sources", async () => {
        const detail = detailWith([
            { kind: "form_submission", id: "s1", role: "primary" },
            { kind: "form_submission", id: "s2", role: "related" },
        ]);
        const { reg } = makeRegistry({
            form_submission: {
                s1: { proposedValues: [{ label: "A", value: "1", entityType: "child" }], documentId: null },
                s2: { proposedValues: [{ label: "B", value: "2", entityType: "child" }, { label: "C", value: "3", entityType: "guardian" }], documentId: null },
            },
        });
        const result = await resolveSourceEvidence(detail, reg);
        expect(result.affectedRecordTypes.sort()).toEqual(["child", "guardian"]);
    });

    it("calls each kind loader once (no N+1) regardless of source count", async () => {
        const detail = detailWith([
            { kind: "form_submission", id: "s1", role: "primary" },
            { kind: "form_submission", id: "s2", role: "related" },
            { kind: "form_submission", id: "s3", role: "related" },
        ]);
        const { reg, calls } = makeRegistry({
            form_submission: {
                s1: { proposedValues: [], documentId: null },
                s2: { proposedValues: [], documentId: null },
                s3: { proposedValues: [], documentId: null },
            },
        });
        await resolveSourceEvidence(detail, reg);
        expect(calls.form_submission).toBe(1);
    });
});


const sampleCollection: ProcessingCollectionSourceEvidence = {
    groups: [
        {
            group_id: "kids",
            collection_provider_ref: "children",
            collection_label: "Children",
            status: "valid",
            diagnostics: [],
            instances: [
                {
                    proposal_id: "rrp:test:existing",
                    collection_provider_ref: "children",
                    collection_label: "Children",
                    iteration_entity_type: "customer_member",
                    instance_key: "k1",
                    origin: "existing",
                    existing_item_id: "cm-1",
                    identity_label: "Sam",
                    status: "valid",
                    diagnostics: [],
                    field_bindings: [
                        {
                            field_id: "child_first_name",
                            provider_ref: "child.child_first_name",
                            entity_type: "child",
                            field_key: "child_first_name",
                            label: "First Name",
                            submitted_value: "Sam",
                            display_value: "Sam",
                        },
                    ],
                    lineage: {
                        processing_case_id: null,
                        form_submission_id: "s1",
                        form_definition_version_id: null,
                        schema_group_id: "kids",
                        collection_provider_ref: "children",
                        instance_key: "k1",
                        payload_path: "groups.kids[k1]",
                    },
                },
            ],
        },
    ],
    diagnostics: [],
};

describe("resolveSourceEvidence collection integration", () => {
    it("keeps scalar evidence unchanged when collection evidence is present", async () => {
        const detail = detailWith([{ kind: "form_submission", id: "s1", role: "primary" }]);
        const { reg } = makeRegistry({
            form_submission: {
                s1: {
                    proposedValues: [{ label: "Household note", value: "hello", entityType: "customer" }],
                    documentId: null,
                    collectionEvidence: sampleCollection,
                },
            },
        });
        const result = await resolveSourceEvidence(detail, reg);
        expect(result.evidence[0]?.proposedValues).toEqual([
            { label: "Household note", value: "hello", entityType: "customer" },
        ]);
        expect(result.evidence[0]?.collectionEvidence?.groups).toHaveLength(1);
    });

    it("does not flatten collection nested fields into scalar proposedValues", async () => {
        const detail = detailWith([{ kind: "form_submission", id: "s1", role: "primary" }]);
        const { reg } = makeRegistry({
            form_submission: {
                s1: { proposedValues: [], documentId: null, collectionEvidence: sampleCollection },
            },
        });
        const result = await resolveSourceEvidence(detail, reg);
        expect(result.evidence[0]?.proposedValues).toEqual([]);
        expect(result.evidence[0]?.collectionEvidence?.groups[0]?.instances[0]?.field_bindings[0]?.label).toBe(
            "First Name",
        );
    });

    it("includes collection entity types in affectedRecordTypes without duplicating scalar", async () => {
        const detail = detailWith([{ kind: "form_submission", id: "s1", role: "primary" }]);
        const { reg } = makeRegistry({
            form_submission: {
                s1: {
                    proposedValues: [{ label: "X", value: "1", entityType: "person" }],
                    documentId: null,
                    collectionEvidence: sampleCollection,
                },
            },
        });
        const result = await resolveSourceEvidence(detail, reg);
        expect(result.affectedRecordTypes.sort()).toEqual(["child", "customer_member", "person"]);
    });
});
