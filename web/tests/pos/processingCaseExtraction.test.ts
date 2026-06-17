/**
 * POS-FP10 (intake-aligned) — document → facts → field candidates.
 *
 * Proves POS reuses the shared Intake Engine contracts (no POS-specific proposal model):
 * document metadata produces `IntakeFact[]`; facts map to shared `IntakeFieldCandidate[]`
 * (classification-scoped); unknown produces no candidates; confidence is preserved as the
 * shared string tiers; and persistence is annotation-only (metadata only, no case_type,
 * no status, no insert, no other table → no record/lifecycle change, no commit).
 */

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDocumentSourceEnvelope, extractFactsFromDocument } from "@/lib/pos/processingCase/extraction/documentFacts";
import { buildProcessingExtraction, EXTRACTOR_VERSION } from "@/lib/pos/processingCase/extraction/buildProcessingExtraction";
import {
    dbStoreProcessingCaseExtraction,
    parseStoredExtraction,
    toStoredExtraction,
} from "@/lib/pos/processingCase/extraction/processingCaseExtractionDb";
import { maybeExtractProcessingCaseFromDocumentSafe } from "@/lib/pos/processingCase/extraction/maybeExtractProcessingCaseFromDocumentSafe";
import { __resetHouseholdCandidateCounterForTests } from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import type { ProcessingClassificationKey } from "@/lib/pos/processingCase/classification/types";

const CAPTURED_AT = "2026-06-17T12:00:00.000Z";

function build(classificationKey: ProcessingClassificationKey, signals: {
    fileName?: string;
    title?: string;
    docType?: string;
    metadata?: Record<string, unknown>;
}) {
    __resetHouseholdCandidateCounterForTests();
    const envelope = buildDocumentSourceEnvelope(signals, { sourceId: "doc-1", capturedAt: CAPTURED_AT });
    return buildProcessingExtraction({ envelope, classificationKey });
}

function cand(result: ReturnType<typeof build>, key: string) {
    return result.candidates.find((c) => c.payload_key === key);
}

describe("extractFactsFromDocument — source-agnostic IntakeFact[]", () => {
    it("emits typed facts (date/amount/person_name) with the shared shape; never target keys", () => {
        const envelope = buildDocumentSourceEnvelope(
            { fileName: "x.pdf", metadata: { child_name: "Jane Doe", authorization_start_date: "2026-07-01", amount: "$1,250.00" } },
            { sourceId: "doc-1", capturedAt: CAPTURED_AT }
        );
        const { source, facts } = extractFactsFromDocument(envelope);
        expect(source.source_kind).toBe("document");
        const types = facts.map((f) => f.fact_type).sort();
        expect(types).toEqual(["amount", "date", "person_name"]);
        // confidence is the shared string tier, not a number
        for (const f of facts) expect(["high", "medium", "low"]).toContain(f.confidence);
        const name = facts.find((f) => f.fact_type === "person_name");
        expect(name?.role_hint).toBe("child");
        expect(name?.normalized_value).toBe("Jane Doe");
        const date = facts.find((f) => f.fact_type === "date");
        expect(date?.normalized_value).toBe("2026-07-01");
        const amt = facts.find((f) => f.fact_type === "amount");
        expect(amt?.normalized_value).toBe("1250");
    });

    it("org/agency names are NOT facts (no shared fact_type) — left on envelope metadata", () => {
        const envelope = buildDocumentSourceEnvelope(
            { metadata: { agency_name: "Bright Futures DHS" } },
            { sourceId: "doc-1", capturedAt: CAPTURED_AT }
        );
        const { facts } = extractFactsFromDocument(envelope);
        expect(facts).toEqual([]);
        expect((envelope.metadata as Record<string, unknown>).agency_name).toBe("Bright Futures DHS");
    });

    it("parses a single underscore-adjacent date from the filename (weaker confidence)", () => {
        const envelope = buildDocumentSourceEnvelope(
            { fileName: "remittance_2026-07-15.pdf", metadata: {} },
            { sourceId: "doc-1", capturedAt: CAPTURED_AT }
        );
        const { facts } = extractFactsFromDocument(envelope);
        const d = facts.find((f) => f.fact_type === "date");
        expect(d?.normalized_value).toBe("2026-07-15");
        expect(d?.confidence).toBe("medium");
    });
});

describe("mapProcessingFactsToCandidates (via buildProcessingExtraction) — shared IntakeFieldCandidate[]", () => {
    it("subsidy_contract: agency/child/start/end candidates, confidence preserved", () => {
        const r = build("subsidy_contract", {
            metadata: {
                agency_name: "Bright Futures DHS",
                child_name: "Jane Doe",
                authorization_start_date: "2026-07-01",
                authorization_end_date: "2026-09-30",
            },
        });
        expect(cand(r, "agency_name")?.value).toBe("Bright Futures DHS");
        expect(cand(r, "child_name")?.value).toBe("Jane Doe");
        expect(cand(r, "authorization_start_date")?.value).toBe("2026-07-01");
        expect(cand(r, "authorization_end_date")?.value).toBe("2026-09-30");
        // shared candidate shape
        const c = cand(r, "authorization_start_date")!;
        expect(c).toHaveProperty("payload_key");
        expect(c).toHaveProperty("rule_id");
        expect(c).toHaveProperty("fact_ids");
        expect(["high", "medium", "low", "invalid"]).toContain(c.confidence);
        expect(c.fact_ids.length).toBeGreaterThan(0);
        // agency has no backing fact (org names aren't facts)
        expect(cand(r, "agency_name")!.fact_ids).toEqual([]);
    });

    it("remittance: payer/amount/date candidates", () => {
        const r = build("remittance", {
            fileName: "remit.pdf",
            metadata: { payer: "State CCAP", amount: "$1,250.00", payment_date: "07/15/2026" },
        });
        expect(cand(r, "payer_name")?.value).toBe("State CCAP");
        expect(cand(r, "payment_amount")?.value).toBe("1250");
        expect(cand(r, "payment_date")?.value).toBe("2026-07-15");
    });

    it("remittance: payment_date falls back to a filename date", () => {
        const r = build("remittance", { fileName: "remittance_2026-07-15.pdf", metadata: { payer: "X" } });
        expect(cand(r, "payment_date")?.value).toBe("2026-07-15");
        expect(cand(r, "payment_date")?.confidence).toBe("medium");
    });

    it("immunization_record: child + immunization date", () => {
        const r = build("immunization_record", { metadata: { child_name: "Sam Lee", immunization_date: "2026-05-02" } });
        expect(cand(r, "child_name")?.value).toBe("Sam Lee");
        expect(cand(r, "immunization_date")?.value).toBe("2026-05-02");
    });

    it("unknown: no candidates", () => {
        const r = build("unknown", { metadata: { agency_name: "x", child_name: "Y Z" } });
        expect(r.candidates).toEqual([]);
    });

    it("no document signals -> no facts and no candidates (honest empty)", () => {
        const r = build("subsidy_contract", { fileName: "scan.pdf" });
        expect(r.facts).toEqual([]);
        expect(r.candidates).toEqual([]);
        expect(r.extractor_version).toBe(EXTRACTOR_VERSION);
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

describe("dbStoreProcessingCaseExtraction — annotation only (no commit / record / status)", () => {
    it("writes ONLY metadata (source/facts/candidates), preserves siblings, no insert", async () => {
        const fake = makeFakeSupabase({ classification: { classification_key: "subsidy_contract" }, operational_result: { x: 1 } });
        const result = build("subsidy_contract", { metadata: { agency_name: "Bright Futures", child_name: "Jane Doe" } });
        const stored = await dbStoreProcessingCaseExtraction(fake.supabase, {
            orgId: "o1", caseId: "c1", result, now: new Date("2026-06-17T09:00:00.000Z"),
        });

        expect(fake.updates).toHaveLength(1);
        const payload = fake.updates[0].payload;
        expect(Object.keys(payload)).toEqual(["metadata"]);
        expect("case_type" in payload).toBe(false);
        expect("status" in payload).toBe(false);
        const meta = payload.metadata as Record<string, unknown>;
        expect(meta.classification).toEqual({ classification_key: "subsidy_contract" });
        expect(meta.operational_result).toEqual({ x: 1 });
        const ext = meta.extraction as { source: unknown; facts: unknown[]; candidates: unknown[] };
        expect(ext.source).toBeTruthy();
        expect(Array.isArray(ext.candidates)).toBe(true);
        expect(stored.extracted_at).toBe("2026-06-17T09:00:00.000Z");
        expect(fake.inserted).toBe(false);
    });
});

describe("maybeExtractProcessingCaseFromDocumentSafe — best-effort", () => {
    it("runs pipeline + stores, never inserts a case", async () => {
        const fake = makeFakeSupabase();
        const stored = await maybeExtractProcessingCaseFromDocumentSafe(fake.supabase, {
            orgId: "o1", caseId: "c1", classificationKey: "immunization_record", sourceId: "doc-1",
            document: { metadata: { child_name: "Sam Lee", immunization_date: "2026-05-02" } },
        });
        expect(stored?.candidates.map((c) => c.payload_key).sort()).toEqual(["child_name", "immunization_date"]);
        expect(stored?.source.source_kind).toBe("document");
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
    it("round-trips a stored intake extraction", () => {
        const stored = toStoredExtraction(
            build("subsidy_contract", { metadata: { agency_name: "BF", child_name: "Jane Doe" } }),
            new Date("2026-06-17T09:00:00.000Z")
        );
        expect(parseStoredExtraction({ extraction: stored, classification: { k: 1 } })).toEqual(stored);
    });
    it("returns null when absent/malformed", () => {
        expect(parseStoredExtraction({})).toBeNull();
        expect(parseStoredExtraction(null)).toBeNull();
        expect(parseStoredExtraction({ extraction: { facts: [] } })).toBeNull(); // no source/candidates
    });
});
