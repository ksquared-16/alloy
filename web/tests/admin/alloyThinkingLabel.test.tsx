/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
    AlloyThinkingLabel,
    THINKING_DOT_STAGGER_S,
} from "@/components/admin/workspace/AlloyThinkingLabel";
import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

describe("AlloyThinkingLabel", () => {
    it("renders quieter Thinking copy with a reserved, non-reflowing ellipsis slot", () => {
        const html = renderToStaticMarkup(<AlloyThinkingLabel size="lg" />);
        expect(html).toContain('data-alloy-thinking-label="true"');
        expect(html).toContain('data-alloy-thinking-ellipsis="true"');
        expect(html).toContain("Thinking");
        expect(html).toContain("font-normal");
        expect(html).toContain("text-alloy-midnight/55");
        // Reserved slot keeps the label from reflowing as the dots breathe.
        expect(html).toContain("w-[1.35em]");
        expect(html).not.toContain("font-semibold");
    });

    it("renders three continuous breathing dots, staggered — not a stepping ellipsis counter", () => {
        const html = renderToStaticMarkup(<AlloyThinkingLabel size="lg" />);
        const dotCount = (html.match(/motion-thinking-dot/g) ?? []).length;
        expect(dotCount).toBe(3);
        // Each dot carries its own stagger so a soft light travels across the three.
        expect(html).toContain("animation-delay:0s");
        expect(html).toContain(`animation-delay:${THINKING_DOT_STAGGER_S}s`);
        expect(html).toContain(`animation-delay:${THINKING_DOT_STAGGER_S * 2}s`);
        // Motion is CSS-driven; the label no longer counts through literal dot strings.
        expect(html).not.toContain("...");
    });

    it("content boot shell uses AlloyThinkingLabel", () => {
        const html = renderToStaticMarkup(
            <AlloyOperationalBootShell variant="workspace" chrome="content" />,
        );
        expect(html).toContain('data-alloy-thinking-label="true"');
        expect(html).toContain('data-alloy-operational-boot-chrome="content"');
    });
});
