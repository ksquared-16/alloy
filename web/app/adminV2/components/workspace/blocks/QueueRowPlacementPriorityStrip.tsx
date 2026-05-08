import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

/**
 * Conservative placement preview for work-unit queue rows (Card 7).
 * Does not show rank or imply global waitlist ordering.
 */
export function QueueRowPlacementPriorityStrip({ preview }: { preview: QueueRowPlacementPriorityVm }) {
    if (preview.evaluateError) {
        return (
            <div
                className="adminv2-ws-queue-placement-strip adminv2-ws-queue-placement-strip--error"
                data-queue-placement="error"
            >
                <span className="adminv2-ws-queue-placement-strip__label">Placement priority</span>
                <span className="adminv2-ws-queue-placement-strip__muted">
                    {preview.errorMessage ?? "Preview unavailable."}
                </span>
            </div>
        );
    }

    return (
        <div className="adminv2-ws-queue-placement-strip" data-queue-placement="preview">
            <div className="adminv2-ws-queue-placement-strip__head">
                <span className="adminv2-ws-queue-placement-strip__kicker">Placement priority</span>
                <span
                    className="adminv2-ws-queue-placement-cohort-chip"
                    title="Priority cohort for this record (preview projection only — not list position)"
                >
                    {preview.cohortLabel}
                </span>
            </div>
            {preview.reasonLines.length > 0 ? (
                <ul className="adminv2-ws-queue-placement-strip__reasons" aria-label="Placement notes">
                    {preview.reasonLines.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                </ul>
            ) : null}
            {preview.warningLines.length > 0 ? (
                <ul className="adminv2-ws-queue-placement-strip__warnings" aria-label="Placement warnings">
                    {preview.warningLines.map((line, i) => (
                        <li key={`w-${i}`}>{line}</li>
                    ))}
                </ul>
            ) : null}
            {preview.shadowMode ? (
                <p className="adminv2-ws-queue-placement-strip__shadow-note">
                    Preview only — row order matches this queue&apos;s usual sort.
                </p>
            ) : null}
        </div>
    );
}
