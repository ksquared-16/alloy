/**
 * POS-FP9 (Sprint 2.6) — operator classification correction.
 *
 * Proves: validation accepts the allowed (key,status) pairs and rejects bad ones;
 * the operator result carries 0.95/0 confidence + an `operator` signal; persistence
 * writes ONLY case_type + metadata.classification (no status, no insert, no other
 * table); org scoping is honored at the query level; and the UI payload helper maps
 * intents correctly.
 *
 * No DB / no route runtime: pure logic + a fake Supabase that throws if anything other
 * than processing_cases is touched (mirrors the existing classification tests).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    validateOperatorCorrection,
    buildOperatorClassification,
    operatorCorrectionRequestBody,
    OPERATOR_CLASSIFIED_KEYS,
    OPERATOR_CLASSIFIED_CONFIDENCE,
} from "@/lib/pos/processingCase/classification/operatorCorrection";
import { dbStoreProcessingCaseClassification } from "@/lib/pos/processingCase/classification/processingCaseClassificationDb";

describe("validateOperatorCorrection — key/status pairs", () => {
    it("accepts each real key with status classified", () => {
        for (const key of OPERATOR_CLASSIFIED_KEYS) {
            const v = validateOperatorCorrection({ classification_key: key, status: "classified" });
            expect(v.ok).toBe(true);
        }
    });

    it("accepts unknown/unknown", () => {
        const v = validateOperatorCorrection({ classification_key: "unknown", status: "unknown" });
        expect(v).toEqual({ ok: true, classification_key: "unknown", status: "unknown" });
    });

    it("rejects an invalid classification key", () => {
        const v = validateOperatorCorrection({ classification_key: "tax_return", status: "classified" });
        expect(v.ok).toBe(false);
    });

    it("rejects an invalid status", () => {
        const v = validateOperatorCorrection({ classification_key: "remittance", status: "archived" });
        expect(v.ok).toBe(false);
    });

    it("rejects incoherent pairs", () => {
        // real key but status unknown
        expect(validateOperatorCorrection({ classification_key: "subsidy_contract", status: "unknown" }).ok).toBe(false);
        // unknown key but status classified
        expect(validateOperatorCorrection({ classification_key: "unknown", status: "classified" }).ok).toBe(false);
        // unsupported is not operator-correctable
        expect(validateOperatorCorrection({ classification_key: "remittance", status: "unsupported" }).ok).toBe(false);
    });
});

describe("buildOperatorClassification — confidence + operator signal", () => {
    it("classified -> 0.95 confidence with an operator signal reflecting the key", () => {
        const r = buildOperatorClassification({ classification_key: "subsidy_contract", status: "classified" });
        expect(r.confidence).toBe(OPERATOR_CLASSIFIED_CONFIDENCE);
        expect(r.status).toBe("classified");
        expect(r.signals).toEqual([{ source: "operator", value: "subsidy_contract", weight: 0.95 }]);
        expect(r.classifier_version).toBe("operator");
        expect(r.label).toBe("Subsidy contract");
    });

    it("unknown -> 0 confidence", () => {
        const r = buildOperatorClassification({ classification_key: "unknown", status: "unknown" });
        expect(r.confidence).toBe(0);
        expect(r.signals).toEqual([{ source: "operator", value: "unknown", weight: 0 }]);
    });
});

// --- persistence: annotation only -----------------------------------------------------

function makeFakeSupabase(existingMetadata: Record<string, unknown> = {}) {
    const updates: { table: string; payload: Record<string, unknown> }[] = [];
    let inserted = false;
    const supabase = {
        from(table: string) {
            if (table !== "processing_cases") throw new Error(`must not touch table "${table}"`);
            return {
                select() {
                    return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { metadata: existingMetadata }, error: null }) }; } }; } };
                },
                update(payload: Record<string, unknown>) {
                    updates.push({ table, payload });
                    return { eq() { return { eq: async () => ({ error: null }) }; } };
                },
                insert() { inserted = true; throw new Error("must not insert"); },
            };
        },
    } as unknown as SupabaseClient;
    return { supabase, updates, get inserted() { return inserted; } };
}

describe("dbStoreProcessingCaseClassification (operator path) — annotation only", () => {
    it("valid classified update writes only case_type + metadata.classification; no status; corrected_at set", async () => {
        const fake = makeFakeSupabase({ keep: "me", operational_result: { kind: "x" } });
        const result = buildOperatorClassification({ classification_key: "remittance", status: "classified" });
        const now = new Date("2026-06-17T08:00:00.000Z");
        const stored = await dbStoreProcessingCaseClassification(fake.supabase, {
            orgId: "o1", caseId: "c1", result, now, correctedAt: now,
        });

        expect(fake.updates).toHaveLength(1);
        const payload = fake.updates[0].payload;
        expect(Object.keys(payload).sort()).toEqual(["case_type", "metadata"]);
        expect(payload.case_type).toBe("remittance");
        expect("status" in payload).toBe(false);
        const meta = payload.metadata as Record<string, unknown>;
        // existing metadata preserved (merge) — sources/proposals/other case metadata untouched.
        expect(meta.keep).toBe("me");
        expect(meta.operational_result).toEqual({ kind: "x" });
        expect((meta.classification as { classification_key: string }).classification_key).toBe("remittance");
        expect(stored.corrected_at).toBe("2026-06-17T08:00:00.000Z");
        expect(fake.inserted).toBe(false);
    });

    it("valid unknown update writes case_type=unknown and confidence 0", async () => {
        const fake = makeFakeSupabase();
        const result = buildOperatorClassification({ classification_key: "unknown", status: "unknown" });
        const stored = await dbStoreProcessingCaseClassification(fake.supabase, {
            orgId: "o1", caseId: "c1", result, correctedAt: new Date(),
        });
        expect(fake.updates[0].payload.case_type).toBe("unknown");
        expect(stored.confidence).toBe(0);
        expect(stored.status).toBe("unknown");
    });

    it("does not mutate sources / proposals / business records (only processing_cases touched)", async () => {
        const fake = makeFakeSupabase();
        await dbStoreProcessingCaseClassification(fake.supabase, {
            orgId: "o1", caseId: "c1",
            result: buildOperatorClassification({ classification_key: "immunization_record", status: "classified" }),
            correctedAt: new Date(),
        });
        expect(fake.updates.every((u) => u.table === "processing_cases")).toBe(true);
    });
});

describe("org scoping — query is filtered by org_id", () => {
    it("the store filters its read + write by the provided org id", async () => {
        const eqCalls: [string, unknown][] = [];
        const supabase = {
            from() {
                return {
                    select() {
                        return {
                            eq(col: string, val: unknown) {
                                eqCalls.push([col, val]);
                                return { eq(c2: string, v2: unknown) { eqCalls.push([c2, v2]); return { maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }; } };
                            },
                        };
                    },
                    update() {
                        return {
                            eq(col: string, val: unknown) {
                                eqCalls.push([col, val]);
                                return { eq(c2: string, v2: unknown) { eqCalls.push([c2, v2]); return Promise.resolve({ error: null }); } };
                            },
                        };
                    },
                };
            },
        } as unknown as SupabaseClient;

        await dbStoreProcessingCaseClassification(supabase, {
            orgId: "org-77", caseId: "case-9",
            result: buildOperatorClassification({ classification_key: "remittance", status: "classified" }),
            correctedAt: new Date(),
        });
        // both the read and the update scoped by org_id = org-77
        expect(eqCalls.filter(([c, v]) => c === "org_id" && v === "org-77").length).toBeGreaterThanOrEqual(2);
    });
});

describe("operatorCorrectionRequestBody — UI intent -> PATCH body", () => {
    it("confirm a real key -> classified", () => {
        expect(operatorCorrectionRequestBody({ intent: "confirm", currentKey: "subsidy_contract" })).toEqual({
            classification_key: "subsidy_contract",
            status: "classified",
        });
    });
    it("confirm unknown -> null (no-op)", () => {
        expect(operatorCorrectionRequestBody({ intent: "confirm", currentKey: "unknown" })).toBeNull();
    });
    it("change -> classified with chosen key", () => {
        expect(operatorCorrectionRequestBody({ intent: "change", key: "enrollment_document" })).toEqual({
            classification_key: "enrollment_document",
            status: "classified",
        });
    });
    it("mark_unknown -> unknown/unknown", () => {
        expect(operatorCorrectionRequestBody({ intent: "mark_unknown" })).toEqual({
            classification_key: "unknown",
            status: "unknown",
        });
    });
});
