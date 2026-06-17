"use client";

import type { ReactNode } from "react";
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
    bodyClassName?: string;
    children: ReactNode;
};

/** Premium drawer overview section — pine accent, tinted header band, icon badge. */
export default function DrawerOverviewPanelShell({
    sectionKey,
    eyebrow,
    title,
    variant = "default",
    bodyClassName = "px-3 pb-3 pt-2",
    children,
}: Props) {
    const Icon = resolveDrawerOverviewSectionIcon(sectionKey);
    const surfaceClass =
        variant === "centerpiece" ? DRAWER_OVERVIEW_PANEL_CENTERPIECE_SURFACE : DRAWER_OVERVIEW_PANEL_SURFACE;

    return (
        <section
            className={`${surfaceClass} flex h-full min-h-0 flex-col`}
            data-drawer-overview-panel="true"
            data-drawer-overview-panel-section={sectionKey}
            data-layout-runtime-section-key={sectionKey}
            {...(variant === "centerpiece" ?
                { "data-layout-runtime-primary-workspace-section": "true" }
            :   {})}
        >
            <header className={DRAWER_OVERVIEW_PANEL_HEADER}>
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className={DRAWER_OVERVIEW_PANEL_ICON_BADGE} aria-hidden>
                        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0 flex-1">
                        {eyebrow ?
                            <p className={PRESENTATION_SECTION_EYEBROW}>{eyebrow}</p>
                        :   null}
                        <h3 className={`truncate ${PRESENTATION_SECTION_HEADER}`}>{title}</h3>
                    </div>
                </div>
            </header>
            <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${bodyClassName}`}>{children}</div>
        </section>
    );
}
