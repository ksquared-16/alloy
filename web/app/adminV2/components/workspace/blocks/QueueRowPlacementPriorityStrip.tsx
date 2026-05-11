import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

/**
 * Compact waitlist placement row — position, short program label, rule chip; caveats live in the lane hint only.
 */
export function QueueRowPlacementPriorityStrip({ preview }: { preview: QueueRowPlacementPriorityVm }) {
    if (preview.evaluateError) {
        return (
            <div
                className="adminv2-ws-queue-placement-strip adminv2-ws-queue-placement-strip--error adminv2-ws-queue-placement-strip--compact"
                data-queue-placement="error"
            >
                <span className="adminv2-ws-queue-placement-strip__label">Waitlist</span>
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

    const firstWarning = preview.warningLines[0]?.trim();
    const chipTitle = preview.priorityRuleLabel;

    return (
        <div
            className="adminv2-ws-queue-placement-strip adminv2-ws-queue-placement-strip--compact"
            data-queue-placement="preview"
        >
            <div className="adminv2-ws-queue-placement-strip__row">
                {hasScopedPosition ? (
                    <span className="adminv2-ws-queue-placement-position" aria-hidden>
                        #{preview.scopedWaitlistPosition}
                    </span>
                ) : null}
                {hasScopedPosition ? (
                    <span className="adminv2-ws-queue-placement-strip__program" title={preview.scopedWaitlistPositionLabel}>
                        {preview.waitlistProgramShortLabel}
                    </span>
                ) : null}
                <span className="adminv2-ws-queue-placement-rule-chip" title={chipTitle}>
                    {preview.priorityRuleLabel}
                </span>
                {firstWarning ? (
                    <span
                        className="adminv2-ws-queue-placement-strip__warn-dot"
                        title={firstWarning}
                        aria-label={firstWarning}
                        role="img"
                    >
                        !
                    </span>
                ) : null}
            </div>
            {preview.priorityReasonShort?.trim() ? (
                <p className="adminv2-ws-queue-placement-strip__reason-one">{preview.priorityReasonShort.trim()}</p>
            ) : null}
        </div>
    );
}
