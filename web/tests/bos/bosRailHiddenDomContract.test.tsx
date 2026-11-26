/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * R6 — the DOM contract of a withheld rail.
 *
 * A rail that is merely transparent is still focusable, still in the accessibility tree, and still
 * swallows clicks. `visibility: hidden` is the property that removes it from all three, which is why
 * the gate uses it and never opacity. These assert the mount's hidden branch carries that contract
 * and applies it in the SAME render that computes the style — not in a post-paint effect, which is
 * what produced the measured 765 ms provisional flash.
 */
const MOUNT = readFileSync(
    join(process.cwd(), "app", "adminV2", "components", "CommandRailBosMount.tsx"),
    "utf8",
);
const CONTROLLER = readFileSync(
    join(process.cwd(), "contexts", "BosPresentationControllerContext.tsx"),
    "utf8",
);
const ROUTE_HOST = readFileSync(
    join(process.cwd(), "components", "admin", "workspace", "WorkUnitSlugRouteHost.tsx"),
    "utf8",
);

describe("the withheld rail's DOM contract", () => {
    it("hides with visibility, never opacity — visibility also removes it from a11y and tab order", () => {
        const hiddenBranch = MOUNT.slice(MOUNT.indexOf("if (!bos.floatingPlacementTrustworthy)"));
        expect(hiddenBranch).toContain('visibility: "hidden"');
        expect(hiddenBranch).toContain('pointerEvents: "none"');
        expect(hiddenBranch.slice(0, 600)).not.toContain("opacity");
    });

    it("the hidden branch still carries the real geometry, so revealing is not a move", () => {
        const hiddenBranch = MOUNT.slice(MOUNT.indexOf("if (!bos.floatingPlacementTrustworthy)"), MOUNT.indexOf("return {\n                position: \"fixed\","));
        for (const key of ["left: g.x", "top: g.y", "width: g.width"]) {
            expect(hiddenBranch).toContain(key);
        }
    });

    it("exposure is decided during render, not applied by an effect", () => {
        // The style is computed in a useMemo consumed by the rendered element.
        expect(MOUNT).toContain("const overlayStyle = useMemo(");
        expect(MOUNT).toContain("style={{ ...overlayStyle, zIndex: overlayZ }}");
    });

    it("the Work Unit lifecycle is declared during render, so it precedes first paint", () => {
        expect(ROUTE_HOST).toContain("const declaredEpoch = useMemo(");
        expect(ROUTE_HOST).toContain("declareWorkUnitSurfaceMounted(resolved)");
        // The paired release is the only part that belongs in an effect.
        expect(ROUTE_HOST).toContain("useEffect(() => () => releaseWorkUnitSurface(declaredEpoch)");
    });

    it("no lifecycle subscriber drives parking — the observer stays the only scheduler", () => {
        const sub = CONTROLLER.slice(CONTROLLER.indexOf("subscribeWorkUnitRevealLifecycle("));
        const body = sub.slice(0, sub.indexOf("});") + 3);
        expect(body).not.toContain("park()");
    });

    it("exposure is composed from the shared rule, not re-derived in the provider", () => {
        expect(CONTROLLER).toContain("resolveFloatingExposure({");
    });
});
