/**
 * THE APPROVED FINANCIALS PRESENTATION, LOCKED AT THE EFFECT.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
 *
 * A published surface put the Financials placement on the variant NAMED "Compact", and the Focus
 * Panel dutifully rendered the sparse `FinancialsCompactCard`:
 *
 *     FINANCIALS
 *     Responsibility    -$55.13
 *     Current balance   -$55.13
 *     Payment  Add  Details
 *
 * Human QA was stopped on the spot. The trap is the vocabulary: the presentation Kelly approved is
 * compact in FEEL but is the authorable variant named "Summary" (density `standard`, 8 columns),
 * while "Compact" (density `compact`, 4 columns) is the supporting-context card.
 *
 * ── WHY THE PREVIOUS PROOF MISSED IT ─────────────────────────────────────────────────────────
 *
 * It did not miss it. A mounted probe recorded `zone-head ""` and lines `Responsibility · Current
 * balance` — exactly this regression — and the probe was then "corrected" by WEAKENING the
 * assertion to one the sparse card also satisfies. That is the failure this file is built against,
 * so every assertion here names the approved anatomy rather than something both variants share.
 *
 * ── WHAT IS DELIBERATELY NOT TESTED ──────────────────────────────────────────────────────────
 *
 * That "Summary" exists, and that `FinancialsCompactCard` works. Both were true throughout the
 * regression and neither would have caught it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { composeEffectiveCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { readFocusPanelCardSectionMeta } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * A published section exactly as the authoring surface stores one — BOTH density records, because
 * carrying two is what made the regression invisible to anyone reading only one of them.
 */
const financialsSection = (appearanceDensity: string | null) => ({
    id: "fp-card-financials",
    key: "financials",
    title: "Financials",
    rows: [],
    metadata: {
        focusPanelCard: { key: "financials", span: 2, tier: "work", density: "standard", gridRow: 0, instanceId: "financials" },
        ...(appearanceDensity
            ? { focusPanelCardConfig: { appearance: { density: appearanceDensity } } }
            : {}),
    },
});

describe("THE GATE — the published configuration resolves to the approved presentation", () => {
    /*
     * THE AUTHORITATIVE VALUE IS THE APPEARANCE OVERRIDE. `composeEffectiveCardModel` resolves
     * `density: appearance.density ?? baseModel.density`, so a base record saying `standard` is not
     * protection — which is precisely why the live surface rendered sparse while its base metadata
     * looked correct.
     */
    const base = { key: "financials", title: "Financials", insight: "", tier: "work", density: "standard", span: 2 } as never;

    it("lets the appearance override decide the density, which is the authority that regressed", () => {
        const compact = composeEffectiveCardModel(base, { appearance: { density: "compact" } } as never, {} as never);
        expect((compact as { density?: string }).density, "override wins over a correct base").toBe("compact");
    });

    it("resolves to STANDARD when the placement is published on the approved variant", () => {
        const standard = composeEffectiveCardModel(base, { appearance: { density: "standard" } } as never, {} as never);
        expect((standard as { density?: string }).density).toBe("standard");
    });

    /*
     * THE MAPPING THAT TURNS DENSITY INTO ANATOMY. `standard` must reach the card as span "row",
     * because span 1 is what selects the sparse component. This is the single line whose behaviour
     * separates the approved presentation from the regressed one.
     */
    it("sends a standard placement to the card as span=row, and compact as span=1", () => {
        const host = src("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(host, "the host still derives span from density").toContain('span={model.density === "compact" ? 1 : "row"}');
    });

    it("reads the published section through the same meta reader the runtime uses", () => {
        const meta = readFocusPanelCardSectionMeta(financialsSection("standard") as never);
        expect(meta?.key).toBe("financials");
        expect(meta?.density, "base metadata stays standard").toBe("standard");
    });
});

describe("THE GATE — span=row renders the approved anatomy, span=1 does not", () => {
    const card = src("components/operationalCards/FinancialsCard.tsx");

    /*
     * The approved anatomy is named by its ZONES. These strings are what an operator reads, and
     * they exist only on the rich presentation — the sparse card renders a flat `c.lines` list.
     */
    it("keeps the approved obligation and position zones on the rich presentation", () => {
        // The literal strings the rich body renders. `&amp;` because it is authored as an entity.
        for (const zone of ["Current period", "Charges", "Discounts &amp; credits", "Net obligation", "Due"]) {
            expect(card, `the approved anatomy states "${zone}"`).toContain(zone);
        }
    });

    /* The rich body must still be the thing `span="row"` reaches. */
    it("routes span=1 to the sparse card and everything else to the rich body", () => {
        expect(card).toMatch(/if \(span === 1\)[\s\S]{0,200}FinancialsCompactCard/);
        expect(card, "the rich body is the default path").toContain('data-financials-card-body="true"');
    });

    /*
     * THE SPARSE CARD IS NOT THE APPROVED ONE, and saying so is the point of this file: it carries
     * neither the period breakdown nor the obligation zones.
     */
    it("proves the sparse card cannot satisfy the approved anatomy", () => {
        const sparse = card.slice(card.indexOf("function FinancialsCompactCard"));
        const body = sparse.slice(0, sparse.indexOf("\nfunction ") > 0 ? sparse.indexOf("\nfunction ") : sparse.length);
        expect(body, "sparse renders a flat line list").toContain("alloy-os-billing__lines--compact");
        expect(body, "sparse states no Current period zone").not.toMatch(/zone-head">Current period/);
        expect(body, "sparse states no Net obligation").not.toMatch(/Net obligation/i);
    });
});

describe("THE GATE — focused Details owns its payment band", () => {
    const host = src("components/admin/focusPanel/cards/FinancialsCard.tsx");
    const detail = src("components/operationalCards/FinancialsDetailCard.tsx");

    /*
     * The band rendered as a SIBLING of the focused card, so it sat outside the card's box and an
     * operator saw a stray `Record payment →` beside focused Details. Measured at 509,522 with no
     * `data-universal-card-key` ancestor.
     */
    it("passes the band into the card instead of rendering it beside the card", () => {
        expect(host, "the detail branch hands the band to the card").toContain("paymentBand={paymentBandFor(true)}");

        /*
         * SCOPED TO THE DETAIL BRANCH, deliberately. The RESTING card legitimately renders a band
         * as a child of its own body, and a repo-wide ban on the bare invocation would forbid the
         * correct call along with the defective one — the first draft of this assertion did exactly
         * that, and failed on working code.
         *
         * What must not exist is a bare `{paymentBandFor(...)}` sitting as a SIBLING of the Details
         * card, which is the shape the orphan had.
         */
        const start = host.indexOf('if (overlay === "detail"');
        expect(start, "the detail branch is findable").toBeGreaterThan(0);
        const branch = host.slice(start, host.indexOf("\n    if (", start + 10));
        expect(branch, "the detail branch renders no sibling band").not.toMatch(
            /<\/FinancialsDetailCard>|\/>\s*\n[\s\S]{0,800}\{paymentBandFor\(true\)\}/,
        );
    });

    it("renders the band inside the card, under an owned marker", () => {
        expect(detail).toContain('data-financials-payment-band="detail"');
        expect(detail).toContain("paymentBand?: ReactNode");
    });

    /* The legitimate payment paths are untouched — this was never about removing payment. */
    it("keeps the payment overlay's own band and the Details payment control", () => {
        expect(host, "the payment surface still renders its band").toContain("paymentBandFor(false)");
        expect(host, "Details still offers Payment").toContain("onPayment={openSettle}");
    });

    /* No visual exception was used to solve a composition problem. */
    it("solves ownership without a z-index, scrim or opacity exception", () => {
        const css = src("app/adminV2/components/operationalCardsShared.css");
        const band = css.slice(css.indexOf(".alloy-os-fdetail__paymentband"));
        const rule = band.slice(0, band.indexOf("}") + 1);
        expect(rule).not.toMatch(/z-index|position\s*:\s*(absolute|fixed)|opacity/);
    });
});
