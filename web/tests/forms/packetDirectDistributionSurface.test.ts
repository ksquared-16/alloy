/**
 * The packet's direct-send surface: what it says, and where its results are allowed to render.
 *
 * ## The defect this pins
 *
 * Typing a family's name in the Packet Studio recipient picker looked like a dead control. It was
 * not. The request reached the canonical typeahead, came back with two children, and the menu
 * rendered with `visibility: visible` and `opacity: 1` — and then painted UNDERNEATH the Processing
 * shell it opens inside, because it carried a hand-written `zIndex: 90` against a panel at 97. It
 * also anchored below an input sitting at y=1120 in a 1250px viewport, because the section around
 * it had grown to 1283px — taller than the screen.
 *
 * Both halves are proven in the browser (menu on screen, above the shell, opening upward when the
 * viewport is short). What is pinned here is the wiring a later edit could quietly undo: the
 * platform overlay constant rather than a local number, listbox semantics, and a link list that
 * leads with what is live.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DISTRIBUTION_COPY } from "@/lib/forms/distributionPresentation";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

/**
 * The file with its prose removed.
 *
 * These modules document the defect they fixed, so a naive `not.toContain("global-search")` fails on
 * the sentence explaining that it no longer calls it. A source guard has to read the CODE.
 */
const code = (rel: string) =>
    read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

describe("the recipient picker renders where it can be seen", () => {
    const src = read("app/adminV2/pos/RecordLaunchPicker.tsx");
    const body = code("app/adminV2/pos/RecordLaunchPicker.tsx");

    it("uses the platform's nested-overlay layer, not a local z-index", () => {
        /*
         * `ProcessingAlloyDialog` (z-[80] → z-[110]) and the form-builder library panel had this
         * exact defect. The constant exists so a third surface does not have to rediscover which
         * number clears the shell.
         */
        expect(body).toContain("ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z");
        expect(body).not.toMatch(/zIndex:\s*\d+/);
    });

    it("opens upward when there is no room below", () => {
        expect(body).toContain("flipUp");
        // Both halves of the decision: not enough room below AND more room above.
        expect(body).toMatch(/below\s*<\s*MENU_MAX_H\s*\+\s*8\s*&&\s*r\.top\s*>\s*below/);
    });

    it("announces itself as a listbox", () => {
        // The rows were plain buttons, so a screen reader was told nothing had appeared either.
        expect(src).toContain('role="listbox"');
        expect(src).toContain('role="option"');
    });

    it("still asks the canonical CRM typeahead, and only that", () => {
        // The search owner was never the problem; a second implementation would have been one.
        expect(body).toContain("/api/admin/forms/crm-entity-search");
        expect(body).not.toContain("/api/admin/global-search");
    });
});

describe("the direct-send surface says what it is", () => {
    it("names the act, not the machinery", () => {
        expect(DISTRIBUTION_COPY.launchPacket).toBe("Send packet");
        expect(DISTRIBUTION_COPY.launchPacket).not.toMatch(/launch/i);
    });

    it("carries the process distinction in ONE short line", () => {
        const intro = DISTRIBUTION_COPY.packetIntro;
        expect(intro).toMatch(/configured processes/i);
        expect(intro).toMatch(/one-off/i);
        // One sentence. The old copy explained what a packet is and then repeated the session-inbox
        // line that the paragraph beneath it already printed.
        expect(intro.split(".").filter((s) => s.trim()).length).toBe(1);
        expect(intro).not.toMatch(/session inbox/i);
    });

    it("leads with live sends and keeps the rest as history", () => {
        expect(DISTRIBUTION_COPY.packetLinksLead).toBe("Recent direct sends");
        // The Form surface keeps its own vocabulary: its links are not "direct sends".
        expect(DISTRIBUTION_COPY.activeLinksLead).toContain("intake links");
        expect(DISTRIBUTION_COPY.historyToggle).toBe("View all history");
    });
});

describe("the link list is a summary, not a ledger", () => {
    const src = code("components/forms/workspace/DistributionLinksPanel.tsx");

    it("puts inactive links behind a disclosure that counts them", () => {
        // Nine full-width rows of mostly retired QA links is how the secondary capability came to be
        // taller than the packet it belongs to.
        expect(src).toContain("distribution-link-history");
        expect(src).toContain("DISTRIBUTION_COPY.historyToggle");
        expect(src).toMatch(/inactiveLinks\.length/);
    });

    it("deletes nothing — every inactive link is still rendered inside it", () => {
        const start = src.indexOf("distribution-link-history");
        const block = src.slice(start, start + 900);
        expect(block).toContain("inactiveLinks.map");
    });

    it("no longer prints the session-inbox sentence twice", () => {
        // The region beneath owns review and already carries that link.
        expect(src).not.toContain("FORMS_MODULE_ROUTES.packetSessions");
    });
});
