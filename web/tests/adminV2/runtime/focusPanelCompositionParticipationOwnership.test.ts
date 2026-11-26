/**
 * ONE OWNER FOR "MAY THIS CARD PARTICIPATE?" — and it is not a single constant.
 *
 * The platform owns a FAMILY of default compositions, one per subject grain (plus the child's
 * settlement context). `FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION` is the `opportunity` member. Guards
 * that read that member and reported its answer as the platform's are how `health_safety` — placed
 * deliberately at child-with-family grain, omitted deliberately at case grain — was classified as
 * participating in no composition at all.
 *
 * These guards keep the two notions from drifting apart again:
 *
 *   CANONICAL   the code-owned composition family, enumerated through the same resolver the runtime
 *               uses. Nothing may restate the grain list or the compositions.
 *   RUNTIME     a tenant-published `LayoutDoc`, which OVERRIDES a default wholesale. It is bounded by
 *               an explicit supported mechanism — the card CATALOG — and may only place a card the
 *               platform declares. It selects within the canonical model; it cannot extend it.
 *
 * They are not two participation models to keep in step. They are one model and a tenant's selection
 * from it, and that is what this file pins.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    FOCUS_PANEL_CODE_OWNED_COMPOSITION_CARD_KEYS,
    focusPanelCardParticipatesInACodeOwnedComposition,
    focusPanelDefaultCompositionForGrain,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { OPERATIONAL_SUBJECT_TYPES } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import { FOCUS_PANEL_CARD_CATALOG } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardCatalog";
import { cardSuccessor } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { MOUNTABLE_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelMountableCards";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

describe("composition participation ownership", () => {
    it("the participation set covers EVERY grain, in both settlement contexts", () => {
        // Enumerated from the runtime's own grain list, so a grain added later cannot be missed here
        // by a private copy of the list going stale.
        for (const grain of OPERATIONAL_SUBJECT_TYPES) {
            for (const context of [undefined, { familySettlement: true }]) {
                for (const entry of focusPanelDefaultCompositionForGrain(grain, context)) {
                    expect(
                        focusPanelCardParticipatesInACodeOwnedComposition(entry.key),
                        `${grain} places ${entry.key}, but the participation set does not name it`,
                    ).toBe(true);
                }
            }
        }
    });

    it("a card placed at ONE grain participates, even when another grain omits it on purpose", () => {
        // The property, stated without naming a card: some key is placed by a non-`opportunity`
        // composition and not by the case one. If that ever stops being true the reconciliation is
        // moot — and if the guard narrows back to one constant, this fails.
        const caseKeys = new Set<FocusPanelCardKey>(
            focusPanelDefaultCompositionForGrain("opportunity").map((e) => e.key),
        );
        const placedOnlyElsewhere = [...FOCUS_PANEL_CODE_OWNED_COMPOSITION_CARD_KEYS].filter(
            (key) => !caseKeys.has(key),
        );
        expect(placedOnlyElsewhere.length).toBeGreaterThan(0);
        for (const key of placedOnlyElsewhere) {
            expect(focusPanelCardParticipatesInACodeOwnedComposition(key)).toBe(true);
        }
    });

    it("the RUNTIME composition is bounded by the catalog — the one supported mechanism", () => {
        /*
         * A tenant doc overrides a default wholesale, so it may place a different SET; what it cannot
         * do is place a card the platform never declared. The catalog is the Surface Builder's
         * palette, so "catalogued" is exactly "a tenant can publish this" — which makes the check
         * below the real boundary between the canonical model and the published one.
         *
         * Supersession is resolved first. `current_work` is named by two compositions under an
         * identity the runtime retires before a cell exists (`business_process`, which IS catalogued),
         * so checking the raw key would report a divergence that no operator can reach.
         *
         * ONE residue, declared rather than assumed. `staff` is placed only by the PERSON composition
         * and supersedes `employment` at that grain alone; the palette is the enrollment Summary
         * composer's, which has no person surface to author. It is listed here so it cannot mask the
         * next placement that is genuinely outside the declared vocabulary.
         */
        const PUBLISHABLE_EXEMPT: Readonly<Record<string, string>> = {
            staff: "person-grain only, superseding `employment` there; the Summary palette is the enrollment composer's",
        };
        const catalogKeys = new Set(
            FOCUS_PANEL_CARD_CATALOG.map((entry) => entry.cardKey).filter(Boolean),
        );
        const uncatalogued = [...FOCUS_PANEL_CODE_OWNED_COMPOSITION_CARD_KEYS]
            .map((key) => cardSuccessor(key) ?? key)
            .filter((key) => !catalogKeys.has(key) && !(key in PUBLISHABLE_EXEMPT));
        expect(
            uncatalogued,
            `A composition places a card the catalog does not declare, so a tenant could never ` +
                `publish it and the two models have diverged: ${uncatalogued.join(", ")}`,
        ).toEqual([]);
        // The exemption is a debt register, not a parking space.
        for (const key of Object.keys(PUBLISHABLE_EXEMPT)) {
            expect(catalogKeys.has(key as FocusPanelCardKey), `${key} is catalogued now — retire its exemption`).toBe(false);
        }
    });

    it("every card that can join the COMMIT WAVE is publishable — no exemptions there", () => {
        // The cards this contract actually admits early must be in the declared vocabulary, so a
        // tenant's published surface can render what the commit wave mounted.
        const catalogKeys = new Set(
            FOCUS_PANEL_CARD_CATALOG.map((entry) => entry.cardKey).filter(Boolean),
        );
        for (const spec of MOUNTABLE_CARD_SPECS) {
            const key = cardSuccessor(spec.key) ?? spec.key;
            expect(catalogKeys.has(key), `${spec.key} mounts early but no tenant can publish it`).toBe(true);
        }
    });

    it("the shared commit producer names NO card, so nothing can be special-cased into the wave", () => {
        // The producer loops the two registries and knows no key. A card key appearing in its CODE
        // would mean a card was admitted by name rather than by declaration — the failure this whole
        // contract exists to prevent. Comments are stripped first: the docblock cites cards by name.
        const source = readFileSync(
            join(
                process.cwd(),
                "lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts",
            ),
            "utf8",
        );
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
        const named = [...FOCUS_PANEL_CODE_OWNED_COMPOSITION_CARD_KEYS].filter((key) =>
            code.includes(`"${key}"`),
        );
        expect(
            named,
            `The shared producer names these cards in code: ${named.join(", ")}`,
        ).toEqual([]);
    });

    it("every mountable card participates, and participation is what admitted it", () => {
        for (const spec of MOUNTABLE_CARD_SPECS) {
            expect(
                focusPanelCardParticipatesInACodeOwnedComposition(spec.key),
                `${spec.key} is mountable but no composition places it`,
            ).toBe(true);
        }
    });
});
