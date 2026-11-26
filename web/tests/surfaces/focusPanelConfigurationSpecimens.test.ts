/**
 * THE FOCUS PANEL CARD SET IS CONFIGURATION, NOT ARCHITECTURE.
 *
 * Staging renders seven cards. The code-owned default visible set names EIGHT
 * (`ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS`), and the difference is a published layout change: v162
 * dropped `billing_preview`. So "seven cards" was never a property of this build, and any gate that
 * asserted it would be asserting one deployment's configuration.
 *
 * These are the D/E/F configuration-change specimens. Each is built from an ISOLATED layout
 * fixture and asserted against THAT fixture's own membership — never against a remembered card
 * list, and never by mutating shared staging configuration to manufacture a cardinality.
 *
 *   D  a card REMOVED from the published layout must not become a hidden dependency
 *   E  a card ADDED must enter the same classification as every other card, with no allowlist
 *   F  a card REORDERED must keep its truth bound by identity, not by position
 */
import { describe, expect, it } from "vitest";

import {
    buildPublishedLayoutFromGrid,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import {
    deriveRowsFromGrid,
    publishedLayoutReadingOrder,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    filterPublishedLayoutToVisibleCards,
    type FocusPanelCardVisibility,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";
import { MOUNTABLE_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

const K = (k: string) => k as FocusPanelCardKey;

/** A layout is a list of placements. Cardinality is a property of the specimen, never of the gate. */
const gridOf = (...cards: string[]): FocusPanelGridLayout => ({
    columns: 12,
    areas: cards.map((card, i) => ({
        card: K(card),
        colStart: 1,
        colSpan: 6,
        rowStart: i + 1,
        rowSpan: 1,
    })),
});

const orderOf = (grid: FocusPanelGridLayout) =>
    publishedLayoutReadingOrder(buildPublishedLayoutFromGrid(grid));

/**
 * Deliberately mixes cards the mountability registry knows with one it does not, so a gate
 * cannot pass by accident on a set that happens to be entirely registered.
 */
const REGISTERED = MOUNTABLE_CARD_SPECS.map((s) => s.key);
const UNREGISTERED = "children";

describe("SPECIMEN D — a card removed from configuration leaves the product", () => {
    const before = gridOf("business_process", "household", UNREGISTERED, ...REGISTERED);
    const after = gridOf("business_process", "household", UNREGISTERED, ...REGISTERED.slice(1));
    const dropped = REGISTERED[0];

    it("is absent from the reading order it used to occupy", () => {
        expect(orderOf(before)).toContain(dropped);
        expect(orderOf(after)).not.toContain(dropped);
    });

    it("is absent from every derived geometry, not merely from the grid", () => {
        const cells = deriveRowsFromGrid(after.areas.length ? after : after).flatMap((r) =>
            r.cells.flatMap((c) => c.cards),
        );
        expect(cells).not.toContain(dropped);
    });

    it("REMAINS in the mountability registry — which is exactly why it must not be a dependency", () => {
        // The registry is a per-card PREDICATE table, not a membership list. If it were a
        // membership list, a card removed from the layout would keep doing commit-time work for a
        // surface that never places it — the hidden performance dependency this specimen exists to
        // forbid. Placement is decided by configuration; the registry only answers "if placed, can
        // this card address its own read?".
        expect(REGISTERED).toContain(dropped);
        expect(orderOf(after)).not.toContain(dropped);
    });

    it("disturbs no surviving card's relative order", () => {
        // Geometry coordinates necessarily shift when a row is removed — that is this fixture
        // generator's arithmetic, not a product fact, so asserting identical rowStart would be
        // testing the helper. What must hold is that removal is a DELETION: the survivors keep
        // their relative reading order and nothing else moves past anything.
        expect(orderOf(after)).toEqual(orderOf(before).filter((c) => c !== dropped));
    });
});

describe("SPECIMEN E — a card added to configuration is classified like any other", () => {
    const before = gridOf("business_process", "household");
    const withRegistered = gridOf("business_process", "household", REGISTERED[0]);
    const withUnregistered = gridOf("business_process", "household", UNREGISTERED);

    it("enters the reading order", () => {
        expect(orderOf(before)).not.toContain(REGISTERED[0]);
        expect(orderOf(withRegistered)).toContain(REGISTERED[0]);
    });

    it("a card the mountability registry does NOT know is placed just the same", () => {
        // No allowlist may gate placement. A newly configured card must not bypass — or be
        // excluded from — the canonical visibility pass merely because no spec names it.
        expect(REGISTERED).not.toContain(K(UNREGISTERED));
        expect(orderOf(withUnregistered)).toContain(UNREGISTERED);
    });

    it("is subject to the same visibility filter as every other card", () => {
        for (const added of [REGISTERED[0], UNREGISTERED]) {
            const layout = buildPublishedLayoutFromGrid(
                gridOf("business_process", "household", added),
            );
            const vis = new Map<FocusPanelCardKey, FocusPanelCardVisibility>([[K(added), "hidden"]]);
            const filtered = filterPublishedLayoutToVisibleCards(layout, vis);
            expect(filtered).not.toBeNull();
            expect(publishedLayoutReadingOrder(filtered!)).not.toContain(added);
            // and the cards it was added beside are untouched
            expect(publishedLayoutReadingOrder(filtered!)).toEqual(orderOf(before));
        }
    });

    it("defaults to visible when configuration says nothing about it", () => {
        const layout = buildPublishedLayoutFromGrid(withUnregistered);
        const filtered = filterPublishedLayoutToVisibleCards(layout, new Map());
        expect(publishedLayoutReadingOrder(filtered!)).toContain(UNREGISTERED);
    });
});

describe("SPECIMEN F — a reordered configuration binds truth by identity, not position", () => {
    const cards = ["business_process", "household", UNREGISTERED, ...REGISTERED];
    const forward = gridOf(...cards);
    const reversed = gridOf(...[...cards].reverse());

    it("changes the reading order", () => {
        expect(orderOf(reversed)).toEqual([...orderOf(forward)].reverse());
    });

    it("changes no card's membership", () => {
        expect([...orderOf(reversed)].sort()).toEqual([...orderOf(forward)].sort());
    });

    it("hiding a card removes THAT card, whichever position it now occupies", () => {
        // The failure this forbids is positional binding: a filter or a merge keyed on slot index
        // would strip whatever card had moved into the hidden card's old position.
        for (const target of cards) {
            const vis = new Map<FocusPanelCardKey, FocusPanelCardVisibility>([
                [K(target), "hidden"],
            ]);
            for (const grid of [forward, reversed]) {
                const filtered = filterPublishedLayoutToVisibleCards(
                    buildPublishedLayoutFromGrid(grid),
                    vis,
                );
                const order = publishedLayoutReadingOrder(filtered!);
                expect(order).not.toContain(target);
                expect([...order].sort()).toEqual(cards.filter((c) => c !== target).sort());
            }
        }
    });
});
