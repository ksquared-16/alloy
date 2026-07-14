import { describe, expect, it, vi } from "vitest";
import {
    appendCorrectedProcessingFact,
    hashFactsForResolution,
    intakeFactToInsertRow,
    validateFactEvidence,
} from "@/lib/pos/processingIdentity/processingFactsDb";
import type { IntakeFact } from "@/lib/intake/types";

describe("B2 processing facts", () => {
    const sampleFact: IntakeFact = {
        fact_id: "f1",
        fact_type: "email",
        raw_value: "Parent@Example.com",
        normalized_value: "parent@example.com",
        confidence: "high",
        validation_state: "valid",
        role_hint: "parent",
        evidence: "form_field:guardian.email",
    };

    it("maps intake fact to insert row with immutable raw value", () => {
        const row = intakeFactToInsertRow({
            orgId: "org-1",
            caseId: "case-1",
            generationId: "gen-1",
            fact: sampleFact,
        });
        expect(row.raw_value).toBe("Parent@Example.com");
        expect(row.normalized_value).toBe("parent@example.com");
        expect(row.retention_class).toBe("uncommitted_submission");
    });

    it("hashes facts deterministically", () => {
        const rows = [
            intakeFactToInsertRow({
                orgId: "org-1",
                caseId: "case-1",
                generationId: "gen-1",
                fact: sampleFact,
            }),
        ];
        const a = hashFactsForResolution(rows.map((r, i) => ({ ...r, id: `id-${i}`, created_at: "" })));
        const b = hashFactsForResolution(rows.map((r, i) => ({ ...r, id: `id-${i}`, created_at: "" })));
        expect(a).toBe(b);
    });

    it("rejects malformed evidence payloads", () => {
        expect(validateFactEvidence({ ok: true })).toBe(true);
        expect(validateFactEvidence([])).toBe(false);
    });

    it("appendCorrectedProcessingFact preserves original raw value lineage", async () => {
        const inserts: unknown[] = [];
        const supabase = {
            from: vi.fn(() => ({
                insert: vi.fn((rows: unknown) => {
                    inserts.push(rows);
                    return { select: vi.fn(() => ({ data: [{ id: "f2", ...(rows as object[])[0] }], error: null })) };
                }),
            })),
        };
        const original = {
            id: "f1",
            org_id: "org-1",
            case_id: "case-1",
            source_id: null,
            subject_ref: "parent",
            fact_type: "email",
            semantic_key: "email",
            raw_value: "Parent@Example.com",
            normalized_value: "parent@example.com",
            data_type: "email",
            extraction_method: "intake_extract",
            evidence: {},
            extraction_confidence: 0.9,
            validation_state: "valid",
            mapping_state: "unmapped",
            role_hint: "parent",
            produced_by: "intake",
            extractor_version: "proc-identity-b2",
            generation_id: "gen-1",
            corrected_from: null,
            retention_class: "uncommitted_submission",
            created_at: "2026-01-01T00:00:00Z",
        };
        const corrected = await appendCorrectedProcessingFact(supabase as never, {
            original,
            correctedNormalizedValue: "corrected@example.com",
        });
        expect(corrected.raw_value).toBe("Parent@Example.com");
        expect(corrected.normalized_value).toBe("corrected@example.com");
        expect(corrected.corrected_from).toBe("f1");
    });
});
