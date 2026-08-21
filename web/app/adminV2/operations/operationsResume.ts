/**
 * Operations' declaration of its own stable navigation position.
 *
 * The resume MECHANISM is shared (`lib/runtime/workspaceResume.ts`); what counts as a valid position
 * is workspace knowledge, so each workspace declares it here rather than the shared owner knowing
 * about every workspace's sections.
 */
import {
    OPERATIONS_STUDIO_TABS,
    OPERATIONS_WORK_TABS,
    type OperationsMode,
} from "@/app/adminV2/operations/operationsSections";
import type { StableWorkspacePosition } from "@/lib/runtime/workspaceResume";

export const OPERATIONS_WORKSPACE_KEY = "operations";

export const OPERATIONS_DEFAULT_POSITION = {
    mode: "work" as OperationsMode,
    section: "roster",
    lens: "rooms",
    range: "day",
    studioSection: "types",
} satisfies StableWorkspacePosition;

const WORK_SECTIONS = new Set(OPERATIONS_WORK_TABS.map((t) => t.key as string));
// `templates` is excluded in the workspace's own state type, so it is not a resumable position.
const STUDIO_SECTIONS = new Set(
    OPERATIONS_STUDIO_TABS.map((t) => t.key as string).filter((k) => k !== "templates"),
);
const LENSES = new Set(["rooms", "staff", "assignments"]);
const RANGES = new Set(["day", "week"]);

/**
 * A remembered position is a HINT, never an authority: anything that no longer resolves falls the
 * whole workspace back to its default rather than opening it somewhere broken.
 */
export function isValidOperationsPosition(position: StableWorkspacePosition): boolean {
    if (position.mode !== "work" && position.mode !== "studio") return false;
    if (!WORK_SECTIONS.has(position.section)) return false;
    if (!STUDIO_SECTIONS.has(position.studioSection)) return false;
    if (!LENSES.has(position.lens)) return false;
    if (!RANGES.has(position.range)) return false;
    return true;
}
