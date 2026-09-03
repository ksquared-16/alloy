/**
 * THREE DEFECTS BETWEEN A PUBLISHED SURFACE AND WHAT THE WORK UNIT DREW.
 *
 * 1. THE RENDER LOOP. `useColumnAwareStack.registerCard` returned a fresh closure per
 *    call, and it is called inline in JSX. React detaches a ref whose identity changed —
 *    old callback with `null`, new one with the node — and both call `measure()`, which
 *    drops the card's height and re-adds it, yielding a new `heights` Map with identical
 *    contents. New object = state change = re-render = new closure = detach again.
 *    React ends that with "Maximum update depth exceeded": the client-side exception.
 *
 *    It only reached operators who published a composition whose COLUMNS OVERLAP, because
 *    that is the only shape `planLanesFromGrid` refuses, and the `grid` strategy it falls
 *    back to is the only path that mounts these refs.
 *
 * 2. THE PENDING/RESOLVED SPLIT. The skeleton and the resolved body each chose the active
 *    LayoutDoc themselves, and disagreed for any non-case subject — the skeleton drew the
 *    org's published enrollment layout, the body drew the grain default. Two outlines, one
 *    surface, swapping on settle.
 *
 * 3. THE DOUBLED IDENTITY MARK. The avatar tile's resets sat ABOVE the base tile rule in
 *    the stylesheet at equal specificity, so the case tile's bordered gradient kept
 *    painting behind a person's round avatar.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    focusPanelSummaryUsesPublishedDoc,
    resolveFocusPanelSummaryActiveDoc,
} from "@/lib/adminV2/runtime/focusPanel/resolveFocusPanelSummaryActiveDoc";
import { focusPanelSummaryDefaultDocForGrain } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { planPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const readSrc = (rel: string) => readFileSync(resolve(repoRoot, rel), "utf8");

describe("1 · the column-aware stack must not re-create its refs", () => {
    const src = readSrc("components/admin/focusPanel/useColumnAwareStack.ts");

    it("caches one ref callback per card key", () => {
        expect(src).toContain("cardRefs");
        // The cache is consulted BEFORE a new closure is built.
        expect(src).toMatch(/const cached = cardRefs\.current\.get\(card\);\s*\n\s*if \(cached\) return cached;/);
        expect(src).toContain("cardRefs.current.set(card, ref);");
    });

    it("no longer returns a closure straight out of the factory", () => {
        // The defect, exactly: `(card) => (node) => {...}` — a new identity every call.
        expect(src).not.toMatch(/registerCard\s*=\s*useCallback\(\s*\(card: string\)\s*=>\s*\(node/);
    });

    it("is still called inline in JSX, which is why identity has to be stable", () => {
        const grid = readSrc("components/admin/focusPanel/FocusPanelCardGrid.tsx");
        expect(grid).toContain("stack.registerCard(area.card)");
    });
});

describe("2 · pending and resolved compose from the same document", () => {
    const published = { formatVersion: 1, sections: [], metadata: { marker: "published" } } as unknown as LayoutDoc;

    it("the case subject composes from the org publication", () => {
        expect(
            resolveFocusPanelSummaryActiveDoc({ isSummary: true, grain: "opportunity", publishedDoc: published }),
        ).toBe(published);
    });

    /*
     * THE OVERRIDE THE OPERATOR REPORTED.
     *
     * An enrollment Work Unit row is a CHILD subject standing on a family opportunity — the same
     * record the published Surface is authored against. Gating on grain alone made the runtime
     * discard that publication and compose a hard-coded layout instead, on the very surface the
     * operator had just published.
     */
    it("a child WITH a family behind it composes from the org publication", () => {
        expect(
            resolveFocusPanelSummaryActiveDoc({
                isSummary: true, grain: "child", publishedDoc: published,
                context: { familySettlement: true },
            }),
        ).toBe(published);
    });

    it("keeps every subject with no family opportunity behind it on its code default", () => {
        // The hazard the gate exists for: the published doc IS the enrollment composition, so a
        // staff member must never inherit Household / Children / What's Next from it.
        for (const grain of ["person", "household"] as const) {
            for (const context of [undefined, { familySettlement: true }]) {
                const doc = resolveFocusPanelSummaryActiveDoc({ isSummary: true, grain, publishedDoc: published, context });
                expect(doc, grain).not.toBe(published);
                expect(doc, grain).toBe(focusPanelSummaryDefaultDocForGrain(grain, context));
            }
        }
        // A child opened subject-first (durable path) has no Opportunity, so nothing
        // family-scoped is authoritative for it either.
        const durableChild = resolveFocusPanelSummaryActiveDoc({
            isSummary: true, grain: "child", publishedDoc: published,
            context: { familySettlement: false },
        });
        expect(durableChild).not.toBe(published);
        expect(durableChild).toBe(focusPanelSummaryDefaultDocForGrain("child", { familySettlement: false }));
    });

    it("falls back to the grain's own default when nothing is published", () => {
        for (const grain of ["opportunity", "child", "person", "household"] as const) {
            expect(
                resolveFocusPanelSummaryActiveDoc({ isSummary: true, grain, publishedDoc: null }),
                grain,
            ).toBe(focusPanelSummaryDefaultDocForGrain(grain, undefined));
        }
    });

    it("asks the same question the runtime hook is gated on", () => {
        expect(focusPanelSummaryUsesPublishedDoc("opportunity")).toBe(true);
        expect(focusPanelSummaryUsesPublishedDoc("child", { familySettlement: true })).toBe(true);
        expect(focusPanelSummaryUsesPublishedDoc("child", { familySettlement: false })).toBe(false);
        expect(focusPanelSummaryUsesPublishedDoc("child")).toBe(false);
        expect(focusPanelSummaryUsesPublishedDoc("person", { familySettlement: true })).toBe(false);
        expect(focusPanelSummaryUsesPublishedDoc("household", { familySettlement: true })).toBe(false);
    });

    it("carries the family-settlement context that distinguishes the two child defaults", () => {
        const withFamily = resolveFocusPanelSummaryActiveDoc({
            isSummary: true, grain: "child", publishedDoc: null, context: { familySettlement: true },
        });
        const alone = resolveFocusPanelSummaryActiveDoc({
            isSummary: true, grain: "child", publishedDoc: null, context: { familySettlement: false },
        });
        expect(withFamily).not.toBe(alone);
    });

    it("composes nothing for the non-configurable modes", () => {
        expect(
            resolveFocusPanelSummaryActiveDoc({ isSummary: false, grain: "opportunity", publishedDoc: published }),
        ).toBeNull();
    });

    it("is the ONLY place either component answers the question", () => {
        for (const rel of [
            "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx",
            "components/admin/focusPanel/FocusPanelSummarySkeleton.tsx",
        ]) {
            const src = readSrc(rel);
            expect(src, rel).toContain("resolveFocusPanelSummaryActiveDoc");
            // Neither may reach for a default doc on its own again.
            expect(src, rel).not.toContain("focusPanelSummaryDefaultDocForGrain(");
            expect(src, rel).not.toContain("FOCUS_PANEL_SUMMARY_DEFAULT_DOC");
        }
    });

    it("plans lanes identically pending and resolved", () => {
        const skeleton = readSrc("components/admin/focusPanel/FocusPanelSummarySkeleton.tsx");
        const body = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        // The body carries a `|| mode === "work"` term the skeleton cannot: its composing
        // branch is reachable only when the mode is summary, so the two expressions agree
        // everywhere both are evaluated. A strategy split here is the reflow, not a nicety.
        expect(skeleton).toMatch(/preferLanesFromGrid=\{Boolean\(inputs\.publishedLayout\?\.grid\)\}/);
        expect(body).toMatch(/preferLanesFromGrid=\{Boolean\(publishedLayout\?\.grid\) \|\| mode === "work"\}/);
    });
});

describe("2b · the published composition survives the whole path to the panel", () => {
    /*
     * The operator-authored Surface, as stored: `entity_layouts` v143's
     * `doc.metadata.focusPanelLayout.grid` and the card sections beside it, read under a
     * governed read-only census. Reproduced here as the smallest document that carries the
     * same composition — the rest of that row is tenant configuration.
     */
    const AUTHORED = [
        { card: "business_process", instanceId: "current_work", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
        { card: "financials", instanceId: "financials", colStart: 9, colSpan: 4, rowStart: 2, rowSpan: 2 },
        { card: "attendance", instanceId: "attendance", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 },
        { card: "health_safety", instanceId: "health_safety", colStart: 1, colSpan: 6, rowStart: 4, rowSpan: 2 },
        { card: "children", instanceId: "children", colStart: 7, colSpan: 6, rowStart: 5, rowSpan: 4 },
        { card: "household", instanceId: "household", colStart: 7, colSpan: 6, rowStart: 6, rowSpan: 4 },
    ] as const;

    const publishedDoc = {
        formatVersion: 1,
        surface: "drawer",
        entityType: "opportunities",
        metadata: {
            layoutKey: "focus_panel_summary",
            focusPanelMode: "summary",
            focusPanelLayout: {
                grid: { columns: 12, areas: AUTHORED.map(({ card, colStart, colSpan, rowStart, rowSpan }) => ({ card, colStart, colSpan, rowStart, rowSpan })) },
                rows: AUTHORED.map(({ card }) => ({ cells: [{ width: "full", cards: [card] }] })),
            },
        },
        sections: AUTHORED.map(({ card, instanceId }) => ({
            id: `fp-card-${instanceId}`,
            key: card,
            rows: [],
            title: card,
            metadata: { focusPanelCard: { key: card, span: 2, tier: "work", density: "standard", gridRow: 0, instanceId } },
        })),
    } as unknown as LayoutDoc;

    /** Every subject the enrollment Work Unit actually opens. */
    const ENROLLMENT_SUBJECTS = [
        { grain: "opportunity" as const, context: undefined },
        { grain: "child" as const, context: { familySettlement: true } },
    ];

    it("places the authored rectangles, card for card, for every enrollment subject", () => {
        for (const { grain, context } of ENROLLMENT_SUBJECTS) {
            const activeDoc = resolveFocusPanelSummaryActiveDoc({ isSummary: true, grain, publishedDoc, context });
            expect(activeDoc, grain).toBe(publishedDoc);

            const inputs = deriveFocusPanelSummaryCompositionInputs(activeDoc);
            const plan = planPublishedLayout(inputs.publishedLayout!, 1440, { preferLanesFromGrid: true });

            // Overlapping columns → the grid strategy, which honours colStart/colSpan exactly.
            expect(plan.strategy, grain).toBe("grid");
            expect(
                plan.areas.map((a) => [a.card, a.colStart, a.colSpan, a.rowStart, a.rowSpan]),
                grain,
            ).toEqual(AUTHORED.map((a) => [a.card, a.colStart, a.colSpan, a.rowStart, a.rowSpan]));
        }
    });

    it("does not hand that composition to a subject with no family behind it", () => {
        for (const grain of ["person", "household"] as const) {
            const activeDoc = resolveFocusPanelSummaryActiveDoc({ isSummary: true, grain, publishedDoc });
            expect(activeDoc, grain).not.toBe(publishedDoc);
        }
    });
});

describe("3 · the avatar replaces the tile rather than sitting on it", () => {
    const css = readSrc("app/adminV2/components/alloyOsRuntime.css");

    it("declares the avatar modifier AFTER the base tile, where it can win", () => {
        const base = css.indexOf(".alloy-os-fp-header-compact__subject-tile {");
        const avatar = css.indexOf(".alloy-os-fp-header-compact__subject-tile--avatar {");
        expect(base).toBeGreaterThan(-1);
        expect(avatar).toBeGreaterThan(-1);
        // Equal specificity — source order is the only thing deciding this.
        expect(avatar).toBeGreaterThan(base);
    });

    it("clears every painted layer the base tile applies", () => {
        const from = css.indexOf(".alloy-os-fp-header-compact__subject-tile--avatar {");
        const block = css.slice(from, css.indexOf("}", from));
        expect(block).toMatch(/border:\s*0/);
        expect(block).toMatch(/background:\s*none/);
        expect(block).toMatch(/box-shadow:\s*none/);
    });

    it("still switches on the person identity, not on the grain", () => {
        // The block renders the avatar whenever a person subject is scoped — child,
        // contact or employee alike. The header resolves nothing itself.
        const src = readSrc("components/admin/focusPanel/FocusPanelSubjectIdentityBlock.tsx");
        expect(src).toContain("alloy-os-fp-header-compact__subject-tile--avatar");
        expect(src).toMatch(/personName\s*\?/);
    });
});
