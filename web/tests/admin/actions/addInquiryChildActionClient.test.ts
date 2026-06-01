import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    ADMINV2_OPEN_ADD_INQUIRY_CHILD_MODAL,
    dispatchOpenAddInquiryChildModal,
    isAddInquiryChildActionKey,
    isAddInquiryChildFormKey,
    parseOpenAddInquiryChildModalDetail,
    resolveAddInquiryChildMode,
} from "@/lib/admin/actions/addInquiryChildActionClient";

describe("addInquiryChildActionClient", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("recognizes registry keys and form key", () => {
        expect(isAddInquiryChildActionKey("add_child")).toBe(true);
        expect(isAddInquiryChildActionKey("add_sibling")).toBe(true);
        expect(isAddInquiryChildActionKey("approve_enrollment")).toBe(false);
        expect(isAddInquiryChildFormKey("add_inquiry_child")).toBe(true);
    });

    it("resolves sibling mode from action key", () => {
        expect(resolveAddInquiryChildMode({ actionKey: "add_sibling" })).toBe("sibling");
        expect(resolveAddInquiryChildMode({ actionKey: "add_child" })).toBe("child");
    });

    it("dispatches canonical open modal event when window exists", () => {
        const dispatchEvent = vi.fn();
        vi.stubGlobal("window", { dispatchEvent } as unknown as Window);
        dispatchOpenAddInquiryChildModal({ opportunity_id: "opp-9", mode: "child", action_key: "add_child" });
        expect(dispatchEvent).toHaveBeenCalled();
        const ev = dispatchEvent.mock.calls[0][0] as CustomEvent;
        expect(ev.type).toBe(ADMINV2_OPEN_ADD_INQUIRY_CHILD_MODAL);
        const parsed = parseOpenAddInquiryChildModalDetail(ev);
        expect(parsed?.opportunity_id).toBe("opp-9");
        expect(parsed?.mode).toBe("child");
        vi.unstubAllGlobals();
    });
});
