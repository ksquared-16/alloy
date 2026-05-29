import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import EditablePersonContactCard from "@/components/admin/opportunity/EditablePersonContactCard";
import ViewPersonDrawerIconButton from "@/components/admin/drawer/ViewPersonDrawerIconButton";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("View Person drawer icon", () => {
    it("EditablePersonContactCard uses shared icon button instead of text link", () => {
        const src = read("components/admin/opportunity/EditablePersonContactCard.tsx");
        expect(src).toContain("ViewPersonDrawerIconButton");
        expect(src).not.toContain(">View person</");
    });

    it("renders icon button with diagnostics attrs", () => {
        const html = renderToStaticMarkup(
            <ViewPersonDrawerIconButton
                personId="11111111-1111-4111-8111-111111111111"
                displayName="Ada Lovelace"
                onClick={vi.fn()}
                extraAttrs={{ "data-view-person-clicked": "true" }}
            />
        );

        expect(html).toContain('data-testid="view-person-drawer-open"');
        expect(html).toContain('aria-label="View person for Ada Lovelace"');
        expect(html).toContain('data-view-person-clicked="true"');
    });
});
