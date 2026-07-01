"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    adminV2NavigationClickedItemProps,
    runAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation";
import { warmOperatorWorkUnitEntryFromHref } from "@/lib/admin/operatorWorkUnitEntryWarm";
import type { OperationalSurfaceHealthTone } from "@/lib/admin/enrollmentOperationalSurfaceLanding";
import {
    OperationalSurfaceWorkLine,
    type OperationalSurfaceWorkLineProps,
} from "@/components/admin/workspace/OperationalSurfaceWorkLine";

export type OperationalSurfaceCoverProps = {
    title: string;
    healthLabel: string;
    healthTone: OperationalSurfaceHealthTone;
    storyHeadline: string;
    storyBody?: string;
    workLines: readonly OperationalSurfaceWorkLineProps[];
    entryHref: string;
    entryLabel: string;
    entryClickedKey: string;
};

function isModifiedNavClick(e: MouseEvent<HTMLAnchorElement>): boolean {
    return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented;
}

/** Compressed operational cover page — story, Today's Work, and process entry. */
export function OperationalSurfaceCover({
    storyHeadline,
    storyBody,
    workLines,
    entryHref,
    entryLabel,
    entryClickedKey,
}: OperationalSurfaceCoverProps) {
    const router = useRouter();

    return (
        <div
            className="mt-2.5 flex flex-col gap-3.5 rounded-lg border border-alloy-juniper/15 bg-white px-3.5 py-3.5"
            data-operational-surface-cover="true"
        >
            <div className="space-y-1.5">
                <p className="text-[14px] font-semibold leading-snug text-alloy-midnight">{storyHeadline}</p>
                {storyBody ?
                    <p className="text-xs leading-relaxed text-alloy-midnight/62">{storyBody}</p>
                :   null}
            </div>

            <div className="space-y-2" data-operational-surface-todays-work="true">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-alloy-midnight/45">
                    Today&apos;s Work
                </p>
                <div className="space-y-1.5">
                    {workLines.map((line) => (
                        <OperationalSurfaceWorkLine key={line.id} {...line} />
                    ))}
                </div>
            </div>

            <div className="flex justify-end border-t border-alloy-midnight/8 pt-2.5">
                <Link
                    href={entryHref}
                    className="inline-flex shrink-0 rounded-md border border-alloy-juniper/35 bg-alloy-juniper/10 px-2.5 py-1.5 text-xs font-bold tracking-wide text-alloy-juniper no-underline transition-colors hover:border-alloy-juniper hover:bg-alloy-juniper hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper"
                    data-operational-surface-entry="true"
                    {...adminV2NavigationClickedItemProps(entryClickedKey)}
                    onMouseEnter={() =>
                        warmOperatorWorkUnitEntryFromHref(entryHref, null, "operational_surface_entry_hover")
                    }
                    onFocus={() =>
                        warmOperatorWorkUnitEntryFromHref(entryHref, null, "operational_surface_entry_focus")
                    }
                    onClick={(e) => {
                        if (isModifiedNavClick(e)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        void runAdminV2NavigationTransition({
                            href: entryHref,
                            clickedKey: entryClickedKey,
                            variant: "work_unit",
                            commitFirst: true,
                            prepare: () =>
                                warmOperatorWorkUnitEntryFromHref(
                                    entryHref,
                                    null,
                                    "operational_surface_entry_click",
                                ),
                            commit: () => router.push(entryHref),
                        });
                    }}
                >
                    {entryLabel}
                </Link>
            </div>
        </div>
    );
}
