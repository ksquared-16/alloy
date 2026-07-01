import { describe, it, expect } from "vitest";
import {
    processingCaseDrawerHref,
    processingQueueHref,
    parseProcessingCaseIdFromPath,
} from "@/lib/pos/processingCase/processingDrawerUrl";

describe("processingDrawerUrl", () => {
    it("builds canonical hrefs", () => {
        expect(processingQueueHref()).toBe("/admin/processing");
        expect(processingCaseDrawerHref("abc")).toBe("/admin/processing/abc");
    });

    it("parses a caseId from the drawer path", () => {
        expect(parseProcessingCaseIdFromPath("/admin/processing/abc")).toBe("abc");
        expect(parseProcessingCaseIdFromPath("/admin/processing/abc/")).toBe("abc");
    });

    it("accepts the transitional /adminV2 alias path", () => {
        expect(parseProcessingCaseIdFromPath("/adminV2/processing/abc")).toBe("abc");
    });

    it("returns null for the bare queue path and non-processing paths", () => {
        expect(parseProcessingCaseIdFromPath("/admin/processing")).toBeNull();
        expect(parseProcessingCaseIdFromPath("/admin/settings")).toBeNull();
    });

    it("returns null for a nested (non-caseId) path", () => {
        expect(parseProcessingCaseIdFromPath("/admin/processing/abc/extra")).toBeNull();
    });
});
