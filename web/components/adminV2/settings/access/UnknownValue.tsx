/**
 * W-45 — the one way this workspace is allowed to say "I do not know."
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * `IA-R1` is *"a value the system did not compute MUST render as Planned or Unknown"*, and
 * `06…§4.10` records that the `data-capability` discipline is *"this surface's best property"*.
 * Both are only checkable if unknowns are marked the same way everywhere — the tier A check in
 * `web/tests/access/accessSurfaceTruthfulness.test.ts` looks for this marker, so a hand-rolled
 * `<span>Unknown</span>` would pass the eye and fail the point.
 *
 * `reason` is required. An unknown without a reason is the same silence that let `Active` stand
 * as a literal for four renders: the operator could not tell "not read" from "read and fine".
 */
export function UnknownValue({
    label = "Unknown",
    reason,
    testId,
    className,
}: {
    label?: string;
    /** Why the value is not known — shown to the operator, not swallowed. */
    reason: string;
    testId?: string;
    className?: string;
}) {
    return (
        <span
            className={`inline-flex items-baseline gap-1 text-alloy-midnight/55 ${className ?? ""}`}
            data-capability="unknown"
            data-testid={testId}
            title={reason}
        >
            <span className="font-medium">{label}</span>
            <span className="text-[11px] text-alloy-midnight/45">— {reason}</span>
        </span>
    );
}
