import { useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OperationalAttentionAnchoredDraftPopover from "@/components/admin/drawer/OperationalAttentionAnchoredDraftPopover";

function OpenPopoverFixture(props: { body: string; copyLabel: string; dataSlot?: string }) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    return (
        <div className="relative">
            <button type="button" ref={anchorRef}>
                Open
            </button>
            <OperationalAttentionAnchoredDraftPopover
                open
                onClose={() => {}}
                anchorRef={anchorRef}
                title="Draft"
                subtitle="Copy and edit before using."
                body={props.body}
                copyLabel={props.copyLabel}
                data-drawer-slot={props.dataSlot}
            />
        </div>
    );
}

describe("OperationalAttentionAnchoredDraftPopover", () => {
    it("renders body and copy control when open (anchored overlay content)", () => {
        const html = renderToStaticMarkup(
            <OpenPopoverFixture body="Hi there,\nI wanted to follow up on your inquiry." copyLabel="Copy draft" />,
        );
        expect(html).toContain('data-drawer-slot="attention_draft_popover"');
        expect(html).toContain("Hi there,");
        expect(html).toContain("I wanted to follow up on your inquiry");
        expect(html).toContain("Copy draft");
        expect(html).toContain('role="dialog"');
        expect(html).not.toContain("Send");
        expect(html).not.toContain("Apply");
    });

    it("supports enhance slot naming", () => {
        const html = renderToStaticMarkup(
            <OpenPopoverFixture
                body="Enhanced paragraph."
                copyLabel="Copy"
                dataSlot="enhance_draft_popover"
            />,
        );
        expect(html).toContain('data-drawer-slot="enhance_draft_popover"');
        expect(html).toContain("Enhanced paragraph.");
        expect(html).toContain("Copy");
    });
});
