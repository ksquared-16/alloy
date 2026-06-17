/**
 * POS-FP10 — extraction is stamped with the classification it was built for, and
 * staleness is detectable when the operator corrects the classification.
 */

import { describe, it, expect } from "vitest";
import { buildDocumentSourceEnvelope } from "@/lib/pos/processingCase/extraction/documentFacts";
import { buildProcessingExtraction } from "@/lib/pos/processingCase/extraction/buildProcessingExtraction";
import { isExtractionStale } from "@/lib/pos/processingCase/extraction/processingCaseExtractionDb";

function build(classificationKey: "subsidy_contract" | "remittance" | "unknown") {
    const envelope = buildDocumentSourceEnvelope(
        { metadata: { agency_name: "Bright Futures", child_name: "Jane Doe" } },
        { sourceId: "doc-1", capturedAt: "2026-06-17T12:00:00.000Z" }
    );
    return buildProcessingExtraction({ envelope, classificationKey });
}

describe("extraction carries classification_key", () => {
    it("stamps the classification the candidates were built for", () => {
        expect(build("subsidy_contract").classification_key).toBe("subsidy_contract");
        expect(build("remittance").classification_key).toBe("remittance");
    });
});

describe("isExtractionStale", () => {
    it("false when extraction matches the current classification", () => {
        expect(isExtractionStale({ classification_key: "subsidy_contract" }, "subsidy_contract")).toBe(false);
    });

    it("true when the classification was corrected after extraction", () => {
        expect(isExtractionStale({ classification_key: "subsidy_contract" }, "remittance")).toBe(true);
    });

    it("false when there is no extraction or no current classification", () => {
        expect(isExtractionStale(null, "subsidy_contract")).toBe(false);
        expect(isExtractionStale({ classification_key: "subsidy_contract" }, null)).toBe(false);
    });

    it("correcting to unknown makes a prior classified extraction stale (until re-extracted)", () => {
        expect(isExtractionStale({ classification_key: "subsidy_contract" }, "unknown")).toBe(true);
    });
});
