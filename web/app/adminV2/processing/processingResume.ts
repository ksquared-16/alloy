/**
 * Processing's declaration of its own stable navigation position.
 *
 * NOTE what is deliberately absent. `DigitalMailroomWorkView` is `"overview" | "work"`, and "work"
 * is the CASE DETAIL view — it only means anything with a case selected, and a selected case is
 * transient state this contract does not persist. So a remembered `workView: "work"` is invalid by
 * construction and falls back to the default. Processing therefore resumes its mode and its Studio
 * tab, which are genuine stable navigation, and never reopens onto an empty case detail.
 */
import type { StableWorkspacePosition } from "@/lib/runtime/workspaceResume";

export const PROCESSING_WORKSPACE_KEY = "processing";

export const PROCESSING_DEFAULT_POSITION = {
    mode: "work",
    workView: "overview",
    studioTab: "forms",
} satisfies StableWorkspacePosition;

const STUDIO_TABS = new Set(["forms", "packets", "fields", "branding"]);

export function isValidProcessingPosition(position: StableWorkspacePosition): boolean {
    if (position.mode !== "work" && position.mode !== "studio") return false;
    // "work" requires a case that was never persisted — see the note above.
    if (position.workView !== "overview") return false;
    if (!STUDIO_TABS.has(position.studioTab)) return false;
    return true;
}
