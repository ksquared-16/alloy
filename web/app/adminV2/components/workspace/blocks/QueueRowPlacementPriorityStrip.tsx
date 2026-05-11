import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

type StripProps = {
    preview: QueueRowPlacementPriorityVm;
    /** Default: horizontal chip row under CRM. `statusColumn`: stacked under status in left column. */
    layout?: "default" | "statusColumn";
    /** Plain status label, e.g. `Waitlisted` — shown when `layout="statusColumn"`. */
    statusLabel?: string;
};

/**
 * Compact waitlist placement row — position, short program label, rule chip; caveats live in the lane hint only.
 */
export function QueueRowPlacementPriorityStrip({ preview, layout = "default", statusLabel }: StripProps) {
    const statusCol = layout === "statusColumn";

    if (preview.evaluateError) {
        return (
            <div
                className={`adminv2-ws-queue-placement-strip adminv2-ws-queue-placement-strip--error adminv2-ws-queue-placement-strip--compact${statusCol ? " adminv2-ws-queue-placement-strip--status-column" : ""}`}
                data-queue-placement="error"
            >
                {statusCol && statusLabel?.trim() ? (
                    <p className="adminv2-ws-queue-placement-strip__status-line m-0 text-[11px] leading-snug text-alloy-midnight/75">
                        <span className="font-semibold text-alloy-midnight/55">Status:</span> {statusLabel.trim()}
                    </p>
                ) : null}
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

    if (!statusCol) {
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

    return (
        <div
            className="adminv2-ws-queue-placement-strip adminv2-ws-queue-placement-strip--compact adminv2-ws-queue-placement-strip--status-column"
            data-queue-placement="preview"
        >
            {statusLabel?.trim() ? (
                <p className="adminv2-ws-queue-placement-strip__status-line m-0 text-[11px] leading-snug text-alloy-midnight/80">
                    <span className="font-semibold text-alloy-midnight/55">Status:</span> {statusLabel.trim()}
                </p>
            ) : null}
            <div className="adminv2-ws-queue-placement-strip__row adminv2-ws-queue-placement-strip__row--tight">
                {hasScopedPosition ? (
                    <span className="adminv2-ws-queue-placement-position" aria-hidden>
                        #{preview.scopedWaitlistPosition}
                    </span>
                ) : null}
                {preview.waitlistProgramShortLabel?.trim() ? (
                    <span className="adminv2-ws-queue-placement-strip__program" title={preview.scopedWaitlistPositionLabel}>
                        {preview.waitlistProgramShortLabel.trim()}
                    </span>
                ) : null}
            </div>
            <div className="adminv2-ws-queue-placement-strip__rule-block">
                <span className="adminv2-ws-queue-placement-rule-chip adminv2-ws-queue-placement-rule-chip--inline" title={chipTitle}>
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
