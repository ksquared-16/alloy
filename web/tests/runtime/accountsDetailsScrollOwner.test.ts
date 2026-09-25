import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SLICE C — THE ACCOUNT DETAILS LEDGER MUST BE SCROLLABLE.
 *
 * Measured on mounted staging, the chain from the ledger upward read:
 *
 *   .alloy-os-fdetail__scroll    929px box / 929px content   nothing to scroll
 *   .alloy-os-ucard__body       1149px / 1149px             nothing to scroll
 *   article.alloy-os-ucard      1199px, flex 0 1 auto
 *   .alloy-os-billing--detail   1199px, flex 0 1 auto, MIN-HEIGHT: AUTO
 *   the floor                    423px box / 1199px content  the only scrollable element
 *
 * `min-height: auto` is a flex item's default and refuses to shrink below content, so those two
 * links expanded to the whole ledger inside a 423px floor and every descendant inherited the height.
 * The scroller meant to own this had zero extent — and because it still declares
 * `overscroll-behavior: contain`, it also swallowed the wheel instead of letting it chain to the
 * floor. A real wheel over the ledger moved nothing; setting the floor's scrollTop directly worked.
 *
 * THIS TEST IS A GUARD, NOT THE PROOF. Scrolling is a layout behaviour and only the mounted product
 * can demonstrate it; that evidence lives in certification/slice-c/. What this pins is the one
 * declaration whose absence caused it, so the rule cannot be dropped silently.
 */
const css = readFileSync(
    join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"),
    "utf8",
);

/** The rule body for a selector, so an assertion cannot pass on a comment that merely mentions it. */
function ruleFor(selectorFragment: string): string | null {
    const at = css.indexOf(selectorFragment);
    if (at < 0) return null;
    const open = css.indexOf("{", at);
    const close = css.indexOf("}", open);
    return open < 0 || close < 0 ? null : css.slice(open + 1, close);
}

describe("accounts details scroll owner", () => {
    it("the billing detail wrapper is allowed to shrink inside the floor", () => {
        const rule = ruleFor(
            '.alloy-accounts-account-card [data-financials-surface-role="floor"] .alloy-os-billing--detail',
        );
        expect(rule, "the shrink contract for the detail wrapper must exist").not.toBeNull();
        // `min-height: 0` is the whole defect. Without it the wrapper grows to the full ledger.
        expect(rule).toMatch(/min-height:\s*0/);
        expect(rule).toMatch(/flex:\s*1 1 auto/);
        expect(rule).toMatch(/flex-direction:\s*column/);
    });

    it("the card inside it may shrink too, or the chain breaks one link lower", () => {
        // Both links were measured at 1199px. Fixing only the outer one leaves the article at
        // content height and the scroller still inert.
        expect(css).toContain(
            '.alloy-accounts-account-card [data-financials-surface-role="floor"] .alloy-os-billing--detail > .alloy-os-ucard',
        );
    });

    it("the intended scroller still declares its own bounded-scroller contract", () => {
        // The repair works by letting the chain shrink, NOT by moving scroll ownership elsewhere.
        const shared = readFileSync(
            join(process.cwd(), "app/adminV2/components/operationalCardsShared.css"),
            "utf8",
        );
        const at = shared.indexOf(".alloy-os-fdetail__scroll");
        expect(at).toBeGreaterThan(-1);
        const body = shared.slice(shared.indexOf("{", at) + 1, shared.indexOf("}", at));
        expect(body).toMatch(/overflow-y:\s*auto/);
        expect(body).toMatch(/min-height:\s*0/);
    });
});
