"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    adminV2NavigationClickedItemProps,
    runAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation";
import { warmOperatorWorkUnitEntryFromHref } from "@/lib/admin/operatorWorkUnitEntryWarm";

export type OperationalSurfaceWorkLineProps = {
    id: string;
    label: string;
    count: number;
    href: string;
    ariaLabel?: string;
    clickedKey: string;
};

function isModifiedNavClick(e: MouseEvent<HTMLAnchorElement>): boolean {
    return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented;
}

/** Enterable Today's Work line — launches a Work View deep link. */
export function OperationalSurfaceWorkLine({
    id,
    label,
    count,
    href,
    ariaLabel,
    clickedKey,
}: OperationalSurfaceWorkLineProps) {
    const router = useRouter();
    const displayCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

    return (
        <Link
            href={href}
            className="group/line flex items-center justify-between gap-3 rounded-lg border border-transparent bg-alloy-juniper/[0.04] px-2.5 py-2 text-sm font-semibold text-alloy-midnight no-underline transition-colors hover:border-alloy-juniper/30 hover:bg-alloy-juniper/[0.08] hover:shadow-[0_1px_3px_rgba(0,162,131,0.1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper"
            data-operational-surface-work-line={id}
            aria-label={ariaLabel ?? `Enter ${label}`}
            {...adminV2NavigationClickedItemProps(clickedKey)}
            onMouseEnter={() => warmOperatorWorkUnitEntryFromHref(href, null, "operational_surface_work_line_hover")}
            onFocus={() => warmOperatorWorkUnitEntryFromHref(href, null, "operational_surface_work_line_focus")}
            onClick={(e) => {
                if (isModifiedNavClick(e)) return;
                e.preventDefault();
                e.stopPropagation();
                void runAdminV2NavigationTransition({
                    href,
                    clickedKey,
                    variant: "work_unit",
                    commitFirst: true,
                    prepare: () => warmOperatorWorkUnitEntryFromHref(href, null, "operational_surface_work_line_click"),
                    commit: () => router.push(href),
                });
            }}
        >
            <span className="min-w-0 truncate">{label}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 tabular-nums text-alloy-juniper">
                <span>{displayCount}</span>
                <span
                    aria-hidden
                    className="text-base font-bold leading-none transition-transform group-hover/line:translate-x-0.5"
                >
                    →
                </span>
            </span>
        </Link>
    );
}
