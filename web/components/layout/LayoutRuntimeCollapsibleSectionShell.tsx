"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
    layoutRuntimeSectionCollapseStorageKey,
    readPersistedLayoutRuntimeSectionExpanded,
    writePersistedLayoutRuntimeSectionExpanded,
    type LayoutRuntimeSectionCollapseConfig,
} from "@/lib/layout/runtime/layoutRuntimeSectionCollapse";

type Props = {
    sectionKey: string;
    title: string;
    anchorEntity: string;
    entityId: string;
    collapse: LayoutRuntimeSectionCollapseConfig;
    headerClassName: string;
    surfaceClassName: string;
    bodyClassName: string;
    headerActions?: ReactNode;
    children: ReactNode;
    "data-layout-runtime-section-key"?: string;
};

export default function LayoutRuntimeCollapsibleSectionShell({
    sectionKey,
    title,
    anchorEntity,
    entityId,
    collapse,
    headerClassName,
    surfaceClassName,
    bodyClassName,
    headerActions,
    children,
    ...rest
}: Props) {
    const storageKey = layoutRuntimeSectionCollapseStorageKey({ anchorEntity, entityId, sectionKey });
    const [expanded, setExpanded] = useState<boolean>(() => {
        if (collapse.persistCollapseState) {
            const persisted = readPersistedLayoutRuntimeSectionExpanded(storageKey);
            if (persisted != null) return persisted;
        }
        return collapse.defaultExpanded;
    });

    useEffect(() => {
        if (!collapse.persistCollapseState) return;
        const persisted = readPersistedLayoutRuntimeSectionExpanded(storageKey);
        if (persisted != null) setExpanded(persisted);
    }, [collapse.persistCollapseState, storageKey]);

    const toggle = useCallback(() => {
        setExpanded((current) => {
            const next = !current;
            if (collapse.persistCollapseState) {
                writePersistedLayoutRuntimeSectionExpanded(storageKey, next);
            }
            return next;
        });
    }, [collapse.persistCollapseState, storageKey]);

    const collapsedHint = !expanded && collapse.collapsedSummary ? collapse.collapsedSummary : null;

    return (
        <div className={`${surfaceClassName} group/section flex h-full min-h-0 flex-col`} {...rest}>
            <div className={headerClassName}>
                <div className="flex min-w-0 items-center justify-between gap-2 text-inherit">
                    <button
                        type="button"
                        onClick={toggle}
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        data-layout-runtime-section-collapse-toggle="true"
                    >
                        {expanded ?
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-alloy-forge/70" aria-hidden />
                        :   <ChevronRight className="h-3.5 w-3.5 shrink-0 text-alloy-forge/70" aria-hidden />}
                        <span className="min-w-0 truncate">{title}</span>
                    </button>
                    {headerActions}
                </div>
                {collapsedHint ?
                    <p
                        className="mt-1 truncate text-[11px] font-normal normal-case tracking-normal text-alloy-muted"
                        data-layout-runtime-section-collapsed-summary="true"
                    >
                        {collapsedHint}
                    </p>
                :   null}
            </div>
            {expanded ?
                <div className={`${bodyClassName} flex flex-1 flex-col`}>{children}</div>
            :   null}
        </div>
    );
}
