import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AlloyIdentityLoader } from "@/app/adminV2/components/bos/identity/AlloyIdentityLoader";

describe("AlloyIdentityLoader", () => {
    it("uses crisp mark, horizon, drifting atmosphere, and secondary message", () => {
        const html = renderToStaticMarkup(
            createElement(AlloyIdentityLoader, { message: "Opening Lead…" }),
        );

        expect(html).toContain('data-alloy-identity-loader="true"');
        expect(html).toContain('data-alloy-identity-loader-phase="drifting"');
        expect(html).toContain("data-bos-mark-core");
        expect(html).toContain('data-bos-horizon="true"');
        expect(html).toContain('data-alloy-identity-atmosphere="drifting"');
        expect(html).toContain("Opening Lead…");
        expect(html).not.toContain('data-bos-smoke="thinking"');
        expect(html).not.toContain("radialGradient");
        expect(html).not.toContain("animate-spin");
    });

    it("supports readiness tighten and reveal phases without BosSmoke funnel", () => {
        const tightening = renderToStaticMarkup(
            createElement(AlloyIdentityLoader, { phase: "tightening", message: "Almost ready…" }),
        );
        const revealing = renderToStaticMarkup(
            createElement(AlloyIdentityLoader, { phase: "revealing", message: "Almost ready…" }),
        );

        expect(tightening).toContain('data-alloy-identity-loader-phase="tightening"');
        expect(tightening).toContain('data-alloy-identity-atmosphere="tightening"');
        expect(revealing).toContain('data-alloy-identity-loader-phase="revealing"');
        expect(revealing).toContain('data-alloy-identity-atmosphere="revealing"');
        expect(tightening).not.toContain('data-bos-smoke="');
    });

    it("can hide message when caller supplies title beside the stack", () => {
        const html = renderToStaticMarkup(
            createElement(AlloyIdentityLoader, { message: "Hidden", showMessage: false }),
        );

        expect(html).not.toContain("Hidden");
        expect(html).toContain("data-bos-mark-core");
    });
});
