/**
 * ESCAPE OWNERSHIP, AS DOCTRINE.
 *
 * One Escape closes one layer. The deepest registered layer owns the gesture; a parent that can
 * dismiss a host yields while a registered child is active.
 *
 * This suite exists because the same defect was shipped TWICE in one slice. The first repair added
 * a React bubble guard in the host, which was outranked by a capture-phase listener it never saw —
 * the guard was present in the deployed DOM and still lost. Locks that named the guard would have
 * stayed green through that. So these assert the DOCTRINE: who consults the authority, and who
 * registers with it — never which listener is written where.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const src = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const code = (rel: string) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const OWNERSHIP = "lib/adminV2/runtime/focusPanel/escapeLayerOwnership.ts";

/**
 * Parents that can dismiss a host on Escape and therefore MUST yield to a registered child.
 *
 * Measured, not guessed: each of these was observed consuming Escape on a Financials surface.
 * A new parent joining this list is a deliberate act, and it arrives with the same obligation.
 */
const PARTICIPATING_PARENTS = [
    "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx",
    "components/admin/focusPanel/cards/FinancialsCard.tsx",
] as const;

/** Children that declare themselves the innermost layer. */
const REGISTERED_CHILDREN = [
    ["FINANCIALS_DEPTH_CARD_SELECTOR", '[data-financials-manage-responsibility="open-panel"]'],
    ["INLINE_EDIT_SELECTOR", '[data-identity-editing="true"]'],
] as const;

describe("one authority, consulted by every parent that can steal the gesture", () => {
    it.each(PARTICIPATING_PARENTS)("%s yields to a registered child", (rel) => {
        const parent = code(rel);
        expect(parent, "imports the canonical authority").toContain("hasInnerDismissibleLayer");
        /*
         * And ACTUALLY asks before acting. Importing it and not calling it is the shape of the
         * defect, not the fix.
         */
        expect(parent).toMatch(/if\s*\(\s*hasInnerDismissibleLayer\([^)]*\)\s*\)\s*return/);
    });

    it("there is exactly one ownership authority, not a second registry", () => {
        /*
         * The failure this forbids is a `workspaceEscapeOwnership` or `financialsEscapeGuard`
         * appearing beside the canonical one. Named by SHAPE so a differently-spelled copy is
         * still caught.
         */
        const strays = ["workspaceEscapeOwnership", "financialsEscapeGuard", "escapeGuardRegistry"];
        for (const stray of strays) {
            expect(() => src(`lib/adminV2/runtime/focusPanel/${stray}.ts`)).toThrow();
        }
        expect(code(OWNERSHIP)).toContain("export function hasInnerDismissibleLayer");
    });

    it.each(REGISTERED_CHILDREN)("%s is declared in the authority", (name, selector) => {
        const owner = code(OWNERSHIP);
        expect(owner).toContain(`export const ${name}`);
        expect(owner).toContain(selector);
        /* Declared AND consulted — an exported constant nothing reads protects nothing. */
        expect(owner).toMatch(new RegExp(`closest\\(${name}\\)`));
    });

    it("a registered child counts only while it holds focus", () => {
        /*
         * Yielding to a layer that will not act leaves Escape doing nothing at all, which is worse
         * than the defect it was meant to fix: the child dismisses from its own handler, which
         * cannot run unless focus is inside it.
         */
        const owner = code(OWNERSHIP);
        const predicate = owner.slice(owner.indexOf("export function hasInnerDismissibleLayer"));
        expect(predicate).toContain("activeElement");
        expect(predicate).toContain("closest");
    });
});

describe("both hosts return focus to the control that opened the card", () => {
    const HOSTS = [
        ["components/operationalCards/FinancialsDetailCard.tsx", "Details"],
        ["app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx", "Accounts"],
    ] as const;

    it.each(HOSTS)("%s", (rel) => {
        const host = code(rel);
        expect(host, "the gear is addressable").toMatch(/ref=\{manage\w*GearRef\}/);
        expect(host, "and the close path focuses it").toMatch(/GearRef\.current\?\.focus\(\)/);
        expect(host, "every dismissal routes through that path").toMatch(/onHostedClose=\{close\w*\}/);
    });

    it("neither host drifts from the other on dismissal", () => {
        /* Details and Accounts must not acquire separate depth behaviour. */
        for (const [rel] of HOSTS) {
            const host = code(rel);
            expect(host).toContain('data-financials-manage-responsibility="depth-card"');
            expect(host).toMatch(/e\.key !== "Escape"/);
        }
    });
});
