import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AddInquiryChildModal } from "@/components/admin/opportunity/actions/AddInquiryChildModal";

describe("AddInquiryChildModal", () => {
    it("renders capture fields and disables submit until requirements met", () => {
        const html = renderToStaticMarkup(
            createElement(AddInquiryChildModal, {
                open: true,
                mode: "child",
                onClose: () => {},
                onSubmit: vi.fn(),
            })
        );

        expect(html).toContain("Add child");
        expect(html).toContain('data-add-inquiry-child-modal="true"');
        expect(html).toContain('data-add-inquiry-field="first_name"');
        expect(html).toContain('data-add-inquiry-field="date_of_birth"');
        expect(html).toContain('data-add-inquiry-submit="true"');
        expect(html).toContain("disabled");
    });
});
