"use client";

import type { ReactNode } from "react";
import {
    DRAWER_OVERVIEW_PANEL_BODY_CLASS,
    DRAWER_OVERVIEW_PANEL_HEADER,
    DRAWER_OVERVIEW_PANEL_ICON_BADGE,
    DRAWER_OVERVIEW_PANEL_SURFACE,
} from "@/lib/layout/runtime/drawerOverviewCompositionStandard";
import { resolveDrawerOverviewSectionEyebrow } from "@/lib/layout/runtime/drawerOverviewSectionPresentation";
import { resolveDrawerOverviewSectionIcon } from "@/lib/layout/runtime/drawerOverviewSectionPresentation";
import {
    PRESENTATION_SECTION_EYEBROW,
    PRESENTATION_SECTION_HEADER,
} from "@/lib/presentation/presentationTypography";

type Props = {
    sectionKey: string;
    title: string;
    isSelected?: boolean;
    hidden?: boolean;
    onTitleChange: (title: string) => void;
    children: ReactNode;
};

/** Drawer-parity card chrome for Experience Builder — pine header band + editable title. */
export default function ExperienceBuilderEditableCardShell({
    sectionKey,
    title,
    isSelected = false,
    hidden = false,
    onTitleChange,
    children,
}: Props) {
    const Icon = resolveDrawerOverviewSectionIcon(sectionKey);
    const eyebrow = resolveDrawerOverviewSectionEyebrow(sectionKey);

    return (
        <div
            className={`${DRAWER_OVERVIEW_PANEL_SURFACE} flex h-full min-h-0 flex-col transition-all duration-150 ${
                isSelected ?
                    "ring-1 ring-alloy-pine/30 shadow-[0_2px_8px_rgba(45,106,79,0.08)]"
                :   "hover:shadow-[0_2px_8px_rgba(24,39,58,0.05)]"
            } ${hidden ? "opacity-60" : ""}`}
            data-experience-builder-card-shell="true"
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
                        <input
                            type="text"
                            value={title}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={(e) => onTitleChange(e.target.value)}
                            className={`w-full truncate bg-transparent outline-none placeholder:text-alloy-midnight/35 focus:ring-0 ${PRESENTATION_SECTION_HEADER}`}
                            aria-label="Card title"
                            data-testid={`visual-editor-section-title-inline-${sectionKey}`}
                        />
                    </div>
                </div>
            </header>
            <div className={`flex min-h-0 flex-1 flex-col ${DRAWER_OVERVIEW_PANEL_BODY_CLASS}`}>{children}</div>
        </div>
    );
}
