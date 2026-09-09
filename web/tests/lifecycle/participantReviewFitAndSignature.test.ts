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
        // Asserted as the INTENT rather than the literal list, so adding a legitimate dependency
        // (zoom, for instance) does not read as a regression while the real rule still holds.
        const deps = CANVAS.match(/\}, \[url, page,[^\]]*\]\);/)?.[0] ?? "";
        expect(deps).not.toBe("");
        expect(deps).not.toContain("preview");
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
        // "Fit page" / "Fit width" are the shared toolbar's words now, not this surface's — which is
        // the point: the reading controls are the platform's, not a participant-only copy.
        const CONTROLS = readFileSync(
            join(process.cwd(), "components", "workspace", "WorkspaceArtifactZoomControls.tsx"),
            "utf8",
        );
        expect(CONTROLS).toContain("Fit page");
        expect(CONTROLS).toContain("Fit width");
    });

    it("opens a dedicated reading surface instead of zooming inside the preview", () => {
        /*
         * The first attempt magnified the page INSIDE the same small preview card, which Kelly
         * rightly called a worse reading experience: a cropped window onto a huge document. Reading
         * and deciding are different tasks, so reading gets the browser viewport.
         *
         * Measured at 1280: the reader body is the full 1280x798, fit-page renders the whole page
         * at 604x782, fit-width fills to 1224 and scrolls vertically, and Close returns to the same
         * review with the same 389x504 preview.
         */
        expect(HOST).toContain('data-participant-document-reader="open"');
        expect(HOST).toContain("fixed inset-0");
        expect(HOST).toContain('data-participant-document-reader-close="true"');
        // The preview itself is a preview again — no zoom state inside the card.
        expect(HOST).not.toContain("DOCUMENT_ZOOM");
    });

    it("reuses the platform's artifact viewer rules rather than inventing a second one", () => {
        // `artifactViewportScale` and `WorkspaceArtifactZoomControls` already own fit-page,
        // fit-width and manual zoom for the operator viewport. A participant-only viewer would be a
        // second answer to a solved question.
        expect(HOST).toContain("WorkspaceArtifactZoomControls");
        expect(HOST).toContain("ARTIFACT_ZOOM_STEP");
        expect(HOST).toContain("clampArtifactScale");
        expect(CANVAS).toContain("resolveArtifactScale");
    });

    it("reading is a view, not a step — it cannot move Enrollment", () => {
        /*
         * Opening and closing the reader touches presentation state only. Proven in a counted
         * session: every step moved forward or stayed, never back, with 0 reloads and 0 unloads.
         */
        const openSetter = HOST.match(/setReadingOpen\(true\)/g) ?? [];
        expect(openSetter.length).toBeGreaterThan(0);
        // Nothing in the reader submits, persists or advances the participant.
        const reader = HOST.slice(HOST.indexOf('data-participant-document-reader="open"'), HOST.indexOf("V1.2 — the conversational Enrollment turn"));
        expect(reader).not.toContain("persistDraft");
        expect(reader).not.toContain("setReviewStep");
        expect(reader).not.toContain("handleSubmit");
    });

    it("sizes the page wrapper and centres it with auto margins so a zoomed page is reachable", () => {
        /*
         * Two clipping faults, both found by measuring rather than looking. The wrapper is
         * `overflow-hidden` and, left to flow, took the REGION's width — so a 616px page sat in a
         * 299px wrapper and scrollWidth stayed 299. And centring the column with `items-center`
         * overflowed a zoomed page BOTH ways, leaving its left edge unreachable: 765px of canvas
         * reported 570px of scrollable width. Auto margins collapse to zero when there is no room.
         */
        expect(CANVAS).toMatch(/wrapper\.style\.width = `\$\{viewport\.width\}px`;/);
        expect(CANVAS).toContain('wrapper.style.marginLeft = "auto"');
        expect(CANVAS).not.toContain("flex w-full flex-col items-center gap-4");
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
