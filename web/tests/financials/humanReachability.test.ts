/**
 * REACHABILITY — the product must be discoverable, not merely implemented.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────────
 *
 * Kelly could not find responsibility, discounts, prepaid, billing period or accounting period on
 * the record he was testing, after all of them had been certified. Every certification probe had
 * reached them by direct URL and by test id — so every probe passed, and none of them measured
 * what an operator can actually get to.
 *
 * Two of my own diagnoses in that audit were ALSO wrong, and both are locked here so the mistakes
 * cannot come back as facts:
 *
 *   • I reported the organization Financials chapters as unreachable. They are not: each tile
 *     carries an "Open <Chapter>" button. My probe looked for a clickable ANCESTOR of the heading
 *     and for anchors — the control is a sibling button with an onClick.
 *
 *   • I asserted the retired card was absent using `[data-universal-card-key='billing_preview']`.
 *     That is the REGISTRY key; the component emits `assignment_tuition`, so the selector could
 *     never match and proved nothing either way.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = (p: string) =>
    readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the organization Financials chapters are operable controls", () => {
    const launcher = src("components/adminV2/settings/configurationRuntime/CompactConfigurationLauncher.tsx");

    /* A heading is not a door. Each tile must carry something an operator can press. */
    it("gives every tile a real control, not just a heading", () => {
        /* The button and its handler sit ~700 chars apart once the className lands between them. */
        const btn = launcher.slice(launcher.indexOf("<button"));
        expect(btn, "the tile renders a pressable element").toContain("onClick={() => open(item.href)}");
        expect(btn.slice(0, btn.indexOf("onClick")), "and it is a real button").toContain('type="button"');
        expect(launcher, "and it is labelled with the destination").toMatch(/Open \{item\.label\}/);
    });

    it("navigates to the chapter the tile names", () => {
        expect(launcher).toMatch(/const open = \(href: string\)/);
        expect(launcher, "through the shared soft-nav commit, not a bespoke router call").toContain("commitAdminV2NavLinkNavigation(href");
    });

    /* Every chapter an operator needs must actually be offered a tile. */
    it("offers a tile for each Financials chapter", () => {
        const model = src("lib/financials/financialsLandingModel.ts");
        for (const chapter of ["tuition", "catalog", "policies", "payments", "accounting"]) {
            expect(model, `${chapter} has a landing section`).toContain(`${chapter}:`);
        }
    });

    /*
     * DISCOUNTS ARE FINDABLE FROM THE POLICIES CHAPTER. The tile says "Policies", which is the
     * right domain word and the wrong search word — so the chapter's own content must name
     * discounts, or an operator hunting for them has to guess.
     */
    it("names discounts where an operator hunting for them will land", () => {
        const model = src("lib/financials/financialsLandingModel.ts");
        const seg = model.slice(model.indexOf("policies: ["), model.indexOf("policies: [") + 300);
        expect(seg.toLowerCase(), "the Policies tile says what is inside it").toContain("discount");
    });
});

describe("the retired Tuition card is measured by its RENDERED identity", () => {
    /*
     * The registry key and the rendered key differ, and that difference invalidated a
     * certification claim. Locked so the next probe cannot repeat it.
     */
    it("renders assignment_tuition, not the registry key", () => {
        const card = src("components/admin/focusPanel/cards/AssignmentTuitionCard.tsx");
        expect(card, "this is the identity any absence proof must use")
            .toContain('data-universal-card-key="assignment_tuition"');
        expect(card, "the registry key is NOT what reaches the DOM")
            .not.toContain('data-universal-card-key="billing_preview"');
    });

    it("is still routed from the billing_preview registry key", () => {
        const renderer = src("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        expect(renderer).toMatch(/model\.key === "billing_preview"[\s\S]{0,200}<AssignmentTuitionCard/);
    });
});

describe("available prepaid is named, and named consistently", () => {
    const compact = src("components/operationalCards/FinancialsCard.tsx");
    const detail = src("components/operationalCards/FinancialsDetailCard.tsx");

    /*
     * "Available" alone is financially correct and operationally invisible — the word an operator
     * searches for is "prepaid", and it appeared nowhere in the product.
     */
    it("names the concept on every surface that shows it", () => {
        expect([...compact.matchAll(/label="Available prepaid"/g)].length, "both compact renderers").toBe(2);
        expect(detail).toContain('label="Available prepaid"');
        expect(compact, "the bare label is gone").not.toMatch(/label="Available"/);
    });

    /* Prepaid, held money and a deposit are three things; naming one must not rename another. */
    it("leaves held money and deposits with their own names", () => {
        expect(compact + detail, "held is not relabelled prepaid").not.toMatch(/label="(Held|Available) (prepaid )?deposit prepaid"/);
        expect(detail, "held keeps its own line").toMatch(/Held|held/);
    });
});

describe("the standalone Tuition card is retired, and the capability is not", () => {
    /*
     * RETIREMENT IS A COMPOSITION DECISION. The code default lost the placement, and the tenant's
     * published layout lost it too (v163 → v164, both `sections` and `metadata.focusPanelLayout`).
     * What must NOT happen is the component or its authorities disappearing with it — a tenant may
     * still place the card, and Assignment consumes the same pricing read model either way.
     */
    it("is absent from the code-owned default composition", () => {
        const vis = src("lib/adminV2/runtime/focusPanel/focusPanelCardVisibility.ts");
        const comp = src("lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition.ts");
        expect(vis, "not in the enrolment default").not.toMatch(/"billing_preview"/);
        expect(comp, "and not placed in any code-owned grid").not.toMatch(/key: "billing_preview"/);
    });

    it("keeps the component, its route and the pricing authorities", () => {
        const renderer = src("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        expect(renderer, "a tenant that places it still gets a card").toContain("AssignmentTuitionCard");
        expect(renderer).toMatch(/model\.key === "billing_preview"/);
        /* The read model Assignment itself depends on. */
        expect(src("lib/enrollment/pricing/buildAssignmentTuitionView.ts").length, "the pricing read model survives").toBeGreaterThan(0);
    });

    /*
     * ASSIGNMENT IS WHERE TUITION LIVES NOW, so it must stay composed at the grain where pricing
     * is decided. Removing one card must not have removed the one that replaced it.
     */
    it("leaves Assignment composed at the child grain", () => {
        const registry = src("lib/adminV2/runtime/focusPanel/focusPanelCardRegistry.ts");
        expect(registry).toMatch(/key: "scheduling"[\s\S]{0,160}grains: \[[^\]]*"child"/);
        expect(src("lib/adminV2/runtime/focusPanel/focusPanelCardVisibility.ts")).toContain('"scheduling"');
    });
});
