import { describe, expect, it, vi } from "vitest";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

describe("applyRegistryResolvedActionClient add sibling legacy path", () => {
    it("calls openAddInquiryChild for add_sibling open_form without execute", async () => {
        const openAddInquiryChild = vi.fn();
        const action: ResolvedActionForClient = {
            key: "add_sibling",
            label: "Add sibling",
            description: null,
            action_type: "open_form",
            icon: null,
            style: null,
            display_style: "button",
            payload: { form_key: "add_inquiry_child", mode: "add_sibling" },
            workflow_id: null,
        };

        const out = await applyRegistryResolvedActionClient(action, {
            router: { push: vi.fn(), refresh: vi.fn() },
            focusRecord: vi.fn(),
            openAddInquiryChild,
            entityId: "opp-1",
            context: { surface: "record_section", section_key: "inquiry_children" },
        });

        expect(out.ok).toBe(true);
        expect(openAddInquiryChild).toHaveBeenCalledWith("sibling");
    });
});
