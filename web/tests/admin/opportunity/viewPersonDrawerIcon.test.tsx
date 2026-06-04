import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import RelatedRecordDrawerIconButton from "@/components/admin/drawer/RelatedRecordDrawerIconButton";
import ViewPersonDrawerIconButton from "@/components/admin/drawer/ViewPersonDrawerIconButton";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("Related record drawer icon button", () => {
    it("ViewPersonDrawerIconButton re-exports shared related-record icon button", () => {
        expect(ViewPersonDrawerIconButton).toBe(RelatedRecordDrawerIconButton);
    });

    it("EditablePersonContactCard uses shared icon button instead of text link", () => {
        const src = read("components/admin/opportunity/EditablePersonContactCard.tsx");
        expect(src).toContain("ViewPersonDrawerIconButton");
        expect(src).not.toContain(">View person</");
    });

    it("renders person icon kind for person rows", () => {
        const html = renderToStaticMarkup(
            <RelatedRecordDrawerIconButton
                personId="11111111-1111-4111-8111-111111111111"
                displayName="Ada Lovelace"
                recordKind="person"
                onClick={vi.fn()}
                extraAttrs={{ "data-view-person-clicked": "true" }}
            />
        );

        expect(html).toContain('data-testid="view-person-drawer-open"');
        expect(html).toContain('data-related-record-drawer-icon-kind="person"');
        expect(html).toContain('aria-label="View person for Ada Lovelace"');
        expect(html).toContain('data-view-person-clicked="true"');
        expect(html).toContain('data-related-record-drawer-icon-glyph="true"');
    });

    it("renders child icon kind for child rows", () => {
        const html = renderToStaticMarkup(
            <RelatedRecordDrawerIconButton
                personId="22222222-2222-4222-8222-222222222222"
                displayName="Sam Lee"
                recordKind="child"
                onClick={vi.fn()}
            />
        );

        expect(html).toContain('data-testid="view-child-drawer-open"');
        expect(html).toContain('data-related-record-drawer-icon-kind="child"');
        expect(html).toContain('aria-label="View child Sam Lee"');
    });

    it("preserves pointer and click handlers on the button", () => {
        const onClick = vi.fn();
        const onPointerDown = vi.fn();
        const html = renderToStaticMarkup(
            <RelatedRecordDrawerIconButton
                personId="11111111-1111-4111-8111-111111111111"
                displayName="Ada Lovelace"
                recordKind="person"
                onClick={onClick}
                onPointerDown={onPointerDown}
            />
        );
        expect(html).toContain('type="button"');
        expect(html).toContain('data-view-person-target-id="11111111-1111-4111-8111-111111111111"');
    });
});

describe("Opportunity inquiry children drawer icons", () => {
    it("OpportunityInquiryChildrenSection uses shared child drawer icon button", () => {
        const src = read("components/admin/entity/OpportunityInquiryChildrenSection.tsx");
        expect(src).toContain("InquiryChildDrawerIconButton");
        expect(src).toContain('recordKind="child"');
        expect(src).toContain("ViewPersonDrawerIconButton");
        expect(src).not.toContain("function ViewPersonIconButton");
    });
});
