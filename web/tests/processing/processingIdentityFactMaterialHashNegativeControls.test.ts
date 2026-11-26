/**
 * Negative controls for content-deterministic identity fact hashing (D-1).
 *
 * Each control reconstructs the defect it guards against and shows the guard
 * rejects it. Where the defect is a source fact it is checked structurally;
 * where it is behavioural, the broken variant is built and its output compared
 * against the real one, so "the test would fail" is demonstrated rather than
 * asserted.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

import {
    hashFactsForResolution,
    type ProcessingFactRow,
} from "@/lib/pos/processingIdentity/processingFactsDb";
import {
    canonicalIdentityFactMaterialPayload,
    PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
} from "@/lib/pos/processingIdentity/factMaterialProjection";

const WEB_ROOT = join(__dirname, "..", "..");

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
        evidence: { fact_id: "email-1" },
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

/** The exact pre-fix implementation, rebuilt so the defect is demonstrable. */
function legacyHashWithRowIds(facts: ProcessingFactRow[]): string {
    const payload = facts
        .map((f) => `${f.id}:${f.fact_type}:${f.normalized_value ?? f.raw_value ?? ""}`)
        .sort()
        .join("|");
    return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------

describe("D1-NC-1 — random row ids re-entering the projection would be caught", () => {
    it("the legacy algorithm DOES differ on row id; the current one does not", () => {
        const a = [row({ id: "aaaaaaaa-1111-4111-a111-111111111111" })];
        const b = [row({ id: "bbbbbbbb-2222-4222-a222-222222222222" })];

        // The defect, reproduced: identical evidence, different hash.
        expect(legacyHashWithRowIds(a)).not.toBe(legacyHashWithRowIds(b));
        // The fix.
        expect(hashFactsForResolution(a)).toBe(hashFactsForResolution(b));
    });

    it("no uuid-shaped row identifier survives into the payload", () => {
        const payload = canonicalIdentityFactMaterialPayload([
            row({
                id: "aaaaaaaa-1111-4111-a111-111111111111",
                generation_id: "cccccccc-3333-4333-a333-333333333333",
                source_id: "dddddddd-4444-4444-a444-444444444444",
                corrected_from: "eeeeeeee-5555-4555-a555-555555555555",
            }),
        ]);
        for (const uuid of [
            "aaaaaaaa-1111-4111-a111-111111111111",
            "cccccccc-3333-4333-a333-333333333333",
            "dddddddd-4444-4444-a444-444444444444",
            "eeeeeeee-5555-4555-a555-555555555555",
        ]) {
            expect(payload).not.toContain(uuid);
        }
        // Nothing uuid-shaped at all.
        expect(payload).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    });

    it("the production hash function no longer reads `id` at all", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/factMaterialProjection.ts"),
            "utf8",
        );
        // The projection input type deliberately does not even declare `id`.
        expect(src).not.toMatch(/^\s*id\??:/m);
        expect(src).not.toContain("fact.id");
    });
});

describe("D1-NC-2 — insertion order influencing the hash would be caught", () => {
    it("an order-sensitive variant DOES differ; the canonical one does not", () => {
        const one = row({ fact_type: "email", normalized_value: "a@example.com" });
        const two = row({ fact_type: "phone", normalized_value: "+15555550100" });

        // A variant that forgot to sort — the defect.
        const orderSensitive = (facts: ProcessingFactRow[]) =>
            createHash("sha256")
                .update(facts.map((f) => `${f.fact_type}:${f.normalized_value}`).join("|"))
                .digest("hex");
        expect(orderSensitive([one, two])).not.toBe(orderSensitive([two, one]));

        // The canonical payload sorts, so it cannot.
        expect(hashFactsForResolution([one, two])).toBe(hashFactsForResolution([two, one]));
    });
});

describe("D1-NC-3 — omitting meaningful content would be caught", () => {
    /** Every admitted field, with a change that must move the hash. */
    const MATERIAL_CHANGES: [string, Partial<ProcessingFactRow>][] = [
        ["fact_type", { fact_type: "phone" }],
        ["semantic_key", { semantic_key: "secondary_email" }],
        ["normalized_value", { normalized_value: "other@example.com" }],
        ["data_type", { data_type: "text" }],
        ["subject_ref", { subject_ref: "parent-2" }],
        ["role_hint", { role_hint: "child" }],
        ["extraction_method", { extraction_method: "operator_correction" }],
        ["produced_by", { produced_by: "operator_review" }],
        ["extractor_version", { extractor_version: "proc-identity-b3" }],
        ["validation_state", { validation_state: "corrected" }],
        ["extraction_confidence", { extraction_confidence: 0.2 }],
        ["corrected_from (as is_correction)", { corrected_from: "eeeeeeee-5555-4555-a555-555555555555" }],
    ];

    it.each(MATERIAL_CHANGES)("dropping %s from the projection would be caught", (_field, change) => {
        expect(hashFactsForResolution([row(change)])).not.toBe(hashFactsForResolution([row()]));
    });

    it("raw_value still backs the material value when normalization is absent", () => {
        const withRawOnly = row({ normalized_value: null, raw_value: "Parent@Example.com" });
        const differentRaw = row({ normalized_value: null, raw_value: "Other@Example.com" });
        expect(hashFactsForResolution([withRawOnly])).not.toBe(hashFactsForResolution([differentRaw]));
    });
});

describe("D1-NC-4 — including facts the engine ignores would be caught", () => {
    it("immaterial fields are provably inert, one at a time", () => {
        const base = hashFactsForResolution([row()]);
        const INERT: [string, Partial<ProcessingFactRow>][] = [
            ["id", { id: "99999999-9999-4999-a999-999999999999" }],
            ["generation_id", { generation_id: "88888888-8888-4888-a888-888888888888" }],
            ["source_id", { source_id: "77777777-7777-4777-a777-777777777777" }],
            ["org_id", { org_id: "org-2" }],
            ["case_id", { case_id: "case-2" }],
            ["mapping_state", { mapping_state: "mapped" }],
            ["retention_class", { retention_class: "committed" }],
            ["created_at", { created_at: "2099-01-01T00:00:00.000Z" }],
            ["evidence", { evidence: { fact_id: "email-999", note: "anything" } }],
        ];
        for (const [field, change] of INERT) {
            expect({ field, hash: hashFactsForResolution([row(change)]) }).toEqual({ field, hash: base });
        }
    });

    it("a variant that admitted `evidence` WOULD be unstable — `fact_id` is a mutable counter", () => {
        // `extractFactsFromText` derives fact_id from a module-level counter, so
        // the same document can yield different fact_ids across runs.
        const withEvidence = (f: ProcessingFactRow) =>
            createHash("sha256").update(JSON.stringify(f.evidence)).digest("hex");
        expect(withEvidence(row({ evidence: { fact_id: "email-1" } }))).not.toBe(
            withEvidence(row({ evidence: { fact_id: "email-2" } })),
        );
        // The real projection is unmoved by exactly that difference.
        expect(hashFactsForResolution([row({ evidence: { fact_id: "email-1" } })])).toBe(
            hashFactsForResolution([row({ evidence: { fact_id: "email-2" } })]),
        );
    });
});

describe("D1-NC-5 — silently reinterpreting historical hashes would be caught", () => {
    it("the new algorithm does NOT reproduce legacy hashes — the change is visible, not silent", () => {
        const cohort = [row()];
        expect(hashFactsForResolution(cohort)).not.toBe(legacyHashWithRowIds(cohort));
    });

    it("the projection version is inside the payload, so a bump cannot collide", () => {
        const payload = canonicalIdentityFactMaterialPayload([row()]);
        expect(payload.startsWith(PROCESSING_IDENTITY_FACT_MATERIAL_VERSION)).toBe(true);
        const bumped = payload.replace(
            PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            "proc-identity-fact-material-v2",
        );
        expect(createHash("sha256").update(bumped).digest("hex")).not.toBe(
            createHash("sha256").update(payload).digest("hex"),
        );
    });

    it("the ONLY hash comparison in the engine is generation-scoped, so no historical hash is reread", () => {
        const engine = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/canonicalResolutionEngine.ts"),
            "utf8",
        );
        // One comparison exists, and it sits behind a lookup keyed on the
        // generation id — a fresh random uuid for every live caller, so it can
        // never match a row written under the legacy algorithm.
        const comparisons = [...engine.matchAll(/input_facts_hash\s*===/g)];
        expect(comparisons).toHaveLength(1);
        expect(engine).toContain("findResolutionByCaseSubjectGeneration");
    });

    it("no live caller supplies a generation id, so the comparison is unreachable in production", () => {
        for (const adapter of [
            "lib/pos/processingIdentity/sources/formIntakeAdapter.ts",
            "lib/pos/processingIdentity/sources/createLeadIntakeAdapter.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, adapter), "utf8");
            expect(src).toContain("runCanonicalIdentityResolution");
            expect(src).not.toMatch(/generationId\s*:/);
        }
    });
});
