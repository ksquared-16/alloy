/**
 * ONE AUTHORITY FOR A CARD'S DENSITY, STATED RATHER THAN OBSERVED.
 *
 * A published Focus Panel section carries TWO density signals, and they can disagree:
 *
 *   sections[].metadata.focusPanelCard.density              the BASE placement default
 *   sections[].metadata.focusPanelCardConfig.appearance.density   the AUTHORED appearance
 *
 * Measured on deployed staging, the Financials section carried `focusPanelCard.density: "standard"`
 * beside `appearance.density: "compact"`, with the grid placing it at `colSpan: 4`. The card rendered
 * Compact — correctly, because the appearance is what the operator authored and 4 columns is the
 * Compact variant's width. But that precedence lived only in runtime behaviour, and reading the two
 * stored values in the wrong order is exactly how a diagnosis starts by looking for a regression that
 * is not there.
 *
 * So the rule is asserted here: APPEARANCE WINS. `focusPanelCard.density` is a default, not a
 * competing claim, and density is authored independently — there is no width-to-density derivation
 * anywhere in the runtime.
 */

import { describe, expect, it } from "vitest";

import { composeEffectiveCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { placementVariantsFor } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardAuthoring";

const baseModel = {
    key: "financials",
    title: "Financials",
    insight: "",
    tier: "work",
    span: 2,
    density: "standard",
} as never;

describe("card density has one authority", () => {
    it("the authored appearance wins over the base placement default", () => {
        const effective = composeEffectiveCardModel(
            baseModel,
            { appearance: { density: "compact" } } as never,
            null as never,
        );
        expect(effective.density, "appearance.density must decide the rendered presentation").toBe("compact");
    });

    it("the base default stands when nothing is authored", () => {
        expect(composeEffectiveCardModel(baseModel, null, null as never).density).toBe("standard");
        expect(composeEffectiveCardModel(baseModel, { appearance: {} } as never, null as never).density).toBe("standard");
    });

    it("Financials declares Summary and Compact as distinct authored widths", () => {
        /*
         * The two presentations are authored variants, not a responsive accident: Summary is the
         * 8-column card with the Current period / Net obligation hierarchy, Compact is the 4-column
         * card with the bounded lines. A 4-column placement is therefore SUPPOSED to render Compact.
         */
        const variants = placementVariantsFor("financials");
        const byLabel = Object.fromEntries(variants.map((v) => [v.variantLabel, v]));

        expect(byLabel.Summary?.density).toBe("standard");
        expect(byLabel.Summary?.columns).toBe(8);
        expect(byLabel.Compact?.density).toBe("compact");
        expect(byLabel.Compact?.columns).toBe(4);
    });

    it("density is never derived from the authored width", () => {
        /*
         * The alternative rule, ruled out. If width decided density, an 8-column placement carrying
         * an authored `compact` appearance would come back `standard` — it does not, and must not,
         * because the operator's choice is the authority.
         */
        const wide = composeEffectiveCardModel(
            { ...(baseModel as Record<string, unknown>), span: "row" } as never,
            { appearance: { density: "compact" } } as never,
            null as never,
        );
        expect(wide.density).toBe("compact");
    });
});
