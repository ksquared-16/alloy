import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CANVAS = readFileSync(
    join(process.cwd(), "app", "forms", "embed", "[token]", "ParticipantDocumentCanvas.tsx"),
    "utf8",
);
const HOST = readFileSync(
    join(process.cwd(), "app", "forms", "embed", "[token]", "FormEmbedClient.tsx"),
    "utf8",
);

describe("a captured signature is acknowledged immediately", () => {
    it("does not re-rasterize the document to show the mark", () => {
        /*
         * The captured preview used to be a DEPENDENCY of the rasterize effect. So finishing a
         * signature re-imported pdf.js, re-fetched the document and re-rendered the page — seconds —
         * purely to relabel one overlay, and for that whole time the parent kept looking at a
         * dashed, pulsing "Tap to sign" over a signature they had already given. Kelly's words:
         * "did my signature actually work?".
         *
         * Measured after the fix: the signed state appears in well under a second at both widths.
         */
        expect(CANVAS).toContain("}, [url, page, signature?.focus, !!signature, fitHeightPx]);");
        expect(CANVAS).not.toMatch(/\}, \[url, page, signature\?\.preview\?\.typedName/);
    });

    it("paints the mark in place, off the same rules the full render uses", () => {
        // One painter, so an in-place update and a full rasterize can never disagree about what
        // "signed" looks like.
        expect(CANVAS).toContain("function paintSignatureTarget(");
        expect(CANVAS).toMatch(/useEffect\([\s\S]*paintSignatureTarget\(target, signature\?\.preview/);
        // The state is asserted in the DOM so a regression is observable, not just visible.
        expect(CANVAS).toContain('data-artifact-signature-state", "signed"');
        expect(CANVAS).toContain('data-artifact-signature-state", "unsigned"');
    });

    it("still shows the mark only once the host has captured it", () => {
        // The host sets `capturedSignature` after the authoritative commit. Nothing here may
        // anticipate that — an optimistic signed state would be a lie about a legal act.
        expect(CANVAS).toMatch(/preview\?\.drawnPngDataUrl/);
        expect(CANVAS).toMatch(/preview\?\.typedName/);
    });
});

describe("review presents the decision, not just the document", () => {
    it("fits the whole page by default and offers an intentional way to enlarge", () => {
        /*
         * The canvas rendered at container width unconditionally, so a letter page was taller than
         * a laptop viewport and "Make a change" / "Everything looks good" sat below the fold. The
         * task at review is deciding whether the document is correct, so the default presentation
         * now serves that and enlarging is a deliberate act.
         */
        expect(CANVAS).toContain("fitHeightPx");
        expect(CANVAS).toContain("MIN_FIT_SCALE");
        // Fit must never win over legibility.
        expect(CANVAS).toMatch(/Math\.max\(MIN_FIT_SCALE, Math\.min\(widthScale, fitHeightPx \/ base\.height\)\)/);
        expect(HOST).toContain('data-participant-document-zoom');
        expect(HOST).toContain("View larger");
        expect(HOST).toContain("Fit page");
    });

    it("keeps the decision reachable on a phone", () => {
        /*
         * Fitting alone was not enough at 375: the primary action still landed at 779px in an 812px
         * viewport. The row sticks while the review is on screen and returns to normal flow from
         * `sm` up, where it already fit.
         */
        expect(HOST).toContain('data-review-decision-row="true"');
        expect(HOST).toMatch(/sticky bottom-0[^"]*sm:static/);
    });

    it("does not move the attestation back above the document", () => {
        // The fit work must not undo the corrected order.
        const review = HOST.slice(HOST.indexOf('reviewStep === "sign"'));
        const ack = review.indexOf('data-artifact-final-phase="acknowledgment"');
        const canvas = review.indexOf("<ParticipantDocumentCanvas");
        expect(canvas).toBeGreaterThan(-1);
        expect(ack).toBeGreaterThan(canvas);
        expect(HOST).toContain("acknowledgementOutstanding");
    });
});
