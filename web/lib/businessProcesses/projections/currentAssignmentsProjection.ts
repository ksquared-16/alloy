/**
 * Assignments · `current_assignments` — kept as an import path since Slice 2. The projection now lives
 * with its four Slice 3 siblings in `assignmentsProjections.ts`, over the same read path and the same
 * canonical resolver (`resolveAssignmentLifecycleState`): one definition of "current", not two.
 */
export {
    ASSIGNMENT_PAGE_SIZE,
    ASSIGNMENT_READ_CAP,
    CURRENT_ASSIGNMENTS_PROJECTION,
    loadCurrentAssignments,
} from "@/lib/businessProcesses/projections/assignmentsProjections";
