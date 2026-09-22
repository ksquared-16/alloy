/**
 * Does this browser render backdrop-filter at all?
 *
 * The scrim's computed `backdrop-filter` came back `none` after the declaration was raised to 10px,
 * and no rule in the sheet overrides it. Before tuning opacity against a screenshot, establish
 * whether the instrument can render the effect — because if it cannot, every depth screenshot this
 * pass produced UNDERSTATES what Kelly will see, and tuning against it would over-darken the scrim.
 */
import { test } from "@playwright/test";
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test.use({ baseURL: "http://127.0.0.1:3012" });
test("backdrop-filter support", async ({ page }) => {
    await page.goto("/login");
    log("BLUR_SUPPORT " + JSON.stringify(await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.backdropFilter = "blur(8px)";
        document.body.appendChild(probe);
        const computed = getComputedStyle(probe).backdropFilter;
        probe.remove();
        return {
            cssSupports: CSS.supports("backdrop-filter", "blur(8px)"),
            cssSupportsWebkit: CSS.supports("-webkit-backdrop-filter", "blur(8px)"),
            computedOnFreshElement: computed,
            ua: navigator.userAgent.slice(0, 60),
        };
    })));
});
