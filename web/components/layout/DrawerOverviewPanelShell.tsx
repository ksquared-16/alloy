"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
    layoutRuntimeSectionCollapseStorageKey,
    readPersistedLayoutRuntimeSectionExpanded,
    writePersistedLayoutRuntimeSectionExpanded,
    type LayoutRuntimeSectionCollapseConfig,
} from "@/lib/layout/runtime/layoutRuntimeSectionCollapse";
import {
    resolveLayoutEditorWidgetToneIconClass,
    resolveLayoutEditorWidgetToneRailClass,
    resolveLayoutEditorWidgetToneTitleClass,
    type LayoutEditorWidgetRuntimeTone,
} from "@/lib/layout/layoutEditorWidgetStyle";
import {
    DRAWER_OVERVIEW_PANEL_CENTERPIECE_SURFACE,
    DRAWER_OVERVIEW_PANEL_HEADER,
    DRAWER_OVERVIEW_PANEL_ICON_BADGE,
    DRAWER_OVERVIEW_PANEL_SURFACE,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { resolveDrawerOverviewSectionIcon } from "@/lib/layout/runtime/drawerOverviewSectionPresentation";
import {
    PRESENTATION_SECTION_EYEBROW,
    PRESENTATION_SECTION_HEADER,
} from "@/lib/presentation/presentationTypography";

export type DrawerOverviewPanelVariant = "default" | "centerpiece";

type Props = {
    sectionKey: string;
    eyebrow?: string | null;
    title: string;
    variant?: DrawerOverviewPanelVariant;
    tone?: LayoutEditorWidgetRuntimeTone;
    bodyClassName?: string;
    headerActions?: ReactNode;
    children: ReactNode;
    collapse?: LayoutRuntimeSectionCollapseConfig;
    anchorEntity?: string;
    entityId?: string;
};

function toneHeaderClass(tone: LayoutEditorWidgetRuntimeTone | undefined): string {
    if (!tone || tone === "green") return DRAWER_OVERVIEW_PANEL_HEADER;
    switch (tone) {
        case "blue":
            return "border-b border-alloy-stone/10 bg-gradient-to-r from-sky-50/70 via-sky-50/30 to-white px-3 py-2";
        case "amber":
            return "border-b border-alloy-stone/10 bg-gradient-to-r from-amber-50/70 via-amber-50/30 to-white px-3 py-2";
        case "red":
            return "border-b border-alloy-stone/10 bg-gradient-to-r from-red-50/60 via-red-50/25 to-white px-3 py-2";
        case "purple":
            return "border-b border-alloy-stone/10 bg-gradient-to-r from-violet-50/65 via-violet-50/25 to-white px-3 py-2";
        case "muted":
            return "border-b border-alloy-stone/10 bg-gradient-to-r from-alloy-stone/[0.06] via-white to-white px-3 py-2";
        default:
            return DRAWER_OVERVIEW_PANEL_HEADER;
    }
}

/** Premium drawer overview section — pine accent, tinted header band, icon badge. */
export default function DrawerOverviewPanelShell({
    sectionKey,
    eyebrow,
    title,
    variant = "default",
    tone,
    bodyClassName = "px-3.5 pb-3.5 pt-2.5",
    headerActions,
    children,
    collapse,
    anchorEntity = "",
    entityId = "",
}: Props) {
    const Icon = resolveDrawerOverviewSectionIcon(sectionKey);
    const railClass = tone ? resolveLayoutEditorWidgetToneRailClass(tone) : "border-l-alloy-juniper/70";
    const iconBadgeClass = tone ? resolveLayoutEditorWidgetToneIconClass(tone) : DRAWER_OVERVIEW_PANEL_ICON_BADGE;
    const surfaceBase =
        variant === "centerpiece" ? DRAWER_OVERVIEW_PANEL_CENTERPIECE_SURFACE : DRAWER_OVERVIEW_PANEL_SURFACE;
    const surfaceClass = tone ?
        surfaceBase.replace("border-l-alloy-juniper/70", railClass).replace("border-l-alloy-juniper/75", railClass)
    :   surfaceBase;

    const isCollapsible = collapse?.collapsible === true;
    const storageKey = layoutRuntimeSectionCollapseStorageKey({ anchorEntity, entityId, sectionKey });
    const [expanded, setExpanded] = useState<boolean>(() => {
        if (collapse?.persistCollapseState) {
            const persisted = readPersistedLayoutRuntimeSectionExpanded(storageKey);
            if (persisted != null) return persisted;
        }
        return collapse?.defaultExpanded !== false;
    });

    useEffect(() => {
        if (!collapse?.persistCollapseState) return;
        const persisted = readPersistedLayoutRuntimeSectionExpanded(storageKey);
        if (persisted != null) setExpanded(persisted);
    }, [collapse?.persistCollapseState, storageKey]);

    const toggle = useCallback(() => {
        setExpanded((current) => {
            const next = !current;
            if (collapse?.persistCollapseState) {
                writePersistedLayoutRuntimeSectionExpanded(storageKey, next);
            }
            return next;
        });
    }, [collapse?.persistCollapseState, storageKey]);

    const collapsedHint = !expanded && collapse?.collapsedSummary ? collapse.collapsedSummary : null;
    const showBody = !isCollapsible || expanded;

    return (
        <section
            className={`${surfaceClass} group/section flex h-full min-h-0 flex-col`}
            data-drawer-overview-panel="true"
            data-drawer-overview-panel-section={sectionKey}
            data-layout-runtime-section-key={sectionKey}
            {...(tone ? { "data-layout-runtime-widget-tone": tone } : {})}
            {...(variant === "centerpiece" ?
                { "data-layout-runtime-primary-workspace-section": "true" }
            :   {})}
        >
            <header className={toneHeaderClass(tone)}>
                <div className="flex min-w-0 items-center gap-2.5">
                    {isCollapsible ?
                        <button
                            type="button"
                            onClick={toggle}
                            aria-expanded={expanded}
                            className="flex shrink-0 items-center justify-center rounded p-0.5 text-alloy-forge/70 hover:bg-alloy-stone/10"
                            data-layout-runtime-section-collapse-toggle="true"
                        >
                            {expanded ?
                                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                            :   <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                        </button>
                    :   null}
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${iconBadgeClass}`} aria-hidden>
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0 flex-1">
                        {eyebrow ?
                            <p className={PRESENTATION_SECTION_EYEBROW}>{eyebrow}</p>
                        :   null}
                        <h3 className={`truncate ${PRESENTATION_SECTION_HEADER} ${tone ? resolveLayoutEditorWidgetToneTitleClass(tone) : ""}`}>{title}</h3>
                        {collapsedHint ?
                            <p
                                className="mt-0.5 truncate text-[11px] font-normal normal-case tracking-normal text-alloy-muted"
                                data-layout-runtime-section-collapsed-summary="true"
                            >
                                {collapsedHint}
                            </p>
                        :   null}
                    </div>
                    {headerActions ?
                        <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
                    :   null}
                </div>
            </header>
            {showBody ?
                <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${bodyClassName}`}>{children}</div>
            :   null}
        </section>
    );
}
