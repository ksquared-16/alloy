"use client";

/**
 * Operations — workspace modal (like Processing / Inbox), opened from the left nav.
 *
 * Hosts the operating day and its configuration in the shared workspace-modal shell: Roster,
 * Attendance, Staff and Children under WORK; Assignment Categories, Patterns and Validation under
 * STUDIO. It replaces three separate modals (Roster, Records, Assignments) that each opened a
 * partial view of the same day and the same people.
 *
 * The `adminv2-roster-modal` attribute is retained as an ALIAS beside the canonical one. Nested
 * portal z-index and overlay reachability are asserted against it, and renaming those selectors in
 * the same change that re-parents the product would make any failure ambiguous between "the move
 * broke it" and "the selector moved".
 */
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import OperationsWorkspace from "@/components/adminV2/roster/RosterWorkspace";

export default function OperationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-operations-modal"
            ariaLabelledBy="operations-workspace-title"
            panelClassName="max-h-[min(94vh,56rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
                data-adminv2-operations-modal="true"
                data-adminv2-roster-modal="true"
            >
                <OperationsWorkspace onClose={onClose} />
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
