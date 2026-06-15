import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AlloyIdentityLoader } from "@/app/adminV2/components/bos/identity/AlloyIdentityLoader";

describe("AlloyIdentityLoader", () => {
    it("uses crisp mark, horizon, smoke, and secondary message", () => {
        const html = renderToStaticMarkup(
            createElement(AlloyIdentityLoader, { message: "Opening Lead…" }),
        );

        expect(html).toContain('data-alloy-identity-loader="true"');
        expect(html).toContain("data-bos-mark-core");
        expect(html).toContain('data-bos-horizon="true"');
        expect(html).toContain('data-bos-smoke="thinking"');
        expect(html).toContain("Opening Lead…");
        expect(html).not.toContain("radialGradient");
        expect(html).not.toContain("animate-spin");
    });

    it("can hide message when caller supplies title beside the stack", () => {
        const html = renderToStaticMarkup(
            createElement(AlloyIdentityLoader, { message: "Hidden", showMessage: false }),
        );

        expect(html).not.toContain("Hidden");
        expect(html).toContain("data-bos-mark-core");
    });
});
