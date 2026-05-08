import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

/**
 * Waitlist placement preview for work-unit queue rows — scoped position numbers only when server uses non-shadow placement sort.
 */
export function QueueRowPlacementPriorityStrip({ preview }: { preview: QueueRowPlacementPriorityVm }) {
    if (preview.evaluateError) {
        return (
            <div
                className="adminv2-ws-queue-placement-strip adminv2-ws-queue-placement-strip--error"
                data-queue-placement="error"
            >
                <span className="adminv2-ws-queue-placement-strip__label">Waitlist priority</span>
                <span className="adminv2-ws-queue-placement-strip__muted">
                    {preview.errorMessage ?? "Preview unavailable."}
                </span>
            </div>
        );
    }

    const hasScopedPosition =
        !preview.shadowMode &&
        preview.scopedWaitlistPosition != null &&
        preview.scopedWaitlistPosition >= 1 &&
        (preview.scopedWaitlistPositionLabel?.trim() ?? "");

    const chipTitle = hasScopedPosition
        ? `${preview.scopedWaitlistPositionLabel} — priority rule / factor for this record (page-local scope; see lane note)`
        : preview.shadowMode
          ? "Priority rule / factor (preview — list order not placement-sorted)"
          : "Priority rule / factor for this record (page-local scope; see lane note)";

    return (
        <div className="adminv2-ws-queue-placement-strip" data-queue-placement="preview">
            <div className="adminv2-ws-queue-placement-strip__head">
                {hasScopedPosition ? (
                    <span
                        className="adminv2-ws-queue-placement-position"
                        aria-label={preview.scopedWaitlistPositionLabel}
                        title={preview.scopedWaitlistPositionLabel}
                    >
                        #{preview.scopedWaitlistPosition}
                    </span>
                ) : null}
                <span className="adminv2-ws-queue-placement-strip__kicker">Waitlist priority</span>
                <span className="adminv2-ws-queue-placement-rule-chip" title={chipTitle}>
                    {preview.priorityRuleLabel}
                </span>
            </div>
            {hasScopedPosition ? (
                <p className="adminv2-ws-queue-placement-strip__position-caption">{preview.scopedWaitlistPositionLabel}</p>
            ) : null}
            {preview.reasonLines.length > 0 ? (
                <ul className="adminv2-ws-queue-placement-strip__reasons" aria-label="Waitlist priority notes">
                    {preview.reasonLines.map((line, i) => (
                        <li key={i}>{line}</li>
                    ))}
                </ul>
            ) : null}
            {preview.warningLines.length > 0 ? (
                <ul className="adminv2-ws-queue-placement-strip__warnings" aria-label="Waitlist priority warnings">
                    {preview.warningLines.map((line, i) => (
                        <li key={`w-${i}`}>{line}</li>
                    ))}
                </ul>
            ) : null}
            {preview.shadowMode ? (
                <p className="adminv2-ws-queue-placement-strip__shadow-note">
                    Preview only — row order matches this queue&apos;s usual sort; the rule above reflects placement priority
                    inside this program / room group when ordering is applied. Position numbers stay off until placement sort is
                    enabled for this lane.
                </p>
            ) : null}
        </div>
    );
}
