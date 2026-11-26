import { describe, expect, it } from "vitest";
import {
    capabilitiesForFormat,
    detectProcessingSourceFormat,
    processingImportAcceptList,
} from "@/lib/pos/processingSourceCapabilities";

describe("processingSourceCapabilities", () => {
    it("detects common intake formats", () => {
        expect(detectProcessingSourceFormat("packet.pdf", "application/pdf")).toBe("pdf");
        expect(detectProcessingSourceFormat("form.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("docx");
        expect(detectProcessingSourceFormat("scan.png", "image/png")).toBe("png");
        expect(detectProcessingSourceFormat("notes.txt", "text/plain")).toBe("txt");
    });

    it("marks images as store/preview without question detection", () => {
        const caps = capabilitiesForFormat("png");
        expect(caps.store).toBe(true);
        expect(caps.preview).toBe(true);
        expect(caps.questionDetection).toBe(false);
    });

    it("excludes heic from import accept list", () => {
        const accept = processingImportAcceptList();
        expect(accept).toContain(".pdf");
        expect(accept).toContain(".docx");
        expect(accept).not.toContain(".heic");
    });
});
