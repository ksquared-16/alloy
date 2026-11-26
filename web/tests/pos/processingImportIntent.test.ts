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

    it("offers packet intake now that a case can be analysed across all its sources", () => {
        // Held closed while nothing composed across a case's sources. `buildPacketIntakeForCaseSafe`
        // reads every document attached to the case and composes one analysis, so the intent is real.
        const packet = PROCESSING_IMPORT_INTENT_OPTIONS.find((opt) => opt.value === "packet_source");
        expect(packet?.available).toBe(true);
        expect(packet?.description).toMatch(/analyze every source/i);
    });

    it("parseProcessingIntentFromMetadata reads case metadata", () => {
        expect(parseProcessingIntentFromMetadata({ processing_intent: "generate_form" })).toBe("generate_form");
        expect(parseProcessingIntentFromMetadata({ import_purpose: "process_information" })).toBe("process_information");
        expect(parseProcessingIntentFromMetadata(null)).toBeNull();
    });
});
