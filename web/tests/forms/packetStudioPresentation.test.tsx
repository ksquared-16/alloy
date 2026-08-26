/**
 * What the Packet workspace claims, and in whose visual language.
 *
 * Two things this pass had to get right. The screen must not imply that a configured process needs
 * an operator to launch its participant work — `enrollment.start` already realizes it — and it must
 * not imply the operator is rebuilding a packet Processing already handed over.
 *
 * The visual half matters for a reason that is easy to miss: `alloy-pine` is NOT Bend Pine.
 * `globals.css` says so outright — "Do NOT reuse `alloy-pine` — it is Midnight Forge's value under a
 * [misleading] name" (#273F52, navy). So drift here hides behind a token that reads correct.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LAYOUT = readFileSync(
    resolve(__dirname, "../../components/forms/workspace/PacketBuilderWorkspaceLayout.tsx"),
    "utf8",
);
const GLOBALS = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

/**
 * The layout with comments stripped.
 *
 * A token assertion must measure CODE. Run against the raw file it also reads the comment explaining
 * why `bg-alloy-blue` was avoided — and fails on the sentence that documents the fix.
 */
const LAYOUT_CODE = LAYOUT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the packet workspace says true things", () => {
    it("names the direct send so it cannot be read as Enrollment execution", () => {
        expect(LAYOUT).toContain('title="Send this packet directly"');
        expect(LAYOUT).toMatch(/Configured processes such as Enrollment launch their participant work automatically/);
        expect(LAYOUT).not.toContain('title="Distribution"');
    });

    it("presents order as confirm/reorder rather than rebuilding the packet", () => {
        expect(LAYOUT).toContain('title="Confirm order"');
        expect(LAYOUT).toMatch(/Processing already chose the forms/);
        expect(LAYOUT).not.toContain('title="Step composition"');
        expect(LAYOUT).not.toContain("Build the ordered intake flow");
    });

    it("keeps Included forms and says why the order matters", () => {
        expect(LAYOUT).toContain('title="Included forms"');
        expect(LAYOUT).toMatch(/the order a family meets them, and the order they are reviewed in/);
        expect(LAYOUT).not.toContain('title="Saved pipeline"');
    });

    it("keeps the session inbox as the review surface for both routes in", () => {
        expect(LAYOUT).toContain('title="Sessions & review"');
        expect(LAYOUT).toMatch(/whether it was sent directly or launched by a process/);
    });
});

describe("visual language", () => {
    it("proves alloy-pine is a trap, not Bend Pine", () => {
        // If this ever stops being true, the assertions below are measuring the wrong thing.
        expect(GLOBALS).toMatch(/--color-alloy-pine:\s*#273F52/i);
        expect(GLOBALS).toMatch(/Do NOT reuse `alloy-pine`/);
    });

    it("uses Bend Pine for primary and selected treatments here", () => {
        expect(LAYOUT_CODE).toContain("bg-alloy-bend-pine");
        expect(LAYOUT_CODE).toContain("accent-alloy-bend-pine");
        expect(LAYOUT_CODE).not.toMatch(/\balloy-pine\b/);
        expect(LAYOUT_CODE).not.toContain("bg-alloy-blue");
    });

    it("gives the major sections the established card treatment", () => {
        for (const region of ["packet-region-steps", "packet-region-distribution", "packet-region-sessions"]) {
            const at = LAYOUT.indexOf(`data-testid="${region}"`);
            expect(at, region).toBeGreaterThan(-1);
            const line = LAYOUT.slice(LAYOUT.lastIndexOf("<section", at), at);
            expect(line, `${region} lacks the card treatment`).toContain("border border-alloy-stone/20");
        }
    });
});
