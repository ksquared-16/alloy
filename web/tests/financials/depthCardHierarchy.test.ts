/**
 * THE DEPTH CARDS WERE FLAT BECAUSE EVERYTHING WAS SECONDARY.
 *
 * Responsibility, Discounts and Payments were written in Tailwind opacities — `text-alloy-midnight/55`
 * for very nearly everything — so a section heading, a current arrangement, a person's name, a
 * helper sentence and a piece of metadata all arrived at one weight and one gray. The cards
 * worked and could not be scanned: there was nothing for the eye to land on, and current
 * financial truth read as disabled.
 *
 * §60 is explicit that subjective quality is not lockable with arbitrary strings, so these locks
 * hold the STRUCTURAL conditions that produce it: primary state takes the normal foreground,
 * genuinely secondary explanation takes the muted token, sections are distinct from values, and
 * all three cards reach the same named grammar rather than each re-deriving one from opacities.
 *
 * Appearance itself is a mounted gate.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CSS = "app/adminV2/components/operationalCardsShared.css";
const RESP = "app/adminV2/financials/FinancialsResponsibilityPanel.tsx";
const DISCOUNT = "app/adminV2/financials/FinancialsDiscountPanel.tsx";
const METHODS = "components/operationalCards/PaymentMethodsSection.tsx";

describe("the grammar is named once, from the established one", () => {
    it("the depth-card text roles exist as rules", () => {
        const css = read(CSS);
        for (const role of ["section", "value", "label", "hint"]) {
            expect(css, `.alloy-os-depthcard__${role} is a rule, not a class name with nothing behind it`)
                .toMatch(new RegExp(`\\.alloy-os-depthcard__${role}\\s*\\{`));
        }
    });

    it("value takes the normal foreground and hint takes the muted token", () => {
        /*
         * THE WHOLE DEFECT IN ONE ASSERTION. A current arrangement, a discount position and a
         * payment-method state are what the operator opened the card to read. They are primary
         * content and must not be rendered in the colour reserved for explanation.
         */
        const css = read(CSS);
        const rule = (sel: string) => css.slice(css.search(new RegExp(`\\${sel}\\s*\\{`))).slice(0, 320);
        expect(rule(".alloy-os-depthcard__value"), "primary content is full foreground")
            .toMatch(/color:\s*var\(--alloy-os-midnight/);
        expect(rule(".alloy-os-depthcard__value"), "and carries weight").toMatch(/font-weight:\s*[5-7]00/);
        expect(rule(".alloy-os-depthcard__hint"), "secondary explanation is the tertiary token")
            .toMatch(/color:\s*var\(--alloy-os-text-tertiary/);
        expect(rule(".alloy-os-depthcard__section"), "a section label is not a value")
            .toMatch(/text-transform:\s*uppercase/);
    });

    it("no new colour system was introduced", () => {
        /* §51: stronger hierarchy is not permission for louder chrome. */
        const css = read(CSS);
        const block = css.slice(css.indexOf(".alloy-os-depthcard__section"), css.indexOf(".alloy-os-fdetail__rowgroup"));
        const literals = block.match(/#[0-9a-f]{3,8}/gi) ?? [];
        /* Fallbacks inside var() are the established token defaults; nothing else may appear. */
        const outsideVar = block
            .split("\n")
            .filter((l) => /#[0-9a-f]{3,8}/i.test(l) && !l.includes("var(--alloy"))
            .filter((l) => !l.trim().startsWith("*"));
        expect(outsideVar, `raw colours: ${outsideVar.join(" | ")}`).toHaveLength(0);
        expect(literals.length, "and every colour is a token fallback").toBeGreaterThan(0);
    });
});

describe("current financial state is not rendered as helper text", () => {
    it("Responsibility's current arrangement uses the value treatment", () => {
        const panel = code(RESP);
        expect(panel).toMatch(/alloy-os-depthcard__value[^"]*"[\s\S]{0,200}scopeArrangement\.arrangement\.shares/);
        expect(panel, "and its scope label is a section, not another value")
            .toMatch(/alloy-os-depthcard__section/);
    });

    it("a responsible party is named at a person's weight", () => {
        const panel = code(RESP);
        expect(panel).toMatch(/alloy-os-depthcard__identity-name[^>]*>\{share\.name\}/);
    });

    it("each child's discount state uses the value treatment", () => {
        const panel = code(DISCOUNT);
        expect(panel).toMatch(/alloy-os-depthcard__value[^>]*>\s*\{?\s*<span>\{line\.policyLabel\}/);
        expect(panel, "and the child with none says so at the same weight")
            .toMatch(/alloy-os-depthcard__value"[^>]*data-financials-discount-none-for-child/);
    });

    it("the payment-method state is not muted", () => {
        const section = code(METHODS);
        expect(section).toMatch(/alloy-os-depthcard__value[^>]*>No payment method on file\./);
        expect(section, "and the sentence under it is the hint")
            .toMatch(/alloy-os-depthcard__hint/);
    });

    it("the three cards reach one grammar rather than three sets of opacities", () => {
        /*
         * The measure that matters is not zero opacities — it is that the PRIMARY state no longer
         * depends on them. Each card names the shared roles; what remains of the Tailwind
         * opacities is incidental chrome.
         */
        for (const rel of [RESP, DISCOUNT, METHODS]) {
            expect(code(rel), `${rel} uses the shared grammar`).toContain("alloy-os-depthcard__");
        }
    });
});

describe("actions are distinguishable from helper text", () => {
    it("the card's first-class offer is not set at metadata weight", () => {
        /* §9: Add discount is a product action now, not body prose. */
        const panel = code(DISCOUNT);
        expect(panel).toMatch(/alloy-os-depthcard__action[^-][\s\S]{0,400}Add discount/);
    });

    it("and the corrective beside it is quieter, not louder", () => {
        /* §9: not every action becomes a Bend Pine fill; a card of fills shouts past its parent. */
        const panel = code(DISCOUNT);
        expect(panel).toMatch(/alloy-os-depthcard__action--quiet/);
        const css = read(CSS);
        const quiet = css.slice(css.indexOf(".alloy-os-depthcard__action--quiet")).slice(0, 220);
        expect(quiet, "quiet actions are not brand-filled").not.toMatch(/background:/);
    });
});
