import { measureAndApplyDrawerWorkspaceGeometry } from "@/lib/bos/drawerWorkspaceGeometry";
import { setActionWorkspaceOpenDocumentFlag } from "@/lib/bos/bosRailPresentationFlags";

/**
 * Close BOS Action Workspace, restore the persistent rail, then open the entity drawer.
 * Opening the drawer while the workspace flag is still set leaves the rail CSS-suppressed (width 0).
 */
export function queueActionWorkspaceLeadHandoff(
    opportunityId: string,
    openLead: (id: string) => void,
    closeWorkspace: () => void,
): void {
    const id = opportunityId.trim();
    if (!id) return;

    setActionWorkspaceOpenDocumentFlag(false);
    closeWorkspace();

    const remeasure = () => {
        if (typeof document === "undefined") return;
        measureAndApplyDrawerWorkspaceGeometry(document.documentElement);
    };

    if (typeof window === "undefined") {
        openLead(id);
        return;
    }

    window.requestAnimationFrame(() => {
        remeasure();
        window.requestAnimationFrame(() => {
            openLead(id);
            remeasure();
            window.setTimeout(remeasure, 0);
            window.setTimeout(remeasure, 100);
            window.setTimeout(remeasure, 300);
        });
    });
}
