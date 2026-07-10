import { describe, expect, it } from "vitest";
import {
    PROCESSING_IMPORT_INTENT_OPTIONS,
    isProcessingImportIntent,
    parseProcessingIntentFromMetadata,
    processingIntentMetadata,
} from "@/lib/pos/processingImportIntent";

describe("processingImportIntent", () => {
    it("validates intent vocabulary", () => {
        expect(isProcessingImportIntent("generate_form")).toBe(true);
        expect(isProcessingImportIntent("store_document")).toBe(true);
        expect(isProcessingImportIntent("invalid")).toBe(false);
    });

    it("persists explicit metadata patch", () => {
        expect(processingIntentMetadata("process_information")).toEqual({
            processing_intent: "process_information",
            import_purpose: "process_information",
        });
    });

    it("marks packet intent unavailable in V1 options", () => {
        const packet = PROCESSING_IMPORT_INTENT_OPTIONS.find((opt) => opt.value === "packet_source");
        expect(packet?.available).toBe(false);
    });

    it("parseProcessingIntentFromMetadata reads case metadata", () => {
        expect(parseProcessingIntentFromMetadata({ processing_intent: "generate_form" })).toBe("generate_form");
        expect(parseProcessingIntentFromMetadata({ import_purpose: "process_information" })).toBe("process_information");
        expect(parseProcessingIntentFromMetadata(null)).toBeNull();
    });
});
