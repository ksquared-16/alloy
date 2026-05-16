"use client";

/** Matches `adminv2-ws-wu-queue-card--compact` geometry for stable queue / dept oper panels. */
export function WorkUnitQueueCompactRowSkeleton({
    variant = "standard",
}: {
    variant?: "standard" | "attention" | "throughput";
}) {
    const tier =
        variant === "attention"
            ? "adminv2-ws-wu-queue-card--tier-warning adminv2-ws-dept-attention-bucket-tile"
            : variant === "throughput"
              ? "adminv2-ws-wu-queue-card--tier-standard adminv2-ws-dept-pipeline-lane-tile"
              : "adminv2-ws-wu-queue-card--tier-standard";
    const iconWellClass =
        variant === "attention"
            ? "adminv2-ws-dept-oper-icon-well adminv2-ws-dept-oper-icon-well--attention"
            : "adminv2-ws-dept-oper-icon-well";

    return (
        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
            <div
                className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact ${tier} pointer-events-none select-none`}
                aria-busy="true"
            >
                <div className="adminv2-ws-wu-queue-card-compact-text min-w-0">
                    <div className="adminv2-ws-dept-oper-row-title">
                        <span className={iconWellClass} aria-hidden>
                            <span className="block h-6 w-6 rounded-md skeleton-pulse bg-alloy-stone/18" />
                        </span>
                        <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact min-w-0 pt-0.5">
                            <span className="block h-3.5 w-[min(72%,14rem)] rounded skeleton-pulse bg-alloy-stone/16" />
                        </div>
                    </div>
                    <div className="adminv2-ws-paired-oper-queue-meta mt-2 tabular-nums" style={{ color: "var(--d-muted)" }}>
                        <span className="font-medium text-alloy-midnight/75">Total</span>{" "}
                        <span className="inline-block h-3.5 w-6 rounded skeleton-pulse bg-alloy-stone/14 align-middle" />
                    </div>
                </div>
                <div className="adminv2-ws-wu-queue-card-compact-aside shrink-0 self-center">
                    <span className="inline-block h-6 w-[3.25rem] rounded-md skeleton-pulse bg-alloy-stone/12" />
                </div>
            </div>
        </li>
    );
}

export function WorkUnitQueueCompactRowSkeletonList({
    count = 4,
    variant = "standard",
    ariaLabel = "Loading queue rows",
}: {
    count?: number;
    variant?: "standard" | "attention" | "throughput";
    ariaLabel?: string;
}) {
    return (
        <ul className="adminv2-ws-queue-list" role="list" aria-busy="true" aria-label={ariaLabel}>
            {Array.from({ length: count }, (_, i) => (
                <WorkUnitQueueCompactRowSkeleton key={`${variant}-skel-${i}`} variant={variant} />
            ))}
        </ul>
    );
}
