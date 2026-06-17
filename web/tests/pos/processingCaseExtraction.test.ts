/**
 * POS-FP10 — extraction proposals (deterministic, proposal-only).
 *
 * Proves: subsidy/remittance/immunization proposals come from real signals; unknown
 * yields none; confidence is preserved; values are never fabricated; and persistence
 * is annotation-only — it writes ONLY metadata.extraction (no case_type, no status,
 * no insert, no other table), so no record update / lifecycle change / commit occurs.
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    extractProposalsForClassification,
    normalizeDate,
    normalizeAmount,
    EXTRACTOR_VERSION,
} from "@/lib/pos/processingCase/extraction/extractProposalsForClassification";
import {
    dbStoreProcessingCaseExtraction,
    parseStoredExtraction,
    toStoredExtraction,
} from "@/lib/pos/processingCase/extraction/processingCaseExtractionDb";
import { maybeExtractProcessingCaseFromDocumentSafe } from "@/lib/pos/processingCase/extraction/maybeExtractProcessingCaseFromDocumentSafe";

describe("extractProposalsForClassification — by classification", () => {
    it("subsidy_contract: proposes agency/child/start/end from metadata, confidence preserved", () => {
        const set = extractProposalsForClassification({
            classificationKey: "subsidy_contract",
            fileName: "subsidy_contract.pdf",
            metadata: {
                agency_name: "Bright Futures DHS",
                child_name: "Jane Doe",
                authorization_start_date: "2026-07-01",
                authorization_end_date: "2026-09-30",
            },
        });
        expect(set.classification_key).toBe("subsidy_contract");
        const byKey = Object.fromEntries(set.proposals.map((p) => [p.field_key, p]));
        expect(byKey.agency_name.value).toBe("Bright Futures DHS");
        expect(byKey.child_name.value).toBe("Jane Doe");
        expect(byKey.authorization_start_date.value).toBe("2026-07-01");
        expect(byKey.authorization_end_date.value).toBe("2026-09-30");
        // confidence preserved + honest (explicit metadata => 0.9)
        for (const p of set.proposals) {
            expect(p.confidence).toBe(0.9);
            expect(p.signals[0].source.startsWith("metadata.")).toBe(true);
        }
    });

    it("subsidy_contract: only proposes fields that have a real signal (no fabrication)", () => {
        const set = extractProposalsForClassification({
            classificationKey: "subsidy_contract",
            fileName: "subsidy_contract.pdf",
            metadata: { agency_name: "Bright Futures" },
        });
        const keys = set.proposals.map((p) => p.field_key);
        expect(keys).toEqual(["agency_name"]);
        // child_name / dates absent → not proposed
        expect(keys).not.toContain("child_name");
        expect(keys).not.toContain("authorization_start_date");
    });

    it("remittance: payer/amount/date, amount + date normalized", () => {
        const set = extractProposalsForClassification({
            classificationKey: "remittance",
            fileName: "remit.pdf",
            metadata: { payer: "State CCAP", amount: "$1,250.00", payment_date: "07/15/2026" },
        });
        const byKey = Object.fromEntries(set.proposals.map((p) => [p.field_key, p]));
        expect(byKey.payer_name.value).toBe("State CCAP");
        expect(byKey.payment_amount.value).toBe("1250");
        expect(byKey.payment_date.value).toBe("2026-07-15");
    });

    it("remittance: payment_date can come from a single date in the filename (lower confidence)", () => {
        const set = extractProposalsForClassification({
            classificationKey: "remittance",
            fileName: "remittance_2026-07-15.pdf",
            metadata: { payer: "State CCAP" },
        });
        const byKey = Object.fromEntries(set.proposals.map((p) => [p.field_key, p]));
        expect(byKey.payment_date.value).toBe("2026-07-15");
        expect(byKey.payment_date.confidence).toBe(0.6);
        expect(byKey.payment_date.signals[0].source).toBe("filename");
    });

    it("immunization_record: child + immunization date", () => {
        const set = extractProposalsForClassification({
            classificationKey: "immunization_record",
            fileName: "immunization.pdf",
            metadata: { child_name: "Sam Lee", immunization_date: "2026-05-02" },
        });
        const byKey = Object.fromEntries(set.proposals.map((p) => [p.field_key, p]));
        expect(byKey.child_name.value).toBe("Sam Lee");
        expect(byKey.immunization_date.value).toBe("2026-05-02");
    });

    it("unknown: returns no proposals", () => {
        const set = extractProposalsForClassification({ classificationKey: "unknown", fileName: "IMG_1.pdf", metadata: { agency_name: "x" } });
        expect(set.proposals).toEqual([]);
    });

    it("no document signals -> honest empty proposals (no fabrication)", () => {
        const set = extractProposalsForClassification({ classificationKey: "subsidy_contract", fileName: "scan.pdf" });
        expect(set.proposals).toEqual([]);
        expect(set.extractor_version).toBe(EXTRACTOR_VERSION);
    });

    it("ambiguous (two dates) in filename -> no filename-derived date", () => {
        const set = extractProposalsForClassification({
            classificationKey: "remittance",
            fileName: "remit_2026-07-01_2026-07-31.pdf",
            metadata: { payer: "x" },
        });
        const byKey = Object.fromEntries(set.proposals.map((p) => [p.field_key, p]));
        expect(byKey.payment_date).toBeUndefined();
    });
});

describe("normalizers", () => {
    it("normalizeDate handles ISO + US, rejects junk", () => {
        expect(normalizeDate("2026-07-01")).toBe("2026-07-01");
        expect(normalizeDate("7/1/2026")).toBe("2026-07-01");
        expect(normalizeDate("not a date")).toBeNull();
    });
    it("normalizeAmount strips currency formatting", () => {
        expect(normalizeAmount("$1,250.00")).toBe("1250");
        expect(normalizeAmount("abc")).toBeNull();
    });
});

// --- persistence: annotation only -----------------------------------------------------

function makeFakeSupabase(existingMetadata: Record<string, unknown> = {}) {
    const updates: { table: string; payload: Record<string, unknown> }[] = [];
    let inserted = false;
    const supabase = {
        from(table: string) {
            if (table !== "processing_cases") throw new Error(`extraction must not touch table "${table}"`);
            return {
                select() {
                    return { eq() { return { eq() { return { maybeSingle: async () => ({ data: { metadata: existingMetadata }, error: null }) }; } }; } };
                },
                update(payload: Record<string, unknown>) {
                    updates.push({ table, payload });
                    return { eq() { return { eq: async () => ({ error: null }) }; } };
                },
                insert() { inserted = true; throw new Error("extraction must not insert"); },
            };
        },
    } as unknown as SupabaseClient;
    return { supabase, updates, get inserted() { return inserted; } };
}

describe("dbStoreProcessingCaseExtraction — annotation only (no commit / no record / no status)", () => {
    it("writes ONLY metadata (not case_type, not status); merges; no insert", async () => {
        const fake = makeFakeSupabase({ classification: { classification_key: "subsidy_contract" }, operational_result: { x: 1 } });
        const set = extractProposalsForClassification({
            classificationKey: "subsidy_contract",
            metadata: { agency_name: "Bright Futures" },
        });
        const stored = await dbStoreProcessingCaseExtraction(fake.supabase, {
            orgId: "o1", caseId: "c1", set, now: new Date("2026-06-17T09:00:00.000Z"),
        });

        expect(fake.updates).toHaveLength(1);
        const payload = fake.updates[0].payload;
        // Only metadata is written — NOT case_type, NOT status.
        expect(Object.keys(payload)).toEqual(["metadata"]);
        expect("case_type" in payload).toBe(false);
        expect("status" in payload).toBe(false);
        const meta = payload.metadata as Record<string, unknown>;
        // sibling metadata preserved (classification + operational_result untouched).
        expect(meta.classification).toEqual({ classification_key: "subsidy_contract" });
        expect(meta.operational_result).toEqual({ x: 1 });
        expect((meta.extraction as { proposals: unknown[] }).proposals.length).toBe(1);
        expect(stored.extracted_at).toBe("2026-06-17T09:00:00.000Z");
        expect(fake.inserted).toBe(false);
    });

    it("storing proposals performs no commit action (no other table, ever)", async () => {
        const fake = makeFakeSupabase();
        await dbStoreProcessingCaseExtraction(fake.supabase, {
            orgId: "o1", caseId: "c1",
            set: extractProposalsForClassification({ classificationKey: "remittance", metadata: { payer: "x" } }),
        });
        expect(fake.updates.every((u) => u.table === "processing_cases")).toBe(true);
    });
});

describe("maybeExtractProcessingCaseFromDocumentSafe — best-effort", () => {
    it("extracts + stores, never inserts a case", async () => {
        const fake = makeFakeSupabase();
        const stored = await maybeExtractProcessingCaseFromDocumentSafe(fake.supabase, {
            orgId: "o1", caseId: "c1", classificationKey: "immunization_record",
            document: { fileName: "immun.pdf", metadata: { child_name: "Sam", immunization_date: "2026-05-02" } },
        });
        expect(stored?.proposals.length).toBe(2);
        expect(fake.inserted).toBe(false);
    });
    it("never throws; returns null on failure", async () => {
        const exploding = { from() { throw new Error("db down"); } } as unknown as SupabaseClient;
        const out = await maybeExtractProcessingCaseFromDocumentSafe(exploding, {
            orgId: "o1", caseId: "c1", classificationKey: "subsidy_contract", document: { fileName: "x.pdf" },
        });
        expect(out).toBeNull();
    });
});

describe("parseStoredExtraction — read model projection", () => {
    it("round-trips a stored extraction set", () => {
        const stored = toStoredExtraction(
            extractProposalsForClassification({ classificationKey: "subsidy_contract", metadata: { agency_name: "BF" } }),
            new Date("2026-06-17T09:00:00.000Z")
        );
        expect(parseStoredExtraction({ extraction: stored, classification: { k: 1 } })).toEqual(stored);
    });
    it("returns null when absent/malformed", () => {
        expect(parseStoredExtraction({})).toBeNull();
        expect(parseStoredExtraction(null)).toBeNull();
        expect(parseStoredExtraction({ extraction: { classification_key: "x" } })).toBeNull(); // no proposals[]
    });
});
