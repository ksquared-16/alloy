import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BosRailActionIcon } from "@/app/adminV2/components/bos/identity/BosRailActionIcon";

describe("BosRailActionIcon", () => {
    it("renders operational icon without BosMark", () => {
        const html = renderToStaticMarkup(createElement(BosRailActionIcon, { icon: "summarize" }));
        expect(html).toContain('data-bos-rail-action-icon="summarize"');
        expect(html).not.toContain("data-bos-mark");
        expect(html).toContain('stroke="#00A283"');
    });

    it("supports all catalog icon keys", () => {
        const keys = ["summarize", "missing", "draft", "documents", "outreach", "insight"] as const;
        for (const icon of keys) {
            const html = renderToStaticMarkup(createElement(BosRailActionIcon, { icon }));
            expect(html).toContain(`data-bos-rail-action-icon="${icon}"`);
        }
    });
});
