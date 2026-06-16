import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { setActionWorkspaceOpenDocumentFlag } = vi.hoisted(() => ({
    setActionWorkspaceOpenDocumentFlag: vi.fn(),
}));

vi.mock("@/lib/bos/bosRailPresentationFlags", () => ({
    setActionWorkspaceOpenDocumentFlag,
}));

import {
    closeAllWorkspaceModals,
    closeWorkspaceModal,
    getAdminV2WorkspaceModal,
    openWorkspaceModal,
    resetAdminV2WorkspaceModalForTests,
} from "@/lib/adminV2/workspaceModalCoordinator";
import {
    dispatchAdminV2OpenInboxModal,
    dispatchAdminV2OpenTasksPanel,
} from "@/lib/adminV2/workspaceModalEvents";

describe("workspaceModalCoordinator", () => {
    beforeEach(() => {
        resetAdminV2WorkspaceModalForTests();
        setActionWorkspaceOpenDocumentFlag.mockClear();
    });

    afterEach(() => {
        resetAdminV2WorkspaceModalForTests();
    });

    it("opening tasks after inbox closes inbox", () => {
        openWorkspaceModal("inbox");
        openWorkspaceModal("tasks");
        expect(getAdminV2WorkspaceModal()).toBe("tasks");
    });

    it("opening inbox after tasks closes tasks", () => {
        openWorkspaceModal("tasks");
        openWorkspaceModal("inbox");
        expect(getAdminV2WorkspaceModal()).toBe("inbox");
    });

    it("opening a shell modal suppresses BOS action workspace", () => {
        openWorkspaceModal("inbox");
        expect(setActionWorkspaceOpenDocumentFlag).toHaveBeenCalledWith(false);
    });

    it("closeWorkspaceModal only clears the active modal key", () => {
        openWorkspaceModal("inbox");
        closeWorkspaceModal("tasks");
        expect(getAdminV2WorkspaceModal()).toBe("inbox");
        closeWorkspaceModal("inbox");
        expect(getAdminV2WorkspaceModal()).toBeNull();
    });

    it("closeAllWorkspaceModals clears active modal (BOS open path)", () => {
        openWorkspaceModal("inbox");
        closeAllWorkspaceModals();
        expect(getAdminV2WorkspaceModal()).toBeNull();
    });

    it("dispatch helpers route through the coordinator", () => {
        dispatchAdminV2OpenInboxModal();
        expect(getAdminV2WorkspaceModal()).toBe("inbox");
        dispatchAdminV2OpenTasksPanel();
        expect(getAdminV2WorkspaceModal()).toBe("tasks");
    });
});
