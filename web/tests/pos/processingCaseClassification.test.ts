/**
 * POS-FP9 — non-form source classification.
 *
 * Proves the classifier is deterministic, honest (unknown when no signal), and that
 * persistence ONLY annotates the case (case_type + metadata.classification) — it never
 * changes status, never opens a case, and never touches a business record.
 *
 * No DB: pure classifier + a fake Supabase that records exactly which tables/columns
 * are written (and throws if anything outside processing_cases is touched).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    classifyNonFormSource,
    CLASSIFIER_VERSION,
} from "@/lib/pos/processingCase/classification/classifyNonFormSource";
import {
    dbStoreProcessingCaseClassification,
    parseStoredClassification,
    toStoredClassification,
} from "@/lib/pos/processingCase/classification/processingCaseClassificationDb";
import { maybeClassifyProcessingCaseFromDocumentSafe } from "@/lib/pos/processingCase/classification/maybeClassifyProcessingCaseFromDocumentSafe";

describe("classifyNonFormSource — deterministic labels", () => {
    it("subsidy-like filename -> subsidy_contract (classified, confident, with signals)", () => {
        const r = classifyNonFormSource({ sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" });
        expect(r.classification_key).toBe("subsidy_contract");
        expect(r.status).toBe("classified");
        expect(r.confidence).toBeGreaterThan(0);
        expect(r.confidence).toBeLessThanOrEqual(0.95);
        expect(r.signals.length).toBeGreaterThan(0);
        expect(r.signals.map((s) => s.value)).toContain("subsidy");
    });

    it("remittance-like metadata -> remittance", () => {
        const r = classifyNonFormSource({
            sourceKind: "import",
            fileName: "batch_837.dat",
            metadata: { description: "Monthly remittance / payment advice 835" },
        });
        expect(r.classification_key).toBe("remittance");
        expect(r.status).toBe("classified");
        expect(r.signals.some((s) => s.source === "metadata")).toBe(true);
    });

    it("immunization-like filename -> immunization_record", () => {
        const r = classifyNonFormSource({ sourceKind: "document", fileName: "Jane_Immunization_Record.pdf" });
        expect(r.classification_key).toBe("immunization_record");
        expect(r.status).toBe("classified");
    });

    it("enrollment-like title -> enrollment_document", () => {
        const r = classifyNonFormSource({ sourceKind: "document", title: "Fall 2026 Enrollment Registration" });
        expect(r.classification_key).toBe("enrollment_document");
        expect(r.status).toBe("classified");
    });

    it("doc_type form -> form_like_document", () => {
        const r = classifyNonFormSource({ sourceKind: "document", fileName: "scan001.pdf", docType: "application form" });
        expect(r.classification_key).toBe("form_like_document");
        expect(r.status).toBe("classified");
    });

    it("unrecognized document -> unknown (confidence 0, no signals, honest)", () => {
        const r = classifyNonFormSource({
            sourceKind: "document",
            fileName: "IMG_4821.pdf",
            mimeType: "application/pdf",
        });
        expect(r.classification_key).toBe("unknown");
        expect(r.status).toBe("unknown");
        expect(r.confidence).toBe(0);
        expect(r.signals).toEqual([]);
    });

    it("form-backed source kind -> unsupported (forms have their own path)", () => {
        for (const kind of ["form_submission", "form_packet_session"] as const) {
            const r = classifyNonFormSource({ sourceKind: kind, fileName: "subsidy_contract.pdf" });
            expect(r.status).toBe("unsupported");
            expect(r.classification_key).toBe("unknown");
            expect(r.confidence).toBe(0);
        }
    });

    it("is deterministic and version-stamped", () => {
        const input = { sourceKind: "document", fileName: "subsidy_voucher.pdf" } as const;
        const a = classifyNonFormSource(input);
        const b = classifyNonFormSource(input);
        expect(a).toEqual(b);
        expect(a.classifier_version).toBe(CLASSIFIER_VERSION);
    });

    it("confidence is capped at 0.95 even with many strong signals", () => {
        const r = classifyNonFormSource({
            sourceKind: "document",
            fileName: "child care assistance subsidy ccap voucher.pdf",
            title: "subsidy contract",
            metadata: { a: "subsidy", b: "ccap voucher" },
        });
        expect(r.classification_key).toBe("subsidy_contract");
        expect(r.confidence).toBeLessThanOrEqual(0.95);
    });
});

// --- persistence: annotation only, no status change, no other tables touched ----------

interface CapturedUpdate {
    table: string;
    payload: Record<string, unknown>;
}

function makeFakeSupabase(existingMetadata: Record<string, unknown> = {}) {
    const updates: CapturedUpdate[] = [];
    const reads: string[] = [];
    let inserted = false;
    const supabase = {
        from(table: string) {
            if (table !== "processing_cases") {
                throw new Error(`classification must not touch table "${table}"`);
            }
            return {
                // read path: .select().eq().eq().maybeSingle()
                select() {
                    reads.push(table);
                    return {
                        eq() {
                            return {
                                eq() {
                                    return {
                                        maybeSingle: async () => ({ data: { metadata: existingMetadata }, error: null }),
                                    };
                                },
                            };
                        },
                    };
                },
                // write path: .update().eq().eq()
                update(payload: Record<string, unknown>) {
                    updates.push({ table, payload });
                    return {
                        eq() {
                            return { eq: async () => ({ error: null }) };
                        },
                    };
                },
                insert() {
                    inserted = true;
                    throw new Error("classification must not insert rows");
                },
            };
        },
    } as unknown as SupabaseClient;
    return { supabase, updates, reads, get inserted() { return inserted; } };
}

describe("dbStoreProcessingCaseClassification — annotation only", () => {
    it("writes case_type + metadata.classification and nothing else; no status; no insert", async () => {
        const fake = makeFakeSupabase({ existing_key: "keep-me" });
        const result = classifyNonFormSource({ sourceKind: "document", fileName: "subsidy_contract.pdf" });
        const stored = await dbStoreProcessingCaseClassification(fake.supabase, {
            orgId: "o1",
            caseId: "case-1",
            result,
            now: new Date("2026-06-17T00:00:00.000Z"),
        });

        expect(fake.updates).toHaveLength(1);
        const payload = fake.updates[0].payload;
        // Only these two keys are written.
        expect(Object.keys(payload).sort()).toEqual(["case_type", "metadata"]);
        // case_type mirrors the key.
        expect(payload.case_type).toBe("subsidy_contract");
        // status is NOT in the update — lifecycle is untouched.
        expect("status" in payload).toBe(false);
        // Existing metadata is preserved (merge, not overwrite).
        const meta = payload.metadata as Record<string, unknown>;
        expect(meta.existing_key).toBe("keep-me");
        expect((meta.classification as { classification_key: string }).classification_key).toBe("subsidy_contract");
        // stored result carries the persistence stamp.
        expect(stored.classified_at).toBe("2026-06-17T00:00:00.000Z");
        expect(fake.inserted).toBe(false);
    });

    it("does not commit or mutate business records (only processing_cases is ever touched)", async () => {
        // The fake throws for any non-processing_cases table; reaching here means none was touched.
        const fake = makeFakeSupabase();
        await dbStoreProcessingCaseClassification(fake.supabase, {
            orgId: "o1",
            caseId: "case-1",
            result: classifyNonFormSource({ sourceKind: "document", fileName: "remittance.pdf" }),
        });
        expect(fake.updates.every((u) => u.table === "processing_cases")).toBe(true);
    });
});

describe("maybeClassifyProcessingCaseFromDocumentSafe — best-effort orchestration", () => {
    it("classifies + stores for a document, never opens/inserts a case", async () => {
        const fake = makeFakeSupabase();
        const stored = await maybeClassifyProcessingCaseFromDocumentSafe(fake.supabase, {
            orgId: "o1",
            caseId: "case-1",
            document: { sourceKind: "document", fileName: "Immunization_Record_Jane.pdf" },
        });
        expect(stored?.classification_key).toBe("immunization_record");
        expect(fake.inserted).toBe(false);
        expect(fake.updates).toHaveLength(1);
    });

    it("never throws; returns null on a storage failure (upload flow unaffected)", async () => {
        const explodingSupabase = {
            from() {
                throw new Error("db down");
            },
        } as unknown as SupabaseClient;
        const out = await maybeClassifyProcessingCaseFromDocumentSafe(explodingSupabase, {
            orgId: "o1",
            caseId: "case-1",
            document: { fileName: "x.pdf" },
        });
        expect(out).toBeNull();
    });
});

describe("parseStoredClassification — read model projection", () => {
    it("round-trips a stored classification from metadata", () => {
        const stored = toStoredClassification(
            classifyNonFormSource({ sourceKind: "document", fileName: "subsidy_contract.pdf" }),
            new Date("2026-06-17T00:00:00.000Z")
        );
        const parsed = parseStoredClassification({ classification: stored, other: 1 });
        expect(parsed).toEqual(stored);
    });

    it("returns null when no classification present", () => {
        expect(parseStoredClassification({})).toBeNull();
        expect(parseStoredClassification(null)).toBeNull();
        expect(parseStoredClassification({ classification: { junk: true } })).toBeNull();
    });
});
