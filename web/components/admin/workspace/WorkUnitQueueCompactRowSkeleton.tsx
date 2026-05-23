"use client";

import { ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT } from "@/lib/ui-v2/adminV2LoadingGeometry";

/**
 * Work-unit primary queue lane — matches compact CRM / enrollment row geometry (no metric labels).
 */
export function WorkUnitQueueLaneRowSkeleton() {
    return (
        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
            <div
                className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard pointer-events-none select-none"
                aria-busy="true"
                data-wu-queue-row-skeleton="true"
            >
                <div
                    className="adminv2-ws-enrollment-crm-row adminv2-ws-enrollment-crm-row--split"
                    data-wu-queue-row-skeleton-layout="queue_lane"
                >
                    <div className="adminv2-ws-enrollment-crm-row__content min-w-0 flex-1 space-y-1.5 py-0.5">
                        <span
                            className="block h-3.5 w-[min(72%,14rem)] rounded skeleton-pulse bg-alloy-stone/16"
                            aria-hidden
                        />
                        <span
                            className="block h-3 w-[min(58%,11rem)] rounded skeleton-pulse bg-alloy-stone/12"
                            aria-hidden
                        />
                        <span
                            className="block h-3 w-[min(42%,8rem)] rounded skeleton-pulse bg-alloy-stone/10"
                            aria-hidden
                        />
                    </div>
                    <div className="adminv2-ws-enrollment-crm-row__actions shrink-0 self-center pl-2">
                        <span
                            className="inline-block h-7 w-[4.5rem] rounded-md skeleton-pulse bg-alloy-stone/12"
                            aria-hidden
                        />
                    </div>
                </div>
            </div>
        </li>
    );
}

/** Dept paired oper panels — bucket tile shape (not used on `/work-unit` queue lane). */
function DeptOperBucketRowSkeleton({
    variant,
}: {
    variant: "attention" | "throughput";
}) {
    const tier =
        variant === "attention"
            ? "adminv2-ws-wu-queue-card--tier-warning adminv2-ws-dept-attention-bucket-tile"
            : "adminv2-ws-wu-queue-card--tier-standard adminv2-ws-dept-pipeline-lane-tile";
    const iconWellClass =
        variant === "attention"
            ? "adminv2-ws-dept-oper-icon-well adminv2-ws-dept-oper-icon-well--attention"
            : "adminv2-ws-dept-oper-icon-well";

    return (
        <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
            <div
                className={`adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact ${tier} pointer-events-none select-none`}
                aria-busy="true"
                data-wu-queue-row-skeleton="dept_oper_bucket"
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
                    <div
                        className="adminv2-ws-paired-oper-queue-meta mt-2 tabular-nums"
                        style={{ color: "var(--d-muted)" }}
                    >
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

/** @deprecated Prefer {@link WorkUnitQueueLaneRowSkeleton} on work-unit queue lane. */
export function WorkUnitQueueCompactRowSkeleton({
    variant = "standard",
}: {
    variant?: "standard" | "attention" | "throughput";
}) {
    if (variant === "standard") {
        return <WorkUnitQueueLaneRowSkeleton />;
    }
    return <DeptOperBucketRowSkeleton variant={variant} />;
}

export function WorkUnitQueueLaneRowSkeletonList({
    count = ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT,
    ariaLabel = "Loading queue rows",
}: {
    count?: number;
    ariaLabel?: string;
}) {
    const rows = Math.max(3, Math.min(count, 5));
    return (
        <ul className="adminv2-ws-queue-list adminv2-ws-wu-queue-list" role="list" aria-busy="true" aria-label={ariaLabel}>
            {Array.from({ length: rows }, (_, i) => (
                <WorkUnitQueueLaneRowSkeleton key={`wu-queue-lane-skel-${i}`} />
            ))}
        </ul>
    );
}

export function WorkUnitQueueCompactRowSkeletonList({
    count = ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT,
    variant = "standard",
    ariaLabel = "Loading queue rows",
}: {
    count?: number;
    variant?: "standard" | "attention" | "throughput";
    ariaLabel?: string;
}) {
    if (variant === "standard") {
        return <WorkUnitQueueLaneRowSkeletonList count={count} ariaLabel={ariaLabel} />;
    }
    const rows = Math.max(1, Math.min(count, 8));
    return (
        <ul className="adminv2-ws-queue-list" role="list" aria-busy="true" aria-label={ariaLabel}>
            {Array.from({ length: rows }, (_, i) => (
                <WorkUnitQueueCompactRowSkeleton key={`${variant}-skel-${i}`} variant={variant} />
            ))}
        </ul>
    );
}
