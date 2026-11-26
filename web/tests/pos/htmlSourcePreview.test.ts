import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isTextSourcePreview, sourcePreviewContentType } from "@/lib/pos/sourcePreviewContentType";
import { OFFERED_PROCESSING_IMPORT_INTENTS } from "@/lib/pos/processingImportIntent";

const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");
/** Comments discuss the removed action on purpose; only real code counts. */
const codeOf = (p: string) =>
    web(p)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("which stored sources are framed as text", () => {
    it("serves a hosted-form capture as HTML", () => {
        expect(sourcePreviewContentType("org/case/Admissions_Packet.html", null)).toBe("text/html; charset=utf-8");
        expect(sourcePreviewContentType("x/y/form.HTM", null)).toBe("text/html; charset=utf-8");
    });

    it("serves plain text and CSV as text, never as HTML", () => {
        expect(sourcePreviewContentType("a/b.txt", null)).toBe("text/plain; charset=utf-8");
        expect(sourcePreviewContentType("a/b.csv", null)).toBe("text/plain; charset=utf-8");
    });

    it("refuses everything that has its own viewer, so this cannot become a byte proxy", () => {
        for (const path of ["a/b.pdf", "a/b.png", "a/b.jpg", "a/b.docx", "a/b.doc", "a/b.heic", "a/b"]) {
            expect(sourcePreviewContentType(path, null)).toBeNull();
        }
    });

    it("does not let a declared mime talk a PDF into being served as HTML", () => {
        // The stored PATH decides first. A file named .pdf stays refused however it is labelled.
        expect(sourcePreviewContentType("a/b.pdf", "text/html")).toBeNull();
    });

    it("falls back to the declared mime only for text types", () => {
        expect(sourcePreviewContentType("a/capture", "text/html")).toBe("text/html; charset=utf-8");
        expect(sourcePreviewContentType("a/capture", "application/pdf")).toBeNull();
        expect(sourcePreviewContentType("a/capture", "image/png")).toBeNull();
    });

    it("answers the pane's question the same way", () => {
        expect(isTextSourcePreview("Admissions_Packet.html", null)).toBe(true);
        expect(isTextSourcePreview("scan.pdf", null)).toBe(false);
        expect(isTextSourcePreview(null, null)).toBe(false);
    });
});

describe("the uploaded document is evidence, not an application", () => {
    const route = web("app/api/admin/documents/[id]/source-preview/route.ts");

    it("puts the response in a sandbox with no script, form or plugin execution", () => {
        expect(route).toContain('"content-security-policy": "sandbox;');
        expect(route).toContain("default-src 'none'");
    });

    it("refuses content sniffing and leaks no referrer", () => {
        expect(route).toContain('"x-content-type-options": "nosniff"');
        expect(route).toContain('"referrer-policy": "no-referrer"');
    });

    it("never allows scripts through the CSP", () => {
        expect(route).not.toMatch(/script-src\s+[^;"]*'unsafe-inline'/);
        expect(route).not.toContain("allow-scripts");
    });

    it("authorizes with the shared document authority rather than a session check", () => {
        // A session-only check would let any org member read another child's records.
        expect(route).toContain("assertDocumentAccess");
        expect(route).toContain('operation: "download"');
        expect(route).toContain('decision.outcome !== "allowed"');
    });

    it("frames it with an empty sandbox attribute at the call site too", () => {
        const pane = web("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        expect(pane).toContain('sandbox=""');
        expect(pane).toContain('data-qa-source-preview="text"');
    });

    it("does not hand a text source to the PDF renderer", () => {
        const pane = codeOf("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        expect(pane).toContain("!isTextSource &&");
    });
});

describe("the form-authoring workflow offers no packet analysis", () => {
    it("has no operator-facing packet action in the review workspace", () => {
        const pane = codeOf("app/adminV2/pos/PosTemplateSetupColumn.tsx");
        for (const forbidden of ["Analyse as one packet", "Analyze as one packet", "Re-analyse packet", "processing-analyze-packet"]) {
            expect(pane).not.toContain(forbidden);
        }
    });

    it("has no packet choice in the import chooser", () => {
        expect(OFFERED_PROCESSING_IMPORT_INTENTS.map((o) => o.label)).not.toContain("Analyze as one packet");
        const modal = codeOf("app/adminV2/pos/ProcessingImportIntentModal.tsx");
        expect(modal).toContain("OFFERED_PROCESSING_IMPORT_INTENTS");
        expect(modal).not.toContain("PROCESSING_IMPORT_INTENT_OPTIONS");
    });

    it("keeps the packet machinery for callers that genuinely compose one", () => {
        // Removing the operator question must not remove the capability.
        expect(web("lib/pos/processingImportIntent.ts")).toContain('"packet_source"');
    });
});

describe("the form is the landing surface", () => {
    const pane = codeOf("app/adminV2/pos/PosTemplateSetupColumn.tsx");

    it("starts in the form view, not the concept queue", () => {
        expect(pane).toMatch(/useState<"form"[^>]*>\("form"\)/);
    });

    it("renders the form-shaped review before the concept queue or the two-pane workspace", () => {
        const form = pane.indexOf('reviewMode === "form"');
        const concepts = pane.indexOf('reviewMode === "concepts"');
        expect(form).toBeGreaterThan(-1);
        expect(concepts).toBeGreaterThan(form);
    });
});
