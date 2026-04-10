"use client";

import type { ReactNode } from "react";
import type { ScheduleFieldVisualTier } from "@/lib/admin/scheduleFieldPresentation";

/**
 * Snapshot cell aligned with JobRecordModalV2 `JrmSnapCell` — label + value cluster for composed schedule rows.
 * `tier` drives shell + label emphasis (primary / secondary / supporting).
 */
export default function ScheduleSnapCell(props: {
    label: string;
    children: ReactNode;
    /** Default secondary when omitted (unknown layout keys). */
    tier?: ScheduleFieldVisualTier;
    className?: string;
}) {
    const tier = props.tier ?? "secondary";
    const shell =
        tier === "primary"
            ? "min-w-0 rounded-lg border border-admin-border/50 bg-white/95 px-2.5 py-2 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
            : tier === "supporting"
              ? "min-w-0 rounded-md border border-dashed border-admin-border/28 bg-alloy-stone/[0.03] px-1.5 py-1"
              : "min-w-0 rounded-md border border-admin-border/35 bg-alloy-stone/[0.06] px-2 py-1.5";

    const labelClass =
        tier === "primary"
            ? "mb-1 text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-alloy-midnight/55"
            : tier === "supporting"
              ? "mb-0.5 text-[8px] font-semibold uppercase leading-none tracking-[0.12em] text-alloy-forge/55"
              : "mb-1 text-[9px] font-semibold uppercase leading-none tracking-[0.1em] text-alloy-forge/65";

    return (
        <div className={`${shell} ${props.className ?? ""}`}>
            <div className={labelClass}>{props.label}</div>
            <div
                className={
                    tier === "supporting"
                        ? "flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0"
                        : "flex min-w-0 flex-col gap-0.5"
                }
            >
                {props.children}
            </div>
        </div>
    );
}
