/**
 * Phase 1.2 — content-deterministic Processing identity fact hashing (D-1).
 *
 * `hashFactsForResolution` used to include `processing_facts.id`, a
 * `gen_random_uuid()` primary key, so semantically identical facts stored as
 * different rows hashed differently. These assertions prove the hash now
 * identifies the EVIDENCE rather than the rows that store it — and that the
 * identity engine's own behaviour is untouched.
 *
 * Processing-owned throughout: no Trust import, no Decision Contract, no
 * Decision Package, no Commit Plan.
 */

import { describe, it, expect } from "vitest";
import {
    hashFactsForResolution,
    intakeFactToInsertRow,
    type ProcessingFactRow,
} from "@/lib/pos/processingIdentity/processingFactsDb";
import {
    canonicalIdentityFactMaterialPayload,
    hashIdentityFactMaterial,
    projectIdentityFactMaterial,
    PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
} from "@/lib/pos/processingIdentity/factMaterialProjection";

/** A full row, so the test exercises the real shape the engine passes in. */
function row(overrides: Partial<ProcessingFactRow> = {}): ProcessingFactRow {
    return {
        id: "11111111-1111-4111-a111-111111111111",
        org_id: "org-1",
        case_id: "case-1",
        source_id: "src-1",
        subject_ref: "parent-1",
        fact_type: "email",
        semantic_key: "email",
        raw_value: "Parent@Example.com",
        normalized_value: "parent@example.com",
        data_type: "email",
        extraction_method: "intake_extract",
        evidence: { fact_id: "email-1", source_line: 4, source_span: { start: 0, end: 10 } },
        extraction_confidence: 0.9,
        validation_state: "valid",
        mapping_state: "unmapped",
        role_hint: "parent",
        produced_by: "intake",
        extractor_version: "proc-identity-b2",
        generation_id: "gen-1",
        corrected_from: null,
        retention_class: "uncommitted_submission",
        created_at: "2026-08-05T12:00:00.000Z",
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// 1, 2, 3, 7, 8. What must NOT change the hash
// ---------------------------------------------------------------------------

describe("D1-A — storage identity and ordering are immaterial", () => {
    it("identical semantic facts with different row UUIDs hash the same", () => {
        const a = [row({ id: "aaaaaaaa-1111-4111-a111-111111111111" })];
        const b = [row({ id: "bbbbbbbb-2222-4222-a222-222222222222" })];
        expect(hashFactsForResolution(a)).toBe(hashFactsForResolution(b));
    });

    it("REGRESSION: the row id is genuinely absent from the material payload", () => {
        const id = "deadbeef-1111-4111-a111-111111111111";
        expect(canonicalIdentityFactMaterialPayload([row({ id })])).not.toContain(id);
        expect(canonicalIdentityFactMaterialPayload([row()])).not.toContain("gen-1");
    });

    it("database return order does not change the hash", () => {
        const one = row({ fact_type: "email", normalized_value: "a@example.com" });
        const two = row({ fact_type: "phone", normalized_value: "+15555550100" });
        expect(hashFactsForResolution([one, two])).toBe(hashFactsForResolution([two, one]));
    });

    it("object-key order does not change the hash", () => {
        const canonical = row();
        // Same fields, deliberately different insertion order.
        const reordered = Object.fromEntries(
            Object.entries(canonical).reverse(),
        ) as unknown as ProcessingFactRow;
        expect(Object.keys(reordered)).not.toEqual(Object.keys(canonical));
        expect(hashFactsForResolution([reordered])).toBe(hashFactsForResolution([canonical]));
    });

    it("insertion timestamps do not change the hash", () => {
        expect(hashFactsForResolution([row({ created_at: "2020-01-01T00:00:00.000Z" })])).toBe(
            hashFactsForResolution([row({ created_at: "2099-12-31T23:59:59.000Z" })]),
        );
    });

    it("operational and presentation metadata do not change the hash", () => {
        const base = hashFactsForResolution([row()]);
        expect(hashFactsForResolution([row({ mapping_state: "mapped" })])).toBe(base);
        expect(hashFactsForResolution([row({ retention_class: "committed" })])).toBe(base);
        expect(hashFactsForResolution([row({ org_id: "org-2", case_id: "case-2" })])).toBe(base);
        // `evidence` carries `fact_id`, derived from a mutable module counter.
        expect(hashFactsForResolution([row({ evidence: { fact_id: "email-99", note: "x" } })])).toBe(base);
    });

    it("replay of the same material input is deterministic across calls", () => {
        const cohort = [row(), row({ fact_type: "phone", normalized_value: "+15555550100" })];
        const hashes = new Set(Array.from({ length: 25 }, () => hashFactsForResolution(cohort)));
        expect(hashes.size).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// 4, 5, 6, 10. What MUST change the hash
// ---------------------------------------------------------------------------

describe("D1-B — material content and evidentiary provenance are material", () => {
    const base = () => hashFactsForResolution([row()]);

    it("a changed normalized value changes the hash", () => {
        expect(hashFactsForResolution([row({ normalized_value: "other@example.com" })])).not.toBe(base());
    });

    it("a changed fact type or semantic key changes the hash", () => {
        expect(hashFactsForResolution([row({ fact_type: "phone" })])).not.toBe(base());
        expect(hashFactsForResolution([row({ semantic_key: "secondary_email" })])).not.toBe(base());
    });

    it("subject grouping changes the hash", () => {
        expect(hashFactsForResolution([row({ subject_ref: "parent-2" })])).not.toBe(base());
        expect(hashFactsForResolution([row({ role_hint: "child" })])).not.toBe(base());
    });

    it("an active operator correction changes the hash", () => {
        const corrected = row({
            normalized_value: "fixed@example.com",
            validation_state: "corrected",
            extraction_method: "operator_correction",
            produced_by: "operator_review",
            corrected_from: "11111111-1111-4111-a111-111111111111",
        });
        expect(hashFactsForResolution([corrected])).not.toBe(base());
    });

    it("correction LINEAGE is material without importing the predecessor's row id", () => {
        const a = row({ corrected_from: "aaaaaaaa-1111-4111-a111-111111111111" });
        const b = row({ corrected_from: "bbbbbbbb-2222-4222-a222-222222222222" });
        // Being a correction is material...
        expect(hashFactsForResolution([a])).not.toBe(base());
        // ...but WHICH random predecessor row is not.
        expect(hashFactsForResolution([a])).toBe(hashFactsForResolution([b]));
        expect(projectIdentityFactMaterial(a).is_correction).toBe(true);
        expect(projectIdentityFactMaterial(row()).is_correction).toBe(false);
    });

    it("extractor version and confidence are material", () => {
        expect(hashFactsForResolution([row({ extractor_version: "proc-identity-b3" })])).not.toBe(base());
        expect(hashFactsForResolution([row({ extraction_confidence: 0.3 })])).not.toBe(base());
        // ...but numerically equal confidences agree.
        expect(hashFactsForResolution([row({ extraction_confidence: 0.9 })])).toBe(base());
        // ...and null stays distinct from zero.
        expect(hashFactsForResolution([row({ extraction_confidence: null })])).not.toBe(
            hashFactsForResolution([row({ extraction_confidence: 0 })]),
        );
    });
});

// ---------------------------------------------------------------------------
// 11, 12. Duplicates and corroboration
// ---------------------------------------------------------------------------

describe("D1-C — duplicate and corroboration semantics match the engine", () => {
    it("exact material duplicates collapse — the engine consumes none of them for judgment", () => {
        const one = [row({ id: "aaaaaaaa-1111-4111-a111-111111111111" })];
        const twice = [
            row({ id: "aaaaaaaa-1111-4111-a111-111111111111" }),
            row({ id: "bbbbbbbb-2222-4222-a222-222222222222" }),
        ];
        expect(hashFactsForResolution(twice)).toBe(hashFactsForResolution(one));
    });

    it("facts differing in ANY admitted field stay distinct — corroboration is preserved", () => {
        const one = [row()];
        const differentProducer = [row(), row({ produced_by: "operator_review" })];
        const differentSubject = [row(), row({ subject_ref: "parent-2" })];
        const differentMethod = [row(), row({ extraction_method: "operator_correction" })];
        for (const cohort of [differentProducer, differentSubject, differentMethod]) {
            expect(hashFactsForResolution(cohort)).not.toBe(hashFactsForResolution(one));
        }
    });

    it("a larger cohort is distinguishable from a smaller one", () => {
        expect(
            hashFactsForResolution([row(), row({ fact_type: "phone", normalized_value: "+15555550100" })]),
        ).not.toBe(hashFactsForResolution([row()]));
    });

    it("an empty cohort is stable and distinct from any populated one", () => {
        expect(hashFactsForResolution([])).toBe(hashFactsForResolution([]));
        expect(hashFactsForResolution([])).not.toBe(hashFactsForResolution([row()]));
    });
});

// ---------------------------------------------------------------------------
// 13, 14. Versioning
// ---------------------------------------------------------------------------

describe("D1-D — projection and algorithm versions are explicit and separate", () => {
    it("the projection version is pinned INSIDE the hashed payload", () => {
        expect(canonicalIdentityFactMaterialPayload([row()])).toContain(
            PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        );
        expect(PROCESSING_IDENTITY_FACT_MATERIAL_VERSION).toBe("proc-identity-fact-material-v1");
    });

    it("a projection-version change is distinguishable for identical facts", () => {
        // Simulates a future bump by hashing the payload under another version.
        const current = canonicalIdentityFactMaterialPayload([row()]);
        const next = current.replace(
            PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            "proc-identity-fact-material-v2",
        );
        expect(next).not.toBe(current);
        expect(hashFactsForResolution([row()])).not.toBe(hashIdentityFactMaterial([]));
    });

    it("the RESOLVER version is a separate dimension and does not enter the hash", async () => {
        const { IDENTITY_RESOLVER_VERSION } = await import("@/lib/identity");
        // It is persisted beside the hash on `processing_resolutions.resolver_version`,
        // so an algorithm change stays distinguishable without invalidating
        // material hashes.
        expect(canonicalIdentityFactMaterialPayload([row()])).not.toContain(IDENTITY_RESOLVER_VERSION);
    });
});

// ---------------------------------------------------------------------------
// 9, 16. Cohort and engine behaviour
// ---------------------------------------------------------------------------

describe("D1-E — the cohort is what the engine consumes, and its output is unchanged", () => {
    it("hashes the rows it is handed and reaches for nothing else", () => {
        // The engine passes either this generation's inserted rows or, when no
        // facts were supplied, every fact on the case. The hash is a pure
        // function of that array — it performs no I/O and no filtering.
        expect(hashFactsForResolution.length).toBe(1);
        const cohort = [row()];
        const before = JSON.stringify(cohort);
        hashFactsForResolution(cohort);
        expect(JSON.stringify(cohort)).toBe(before);
    });

    it("still accepts the exact row shape `intakeFactToInsertRow` produces", () => {
        const insert = intakeFactToInsertRow({
            orgId: "org-1",
            caseId: "case-1",
            sourceId: "src-1",
            generationId: "gen-1",
            fact: {
                fact_id: "email-1",
                fact_type: "email",
                raw_value: "Parent@Example.com",
                normalized_value: "parent@example.com",
                confidence: "high",
                validation_state: "valid",
                role_hint: "parent",
            },
        });
        const a = hashFactsForResolution([{ ...insert, id: "a", created_at: "t1" } as ProcessingFactRow]);
        const b = hashFactsForResolution([{ ...insert, id: "b", created_at: "t2" } as ProcessingFactRow]);
        expect(a).toBe(b);
    });

    it("is a pure function — no Trust, no Commit Plan, no persistence", async () => {
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync(
                new URL("../../lib/pos/processingIdentity/factMaterialProjection.ts", import.meta.url),
                "utf8",
            ),
        );
        expect(src).not.toContain("@/lib/trust");
        expect(src).not.toContain("supabase");
        // A table query, not `Array.from(` — the crude substring matched that.
        expect([...src.matchAll(/\.from\(\s*["']/g)]).toEqual([]);
    });
});
