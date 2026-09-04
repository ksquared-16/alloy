/**
 * Overlay authority in Communications — a source contract, not three fixes.
 *
 * This class of defect has now shipped four times in adminV2: a full-viewport
 * overlay written with a raw Tailwind `z-[NNN]`, rendered in place, that opens
 * BEHIND the very workspace it was launched from. An operator reads that as "the
 * button does nothing."
 *
 * Two facts make the raw number useless, and both are structural:
 *
 *   1. A z-index orders siblings WITHIN a stacking context. An overlay rendered
 *      inside the Focus Panel cannot rise above the panel, whatever number it
 *      carries — which is why the panel body dimmed and the panel HEADER did not.
 *   2. Anything portaled to `document.body` escapes the shell's stacking context,
 *      so a value below shell chrome (100) or the BOS layers (96/97) disappears
 *      underneath them.
 *
 * The platform already answers this with `ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z`.
 * Asserting it here is what keeps the next overlay from re-deriving a number.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOTS = [
    join(process.cwd(), "app/adminV2/communications"),
    join(process.cwd(), "components/admin/communications"),
];

/**
 * Composers that live OUTSIDE those roots and portal to `document.body` all the same.
 *
 * `QuickMessageModal` is the composer Manage opens on a record, and being filed under
 * `app/adminV2/components` rather than `.../communications` is the only reason it kept
 * `ADMINV2_DRAWER_ACTION_MODAL_Z` (80) through the last pass. Measured in the running app: the
 * modal at 80, the BOS rail at 95 covering everything from x=1256 rightward — so the composer
 * opened with Send behind the rail, which an operator reads as "Message does nothing". The roots
 * describe where these files happen to sit; this list describes what they ARE.
 */
const PORTALED_COMPOSERS_OUTSIDE_ROOTS = ["app/adminV2/components/QuickMessageModal.tsx"];

function tsxFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full));
        else if (entry.endsWith(".tsx")) out.push(full);
    }
    return out;
}

const FILES = ROOTS.flatMap(tsxFilesUnder);

/** `fixed inset-0` is the shape of a full-viewport overlay. */
const FULL_VIEWPORT_OVERLAY = /fixed\s+inset-0/;
/** A hand-written stacking value on that overlay. */
const RAW_Z_CLASS = /className=\{?["'`][^"'`]*\bz-\[\d+\]/;

describe("Communications overlays use the platform's nested-overlay authority", () => {
    it("finds the surfaces it is supposed to be guarding", () => {
        // A positive control. If the roots are renamed, an empty file list would
        // make every assertion below pass while checking nothing.
        expect(FILES.length).toBeGreaterThan(10);
        expect(FILES.some((f) => f.endsWith("ComposeNewCommunicationModal.tsx"))).toBe(true);
        expect(FILES.some((f) => f.endsWith("FamilySendConfirmationDialog.tsx"))).toBe(true);
    });

    it("declares no raw z-[NNN] on a full-viewport overlay", () => {
        const offenders = FILES.filter((file) => {
            const src = readFileSync(file, "utf8");
            return FULL_VIEWPORT_OVERLAY.test(src) && RAW_Z_CLASS.test(src);
        }).map((f) => f.split("/web/")[1]);
        expect(offenders).toEqual([]);
    });

    it.each([
        ["app/adminV2/communications/ComposeNewCommunicationModal.tsx", "Compose New"],
        ["app/adminV2/communications/TemplateCategoriesManageModal.tsx", "Manage categories"],
        ["components/admin/communications/FamilySendConfirmationDialog.tsx", "Confirm send"],
    ])("%s portals to document.body at the platform constant", (relative) => {
        const src = readFileSync(join(process.cwd(), relative), "utf8");
        expect(src).toMatch(/createPortal\(/);
        expect(src).toMatch(/document\.body/);
        expect(src).toMatch(/ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z/);
        expect(src).not.toMatch(RAW_Z_CLASS);
    });

    it("keeps Compose New off the drawer-action layer, which sits BELOW shell chrome", () => {
        // 80 < 100. This is the value that made Compose New open behind the
        // workspace, and it is the correct value for a drawer action modal — so
        // the mistake is a plausible one and worth naming.
        const src = readFileSync(
            join(process.cwd(), "app/adminV2/communications/ComposeNewCommunicationModal.tsx"),
            "utf8"
        );
        expect(src).not.toMatch(/ADMINV2_DRAWER_ACTION_MODAL_Z/);
    });
});

describe("a composer outside the Communications roots obeys the same authority", () => {
    it.each(PORTALED_COMPOSERS_OUTSIDE_ROOTS)("%s portals at the platform constant", (relative) => {
        const src = readFileSync(join(process.cwd(), relative), "utf8");
        expect(src).toMatch(/createPortal\(/);
        expect(src).toMatch(/document\.body/);
        expect(src).toMatch(/ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z/);
        expect(src).not.toMatch(RAW_Z_CLASS);
    });

    it.each(PORTALED_COMPOSERS_OUTSIDE_ROOTS)("%s stays off the drawer-action layer", (relative) => {
        // 80 < 95 (BOS rail) < 100 (shell chrome). The value is correct for a modal rendered
        // INSIDE the drawer, and wrong for one portaled to the body — which is what makes the
        // mistake worth naming rather than merely forbidding.
        const src = readFileSync(join(process.cwd(), relative), "utf8");
        const declared = src.match(/zIndex:\s*(ADMINV2_[A-Z_]+)/g) ?? [];
        expect(declared, "no platform layer constant is applied to the overlay").not.toEqual([]);
        expect(declared.every((d) => d.includes("ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z"))).toBe(true);
    });
});
